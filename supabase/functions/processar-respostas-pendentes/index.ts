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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[processar-respostas-pendentes] Iniciando processamento...');

    // Buscar respostas pendentes cujo tempo de espera já passou
    const agora = new Date().toISOString();
    const { data: pendentes, error: pendentesError } = await supabase
      .from('respostas_pendentes')
      .select('id, conversa_id')
      .lte('responder_em', agora);

    if (pendentesError) {
      console.error('[processar-respostas-pendentes] Erro ao buscar pendentes:', pendentesError);
      throw pendentesError;
    }

    if (!pendentes || pendentes.length === 0) {
      console.log('[processar-respostas-pendentes] Nenhuma resposta pendente para processar');
      return new Response(JSON.stringify({ success: true, processados: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[processar-respostas-pendentes] ${pendentes.length} respostas pendentes encontradas`);

    let processados = 0;
    let erros = 0;

    for (const pendente of pendentes) {
      try {
        console.log(`[processar-respostas-pendentes] Processando conversa: ${pendente.conversa_id}`);

        // Buscar dados da conversa
        const { data: conversa, error: conversaError } = await supabase
          .from('conversas')
          .select(`
            id,
            conta_id,
            contato_id,
            agente_ia_ativo,
            conexao_id,
            contatos (id, telefone)
          `)
          .eq('id', pendente.conversa_id)
          .single();

        if (conversaError || !conversa) {
          console.error(`[processar-respostas-pendentes] Conversa não encontrada: ${pendente.conversa_id}`);
          await supabase.from('respostas_pendentes').delete().eq('id', pendente.id);
          continue;
        }

        // Verificar se IA ainda está ativa
        if (!conversa.agente_ia_ativo) {
          console.log(`[processar-respostas-pendentes] IA não está ativa para conversa: ${pendente.conversa_id}`);
          await supabase.from('respostas_pendentes').delete().eq('id', pendente.id);
          continue;
        }

        // Buscar a última mensagem do lead para passar ao ai-responder
        const { data: ultimaMensagem } = await supabase
          .from('mensagens')
          .select('conteudo, tipo, metadata')
          .eq('conversa_id', pendente.conversa_id)
          .eq('direcao', 'entrada')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!ultimaMensagem) {
          console.log(`[processar-respostas-pendentes] Sem mensagem de entrada para conversa: ${pendente.conversa_id}`);
          await supabase.from('respostas_pendentes').delete().eq('id', pendente.id);
          continue;
        }

        // Extrair transcrição se houver
        const metadata = ultimaMensagem.metadata as Record<string, any> || {};
        const transcricao = metadata.transcricao || null;
        const descricaoImagem = metadata.descricao_imagem || null;

        // Chamar ai-responder
        const aiResponse = await fetch(
          `${supabaseUrl}/functions/v1/ai-responder`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              conversa_id: pendente.conversa_id,
              mensagem: transcricao || ultimaMensagem.conteudo,
              conta_id: conversa.conta_id,
              mensagem_tipo: ultimaMensagem.tipo,
              transcricao: transcricao,
              descricao_imagem: descricaoImagem,
            }),
          }
        );

        if (!aiResponse.ok) {
          console.error(`[processar-respostas-pendentes] Erro no ai-responder:`, await aiResponse.text());
          erros++;
          continue;
        }

        const aiData = await aiResponse.json();
        console.log(`[processar-respostas-pendentes] Resposta IA:`, aiData);
        
        // Verificar se a mensagem já foi salva/enviada pelo ai-responder
        const mensagemJaSalva = aiData.mensagem_ja_salva || aiData.mensagemJaSalva;
        if (mensagemJaSalva) {
          console.log(`[processar-respostas-pendentes] ✅ Mensagem já salva/enviada, pulando duplicação`);
          await supabase.from('respostas_pendentes').delete().eq('id', pendente.id);
          processados++;
          continue;
        }

        if (aiData.should_respond && aiData.resposta) {
          // Buscar dados da conexão para enviar mensagem
          const { data: conexao } = await supabase
            .from('conexoes_whatsapp')
            .select('token, instance_name')
            .eq('id', conversa.conexao_id)
            .single();

          if (conexao) {
            const contato = conversa.contatos as any;
            const telefone = contato?.telefone;

            if (telefone) {
              // Enviar mensagem via Evolution API
              const sendResponse = await fetch(
                `${EVOLUTION_API_URL}/message/sendText/${conexao.instance_name}`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'apikey': conexao.token,
                  },
                  body: JSON.stringify({
                    number: telefone,
                    text: aiData.resposta,
                  }),
                }
              );

              if (sendResponse.ok) {
                console.log(`[processar-respostas-pendentes] Mensagem enviada para: ${telefone}`);

                // Salvar mensagem da IA no banco
                await supabase.from('mensagens').insert({
                  conversa_id: conversa.id,
                  contato_id: conversa.contato_id,
                  conteudo: aiData.resposta,
                  direcao: 'saida',
                  tipo: 'texto',
                  enviada_por_ia: true,
                });

                // Atualizar conversa
                await supabase
                  .from('conversas')
                  .update({
                    ultima_mensagem: aiData.resposta,
                    ultima_mensagem_at: new Date().toISOString(),
                    status: 'aguardando_cliente',
                  })
                  .eq('id', conversa.id);

                processados++;
              } else {
                console.error(`[processar-respostas-pendentes] Erro ao enviar mensagem:`, await sendResponse.text());
                erros++;
              }
            }
          }
        }

        // Remover da tabela de pendentes
        await supabase.from('respostas_pendentes').delete().eq('id', pendente.id);

      } catch (itemError) {
        console.error(`[processar-respostas-pendentes] Erro ao processar item:`, itemError);
        erros++;
      }
    }

    console.log(`[processar-respostas-pendentes] Processamento concluído. ${processados} respostas enviadas, ${erros} erros`);

    return new Response(JSON.stringify({ 
      success: true, 
      processados,
      erros,
      total: pendentes.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[processar-respostas-pendentes] Erro:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
