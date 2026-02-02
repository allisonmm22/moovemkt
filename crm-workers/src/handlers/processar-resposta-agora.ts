import type { Context } from 'hono';
import type { Env } from '../types';
import { createSupabaseClient } from '../lib/supabase';
import { jsonResponse, errorResponse } from '../lib/cors';
import { dividirMensagem, sleep, EVOLUTION_API_URL } from '../lib/utils';

export async function handleProcessarRespostaAgora(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env;
  const supabase = createSupabaseClient(env);

  try {
    const { conversa_id } = await c.req.json();

    console.log('=== PROCESSAR RESPOSTA AGORA ===');
    console.log('Conversa ID:', conversa_id);

    if (!conversa_id) {
      return errorResponse('conversa_id obrigatório', 400);
    }

    // Adquirir lock atomicamente
    const { data: pendente, error: lockError } = await supabase
      .from('respostas_pendentes')
      .update({ processando: true })
      .eq('conversa_id', conversa_id)
      .eq('processando', false)
      .select('*')
      .maybeSingle();

    if (lockError) {
      return errorResponse('Erro ao adquirir lock', 500, lockError);
    }

    if (!pendente) {
      return jsonResponse({ success: true, message: 'Sem pendência ou já processando' });
    }

    // Verificar se tempo passou
    const agora = new Date();
    const responderEm = new Date(pendente.responder_em);

    if (responderEm > agora) {
      await supabase.from('respostas_pendentes').update({ processando: false }).eq('conversa_id', conversa_id);
      return jsonResponse({ success: true, message: 'Ainda não é hora' });
    }

    console.log('Lock adquirido, processando...');

    // Buscar dados da conversa
    const { data: conversa, error: conversaError } = await supabase
      .from('conversas')
      .select('*, contato:contatos(*), conexao:conexoes_whatsapp(id, instance_name, token, tipo_provedor), agente:agent_ia(fracionar_mensagens, tamanho_max_fracao, delay_entre_fracoes, simular_digitacao)')
      .eq('id', conversa_id)
      .single();

    if (conversaError || !conversa) {
      await supabase.from('respostas_pendentes').delete().eq('conversa_id', conversa_id);
      return errorResponse('Conversa não encontrada', 404);
    }

    // Verificar se IA ativa
    if (!conversa.agente_ia_ativo) {
      await supabase.from('respostas_pendentes').delete().eq('conversa_id', conversa_id);
      return jsonResponse({ success: true, message: 'IA desativada' });
    }

    // Buscar última mensagem
    const { data: ultimaMensagem } = await supabase
      .from('mensagens')
      .select('conteudo, tipo, metadata')
      .eq('conversa_id', conversa_id)
      .eq('direcao', 'entrada')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const metadata = (ultimaMensagem?.metadata as Record<string, any>) || {};

    // Chamar ai-responder
    const aiResponse = await fetch(`${env.SUPABASE_URL}/functions/v1/ai-responder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        conversa_id,
        mensagem: metadata.transcricao || ultimaMensagem?.conteudo || 'Olá',
        conta_id: conversa.conta_id,
        mensagem_tipo: ultimaMensagem?.tipo || 'texto',
        transcricao: metadata.transcricao,
        descricao_imagem: metadata.descricao_imagem,
        texto_documento: metadata.texto_documento,
      }),
    });

    if (!aiResponse.ok) {
      await supabase.from('respostas_pendentes').delete().eq('conversa_id', conversa_id);
      return errorResponse('Erro no ai-responder', 500);
    }

    const aiData = await aiResponse.json();

    // Verificar se já foi salva
    if (aiData.mensagem_ja_salva || aiData.mensagemJaSalva) {
      await supabase.from('respostas_pendentes').delete().eq('conversa_id', conversa_id);
      return jsonResponse({ success: true, mensagem_ja_salva: true });
    }

    // Enviar resposta
    if (aiData.should_respond && aiData.resposta) {
      const conexao = conversa.conexao as any;
      const contato = conversa.contato as any;
      const agente = conversa.agente as any;

      if (!conexao?.id) {
        await supabase.from('respostas_pendentes').delete().eq('conversa_id', conversa_id);
        return errorResponse('Conexão inválida', 500);
      }

      const tipoProvedor = conexao.tipo_provedor || 'evolution';
      const fracionarMensagens = agente?.fracionar_mensagens ?? false;
      const tamanhoMaxFracao = agente?.tamanho_max_fracao ?? 500;
      const delayEntreFracoes = agente?.delay_entre_fracoes ?? 2;
      const simularDigitacao = agente?.simular_digitacao ?? false;

      let mensagensParaEnviar: string[] = [aiData.resposta];

      if (fracionarMensagens && aiData.resposta.length > tamanhoMaxFracao) {
        mensagensParaEnviar = dividirMensagem(aiData.resposta, tamanhoMaxFracao);
        console.log(`Mensagem fracionada em ${mensagensParaEnviar.length} partes`);
      }

      for (let i = 0; i < mensagensParaEnviar.length; i++) {
        const fracao = mensagensParaEnviar[i];

        if (i > 0 && fracionarMensagens) {
          await sleep(delayEntreFracoes * 1000);
        }

        // Simular digitação (apenas Evolution)
        if (simularDigitacao && tipoProvedor === 'evolution' && conexao.instance_name && env.EVOLUTION_API_KEY) {
          try {
            await fetch(`${EVOLUTION_API_URL}/chat/sendPresence/${conexao.instance_name}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: env.EVOLUTION_API_KEY,
              },
              body: JSON.stringify({
                number: contato?.telefone,
                presence: 'composing',
              }),
            });
            const tempoDigitacao = Math.min(3000, Math.max(1000, fracao.length * 15));
            await sleep(tempoDigitacao);
          } catch {
            // Continua mesmo se falhar
          }
        }

        // Enviar mensagem
        const sendResponse = await fetch(`${env.SUPABASE_URL}/functions/v1/enviar-mensagem`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            conexao_id: conexao.id,
            telefone: contato?.telefone,
            mensagem: fracao,
            tipo: 'texto',
          }),
        });

        if (sendResponse.ok) {
          console.log(`Fração ${i + 1}/${mensagensParaEnviar.length} enviada`);

          // Salvar mensagem
          await supabase.from('mensagens').insert({
            conversa_id: conversa.id,
            contato_id: contato?.id || null,
            conteudo: fracao,
            direcao: 'saida',
            tipo: 'texto',
            enviada_por_ia: true,
          });
        }
      }

      // Verificar status atualizado
      const { data: conversaAtualizada } = await supabase
        .from('conversas')
        .select('status')
        .eq('id', conversa.id)
        .single();

      const novoStatus = conversaAtualizada?.status === 'encerrado' ? 'encerrado' : 'aguardando_cliente';

      await supabase
        .from('conversas')
        .update({
          ultima_mensagem: mensagensParaEnviar[mensagensParaEnviar.length - 1],
          ultima_mensagem_at: new Date().toISOString(),
          status: novoStatus,
        })
        .eq('id', conversa.id);
    }

    // Remover pendência
    await supabase.from('respostas_pendentes').delete().eq('conversa_id', conversa_id);

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Erro processar-resposta-agora:', error);
    return errorResponse('Erro interno', 500, error);
  }
}
