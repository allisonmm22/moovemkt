import type { Context } from 'hono';
import type { Env, Conexao, Contato, Conversa } from '../types';
import { createSupabaseClient } from '../lib/supabase';
import { jsonResponse, errorResponse } from '../lib/cors';
import { EVOLUTION_API_URL } from '../lib/utils';

// Buscar foto de perfil do WhatsApp
async function fetchProfilePicture(
  instanceName: string,
  telefone: string,
  evolutionApiKey: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `${EVOLUTION_API_URL}/chat/fetchProfilePictureUrl/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify({ number: telefone }),
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    return data.profilePictureUrl || data.picture || data.url || null;
  } catch {
    return null;
  }
}

// Buscar info do grupo
async function fetchGroupInfo(
  instanceName: string,
  grupoJid: string,
  evolutionApiKey: string
): Promise<{ pictureUrl: string | null; subject: string | null }> {
  try {
    const response = await fetch(
      `${EVOLUTION_API_URL}/group/findGroupInfos/${instanceName}?groupJid=${encodeURIComponent(grupoJid)}`,
      {
        method: 'GET',
        headers: { 'apikey': evolutionApiKey },
      }
    );

    if (!response.ok) return { pictureUrl: null, subject: null };

    const data = await response.json();
    return {
      pictureUrl: data.pictureUrl || data.profilePictureUrl || null,
      subject: data.subject || null,
    };
  } catch {
    return { pictureUrl: null, subject: null };
  }
}

// Processar webhook Meta API
async function processarWebhookMeta(payload: any, env: Env): Promise<Response> {
  console.log('=== PROCESSANDO WEBHOOK META API ===');
  const supabase = createSupabaseClient(env);

  try {
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
      return jsonResponse({ success: true });
    }

    const phoneNumberId = value.metadata?.phone_number_id;
    const messages = value.messages || [];
    const contacts = value.contacts || [];

    // Buscar conexão
    const { data: conexao, error: conexaoError } = await supabase
      .from('conexoes_whatsapp')
      .select('id, conta_id, instance_name, tipo_provedor, agente_ia_id')
      .eq('meta_phone_number_id', phoneNumberId)
      .eq('tipo_provedor', 'meta')
      .single();

    if (conexaoError || !conexao) {
      console.log('Conexão Meta não encontrada:', phoneNumberId);
      return jsonResponse({ success: true });
    }

    // Processar mensagens
    for (const msg of messages) {
      const fromNumber = msg.from;
      const messageType = msg.type;
      const timestamp = new Date(parseInt(msg.timestamp) * 1000).toISOString();
      const metaMsgId = msg.id;

      // Extrair referral/anúncio
      const referral = msg.referral || msg.context?.referral;
      let adInfo: any = null;

      if (referral) {
        adInfo = {
          ad_id: referral.source_id || referral.ad_id,
          ad_title: referral.headline || referral.ad_title,
          ad_body: referral.body,
          ad_source: referral.source_type || 'ad',
          ad_url: referral.source_url,
          captured_at: new Date().toISOString(),
        };
      }

      let messageContent = '';
      let tipo: 'texto' | 'imagem' | 'audio' | 'video' | 'documento' = 'texto';

      switch (messageType) {
        case 'text':
          messageContent = msg.text?.body || '';
          break;
        case 'image':
          tipo = 'imagem';
          messageContent = msg.image?.caption || '📷 Imagem';
          break;
        case 'audio':
          tipo = 'audio';
          messageContent = '🎵 Áudio';
          break;
        case 'video':
          tipo = 'video';
          messageContent = msg.video?.caption || '🎬 Vídeo';
          break;
        case 'document':
          tipo = 'documento';
          messageContent = msg.document?.filename || '📄 Documento';
          break;
        default:
          messageContent = `Mensagem do tipo: ${messageType}`;
      }

      // Buscar ou criar contato
      const contactName = contacts.find((c: any) => c.wa_id === fromNumber)?.profile?.name || fromNumber;

      let { data: contato } = await supabase
        .from('contatos')
        .select('id')
        .eq('conta_id', conexao.conta_id)
        .eq('telefone', fromNumber)
        .single();

      if (!contato) {
        const { data: novoContato, error } = await supabase
          .from('contatos')
          .insert({
            conta_id: conexao.conta_id,
            nome: contactName,
            telefone: fromNumber,
            metadata: adInfo ? { origem_anuncio: adInfo } : {},
          })
          .select()
          .single();

        if (error) continue;
        contato = novoContato;
      }

      // Buscar ou criar conversa
      let { data: conversa } = await supabase
        .from('conversas')
        .select('id, agente_ia_ativo, nao_lidas, agente_ia_id, status')
        .eq('conta_id', conexao.conta_id)
        .eq('contato_id', contato.id)
        .eq('conexao_id', conexao.id)
        .eq('arquivada', false)
        .single();

      if (!conversa) {
        const { data: agentePrincipal } = await supabase
          .from('agent_ia')
          .select('id')
          .eq('conta_id', conexao.conta_id)
          .eq('tipo', 'principal')
          .eq('ativo', true)
          .maybeSingle();

        const { data: novaConversa, error } = await supabase
          .from('conversas')
          .insert({
            conta_id: conexao.conta_id,
            contato_id: contato.id,
            conexao_id: conexao.id,
            agente_ia_ativo: true,
            agente_ia_id: conexao.agente_ia_id || agentePrincipal?.id || null,
            status: 'em_atendimento',
          })
          .select()
          .single();

        if (error) continue;
        conversa = novaConversa;
      }

      // Inserir mensagem
      await supabase.from('mensagens').insert({
        conversa_id: conversa.id,
        contato_id: contato.id,
        conteudo: messageContent,
        direcao: 'entrada',
        tipo,
        metadata: { meta_msg_id: metaMsgId },
      });

      // Atualizar conversa
      await supabase
        .from('conversas')
        .update({
          ultima_mensagem: messageContent,
          ultima_mensagem_at: timestamp,
          nao_lidas: (conversa.nao_lidas || 0) + 1,
          status: 'em_atendimento',
        })
        .eq('id', conversa.id);

      // Agendar resposta IA
      if (conversa.agente_ia_ativo) {
        const { data: agenteConfig } = await supabase
          .from('agent_ia')
          .select('tempo_espera_segundos')
          .eq('id', conversa.agente_ia_id)
          .single();

        const tempoEspera = agenteConfig?.tempo_espera_segundos || 5;
        const responderEm = new Date(Date.now() + tempoEspera * 1000).toISOString();

        await supabase
          .from('respostas_pendentes')
          .upsert({ conversa_id: conversa.id, responder_em: responderEm }, { onConflict: 'conversa_id' });
      }
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Erro webhook Meta:', error);
    return jsonResponse({ success: true });
  }
}

// Handler principal
export async function handleWhatsappWebhook(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env;
  const supabase = createSupabaseClient(env);

  // Verificação GET (Meta webhook)
  if (c.req.method === 'GET') {
    const url = new URL(c.req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('=== META WEBHOOK VERIFICATION ===');

    if (mode === 'subscribe' && token && challenge) {
      const { data: conexao } = await supabase
        .from('conexoes_whatsapp')
        .select('id')
        .eq('meta_webhook_verify_token', token)
        .eq('tipo_provedor', 'meta')
        .single();

      if (conexao || token.startsWith('verify_')) {
        return new Response(challenge, { status: 200 });
      }
    }

    return new Response('Forbidden', { status: 403 });
  }

  // POST: Processar webhooks
  try {
    const payload = await c.req.json();
    console.log('=== WEBHOOK RECEBIDO ===');

    // Meta API
    if (payload.object === 'whatsapp_business_account') {
      return await processarWebhookMeta(payload, env);
    }

    // Evolution API
    const event = payload.event?.toLowerCase() || '';
    const instance = payload.instance;
    const data = payload.data;

    const eventosRelevantes = ['messages.upsert', 'messages_upsert', 'message', 'messages.reaction', 'connection.update', 'connection_update', 'qrcode.updated', 'qrcode_updated', 'qr'];
    const normalizedEvent = event.replace(/_/g, '.').toLowerCase();

    if (!eventosRelevantes.includes(normalizedEvent) && !eventosRelevantes.includes(event)) {
      return jsonResponse({ success: true, skipped: true });
    }

    // Atualização de conexão
    if (normalizedEvent === 'connection.update' || event === 'connection_update') {
      const state = data?.state || data?.status;
      let status: 'conectado' | 'desconectado' | 'aguardando' = 'desconectado';

      if (state === 'open' || state === 'connected') status = 'conectado';
      else if (state === 'connecting' || state === 'qr') status = 'aguardando';

      const numero = data?.instance?.owner?.split('@')[0] || data?.ownerJid?.split('@')[0] || null;

      await supabase
        .from('conexoes_whatsapp')
        .update({ status, numero })
        .eq('instance_name', instance);

      return jsonResponse({ success: true });
    }

    // QR Code
    if (normalizedEvent === 'qrcode.updated' || event === 'qrcode_updated' || event === 'qr') {
      const qrcode = data?.qrcode?.base64 || data?.qrcode || data?.base64;

      if (qrcode) {
        await supabase
          .from('conexoes_whatsapp')
          .update({ qrcode, status: 'aguardando' })
          .eq('instance_name', instance);
      }

      return jsonResponse({ success: true });
    }

    // Mensagens
    if (normalizedEvent === 'messages.upsert' || event === 'messages_upsert' || event === 'message') {
      const message = data?.message || data?.messages?.[0] || data;
      const key = data?.key || message?.key || {};
      const remoteJid = key.remoteJid || data?.remoteJid || data?.from;
      const fromMe = key.fromMe ?? data?.fromMe ?? false;
      const pushName = data?.pushName || message?.pushName || '';
      const messageId = key.id;

      if (!remoteJid) {
        return jsonResponse({ success: true });
      }

      const isGrupo = remoteJid.includes('@g.us');
      const telefone = isGrupo
        ? remoteJid.replace('@g.us', '')
        : remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
      const grupoJid = isGrupo ? remoteJid : null;

      // Extrair conteúdo
      let messageContent = '';
      let messageType: 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'sticker' = 'texto';
      const msgContent = message?.message || message;

      if (msgContent?.conversation) {
        messageContent = msgContent.conversation;
      } else if (msgContent?.extendedTextMessage?.text) {
        messageContent = msgContent.extendedTextMessage.text;
      } else if (msgContent?.imageMessage) {
        messageType = 'imagem';
        messageContent = msgContent.imageMessage.caption || '📷 Imagem';
      } else if (msgContent?.audioMessage) {
        messageType = 'audio';
        messageContent = '🎵 Áudio';
      } else if (msgContent?.videoMessage) {
        messageType = 'video';
        messageContent = msgContent.videoMessage.caption || '🎬 Vídeo';
      } else if (msgContent?.documentMessage) {
        messageType = 'documento';
        messageContent = msgContent.documentMessage.fileName || '📄 Documento';
      } else if (msgContent?.stickerMessage) {
        messageType = 'sticker';
        messageContent = '🎨 Sticker';
      } else if (typeof message === 'string') {
        messageContent = message;
      } else if (data?.body) {
        messageContent = data.body;
      }

      if (!messageContent) {
        return jsonResponse({ success: true });
      }

      // Buscar conexão
      const { data: conexao, error: conexaoError } = await supabase
        .from('conexoes_whatsapp')
        .select('id, conta_id, instance_name, token, tipo_canal, agente_ia_id')
        .eq('instance_name', instance)
        .single();

      if (conexaoError || !conexao) {
        return jsonResponse({ error: 'Conexão não encontrada' });
      }

      const canal = conexao.tipo_canal || 'whatsapp';

      // Verificar mensagem duplicada
      if (messageId) {
        const { data: jaProcessada } = await supabase
          .from('mensagens_processadas')
          .select('id')
          .eq('evolution_msg_id', messageId)
          .eq('conta_id', conexao.conta_id)
          .maybeSingle();

        if (jaProcessada) {
          return jsonResponse({ success: true });
        }
      }

      // Buscar ou criar contato
      let { data: contato } = await supabase
        .from('contatos')
        .select('id, avatar_url')
        .eq('conta_id', conexao.conta_id)
        .eq('telefone', telefone)
        .single();

      if (!contato) {
        let nome = pushName || telefone;
        let avatarUrl: string | null = null;

        if (isGrupo && conexao.token) {
          const groupInfo = await fetchGroupInfo(instance, grupoJid!, conexao.token);
          if (groupInfo.subject) nome = groupInfo.subject;
          avatarUrl = groupInfo.pictureUrl;
        } else if (!isGrupo && conexao.token) {
          avatarUrl = await fetchProfilePicture(instance, telefone, conexao.token);
        }

        const { data: novoContato, error } = await supabase
          .from('contatos')
          .insert({
            conta_id: conexao.conta_id,
            nome,
            telefone,
            avatar_url: avatarUrl,
            is_grupo: isGrupo,
            grupo_jid: grupoJid,
            canal,
          })
          .select()
          .single();

        if (error) {
          return errorResponse('Erro ao criar contato', 500, error);
        }
        contato = novoContato;
      }

      // Buscar ou criar conversa
      let { data: conversa } = await supabase
        .from('conversas')
        .select('id, agente_ia_ativo, nao_lidas, agente_ia_id, status')
        .eq('conta_id', conexao.conta_id)
        .eq('contato_id', contato.id)
        .eq('conexao_id', conexao.id)
        .eq('arquivada', false)
        .single();

      if (!conversa) {
        const agenteIaAtivo = !isGrupo;
        let agenteIaId = conexao.agente_ia_id || null;

        if (!agenteIaId && !isGrupo) {
          const { data: agentePrincipal } = await supabase
            .from('agent_ia')
            .select('id')
            .eq('conta_id', conexao.conta_id)
            .eq('tipo', 'principal')
            .eq('ativo', true)
            .maybeSingle();

          agenteIaId = agentePrincipal?.id || null;
        }

        const { data: novaConversa, error } = await supabase
          .from('conversas')
          .insert({
            conta_id: conexao.conta_id,
            contato_id: contato.id,
            conexao_id: conexao.id,
            agente_ia_ativo: agenteIaAtivo,
            agente_ia_id: agenteIaId,
            status: 'em_atendimento',
            canal,
          })
          .select()
          .single();

        if (error) {
          return errorResponse('Erro ao criar conversa', 500, error);
        }
        conversa = novaConversa;
      }

      // Verificar mensagem existente
      if (messageId) {
        const { data: existingMsg } = await supabase
          .from('mensagens')
          .select('id')
          .eq('conversa_id', conversa.id)
          .contains('metadata', { evolution_msg_id: messageId })
          .maybeSingle();

        if (existingMsg) {
          return jsonResponse({ success: true });
        }
      }

      // Inserir mensagem
      const messageMetadata: Record<string, any> = {};
      if (messageId) messageMetadata.evolution_msg_id = messageId;

      await supabase.from('mensagens').insert({
        conversa_id: conversa.id,
        contato_id: contato.id,
        conteudo: messageContent,
        direcao: fromMe ? 'saida' : 'entrada',
        tipo: messageType,
        enviada_por_dispositivo: fromMe,
        metadata: messageMetadata,
      });

      // Registrar como processada
      if (messageId) {
        await supabase.from('mensagens_processadas').upsert({
          evolution_msg_id: messageId,
          conta_id: conexao.conta_id,
          telefone,
        }, { onConflict: 'evolution_msg_id,conta_id', ignoreDuplicates: true });
      }

      // Atualizar conversa
      const updateData: Record<string, any> = {
        ultima_mensagem: messageContent,
        ultima_mensagem_at: new Date().toISOString(),
        nao_lidas: fromMe ? 0 : (conversa.nao_lidas || 0) + 1,
        status: fromMe ? 'aguardando_cliente' : 'em_atendimento',
      };

      if (fromMe) {
        updateData.agente_ia_ativo = false;
      }

      await supabase.from('conversas').update(updateData).eq('id', conversa.id);

      // Agendar resposta IA
      if (conversa.agente_ia_ativo && !fromMe && !isGrupo) {
        const { data: agenteConfig } = await supabase
          .from('agent_ia')
          .select('tempo_espera_segundos')
          .eq('id', conversa.agente_ia_id)
          .single();

        const tempoEspera = agenteConfig?.tempo_espera_segundos || 5;
        const responderEm = new Date(Date.now() + tempoEspera * 1000).toISOString();

        await supabase
          .from('respostas_pendentes')
          .upsert({ conversa_id: conversa.id, responder_em: responderEm }, { onConflict: 'conversa_id' });
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Erro webhook:', error);
    return errorResponse('Erro interno', 500, error);
  }
}
