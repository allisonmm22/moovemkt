import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVOLUTION_API_URL = 'https://evolution.cognityx.com.br';

// Função para buscar foto de perfil do WhatsApp
async function fetchProfilePicture(
  instanceName: string,
  telefone: string,
  evolutionApiKey: string
): Promise<string | null> {
  try {
    console.log('Buscando foto de perfil para:', telefone);
    
    const response = await fetch(
      `${EVOLUTION_API_URL}/chat/fetchProfilePictureUrl/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify({
          number: telefone,
        }),
      }
    );

    if (!response.ok) {
      console.log('Não foi possível buscar foto de perfil:', response.status);
      return null;
    }

    const data = await response.json();
    const pictureUrl = data.profilePictureUrl || data.picture || data.url || null;
    
    if (pictureUrl) {
      console.log('Foto de perfil encontrada:', pictureUrl.substring(0, 50) + '...');
    } else {
      console.log('Nenhuma foto de perfil disponível');
    }
    
    return pictureUrl;
  } catch (error) {
    console.error('Erro ao buscar foto de perfil:', error);
    return null;
  }
}

// Função para buscar nome e foto do contato individual
async function fetchContactProfile(
  instanceName: string,
  telefone: string,
  evolutionApiKey: string
): Promise<{ name: string | null; pictureUrl: string | null }> {
  try {
    console.log('Buscando perfil do contato:', telefone);
    
    const response = await fetch(
      `${EVOLUTION_API_URL}/chat/fetchProfile/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify({
          number: telefone,
        }),
      }
    );

    if (!response.ok) {
      console.log('Não foi possível buscar perfil:', response.status);
      return { name: null, pictureUrl: null };
    }

    const data = await response.json();
    const name = data.name || data.pushName || data.notify || null;
    const pictureUrl = data.profilePictureUrl || data.picture || data.url || null;
    
    console.log('Perfil encontrado:', { name, pictureUrl: pictureUrl ? 'sim' : 'não' });
    
    return { name, pictureUrl };
  } catch (error) {
    console.error('Erro ao buscar perfil do contato:', error);
    return { name: null, pictureUrl: null };
  }
}

// Função para buscar foto e info do grupo
async function fetchGroupInfo(
  instanceName: string,
  grupoJid: string,
  evolutionApiKey: string
): Promise<{ pictureUrl: string | null; subject: string | null }> {
  try {
    console.log('Buscando info do grupo:', grupoJid);
    
    // Usar GET com query parameter conforme documentação da Evolution API
    const response = await fetch(
      `${EVOLUTION_API_URL}/group/findGroupInfos/${instanceName}?groupJid=${encodeURIComponent(grupoJid)}`,
      {
        method: 'GET',
        headers: {
          'apikey': evolutionApiKey,
        },
      }
    );

    if (!response.ok) {
      console.log('Não foi possível buscar info do grupo:', response.status, await response.text());
      return { pictureUrl: null, subject: null };
    }

    const data = await response.json();
    console.log('Resposta da API do grupo:', JSON.stringify(data, null, 2));
    
    const pictureUrl = data.pictureUrl || data.profilePictureUrl || null;
    const subject = data.subject || null;
    
    console.log('Info do grupo obtida:', { pictureUrl: pictureUrl ? 'sim' : 'não', subject });
    
    return { pictureUrl, subject };
  } catch (error) {
    console.error('Erro ao buscar info do grupo:', error);
    return { pictureUrl: null, subject: null };
  }
}

