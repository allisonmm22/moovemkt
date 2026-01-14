import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declaração do EdgeRuntime para Supabase Edge Functions
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para baixar mídia da Meta/Instagram API
async function downloadInstagramMedia(
  mediaId: string,
  accessToken: string,
  mediaType: string,
  contaId: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<{ success: boolean; url?: string; base64?: string; mimeType?: string; error?: string }> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/meta-download-media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        media_id: mediaId,
        access_token: accessToken,
        media_type: mediaType,
        conta_id: contaId,
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      return {
        success: true,
        url: result.url,
        base64: result.base64,
        mimeType: result.mime_type,
      };
    }

    return { success: false, error: result.error };
  } catch (error) {
    console.error('[instagram-webhook] Erro ao baixar mídia:', error);
    return { success: false, error: String(error) };
  }
}

// Função para analisar imagem
async function analisarImagem(
  base64: string,
  mimeType: string,
  openaiKey: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<string | null> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/analisar-imagem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        image_base64: base64,
        mime_type: mimeType,
        openai_api_key: openaiKey,
      }),
    });

    const result = await response.json();
    return result.description || null;
  } catch (error) {
    console.error('[instagram-webhook] Erro ao analisar imagem:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const url = new URL(req.url);
    
    // Meta/Instagram envia verificação via GET
    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      console.log('=== INSTAGRAM WEBHOOK VERIFICATION ===');
      console.log('Mode:', mode);
      console.log('Token:', token);
      console.log('Challenge:', challenge);

      if (mode === 'subscribe' && token && challenge) {
        // Buscar conexão pelo verify_token
        const { data: conexao } = await supabase
          .from('conexoes_whatsapp')
          .select('id')
          .eq('meta_webhook_verify_token', token)
          .eq('tipo_provedor', 'instagram')
          .single();

        if (conexao) {
          console.log('[instagram-webhook] Token válido para conexão:', conexao.id);
          return new Response(challenge, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }

        // Aceitar tokens no formato verify_*
        if (token.startsWith('verify_')) {
          console.log('[instagram-webhook] Token com formato válido, aceitando verificação');
          return new Response(challenge, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }

        console.log('[instagram-webhook] Token não encontrado no banco');
      }

      console.log('[instagram-webhook] Verificação inválida');
      return new Response('Forbidden', { status: 403 });
    }

    // POST = mensagens recebidas
    if (req.method === 'POST') {
      const payload = await req.json();
      console.log('=== INSTAGRAM WEBHOOK MESSAGE ===');
      console.log('Payload:', JSON.stringify(payload, null, 2));

      // Instagram usa o mesmo formato de webhook que o WhatsApp Business
      const entry = payload.entry?.[0];
      
      if (!entry) {
        console.log('[instagram-webhook] Payload sem entry');
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Instagram pode enviar messaging ou changes
      const messaging = entry.messaging?.[0];
      const changes = entry.changes?.[0];

      // Processar mensagens do Instagram Messaging API
      if (messaging) {
        return await processInstagramMessaging(messaging, entry.id, supabase, supabaseUrl, supabaseKey);
      }

      // Processar changes (formato alternativo)
      if (changes?.value?.messages) {
        return await processInstagramChanges(changes.value, supabase, supabaseUrl, supabaseKey);
      }

      console.log('[instagram-webhook] Nenhuma mensagem para processar');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('[instagram-webhook] Erro:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Processa mensagens no formato Instagram Messaging API
async function processInstagramMessaging(
  messaging: any,
  pageId: string,
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string
) {
  const senderId = messaging.sender?.id;
  const recipientId = messaging.recipient?.id;
  const message = messaging.message;
  const timestamp = messaging.timestamp;

  console.log('[instagram-webhook] Processando messaging:', { senderId, recipientId, pageId });

  if (!senderId || !message) {
    console.log('[instagram-webhook] Mensagem sem sender ou message');
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Ignorar mensagens enviadas pela própria página (echo)
  if (message.is_echo) {
    console.log('[instagram-webhook] Ignorando echo message');
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Buscar conexão pelo page_id (armazenado em meta_phone_number_id)
  const { data: conexao, error: conexaoError } = await supabase
    .from('conexoes_whatsapp')
    .select('id, conta_id, meta_access_token')
    .or(`meta_phone_number_id.eq.${pageId},meta_phone_number_id.eq.${recipientId}`)
    .eq('tipo_provedor', 'instagram')
    .single();

  if (conexaoError || !conexao) {
    console.log('[instagram-webhook] Conexão não encontrada para page:', pageId);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('[instagram-webhook] Conexão encontrada:', conexao.id);

  // Buscar OpenAI API key da conta
  const { data: conta } = await supabase
    .from('contas')
    .select('openai_api_key')
    .eq('id', conexao.conta_id)
    .single();

  const openaiKey = conta?.openai_api_key;

  // Buscar agente principal da conta
  const { data: agentePrincipal } = await supabase
    .from('agent_ia')
    .select('id, tempo_espera_segundos')
    .eq('conta_id', conexao.conta_id)
    .eq('tipo', 'principal')
    .eq('ativo', true)
    .maybeSingle();

  console.log('[instagram-webhook] Agente principal:', agentePrincipal?.id || 'nenhum');

  // Determinar tipo e conteúdo da mensagem
  let messageContent = '';
  let tipo = 'texto';
  let mediaUrl: string | null = null;
  let metadata: Record<string, any> = { instagram_msg_id: message.mid };

  if (message.text) {
    messageContent = message.text;
  } else if (message.attachments) {
    const attachment = message.attachments[0];
    const attachmentType = attachment.type;
    const attachmentPayload = attachment.payload;

    switch (attachmentType) {
      case 'image':
        tipo = 'imagem';
        mediaUrl = attachmentPayload?.url || null;
        messageContent = '📷 Imagem';
        
        // Tentar baixar e analisar imagem
        if (attachmentPayload?.url && openaiKey) {
          try {
            // Baixar imagem diretamente da URL do Instagram
            const imgResponse = await fetch(attachmentPayload.url);
            if (imgResponse.ok) {
              const arrayBuffer = await imgResponse.arrayBuffer();
              const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
              const mimeType = imgResponse.headers.get('content-type') || 'image/jpeg';
              
              const descricao = await analisarImagem(base64, mimeType, openaiKey, supabaseUrl, supabaseKey);
              if (descricao) {
                metadata.descricao_imagem = descricao;
                console.log('[instagram-webhook] Descrição da imagem:', descricao.substring(0, 100));
              }
            }
          } catch (e) {
            console.error('[instagram-webhook] Erro ao processar imagem:', e);
          }
        }
        break;

      case 'video':
        tipo = 'video';
        mediaUrl = attachmentPayload?.url || null;
        messageContent = '🎬 Vídeo';
        break;

      case 'audio':
        tipo = 'audio';
        mediaUrl = attachmentPayload?.url || null;
        messageContent = '🎵 Áudio';
        break;

      case 'file':
        tipo = 'documento';
        mediaUrl = attachmentPayload?.url || null;
        messageContent = '📄 Arquivo';
        break;

      case 'share':
        tipo = 'texto';
        messageContent = attachmentPayload?.url ? `🔗 ${attachmentPayload.url}` : '🔗 Compartilhamento';
        break;

      case 'story_mention':
        tipo = 'texto';
        messageContent = '📱 Mencionou você em um story';
        metadata.story_url = attachmentPayload?.url;
        break;

      default:
        messageContent = `Mídia: ${attachmentType}`;
    }
  } else if (message.sticker_id) {
    tipo = 'sticker';
    messageContent = '🎭 Sticker';
    metadata.sticker_id = message.sticker_id;
  } else {
    messageContent = 'Mensagem do Instagram';
  }

  console.log('[instagram-webhook] Mensagem:', { tipo, conteudo: messageContent.substring(0, 50) });

  // Buscar ou criar contato
  // Instagram usa IGSID como identificador (armazenamos apenas o ID numérico)
  const contactPhone = senderId;
  
  let { data: contato } = await supabase
    .from('contatos')
    .select('id, nome')
    .eq('conta_id', conexao.conta_id)
    .eq('telefone', contactPhone)
    .single();

  if (!contato) {
    // Tentar buscar nome do perfil via Graph API
    let contactName = `Instagram ${senderId.slice(-6)}`;
    
    if (conexao.meta_access_token) {
      try {
        const profileResponse = await fetch(
          `https://graph.facebook.com/${senderId}?fields=name,username&access_token=${conexao.meta_access_token}`
        );
        if (profileResponse.ok) {
          const profile = await profileResponse.json();
          contactName = profile.name || profile.username || contactName;
        }
      } catch (e) {
        console.log('[instagram-webhook] Não foi possível buscar perfil:', e);
      }
    }

    const { data: novoContato, error: contatoError } = await supabase
      .from('contatos')
      .insert({
        conta_id: conexao.conta_id,
        nome: contactName,
        telefone: contactPhone,
        canal: 'instagram',
      })
      .select()
      .single();

    if (contatoError) {
      console.error('[instagram-webhook] Erro ao criar contato:', contatoError);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    contato = novoContato;
  }

  // Buscar ou criar conversa
  // IMPORTANTE: Buscar conversa por conta_id + contato_id + conexao_id para permitir
  // conversas separadas do mesmo lead em diferentes conexões Instagram
  let { data: conversa } = await supabase
    .from('conversas')
    .select('id, agente_ia_ativo, nao_lidas, agente_ia_id, status')
    .eq('conta_id', conexao.conta_id)
    .eq('contato_id', contato.id)
    .eq('conexao_id', conexao.id)
    .eq('arquivada', false)
    .single();

  if (!conversa) {
    // Criar conversa com IA ativa se tiver agente principal
    const { data: novaConversa, error: conversaError } = await supabase
      .from('conversas')
      .insert({
        conta_id: conexao.conta_id,
        contato_id: contato.id,
        conexao_id: conexao.id,
        agente_ia_ativo: !!agentePrincipal,
        agente_ia_id: agentePrincipal?.id || null,
        canal: 'instagram',
        status: 'em_atendimento',
      })
      .select('id, agente_ia_ativo, nao_lidas, agente_ia_id, status')
      .single();

    if (conversaError) {
      console.error('[instagram-webhook] Erro ao criar conversa:', conversaError);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    conversa = novaConversa;
    console.log('[instagram-webhook] Nova conversa criada com IA:', conversa.agente_ia_ativo);
  }

  // Verificar duplicatas
  const { data: existingMsg } = await supabase
    .from('mensagens')
    .select('id')
    .eq('conversa_id', conversa.id)
    .contains('metadata', { instagram_msg_id: message.mid })
    .single();

  if (existingMsg) {
    console.log('[instagram-webhook] Mensagem já existe, ignorando:', message.mid);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Inserir mensagem
  const { error: msgError } = await supabase.from('mensagens').insert({
    conversa_id: conversa.id,
    contato_id: contato.id,
    conteudo: messageContent,
    direcao: 'entrada',
    tipo,
    media_url: mediaUrl,
    metadata,
  });

  if (msgError) {
    console.error('[instagram-webhook] Erro ao inserir mensagem:', msgError);
  } else {
    console.log('[instagram-webhook] Mensagem inserida com sucesso');
  }

  // Atualizar conversa
  await supabase
    .from('conversas')
    .update({
      ultima_mensagem: messageContent.substring(0, 255),
      ultima_mensagem_at: new Date().toISOString(),
      nao_lidas: (conversa.nao_lidas || 0) + 1,
      status: 'em_atendimento',
    })
    .eq('id', conversa.id);

  // Agendar resposta da IA se estiver ativa
  if (conversa.agente_ia_ativo && agentePrincipal) {
    const tempoEspera = agentePrincipal.tempo_espera_segundos || 5;
    const responderEm = new Date(Date.now() + tempoEspera * 1000).toISOString();

    console.log('[instagram-webhook] Agendando resposta IA em', tempoEspera, 'segundos');

    // Upsert na tabela de respostas pendentes
    await supabase
      .from('respostas_pendentes')
      .upsert(
        {
          conversa_id: conversa.id,
          responder_em: responderEm,
          processando: false,
        },
        { onConflict: 'conversa_id' }
      );

    // Agendar processamento da resposta
    EdgeRuntime.waitUntil(
      (async () => {
        await new Promise(resolve => setTimeout(resolve, tempoEspera * 1000));
        try {
          await fetch(`${supabaseUrl}/functions/v1/processar-resposta-agora`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ conversa_id: conversa.id }),
          });
        } catch (e) {
          console.error('[instagram-webhook] Erro ao chamar processar-resposta-agora:', e);
        }
      })()
    );
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Processa mensagens no formato changes (alternativo)
async function processInstagramChanges(
  value: any,
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string
) {
  console.log('[instagram-webhook] Processando changes format');
  
  // Este formato é similar ao WhatsApp Business API
  const pageId = value.metadata?.page_id;
  const messages = value.messages || [];

  if (!pageId || messages.length === 0) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Buscar conexão
  const { data: conexao } = await supabase
    .from('conexoes_whatsapp')
    .select('id, conta_id, meta_access_token')
    .eq('meta_phone_number_id', pageId)
    .eq('tipo_provedor', 'instagram')
    .single();

  if (!conexao) {
    console.log('[instagram-webhook] Conexão não encontrada para changes');
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Buscar agente principal da conta
  const { data: agentePrincipal } = await supabase
    .from('agent_ia')
    .select('id, tempo_espera_segundos')
    .eq('conta_id', conexao.conta_id)
    .eq('tipo', 'principal')
    .eq('ativo', true)
    .maybeSingle();

  // Processar cada mensagem similar ao meta-verify-webhook
  for (const msg of messages) {
    const fromId = msg.from;
    const messageType = msg.type;
    const msgId = msg.id;

    let messageContent = msg.text?.body || `Mensagem do tipo: ${messageType}`;
    let tipo = 'texto';

    // Instagram usa IGSID como identificador (armazenamos apenas o ID numérico)
    const contactPhone = fromId;

    // Buscar ou criar contato
    let { data: contato } = await supabase
      .from('contatos')
      .select('id')
      .eq('conta_id', conexao.conta_id)
      .eq('telefone', contactPhone)
      .single();

    if (!contato) {
      const { data: novoContato } = await supabase
        .from('contatos')
        .insert({
          conta_id: conexao.conta_id,
          nome: `Instagram ${fromId.slice(-6)}`,
          telefone: contactPhone,
          canal: 'instagram',
        })
        .select()
        .single();
      contato = novoContato;
    }

    if (!contato) continue;

    // Buscar ou criar conversa
    let { data: conversa } = await supabase
      .from('conversas')
      .select('id, nao_lidas')
      .eq('conta_id', conexao.conta_id)
      .eq('contato_id', contato.id)
      .eq('arquivada', false)
      .single();

    if (!conversa) {
      const { data: novaConversa } = await supabase
        .from('conversas')
        .insert({
          conta_id: conexao.conta_id,
          contato_id: contato.id,
          conexao_id: conexao.id,
          agente_ia_ativo: !!agentePrincipal,
          agente_ia_id: agentePrincipal?.id || null,
          canal: 'instagram',
          status: 'em_atendimento',
        })
        .select('id, agente_ia_ativo, nao_lidas, agente_ia_id')
        .single();
      conversa = novaConversa;
    }

    if (!conversa) continue;

    // Verificar duplicatas
    const { data: existingMsg } = await supabase
      .from('mensagens')
      .select('id')
      .eq('conversa_id', conversa.id)
      .contains('metadata', { instagram_msg_id: msgId })
      .single();

    if (existingMsg) continue;

    // Inserir mensagem
    await supabase.from('mensagens').insert({
      conversa_id: conversa.id,
      contato_id: contato.id,
      conteudo: messageContent,
      direcao: 'entrada',
      tipo,
      metadata: { instagram_msg_id: msgId },
    });

    // Atualizar conversa
    await supabase
      .from('conversas')
      .update({
        ultima_mensagem: messageContent.substring(0, 255),
        ultima_mensagem_at: new Date().toISOString(),
        nao_lidas: (conversa.nao_lidas || 0) + 1,
        status: 'em_atendimento',
      })
      .eq('id', conversa.id);

    // Agendar resposta da IA se estiver ativa
    if (conversa.agente_ia_ativo && agentePrincipal) {
      const tempoEspera = agentePrincipal.tempo_espera_segundos || 5;
      const responderEm = new Date(Date.now() + tempoEspera * 1000).toISOString();

      await supabase
        .from('respostas_pendentes')
        .upsert(
          {
            conversa_id: conversa.id,
            responder_em: responderEm,
            processando: false,
          },
          { onConflict: 'conversa_id' }
        );

      EdgeRuntime.waitUntil(
        (async () => {
          await new Promise(resolve => setTimeout(resolve, tempoEspera * 1000));
          try {
            await fetch(`${supabaseUrl}/functions/v1/processar-resposta-agora`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({ conversa_id: conversa.id }),
            });
          } catch (e) {
            console.error('[instagram-webhook] Erro ao chamar processar-resposta-agora:', e);
          }
        })()
      );
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}