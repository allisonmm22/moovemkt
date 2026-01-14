import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para baixar mídia da Meta API
async function downloadMetaMedia(
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
    console.error('Erro ao baixar mídia Meta:', error);
    return { success: false, error: String(error) };
  }
}

// Função para transcrever áudio
async function transcreverAudio(
  base64: string,
  mimeType: string,
  openaiKey: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<string | null> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/transcrever-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        audio_base64: base64,
        mime_type: mimeType,
        openai_api_key: openaiKey,
      }),
    });

    const result = await response.json();
    return result.text || null;
  } catch (error) {
    console.error('Erro ao transcrever áudio:', error);
    return null;
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
    console.error('Erro ao analisar imagem:', error);
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
    
    // Meta envia verificação via GET
    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      console.log('=== META WEBHOOK VERIFICATION ===');
      console.log('Mode:', mode);
      console.log('Token:', token);
      console.log('Challenge:', challenge);

      if (mode === 'subscribe' && token && challenge) {
        const { data: conexao } = await supabase
          .from('conexoes_whatsapp')
          .select('id')
          .eq('meta_webhook_verify_token', token)
          .eq('tipo_provedor', 'meta')
          .single();

        if (conexao) {
          console.log('Token válido para conexão:', conexao.id);
          return new Response(challenge, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }

        if (token.startsWith('verify_')) {
          console.log('Token com formato válido, aceitando verificação');
          return new Response(challenge, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }

        console.log('Token não encontrado no banco');
      }

      console.log('Verificação inválida');
      return new Response('Forbidden', { status: 403 });
    }

    // POST = mensagens recebidas
    if (req.method === 'POST') {
      const payload = await req.json();
      console.log('=== META WEBHOOK MESSAGE ===');
      console.log('Payload:', JSON.stringify(payload, null, 2));

      const entry = payload.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      
      if (!value) {
        console.log('Payload Meta sem dados relevantes');
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const phoneNumberId = value.metadata?.phone_number_id;
      const messages = value.messages || [];
      const contacts = value.contacts || [];

      console.log('Phone Number ID:', phoneNumberId);
      console.log('Mensagens:', messages.length);

      if (!phoneNumberId || messages.length === 0) {
        console.log('Sem mensagens para processar');
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Buscar conexão pelo meta_phone_number_id com access_token
      const { data: conexao, error: conexaoError } = await supabase
        .from('conexoes_whatsapp')
        .select('id, conta_id, instance_name, tipo_provedor, meta_access_token')
        .eq('meta_phone_number_id', phoneNumberId)
        .eq('tipo_provedor', 'meta')
        .single();

      if (conexaoError || !conexao) {
        console.log('Conexão Meta não encontrada para phone_number_id:', phoneNumberId);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Conexão encontrada:', conexao.id);

      // Buscar OpenAI API key da conta
      const { data: conta } = await supabase
        .from('contas')
        .select('openai_api_key')
        .eq('id', conexao.conta_id)
        .single();

      const openaiKey = conta?.openai_api_key;

      // Processar cada mensagem
      for (const msg of messages) {
        const fromNumber = msg.from;
        const messageType = msg.type;
        const timestamp = new Date(parseInt(msg.timestamp) * 1000).toISOString();
        const metaMsgId = msg.id;

        let messageContent = '';
        let tipo: string = 'texto';
        let mediaUrl: string | null = null;
        let metadata: Record<string, any> = { meta_msg_id: metaMsgId };

        switch (messageType) {
          case 'text':
            messageContent = msg.text?.body || '';
            break;

          case 'image': {
            tipo = 'imagem';
            const imageId = msg.image?.id;
            const imageCaption = msg.image?.caption || '';
            
            if (imageId && conexao.meta_access_token) {
              console.log('Baixando imagem Meta:', imageId);
              const downloadResult = await downloadMetaMedia(
                imageId,
                conexao.meta_access_token,
                'image',
                conexao.conta_id,
                supabaseUrl,
                supabaseKey
              );

              if (downloadResult.success) {
                mediaUrl = downloadResult.url || null;
                
                // Analisar imagem com OpenAI se disponível
                if (openaiKey && downloadResult.base64 && downloadResult.mimeType) {
                  const descricao = await analisarImagem(
                    downloadResult.base64,
                    downloadResult.mimeType,
                    openaiKey,
                    supabaseUrl,
                    supabaseKey
                  );
                  if (descricao) {
                    metadata.descricao_imagem = descricao;
                    console.log('Descrição da imagem:', descricao.substring(0, 100));
                  }
                }
              }
            }
            messageContent = imageCaption || '📷 Imagem';
            break;
          }

          case 'audio': {
            tipo = 'audio';
            const audioId = msg.audio?.id;
            
            if (audioId && conexao.meta_access_token) {
              console.log('Baixando áudio Meta:', audioId);
              const downloadResult = await downloadMetaMedia(
                audioId,
                conexao.meta_access_token,
                'audio',
                conexao.conta_id,
                supabaseUrl,
                supabaseKey
              );

              if (downloadResult.success) {
                mediaUrl = downloadResult.url || null;
                
                // Transcrever áudio com OpenAI se disponível
                if (openaiKey && downloadResult.base64 && downloadResult.mimeType) {
                  const transcricao = await transcreverAudio(
                    downloadResult.base64,
                    downloadResult.mimeType,
                    openaiKey,
                    supabaseUrl,
                    supabaseKey
                  );
                  if (transcricao) {
                    metadata.transcricao = transcricao;
                    messageContent = transcricao;
                    console.log('Transcrição do áudio:', transcricao.substring(0, 100));
                  }
                }
              }
            }
            
            if (!messageContent) {
              messageContent = '🎵 Áudio';
            }
            break;
          }

          case 'video': {
            tipo = 'video';
            const videoId = msg.video?.id;
            const videoCaption = msg.video?.caption || '';
            
            if (videoId && conexao.meta_access_token) {
              console.log('Baixando vídeo Meta:', videoId);
              const downloadResult = await downloadMetaMedia(
                videoId,
                conexao.meta_access_token,
                'video',
                conexao.conta_id,
                supabaseUrl,
                supabaseKey
              );

              if (downloadResult.success) {
                mediaUrl = downloadResult.url || null;
              }
            }
            messageContent = videoCaption || '🎬 Vídeo';
            break;
          }

          case 'document': {
            tipo = 'documento';
            const docId = msg.document?.id;
            const docFilename = msg.document?.filename || 'documento';
            
            if (docId && conexao.meta_access_token) {
              console.log('Baixando documento Meta:', docId);
              const downloadResult = await downloadMetaMedia(
                docId,
                conexao.meta_access_token,
                'document',
                conexao.conta_id,
                supabaseUrl,
                supabaseKey
              );

              if (downloadResult.success) {
                mediaUrl = downloadResult.url || null;
              }
            }
            messageContent = `📄 ${docFilename}`;
            break;
          }

          case 'sticker': {
            tipo = 'sticker';
            const stickerId = msg.sticker?.id;
            
            if (stickerId && conexao.meta_access_token) {
              console.log('Baixando sticker Meta:', stickerId);
              const downloadResult = await downloadMetaMedia(
                stickerId,
                conexao.meta_access_token,
                'sticker',
                conexao.conta_id,
                supabaseUrl,
                supabaseKey
              );

              if (downloadResult.success) {
                mediaUrl = downloadResult.url || null;
              }
            }
            messageContent = '🎭 Sticker';
            break;
          }

          default:
            messageContent = `Mensagem do tipo: ${messageType}`;
        }

        console.log('Processando mensagem:', { from: fromNumber, tipo, conteudo: messageContent.substring(0, 50), mediaUrl });

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
            })
            .select()
            .single();

          if (contatoError || !novoContato) {
            console.error('Erro ao criar contato:', contatoError);
            continue;
          }
          contato = novoContato;
        }

        if (!contato) {
          console.error('Contato não disponível');
          continue;
        }

        // Buscar ou criar conversa
        let { data: conversa } = await supabase
          .from('conversas')
          .select('id, agente_ia_ativo, nao_lidas, agente_ia_id, status')
          .eq('conta_id', conexao.conta_id)
          .eq('contato_id', contato.id)
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

          if (conversaError || !novaConversa) {
            console.error('Erro ao criar conversa:', conversaError);
            continue;
          }
          conversa = novaConversa;
        }

        if (!conversa) {
          console.error('Conversa não disponível');
          continue;
        }

        // Verificar duplicatas
        const { data: existingMsg } = await supabase
          .from('mensagens')
          .select('id')
          .eq('conversa_id', conversa.id)
          .contains('metadata', { meta_msg_id: metaMsgId })
          .single();

        if (existingMsg) {
          console.log('Mensagem já existe, ignorando:', metaMsgId);
          continue;
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
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro no webhook Meta:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