// Função para processar webhook da Meta API
async function processarWebhookMeta(payload: any, supabase: any, supabaseUrl: string, supabaseKey: string): Promise<Response> {
  console.log('=== PROCESSANDO WEBHOOK META API ===');
  
  try {
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    
    if (!value) {
      console.log('Payload Meta sem dados relevantes');
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extrair informações
    const phoneNumberId = value.metadata?.phone_number_id;
    const messages = value.messages || [];
    const statuses = value.statuses || [];
    const contacts = value.contacts || [];

    console.log('Phone Number ID:', phoneNumberId);
    console.log('Mensagens:', messages.length);
    console.log('Status:', statuses.length);

    // Buscar conexão pelo meta_phone_number_id
    const { data: conexao, error: conexaoError } = await supabase
      .from('conexoes_whatsapp')
      .select('id, conta_id, instance_name, tipo_provedor')
      .eq('meta_phone_number_id', phoneNumberId)
      .eq('tipo_provedor', 'meta')
      .single();

    if (conexaoError || !conexao) {
      console.log('Conexão Meta não encontrada para phone_number_id:', phoneNumberId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Conexão encontrada:', conexao.id);

    // Processar mensagens recebidas
    for (const msg of messages) {
      const fromNumber = msg.from;
      const messageType = msg.type;
      const timestamp = new Date(parseInt(msg.timestamp) * 1000).toISOString();
      const metaMsgId = msg.id;

      // Extrair informações de referral/anúncio da Meta
      const referral = msg.referral || msg.context?.referral;
      let adInfo: any = null;
      
      if (referral) {
        adInfo = {
          ad_id: referral.source_id || referral.ad_id,
          ad_title: referral.headline || referral.ad_title,
          ad_body: referral.body,
          ad_source: referral.source_type || 'ad',
          ad_url: referral.source_url,
          ad_image: referral.image_url || referral.photo_url,
          media_type: referral.media_type,
          ctwa_clid: referral.ctwa_clid,
          captured_at: new Date().toISOString()
        };
        console.log('📢 Lead veio de anúncio Meta:', JSON.stringify(adInfo));
      }

      let messageContent = '';
      let tipo: 'texto' | 'imagem' | 'audio' | 'video' | 'documento' = 'texto';
      let mediaUrl: string | null = null;

      // Extrair conteúdo baseado no tipo
      switch (messageType) {
        case 'text':
          messageContent = msg.text?.body || '';
          break;
        case 'image':
          tipo = 'imagem';
          messageContent = msg.image?.caption || '📷 Imagem';
          // TODO: Download media via Meta API
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

      console.log('Processando mensagem:', { from: fromNumber, tipo, conteudo: messageContent.substring(0, 50) });

      // Buscar ou criar contato
      const contactName = contacts.find((c: any) => c.wa_id === fromNumber)?.profile?.name || fromNumber;
      
      let { data: contato } = await supabase
        .from('contatos')
        .select('id')
        .eq('conta_id', conexao.conta_id)
        .eq('telefone', fromNumber)
        .single();

      if (!contato) {
        const { data: novoContato, error: contatoError } = await supabase
          .from('contatos')
          .insert({
            conta_id: conexao.conta_id,
            nome: contactName,
            telefone: fromNumber,
            metadata: adInfo ? { origem_anuncio: adInfo } : {}
          })
          .select()
          .single();

        if (contatoError) {
          console.error('Erro ao criar contato:', contatoError);
          continue;
        }
        contato = novoContato;
        console.log('Novo contato criado com origem de anúncio:', contato.id);
      } else if (adInfo) {
        // Atualizar contato existente com info de anúncio se ainda não tiver
        const { data: contatoAtual } = await supabase
          .from('contatos')
          .select('metadata')
          .eq('id', contato.id)
          .single();
        
        if (!contatoAtual?.metadata?.origem_anuncio) {
          await supabase
            .from('contatos')
            .update({ 
              metadata: { 
                ...(contatoAtual?.metadata || {}), 
                origem_anuncio: adInfo 
              }
            })
            .eq('id', contato.id);
          console.log('Contato atualizado com origem de anúncio:', contato.id);
        }
      }

      // Buscar ou criar conversa
      // IMPORTANTE: Filtrar por conexao_id para permitir conversas separadas do mesmo lead em diferentes conexões
      let { data: conversa } = await supabase
        .from('conversas')
        .select('id, agente_ia_ativo, nao_lidas, agente_ia_id, status')
        .eq('conta_id', conexao.conta_id)
        .eq('contato_id', contato.id)
        .eq('conexao_id', conexao.id)
        .eq('arquivada', false)
        .single();

      if (!conversa) {
        // Buscar agente principal
        const { data: agentePrincipal } = await supabase
          .from('agent_ia')
          .select('id')
          .eq('conta_id', conexao.conta_id)
          .eq('tipo', 'principal')
          .eq('ativo', true)
          .maybeSingle();

        const { data: novaConversa, error: conversaError } = await supabase
          .from('conversas')
          .insert({
            conta_id: conexao.conta_id,
            contato_id: contato.id,
            conexao_id: conexao.id,
            agente_ia_ativo: true,
            agente_ia_id: agentePrincipal?.id || null,
            status: 'em_atendimento',
          })
          .select()
          .single();

        if (conversaError) {
          console.error('Erro ao criar conversa:', conversaError);
          continue;
        }
        conversa = novaConversa;
      }

      // Inserir mensagem
      const { error: msgError } = await supabase.from('mensagens').insert({
        conversa_id: conversa.id,
        contato_id: contato.id,
        conteudo: messageContent,
        direcao: 'entrada',
        tipo,
        media_url: mediaUrl,
        metadata: { meta_msg_id: metaMsgId },
      });

      if (msgError) {
        console.error('Erro ao inserir mensagem:', msgError);
        continue;
      }

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

      // Se IA ativa, agendar resposta
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

        // Agendar processamento
        // @ts-ignore
        if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(
            new Promise<void>((resolve) => {
              setTimeout(async () => {
                try {
                  await fetch(`${supabaseUrl}/functions/v1/processar-resposta-agora`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
                    body: JSON.stringify({ conversa_id: conversa.id }),
                  });
                } catch (err) {
                  console.error('Erro ao chamar processador:', err);
                }
                resolve();
              }, tempoEspera * 1000);
            })
          );
        }
      }

      console.log('Mensagem Meta processada com sucesso');
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro ao processar webhook Meta:', error);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ===== VERIFICAÇÃO GET WEBHOOK META API =====
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('=== META WEBHOOK VERIFICATION ===');
    console.log('Mode:', mode, 'Token:', token, 'Challenge:', challenge);

    if (mode === 'subscribe' && token && challenge) {
      // Verificar token no banco
      const { data: conexao } = await supabase
        .from('conexoes_whatsapp')
        .select('id')
        .eq('meta_webhook_verify_token', token)
        .eq('tipo_provedor', 'meta')
        .single();

      if (conexao || token.startsWith('verify_')) {
        console.log('Token válido, retornando challenge');
        return new Response(challenge, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      
      console.log('Token não encontrado no banco');
    }

    return new Response('Forbidden', { status: 403 });
  }

  // ===== POST: Processar webhooks =====
  try {
    const dbUrl = Deno.env.get('SUPABASE_DB_URL')!;

    const payload = await req.json();
    console.log('=== WEBHOOK RECEBIDO ===');
    console.log('Payload completo:', JSON.stringify(payload, null, 2));

    // ===== DETECTOR DE ORIGEM: META API vs EVOLUTION API =====
    // Meta API envia com campo "object" = "whatsapp_business_account"
    if (payload.object === 'whatsapp_business_account') {
      console.log('=== WEBHOOK META API DETECTADO ===');
      return await processarWebhookMeta(payload, supabase, supabaseUrl, supabaseKey);
    }

    // ===== CÓDIGO EVOLUTION (100% ORIGINAL ABAIXO) =====
    // Evolution API pode enviar eventos em diferentes formatos
    const event = payload.event?.toLowerCase() || '';
    const instance = payload.instance;
    const data = payload.data;

    // OTIMIZAÇÃO: Early-exit para eventos não relevantes
    const eventosRelevantes = ['messages.upsert', 'messages_upsert', 'message', 'messages.reaction', 'connection.update', 'connection_update', 'qrcode.updated', 'qrcode_updated', 'qr'];
    const normalizedEvent = event.replace(/_/g, '.').toLowerCase();
    
    if (!eventosRelevantes.includes(normalizedEvent) && !eventosRelevantes.includes(event)) {
      console.log('Evento não relevante, ignorando:', event);
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Evento:', event);
    console.log('Instância:', instance);
    console.log('Evento normalizado:', normalizedEvent);

    // Tratar evento de atualização de conexão
    if (normalizedEvent === 'connection.update' || event === 'connection_update') {
      console.log('=== EVENTO DE CONEXÃO ===');
      console.log('Data:', JSON.stringify(data));
      
      const state = data?.state || data?.status;
      let status: 'conectado' | 'desconectado' | 'aguardando' = 'desconectado';
      
      if (state === 'open' || state === 'connected') {
        status = 'conectado';
      } else if (state === 'connecting' || state === 'qr') {
        status = 'aguardando';
      } else if (state === 'close' || state === 'disconnected') {
        status = 'desconectado';
      }

      console.log('Status calculado:', status);

      // Extrair número do telefone
      const numero = data?.instance?.owner?.split('@')[0] || 
                    data?.ownerJid?.split('@')[0] || 
                    null;

      const { error: updateError } = await supabase
        .from('conexoes_whatsapp')
        .update({ 
          status,
          numero,
        })
        .eq('instance_name', instance);

      if (updateError) {
        console.error('Erro ao atualizar status:', updateError);
      } else {
        console.log('Status atualizado para:', status, 'Número:', numero);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tratar reações de mensagens (igual WhatsApp)
    if (normalizedEvent === 'messages.reaction' || event === 'messages_reaction') {
      console.log('=== EVENTO DE REAÇÃO ===');
      console.log('Data:', JSON.stringify(data, null, 2));
      
      // Extrair dados da reação
      const reaction = data?.reaction || data;
      const reactionKey = reaction?.key || {};
      const reactionId = reactionKey.id; // ID da mensagem que recebeu a reação
      const emoji = reaction?.text || reaction?.reaction; // Emoji da reação (vazio = remoção)
      const reactionFrom = reactionKey.remoteJid?.replace('@s.whatsapp.net', '').replace('@c.us', '');
      const reactionParticipant = reactionKey.participant?.replace('@s.whatsapp.net', '').replace('@c.us', '');
      
      console.log('Reação:', { reactionId, emoji, reactionFrom, reactionParticipant });
      
      if (!reactionId) {
        console.log('ID da mensagem não encontrado na reação, ignorando');
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
      
      // Buscar a mensagem original pelo evolution_msg_id
      const { data: mensagemOriginal, error: msgError } = await supabase
        .from('mensagens')
        .select('id, metadata, conversa_id')
        .contains('metadata', { evolution_msg_id: reactionId })
        .maybeSingle();
      
      if (msgError || !mensagemOriginal) {
        console.log('Mensagem original não encontrada para reação:', reactionId);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
      
      console.log('Mensagem encontrada:', mensagemOriginal.id);
      
      // Obter reações existentes
      const metadataAtual = (mensagemOriginal.metadata as Record<string, any>) || {};
      let reactions: Array<{ emoji: string; from: string; timestamp: string }> = metadataAtual.reactions || [];
      
      const reagente = reactionParticipant || reactionFrom || 'desconhecido';
      
      if (emoji && emoji.trim() !== '') {
        // Adicionar/atualizar reação
        // Remover reação anterior do mesmo usuário (se existir)
        reactions = reactions.filter(r => r.from !== reagente);
        // Adicionar nova reação
        reactions.push({
          emoji: emoji,
          from: reagente,
          timestamp: new Date().toISOString()
        });
        console.log('Reação adicionada:', emoji, 'de:', reagente);
      } else {
        // Remover reação (emoji vazio significa remoção)
        reactions = reactions.filter(r => r.from !== reagente);
        console.log('Reação removida de:', reagente);
      }
      
      // Atualizar metadata da mensagem com as reações
      const novaMetadata = { ...metadataAtual, reactions };
      
      const { error: updateError } = await supabase
        .from('mensagens')
        .update({ metadata: novaMetadata })
        .eq('id', mensagemOriginal.id);
      
      if (updateError) {
        console.error('Erro ao atualizar reação:', updateError);
      } else {
        console.log('Reação salva com sucesso. Total de reações:', reactions.length);
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tratar evento de atualização do QR Code
    if (normalizedEvent === 'qrcode.updated' || event === 'qrcode_updated' || event === 'qr') {
      console.log('=== EVENTO DE QRCODE ===');
      
      const qrcode = data?.qrcode?.base64 || data?.qrcode || data?.base64;
      
      if (qrcode) {
        console.log('QR Code recebido para instância:', instance);
        
        await supabase
          .from('conexoes_whatsapp')
          .update({ 
            qrcode,
            status: 'aguardando',
          })
          .eq('instance_name', instance);
          
        console.log('QR Code salvo no banco');
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tratar mensagens recebidas (vários formatos possíveis)
    if (normalizedEvent === 'messages.upsert' || event === 'messages_upsert' || event === 'message') {
      console.log('=== EVENTO DE MENSAGEM ===');
      console.log('Data:', JSON.stringify(data, null, 2));

      // Extrair dados da mensagem (múltiplos formatos)
      const message = data?.message || data?.messages?.[0] || data;
      const key = data?.key || message?.key || {};
      const remoteJid = key.remoteJid || data?.remoteJid || data?.from;
      const fromMe = key.fromMe ?? data?.fromMe ?? false;
      const pushName = data?.pushName || message?.pushName || '';
      
      // Extrair participante do grupo (quem enviou a mensagem)
      const participant = key.participant || data?.participant || null;

      console.log('RemoteJid:', remoteJid);
      console.log('FromMe:', fromMe);
      console.log('PushName:', pushName);
      console.log('Participant:', participant);

      if (!remoteJid) {
        console.log('RemoteJid não encontrado, ignorando');
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // Detectar se é mensagem de grupo
      const isGrupo = remoteJid.includes('@g.us');
      
      // Extrair telefone do participante (para grupos)
      const participanteTelefone = participant 
        ? participant.replace('@s.whatsapp.net', '').replace('@c.us', '')
        : null;
      console.log('É grupo:', isGrupo);

      // Extrair conteúdo da mensagem
      let messageContent = '';
      let messageType: 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'sticker' = 'texto';
      let mediaUrl: string | null = null;
      let needsMediaDownload = false;
      const messageId = key.id;

      // Diferentes estruturas de mensagem na Evolution API
      const msgContent = message?.message || message;
      
      if (msgContent?.conversation) {
        messageContent = msgContent.conversation;
      } else if (msgContent?.extendedTextMessage?.text) {
        messageContent = msgContent.extendedTextMessage.text;
      } else if (msgContent?.imageMessage) {
        messageType = 'imagem';
        messageContent = msgContent.imageMessage.caption || '📷 Imagem';
        needsMediaDownload = true;
      } else if (msgContent?.audioMessage) {
        messageType = 'audio';
        messageContent = '🎵 Áudio';
        needsMediaDownload = true;
      } else if (msgContent?.videoMessage) {
        messageType = 'video';
        messageContent = msgContent.videoMessage.caption || '🎬 Vídeo';
        needsMediaDownload = true;
      } else if (msgContent?.documentMessage) {
        messageType = 'documento';
        messageContent = msgContent.documentMessage.fileName || '📄 Documento';
        needsMediaDownload = true;
      } else if (msgContent?.stickerMessage) {
        messageType = 'sticker';
        messageContent = '🎨 Sticker';
        needsMediaDownload = true;
      } else if (typeof message === 'string') {
        messageContent = message;
      } else if (data?.body) {
        messageContent = data.body;
      }

      console.log('Conteúdo da mensagem:', messageContent);
      console.log('Tipo:', messageType);

      // === EXTRAIR DADOS DE ANÚNCIO DO CONTEXTINFO (Evolution API) ===
      let dadosAnuncio: {
        ad_id?: string;
        ad_title?: string;
        ad_body?: string;
        ad_source?: string;
        ad_url?: string;
        ad_image?: string;
        ctwa_clid?: string;
        captured_at?: string;
      } | null = null;

      // Buscar contextInfo em diferentes locais possíveis do payload
      const contextInfo = 
        msgContent?.extendedTextMessage?.contextInfo ||
        msgContent?.imageMessage?.contextInfo ||
        msgContent?.videoMessage?.contextInfo ||
        msgContent?.audioMessage?.contextInfo ||
        msgContent?.documentMessage?.contextInfo ||
        msgContent?.contextInfo ||
        message?.contextInfo;

      if (contextInfo?.externalAdReplyInfo) {
        const adInfo = contextInfo.externalAdReplyInfo;
        console.log('=== DADOS DE ANÚNCIO DETECTADOS ===');
        console.log('ExternalAdReplyInfo:', JSON.stringify(adInfo));
        
        // Verificar se realmente tem dados relevantes de anúncio
        if (adInfo.showAdAttribution || adInfo.ctwaClid || adInfo.sourceId || adInfo.title) {
          dadosAnuncio = {
            ad_id: adInfo.sourceId || adInfo.ctwaClid || undefined,
            ad_title: adInfo.title || undefined,
            ad_body: adInfo.body || undefined,
            ad_source: adInfo.sourceType === 'ig' ? 'instagram' : 'facebook',
            ad_url: adInfo.sourceUrl || undefined,
            ad_image: adInfo.thumbnailUrl || adInfo.originalImageUrl || adInfo.previewType || undefined,
            ctwa_clid: adInfo.ctwaClid || undefined,
            captured_at: new Date().toISOString()
          };
          console.log('📢 Lead veio de anúncio Meta (Evolution):', JSON.stringify(dadosAnuncio));
        }
      }

      if (!messageContent) {
        console.log('Sem conteúdo de mensagem, ignorando');
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // Extrair identificador do contato/grupo
      const telefone = isGrupo 
        ? remoteJid.replace('@g.us', '') 
        : remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
      const grupoJid = isGrupo ? remoteJid : null;
      console.log('Telefone/ID:', telefone, 'Grupo JID:', grupoJid);

      // Buscar conexão pela instância
      const { data: conexao, error: conexaoError } = await supabase
        .from('conexoes_whatsapp')
        .select('id, conta_id, instance_name, token, tipo_canal')
        .eq('instance_name', instance)
        .single();
      
      // Determinar canal (whatsapp ou instagram)
      const canal = conexao?.tipo_canal || 'whatsapp';

      if (conexaoError || !conexao) {
        console.log('Conexão não encontrada para instância:', instance);
        return new Response(JSON.stringify({ error: 'Conexão não encontrada' }), { 
          status: 200,
          headers: corsHeaders 
        });
      }

      console.log('Conexão encontrada:', conexao.id, 'Conta:', conexao.conta_id);

      // Buscar chave OpenAI da conta para transcrição/análise de imagem
      let openaiApiKey: string | null = null;
      const { data: contaData } = await supabase
        .from('contas')
        .select('openai_api_key')
        .eq('id', conexao.conta_id)
        .single();
      openaiApiKey = contaData?.openai_api_key || null;

      // Se é mídia, fazer download e salvar no Storage
      let transcricaoAudio: string | null = null;
      let descricaoImagem: string | null = null;
      let textoDocumento: string | null = null;
      
      if (needsMediaDownload && messageId) {
        console.log('Baixando mídia:', messageType, messageId);
        try {
          const downloadResponse = await fetch(
            `${supabaseUrl}/functions/v1/download-media`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                instance_name: instance,
                message_id: messageId,
                message_type: messageType,
              }),
            }
          );

          if (downloadResponse.ok) {
            const downloadData = await downloadResponse.json();
            mediaUrl = downloadData.url;
            console.log('Mídia baixada com sucesso:', mediaUrl);

            // Se for áudio e tiver chave OpenAI, transcrever
            if (messageType === 'audio' && openaiApiKey && downloadData.base64) {
              console.log('=== TRANSCREVENDO ÁUDIO ===');
              try {
                const transcribeResponse = await fetch(
                  `${supabaseUrl}/functions/v1/transcrever-audio`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabaseKey}`,
                    },
                    body: JSON.stringify({
                      audio_base64: downloadData.base64,
                      mime_type: downloadData.mimeType,
                      openai_api_key: openaiApiKey,
                    }),
                  }
                );

                if (transcribeResponse.ok) {
                  const transcribeData = await transcribeResponse.json();
                  if (transcribeData.sucesso && transcribeData.transcricao) {
                    transcricaoAudio = transcribeData.transcricao;
                    console.log('Transcrição obtida:', transcricaoAudio?.substring(0, 100));
                  }
                } else {
                  console.error('Erro na transcrição:', await transcribeResponse.text());
                }
              } catch (transcribeError) {
                console.error('Erro ao chamar transcrever-audio:', transcribeError);
              }
            }

            // Se for imagem e tiver chave OpenAI, analisar
            if (messageType === 'imagem' && openaiApiKey && downloadData.base64) {
              console.log('=== ANALISANDO IMAGEM ===');
              try {
                const analiseResponse = await fetch(
                  `${supabaseUrl}/functions/v1/analisar-imagem`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabaseKey}`,
                    },
                    body: JSON.stringify({
                      imagem_base64: downloadData.base64,
                      mime_type: downloadData.mimeType,
                      openai_api_key: openaiApiKey,
                    }),
                  }
                );

                if (analiseResponse.ok) {
                  const analiseData = await analiseResponse.json();
                  if (analiseData.sucesso && analiseData.descricao) {
                    descricaoImagem = analiseData.descricao;
                    console.log('Descrição da imagem obtida:', descricaoImagem?.substring(0, 100));
                  }
                } else {
                  console.error('Erro na análise de imagem:', await analiseResponse.text());
                }
              } catch (analiseError) {
                console.error('Erro ao chamar analisar-imagem:', analiseError);
              }
            }

            // Se for documento PDF, extrair texto usando OpenAI
            if (messageType === 'documento' && downloadData.mimeType?.includes('pdf') && downloadData.base64) {
              console.log('=== EXTRAINDO TEXTO DO PDF ===');
              try {
                const extractResponse = await fetch(
                  `${supabaseUrl}/functions/v1/extrair-texto-pdf`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabaseKey}`,
                    },
                    body: JSON.stringify({
                      pdf_base64: downloadData.base64,
                      mime_type: downloadData.mimeType,
                      conta_id: conexao.conta_id,
                    }),
                  }
                );

                if (extractResponse.ok) {
                  const extractData = await extractResponse.json();
                  if (extractData.sucesso && extractData.texto) {
                    textoDocumento = extractData.texto;
                    console.log('Texto extraído do PDF:', textoDocumento?.substring(0, 100));
                  }
                } else {
                  console.error('Erro na extração de texto:', await extractResponse.text());
                }
              } catch (extractError) {
                console.error('Erro ao chamar extrair-texto-pdf:', extractError);
              }
            }
          } else {
            console.error('Erro ao baixar mídia:', await downloadResponse.text());
          }
        } catch (downloadError) {
          console.error('Erro ao chamar download-media:', downloadError);
        }
      }

      // Buscar token da conexão para usar na API Evolution
      const { data: conexaoCompleta } = await supabase
        .from('conexoes_whatsapp')
        .select('token, instance_name')
        .eq('id', conexao.id)
        .single();

      // Buscar ou criar contato (ou grupo)
      let { data: contato } = await supabase
        .from('contatos')
        .select('id, avatar_url, is_grupo, metadata')
        .eq('conta_id', conexao.conta_id)
        .eq('telefone', telefone)
        .single();

      if (!contato) {
        console.log('Criando novo contato/grupo...');
        
        let avatarUrl: string | null = null;
        let nomeContato = telefone; // Usar telefone como fallback inicial
        
        if (isGrupo && conexaoCompleta?.token && grupoJid) {
          // Buscar info do grupo (foto + nome)
          const groupInfo = await fetchGroupInfo(instance, grupoJid, conexaoCompleta.token);
          avatarUrl = groupInfo.pictureUrl;
          nomeContato = groupInfo.subject || pushName || `Grupo ${telefone}`;
        } else if (!isGrupo && conexaoCompleta?.token) {
          // Para contatos individuais, buscar perfil completo (nome + foto)
          const profile = await fetchContactProfile(instance, telefone, conexaoCompleta.token);
          avatarUrl = profile.pictureUrl;
          
          // Se NÃO é mensagem enviada por mim, usar pushName
          // Se É mensagem enviada por mim, usar nome do perfil buscado (pushName é MEU nome)
          if (fromMe) {
            // Mensagem enviada: pushName é MEU nome, então usar nome do perfil do contato
            nomeContato = profile.name || telefone;
            console.log('Mensagem enviada (fromMe): usando nome do perfil:', nomeContato);
          } else {
            // Mensagem recebida: pushName é o nome do remetente (correto)
            nomeContato = pushName || profile.name || telefone;
            console.log('Mensagem recebida: usando pushName:', nomeContato);
          }
        } else {
          // Sem token, usar pushName apenas se não for fromMe
          nomeContato = fromMe ? telefone : (pushName || telefone);
        }
        
        // Preparar metadata com dados de anúncio se existirem
        const metadataContato = dadosAnuncio ? { origem_anuncio: dadosAnuncio } : {};
        
        const { data: novoContato, error: contatoError } = await supabase
          .from('contatos')
          .insert({
            conta_id: conexao.conta_id,
            nome: nomeContato,
            telefone,
            avatar_url: avatarUrl,
            is_grupo: isGrupo,
            grupo_jid: grupoJid,
            canal: canal, // Salvar canal de origem
            metadata: metadataContato,
          })
          .select()
          .single();
          
        if (contatoError) {
          console.error('Erro ao criar contato:', contatoError);
          throw contatoError;
        }
        contato = novoContato;
        console.log('Contato criado:', contato?.id, 'É grupo:', isGrupo, 'Avatar:', avatarUrl ? 'sim' : 'não', 'Origem anúncio:', dadosAnuncio ? 'sim' : 'não');
      } else if (conexaoCompleta?.token && isGrupo && grupoJid) {
        // Grupo existente - sempre tentar atualizar nome e foto
        console.log('Grupo existente, buscando info atualizada...');
        
        const groupInfo = await fetchGroupInfo(instance, grupoJid, conexaoCompleta.token);
        
        const updates: Record<string, string> = {};
        if (groupInfo.subject) updates.nome = groupInfo.subject;
        if (groupInfo.pictureUrl) updates.avatar_url = groupInfo.pictureUrl;
        
        if (Object.keys(updates).length > 0) {
          await supabase
            .from('contatos')
            .update(updates)
            .eq('id', contato.id);
          console.log('Grupo atualizado:', updates);
        }
      } else if (!contato.avatar_url && conexaoCompleta?.token && !isGrupo) {
        // Contato individual sem foto, tentar buscar
        console.log('Contato sem foto, buscando...');
        
        const avatarUrl = await fetchProfilePicture(instance, telefone, conexaoCompleta.token);
        
        if (avatarUrl) {
          await supabase
            .from('contatos')
            .update({ avatar_url: avatarUrl })
            .eq('id', contato.id);
          console.log('Foto de perfil atualizada para contato existente');
        }
      }

      // Atualizar contato existente com dados de anúncio se ainda não tiver
      if (contato && dadosAnuncio) {
        const metadataAtual = (contato as any).metadata || {};
        if (!metadataAtual.origem_anuncio) {
          console.log('📢 Adicionando origem de anúncio ao contato existente...');
          await supabase
            .from('contatos')
            .update({
              metadata: { ...metadataAtual, origem_anuncio: dadosAnuncio }
            })
            .eq('id', contato.id);
          console.log('Origem de anúncio adicionada ao contato:', contato.id);
        } else {
          console.log('Contato já possui origem de anúncio registrada');
        }
      }

      // Buscar conversa existente usando SQL direto para evitar cache do PostgREST
      console.log('Buscando conversa existente...');
      
      // Usar fetch direto para a API REST do Supabase com header para ignorar cache
      // IMPORTANTE: Buscar conversa por conta_id + contato_id + conexao_id para permitir
      // conversas separadas do mesmo lead em diferentes conexões
      const conversaResponse = await fetch(
        `${supabaseUrl}/rest/v1/conversas?conta_id=eq.${conexao.conta_id}&contato_id=eq.${contato!.id}&conexao_id=eq.${conexao.id}&arquivada=eq.false&select=id,agente_ia_ativo,nao_lidas,agente_ia_id,status,conexao_id`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.pgrst.object+json',
            'Prefer': 'return=representation',
          },
        }
      );

      let conversa: { id: string; agente_ia_ativo: boolean; nao_lidas: number; agente_ia_id: string | null; status: string | null; conexao_id: string | null } | null = null;
      
      if (conversaResponse.ok) {
        const conversaData = await conversaResponse.json();
        if (conversaData && !conversaData.code) {
          conversa = conversaData;
          console.log('Conversa encontrada:', conversa?.id, 'status:', conversa?.status, 'conexao_id:', conversa?.conexao_id);
        }
      }

      if (!conversa) {
        console.log('Criando nova conversa com SQL direto...');
        
        // Para grupos, SEMPRE desativar IA. Para contatos individuais, buscar agente principal
        let agenteIaAtivo = !isGrupo; // Grupos sempre com IA desativada
        let agenteIaId: string | null = null;
        
        if (!isGrupo) {
          // Buscar agente principal da conta apenas para contatos individuais
          const { data: agentePrincipal } = await supabase
            .from('agent_ia')
            .select('id')
            .eq('conta_id', conexao.conta_id)
            .eq('tipo', 'principal')
            .eq('ativo', true)
            .maybeSingle();
          
          agenteIaId = agentePrincipal?.id || null;
          console.log('Agente principal encontrado:', agenteIaId);
        } else {
          console.log('Grupo detectado - IA desativada automaticamente');
        }
        
        // Inserir conversa usando SQL direto
        const insertResponse = await fetch(
          `${supabaseUrl}/rest/v1/conversas`,
          {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
            },
            body: JSON.stringify({
              conta_id: conexao.conta_id,
              contato_id: contato!.id,
              conexao_id: conexao.id,
              agente_ia_ativo: agenteIaAtivo,
              agente_ia_id: agenteIaId,
              status: 'em_atendimento',
              canal: canal, // Salvar canal de origem (whatsapp ou instagram)
            }),
          }
        );

        if (!insertResponse.ok) {
          const errorText = await insertResponse.text();
          console.error('Erro ao criar conversa:', errorText);
          throw new Error(`Erro ao criar conversa: ${errorText}`);
        }

        const novaConversa = await insertResponse.json();
        conversa = Array.isArray(novaConversa) ? novaConversa[0] : novaConversa;
        console.log('Conversa criada:', conversa?.id);
      }

      // VERIFICAR SE MENSAGEM JÁ FOI PROCESSADA (tabela independente)
      // Isso previne reprocessamento mesmo após exclusão de contato/conversa
      if (messageId) {
        const { data: jaProcessada } = await supabase
          .from('mensagens_processadas')
          .select('id')
          .eq('evolution_msg_id', messageId)
          .eq('conta_id', conexao.conta_id)
          .maybeSingle();

        if (jaProcessada) {
          console.log('Mensagem já foi processada anteriormente:', messageId);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
      }

      // Verificar se mensagem já existe (evitar duplicação com polling)
      if (messageId) {
        const { data: existingMsg } = await supabase
          .from('mensagens')
          .select('id')
          .eq('conversa_id', conversa!.id)
          .contains('metadata', { evolution_msg_id: messageId })
          .maybeSingle();
          
        if (existingMsg) {
          console.log('Mensagem já existe, ignorando:', messageId);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
      }

      // Inserir mensagem com evolution_msg_id, transcrição, descrição de imagem e info do participante nos metadados
      // Se fromMe = true (veio do dispositivo físico via webhook), marcar como enviada_por_dispositivo
      const messageMetadata: Record<string, any> = {};
      if (messageId) {
        messageMetadata.evolution_msg_id = messageId;
      }
      if (transcricaoAudio) {
        messageMetadata.transcricao = transcricaoAudio;
      }
      if (descricaoImagem) {
        messageMetadata.descricao_imagem = descricaoImagem;
      }
      if (textoDocumento) {
        messageMetadata.texto_documento = textoDocumento;
      }
      // Adicionar info do participante para mensagens de grupo
      if (isGrupo && !fromMe && participanteTelefone) {
        messageMetadata.participante_nome = pushName || participanteTelefone;
        messageMetadata.participante_telefone = participanteTelefone;
        console.log('Info do participante adicionada:', messageMetadata.participante_nome, messageMetadata.participante_telefone);
      }
      
      const { error: msgError } = await supabase.from('mensagens').insert({
        conversa_id: conversa!.id,
        contato_id: contato!.id,
        conteudo: messageContent,
        direcao: fromMe ? 'saida' : 'entrada',
        tipo: messageType,
        media_url: mediaUrl,
        enviada_por_dispositivo: fromMe,
        metadata: messageMetadata,
      });

      if (msgError) {
        console.error('Erro ao inserir mensagem:', msgError);
        throw msgError;
      }

      console.log('Mensagem inserida com sucesso');

      // REGISTRAR MENSAGEM COMO PROCESSADA (previne reprocessamento após exclusão)
      if (messageId) {
        await supabase.from('mensagens_processadas').upsert({
          evolution_msg_id: messageId,
          conta_id: conexao.conta_id,
          telefone,
        }, { onConflict: 'evolution_msg_id,conta_id', ignoreDuplicates: true });
      }

      // Verificar se conversa estava encerrada e está sendo reaberta pelo lead
      const conversaEstaReabrindo = conversa?.status === 'encerrado' && !fromMe && !isGrupo;
      let agenteIaAtivoFinal = conversa?.agente_ia_ativo || false;
      let agenteIaIdFinal = conversa?.agente_ia_id;

      if (conversaEstaReabrindo) {
        console.log('=== CONVERSA ENCERRADA RECEBENDO NOVA MENSAGEM ===');
        
        // Buscar configuração da conta para saber como reabrir
        const { data: contaConfig } = await supabase
          .from('contas')
          .select('reabrir_com_ia')
          .eq('id', conexao.conta_id)
          .single();
        
        const reabrirComIA = contaConfig?.reabrir_com_ia ?? true;
        console.log('Configuração reabrir_com_ia:', reabrirComIA);
        
        if (reabrirComIA) {
          // Buscar agente principal ativo da conta
          const { data: agentePrincipal } = await supabase
            .from('agent_ia')
            .select('id')
            .eq('conta_id', conexao.conta_id)
            .eq('tipo', 'principal')
            .eq('ativo', true)
            .maybeSingle();
          
          if (agentePrincipal) {
            agenteIaAtivoFinal = true;
            agenteIaIdFinal = agentePrincipal.id;
            console.log('Agente principal reativado:', agentePrincipal.id);
          } else {
            console.log('Nenhum agente principal ativo encontrado');
          }
        } else {
          console.log('Configuração define reabertura com atendimento humano');
          agenteIaAtivoFinal = false;
        }
      }

      // Atualizar conversa usando fetch direto
      const updateData: Record<string, any> = {
        ultima_mensagem: messageContent,
        ultima_mensagem_at: new Date().toISOString(),
        nao_lidas: fromMe ? 0 : (conversa?.nao_lidas || 0) + 1,
        status: fromMe ? 'aguardando_cliente' : 'em_atendimento',
      };

      // Se conversa está reabrindo, aplicar configurações de reativação
      if (conversaEstaReabrindo) {
        updateData.agente_ia_ativo = agenteIaAtivoFinal;
        updateData.agente_ia_id = agenteIaIdFinal;
        updateData.etapa_ia_atual = null; // Começar do início
        updateData.memoria_limpa_em = new Date().toISOString(); // Limpar memória anterior
        console.log('Dados de reabertura:', { agente_ia_ativo: agenteIaAtivoFinal, agente_ia_id: agenteIaIdFinal });
      }

      // Se mensagem veio do dispositivo externo, pausar o agente IA automaticamente
      if (fromMe) {
        updateData.agente_ia_ativo = false;
        console.log('Mensagem do dispositivo externo - pausando agente IA automaticamente');
      }

      const updateResponse = await fetch(
        `${supabaseUrl}/rest/v1/conversas?id=eq.${conversa!.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        }
      );

      if (!updateResponse.ok) {
        console.error('Erro ao atualizar conversa:', await updateResponse.text());
      }

      console.log('Conversa atualizada com sucesso');

      // Sistema de debounce: agendar resposta com tempo_espera_segundos
      // IMPORTANTE: Nunca agendar resposta IA para grupos
      // Usar agenteIaAtivoFinal para considerar reativação em conversas reabertas
      if (agenteIaAtivoFinal && !fromMe && !isGrupo) {
        console.log('=== AGENDANDO RESPOSTA IA COM DEBOUNCE ===');
        
        try {
          // Buscar tempo de espera do agente
          let tempoEspera = 5; // default 5 segundos
          
          if (agenteIaIdFinal) {
            const { data: agenteConfig } = await supabase
              .from('agent_ia')
              .select('tempo_espera_segundos')
              .eq('id', agenteIaIdFinal)
              .single();
            
            if (agenteConfig?.tempo_espera_segundos) {
              tempoEspera = agenteConfig.tempo_espera_segundos;
            }
          }
          
          console.log('Tempo de espera configurado:', tempoEspera, 'segundos');
          
          // Calcular quando responder (agora + tempo_espera)
          const responderEm = new Date(Date.now() + tempoEspera * 1000).toISOString();
          
          // Upsert na tabela respostas_pendentes (atualiza se já existir)
          const { error: upsertError } = await supabase
            .from('respostas_pendentes')
            .upsert({
              conversa_id: conversa!.id,
              responder_em: responderEm,
            }, { 
              onConflict: 'conversa_id',
            });
          
          if (upsertError) {
            console.error('Erro ao agendar resposta:', upsertError);
          } else {
            console.log('Resposta agendada para:', responderEm);
            
            const conversaId = conversa!.id;
            
            // Usar EdgeRuntime.waitUntil para agendar processamento após delay
            // @ts-ignore - EdgeRuntime é disponível no ambiente Deno/Supabase
            if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
              // @ts-ignore
              EdgeRuntime.waitUntil(
                new Promise<void>((resolve) => {
                  setTimeout(async () => {
                    try {
                      console.log('Executando processamento agendado para conversa:', conversaId);
                      
                      await fetch(
                        `${supabaseUrl}/functions/v1/processar-resposta-agora`,
                        {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${supabaseKey}`,
                          },
                          body: JSON.stringify({ conversa_id: conversaId }),
                        }
                      );
                    } catch (err) {
                      console.error('Erro ao chamar processador:', err);
                    }
                    resolve();
                  }, tempoEspera * 1000);
                })
              );
              console.log('Processamento agendado via EdgeRuntime.waitUntil');
            } else {
              // Fallback: chamar imediatamente (sem delay)
              console.log('EdgeRuntime.waitUntil não disponível, chamando imediatamente');
              fetch(
                `${supabaseUrl}/functions/v1/processar-resposta-agora`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({ conversa_id: conversaId }),
                }
              ).catch(err => console.error('Erro no fallback:', err));
            }
          }
        } catch (debounceError) {
          console.error('Erro no sistema de debounce:', debounceError);
        }
      }

      console.log('=== FIM DO PROCESSAMENTO ===');
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro no webhook:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
