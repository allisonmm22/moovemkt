import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVOLUTION_API_URL = 'https://evolution.cognityx.com.br';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conexao_id } = await req.json();

    if (!conexao_id) {
      return new Response(JSON.stringify({ error: 'conexao_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!evolutionApiKey) {
      return new Response(JSON.stringify({ error: 'EVOLUTION_API_KEY não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar conexão
    const { data: conexao, error: conexaoError } = await supabase
      .from('conexoes_whatsapp')
      .select('*')
      .eq('id', conexao_id)
      .single();

    if (conexaoError || !conexao) {
      return new Response(JSON.stringify({ error: 'Conexão não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Buscando mensagens para instância:', conexao.instance_name);

    // Buscar mensagens na Evolution API (últimos 10 minutos)
    const messagesResponse = await fetch(
      `${EVOLUTION_API_URL}/chat/findMessages/${conexao.instance_name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify({
          where: {
            key: {
              fromMe: false,
            },
          },
          limit: 50,
        }),
      }
    );

    if (!messagesResponse.ok) {
      const errorText = await messagesResponse.text();
      console.error('Erro ao buscar mensagens:', errorText);
      
      // Se a API não suporta esse endpoint, retornar vazio
      if (messagesResponse.status === 404 || messagesResponse.status === 400) {
        return new Response(JSON.stringify({ messages: [], processed: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({ error: errorText }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messagesData = await messagesResponse.json();
    console.log('Resposta da Evolution API:', JSON.stringify(messagesData).substring(0, 500));
    
    // Tratar diferentes formatos de resposta da Evolution API
    let messages: any[] = [];
    if (Array.isArray(messagesData)) {
      messages = messagesData;
    } else if (messagesData?.messages?.records && Array.isArray(messagesData.messages.records)) {
      // Formato: { messages: { records: [...] } }
      messages = messagesData.messages.records;
      console.log('Formato messages.records detectado, total:', messagesData.messages.total);
    } else if (messagesData?.messages && Array.isArray(messagesData.messages)) {
      messages = messagesData.messages;
    } else if (messagesData?.data && Array.isArray(messagesData.data)) {
      messages = messagesData.data;
    } else if (messagesData?.records && Array.isArray(messagesData.records)) {
      messages = messagesData.records;
    } else if (typeof messagesData === 'object' && messagesData !== null) {
      // Se for um objeto único, tentar converter para array
      messages = [];
      console.log('Formato de resposta não reconhecido, estrutura:', Object.keys(messagesData));
    }
    
    console.log('Mensagens a processar:', messages.length);
    let processedCount = 0;

    for (const msg of messages) {
      try {
        const key = msg.key || {};
        const remoteJid = key.remoteJid || msg.remoteJid;
        const fromMe = key.fromMe ?? false;
        const pushName = msg.pushName || '';
        const messageId = key.id || msg.id;
        const messageTimestamp = msg.messageTimestamp || msg.timestamp;

        // Ignorar mensagens de grupo
        if (!remoteJid || remoteJid.includes('@g.us')) continue;
        
        // Ignorar mensagens nossas
        if (fromMe) continue;

        // Verificar se já processamos essa mensagem (por timestamp)
        const msgTime = new Date(messageTimestamp * 1000);
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        
        if (msgTime < tenMinutesAgo) continue;

        // Extrair conteúdo
        let messageContent = '';
        let messageType: 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'sticker' = 'texto';
        let mediaUrl: string | null = null;

        const msgContent = msg.message || msg;
        
        if (msgContent?.conversation) {
          messageContent = msgContent.conversation;
        } else if (msgContent?.extendedTextMessage?.text) {
          messageContent = msgContent.extendedTextMessage.text;
        } else if (msgContent?.imageMessage) {
          messageType = 'imagem';
          messageContent = msgContent.imageMessage.caption || '📷 Imagem';
          mediaUrl = msgContent.imageMessage.url || msg.mediaUrl;
        } else if (msgContent?.audioMessage) {
          messageType = 'audio';
          messageContent = '🎵 Áudio';
          mediaUrl = msgContent.audioMessage.url || msg.mediaUrl;
        } else if (msgContent?.videoMessage) {
          messageType = 'video';
          messageContent = msgContent.videoMessage.caption || '🎬 Vídeo';
          mediaUrl = msgContent.videoMessage.url || msg.mediaUrl;
        } else if (msgContent?.documentMessage) {
          messageType = 'documento';
          messageContent = msgContent.documentMessage.fileName || '📄 Documento';
          mediaUrl = msgContent.documentMessage.url || msg.mediaUrl;
        } else if (msgContent?.stickerMessage) {
          messageType = 'sticker';
          messageContent = '🎨 Sticker';
        } else if (typeof msg === 'string') {
          messageContent = msg;
        } else if (msg?.body) {
          messageContent = msg.body;
        }

        if (!messageContent) continue;

        const telefone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');

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
            continue;
          }
        }

        // Verificar se já existe mensagem com esse ID da Evolution na tabela mensagens
        const { data: existingByEvolutionId } = await supabase
          .from('mensagens')
          .select('id')
          .contains('metadata', { evolution_msg_id: messageId })
          .maybeSingle();

        if (existingByEvolutionId) {
          console.log('Mensagem já existe (evolution_id):', messageId);
          continue;
        }

        // Verificação adicional: buscar por conteúdo similar nos últimos 5 minutos
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: existingByContent } = await supabase
          .from('mensagens')
          .select('id')
          .eq('conteudo', messageContent)
          .eq('direcao', 'entrada')
          .gte('created_at', fiveMinutesAgo)
          .maybeSingle();

        if (existingByContent) {
          console.log('Mensagem similar já existe recentemente:', messageContent.substring(0, 30));
          continue;
        }

        // Buscar ou criar contato
        let { data: contato } = await supabase
          .from('contatos')
          .select('id')
          .eq('conta_id', conexao.conta_id)
          .eq('telefone', telefone)
          .single();

        if (!contato) {
          const { data: novoContato, error: contatoError } = await supabase
            .from('contatos')
            .insert({
              conta_id: conexao.conta_id,
              nome: pushName || telefone,
              telefone,
            })
            .select()
            .single();
            
          if (contatoError) {
            console.error('Erro ao criar contato:', contatoError);
            continue;
          }
          contato = novoContato;
        }

        // Buscar ou criar conversa usando fetch direto
        const conversaResponse = await fetch(
          `${supabaseUrl}/rest/v1/conversas?conta_id=eq.${conexao.conta_id}&contato_id=eq.${contato!.id}&arquivada=eq.false&select=id,agente_ia_ativo,nao_lidas`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        let conversa: { id: string; agente_ia_ativo: boolean; nao_lidas: number } | null = null;
        
        if (conversaResponse.ok) {
          const conversaData = await conversaResponse.json();
          if (Array.isArray(conversaData) && conversaData.length > 0) {
            conversa = conversaData[0];
          }
        }

        if (!conversa) {
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
                agente_ia_ativo: true,
                status: 'em_atendimento',
              }),
            }
          );

          if (!insertResponse.ok) {
            console.error('Erro ao criar conversa:', await insertResponse.text());
            continue;
          }

          const novaConversa = await insertResponse.json();
          conversa = Array.isArray(novaConversa) ? novaConversa[0] : novaConversa;
        }

        // Inserir mensagem com metadata do ID original
        const { error: msgError } = await supabase.from('mensagens').insert({
          conversa_id: conversa!.id,
          contato_id: contato!.id,
          conteudo: messageContent,
          direcao: 'entrada',
          tipo: messageType,
          media_url: mediaUrl,
          metadata: { evolution_msg_id: messageId },
        });

        if (msgError) {
          console.error('Erro ao inserir mensagem:', msgError);
          continue;
        }

        // REGISTRAR MENSAGEM COMO PROCESSADA (previne reprocessamento após exclusão)
        if (messageId) {
          await supabase.from('mensagens_processadas').upsert({
            evolution_msg_id: messageId,
            conta_id: conexao.conta_id,
            telefone,
          }, { onConflict: 'evolution_msg_id,conta_id', ignoreDuplicates: true });
        }

        // Atualizar conversa
        await fetch(
          `${supabaseUrl}/rest/v1/conversas?id=eq.${conversa!.id}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ultima_mensagem: messageContent,
              ultima_mensagem_at: new Date().toISOString(),
              nao_lidas: (conversa?.nao_lidas || 0) + 1,
              status: 'em_atendimento',
            }),
          }
        );

        processedCount++;
        console.log('Mensagem processada:', messageContent.substring(0, 50));
      } catch (err) {
        console.error('Erro ao processar mensagem individual:', err);
      }
    }

    console.log('Total processado:', processedCount);

    return new Response(JSON.stringify({ 
      success: true,
      messages: messages.length,
      processed: processedCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao buscar mensagens:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
