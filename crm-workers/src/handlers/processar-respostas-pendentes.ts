import type { Context } from 'hono';
import type { Env } from '../types';
import { createSupabaseClient } from '../lib/supabase';
import { jsonResponse, errorResponse } from '../lib/cors';
import { EVOLUTION_API_URL } from '../lib/utils';

export async function handleProcessarRespostasPendentes(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env;
  const supabase = createSupabaseClient(env);

  try {
    console.log('[processar-respostas-pendentes] Iniciando...');

    const agora = new Date().toISOString();
    const { data: pendentes, error: pendentesError } = await supabase
      .from('respostas_pendentes')
      .select('id, conversa_id')
      .lte('responder_em', agora);

    if (pendentesError) {
      console.error('[processar-respostas-pendentes] Erro:', pendentesError);
      throw pendentesError;
    }

    if (!pendentes || pendentes.length === 0) {
      console.log('[processar-respostas-pendentes] Nenhuma pendente');
      return jsonResponse({ success: true, processados: 0 });
    }

    console.log(`[processar-respostas-pendentes] ${pendentes.length} pendentes`);

    let processados = 0;
    let erros = 0;

    for (const pendente of pendentes) {
      try {
        // Buscar conversa
        const { data: conversa, error: conversaError } = await supabase
          .from('conversas')
          .select('id, conta_id, contato_id, agente_ia_ativo, conexao_id, contatos(id, telefone)')
          .eq('id', pendente.conversa_id)
          .single();

        if (conversaError || !conversa) {
          await supabase.from('respostas_pendentes').delete().eq('id', pendente.id);
          continue;
        }

        if (!conversa.agente_ia_ativo) {
          await supabase.from('respostas_pendentes').delete().eq('id', pendente.id);
          continue;
        }

        // Buscar última mensagem
        const { data: ultimaMensagem } = await supabase
          .from('mensagens')
          .select('conteudo, tipo, metadata')
          .eq('conversa_id', pendente.conversa_id)
          .eq('direcao', 'entrada')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!ultimaMensagem) {
          await supabase.from('respostas_pendentes').delete().eq('id', pendente.id);
          continue;
        }

        const metadata = (ultimaMensagem.metadata as Record<string, any>) || {};

        // Chamar ai-responder
        const aiResponse = await fetch(`${env.SUPABASE_URL}/functions/v1/ai-responder`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            conversa_id: pendente.conversa_id,
            mensagem: metadata.transcricao || ultimaMensagem.conteudo,
            conta_id: conversa.conta_id,
            mensagem_tipo: ultimaMensagem.tipo,
            transcricao: metadata.transcricao,
            descricao_imagem: metadata.descricao_imagem,
          }),
        });

        if (!aiResponse.ok) {
          erros++;
          continue;
        }

        const aiData = await aiResponse.json();

        // Verificar se já salva
        if (aiData.mensagem_ja_salva || aiData.mensagemJaSalva) {
          await supabase.from('respostas_pendentes').delete().eq('id', pendente.id);
          processados++;
          continue;
        }

        if (aiData.should_respond && aiData.resposta) {
          // Buscar conexão
          const { data: conexao } = await supabase
            .from('conexoes_whatsapp')
            .select('token, instance_name')
            .eq('id', conversa.conexao_id)
            .single();

          if (conexao) {
            const contato = conversa.contatos as any;
            const telefone = contato?.telefone;

            if (telefone && env.EVOLUTION_API_KEY) {
              // Enviar via Evolution
              const sendResponse = await fetch(`${EVOLUTION_API_URL}/message/sendText/${conexao.instance_name}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  apikey: env.EVOLUTION_API_KEY,
                },
                body: JSON.stringify({
                  number: telefone,
                  text: aiData.resposta,
                }),
              });

              if (sendResponse.ok) {
                console.log(`[processar-respostas-pendentes] Enviado para: ${telefone}`);

                // Salvar mensagem
                await supabase.from('mensagens').insert({
                  conversa_id: conversa.id,
                  contato_id: conversa.contato_id,
                  conteudo: aiData.resposta,
                  direcao: 'saida',
                  tipo: 'texto',
                  enviada_por_ia: true,
                });

                // Verificar status
                const { data: conversaAtualizada } = await supabase
                  .from('conversas')
                  .select('status')
                  .eq('id', conversa.id)
                  .single();

                const novoStatus = conversaAtualizada?.status === 'encerrado' ? 'encerrado' : 'aguardando_cliente';

                await supabase
                  .from('conversas')
                  .update({
                    ultima_mensagem: aiData.resposta,
                    ultima_mensagem_at: new Date().toISOString(),
                    status: novoStatus,
                  })
                  .eq('id', conversa.id);

                processados++;
              } else {
                erros++;
              }
            }
          }
        }

        // Remover pendente
        await supabase.from('respostas_pendentes').delete().eq('id', pendente.id);
      } catch (itemError) {
        console.error(`[processar-respostas-pendentes] Erro item:`, itemError);
        erros++;
      }
    }

    console.log(`[processar-respostas-pendentes] ${processados} processados, ${erros} erros`);

    return jsonResponse({
      success: true,
      processados,
      erros,
      total: pendentes.length,
    });
  } catch (error) {
    console.error('[processar-respostas-pendentes] Erro:', error);
    return errorResponse('Erro interno', 500, error);
  }
}
