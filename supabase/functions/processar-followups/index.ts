import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVOLUTION_API_URL = 'https://evolution.cognityx.com.br';

interface FollowupRegra {
  id: string;
  conta_id: string;
  agent_ia_id: string | null;
  nome: string;
  tipo: 'texto_fixo' | 'contextual_ia';
  mensagem_fixa: string | null;
  prompt_followup: string | null;
  quantidade_mensagens_contexto: number;
  horas_sem_resposta: number;
  max_tentativas: number;
  intervalo_entre_tentativas: number;
  aplicar_ia_ativa: boolean;
  aplicar_ia_pausada: boolean;
  estagio_ids: string[] | null;
}

interface Conversa {
  id: string;
  conta_id: string;
  contato_id: string;
  conexao_id: string;
  agente_ia_ativo: boolean;
  ultima_mensagem_at: string;
  status: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[processar-followups] Iniciando processamento...');

    // Buscar todas as regras de follow-up ativas
    const { data: regras, error: regrasError } = await supabase
      .from('followup_regras')
      .select('*')
      .eq('ativo', true);

    if (regrasError) {
      console.error('[processar-followups] Erro ao buscar regras:', regrasError);
      throw regrasError;
    }

    if (!regras || regras.length === 0) {
      console.log('[processar-followups] Nenhuma regra ativa encontrada');
      return new Response(JSON.stringify({ message: 'Nenhuma regra ativa' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[processar-followups] ${regras.length} regras ativas encontradas`);

    let followupsEnviados = 0;

    for (const regra of regras as FollowupRegra[]) {
      console.log(`[processar-followups] Processando regra: ${regra.nome}`);

      // Calcular timestamp limite (agora - minutos_sem_resposta)
      // O campo horas_sem_resposta agora armazena MINUTOS
      const minutosAtras = new Date();
      minutosAtras.setMinutes(minutosAtras.getMinutes() - regra.horas_sem_resposta);

      // Buscar conversas elegíveis para esta regra
      // Incluir status em_atendimento E aguardando_cliente
      let query = supabase
        .from('conversas')
        .select('id, conta_id, contato_id, conexao_id, agente_ia_ativo, ultima_mensagem_at, status')
        .eq('conta_id', regra.conta_id)
        .in('status', ['em_atendimento', 'aguardando_cliente'])
        .lt('ultima_mensagem_at', minutosAtras.toISOString());

      // Aplicar filtros de estado da IA
      const iaFilters: boolean[] = [];
      if (regra.aplicar_ia_ativa) iaFilters.push(true);
      if (regra.aplicar_ia_pausada) iaFilters.push(false);
      
      if (iaFilters.length > 0) {
        query = query.in('agente_ia_ativo', iaFilters);
      }

      const { data: conversas, error: conversasError } = await query;

      if (conversasError) {
        console.error(`[processar-followups] Erro ao buscar conversas para regra ${regra.nome}:`, conversasError);
        continue;
      }

      if (!conversas || conversas.length === 0) {
        console.log(`[processar-followups] Nenhuma conversa elegível para regra: ${regra.nome}`);
        continue;
      }

      console.log(`[processar-followups] ${conversas.length} conversas elegíveis para regra: ${regra.nome}`);

      for (const conversa of conversas as Conversa[]) {
        // ========== VERIFICAÇÃO DE PRIORIDADE DO AGENTE ==========
        // Se existe follow-up do agente PENDENTE para esta conversa, NÃO enviar follow-up automático
        const { data: followupAgentePendente, error: followupAgenteError } = await supabase
          .from('followups_agendados')
          .select('id, data_agendada')
          .eq('conversa_id', conversa.id)
          .eq('status', 'pendente')
          .eq('criado_por', 'agente_ia')
          .limit(1)
          .maybeSingle();

        if (followupAgenteError) {
          console.error(`[processar-followups] Erro ao verificar follow-up do agente:`, followupAgenteError);
          continue;
        }

        if (followupAgentePendente) {
          console.log(`[processar-followups] Conversa ${conversa.id}: existe follow-up do agente agendado para ${followupAgentePendente.data_agendada}, pulando follow-up automático`);
          continue;
        }
        // ========== FIM DA VERIFICAÇÃO ==========

        // Verificar a direção da última mensagem
        // Só enviar follow-up se a última mensagem foi do AGENTE (saída)
        // Se foi do lead (entrada), significa que ELE respondeu e não precisamos fazer follow-up
        const { data: ultimaMensagem, error: ultimaMensagemError } = await supabase
          .from('mensagens')
          .select('direcao')
          .eq('conversa_id', conversa.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ultimaMensagemError) {
          console.error(`[processar-followups] Erro ao verificar última mensagem:`, ultimaMensagemError);
          continue;
        }

        // Se última mensagem foi do lead (entrada), pular - ele já respondeu
        if (ultimaMensagem?.direcao === 'entrada') {
          console.log(`[processar-followups] Conversa ${conversa.id}: última mensagem foi do lead, pulando`);
          continue;
        }

        // Verificar se o lead está em uma etapa com follow-up desativado
        const { data: negociacao } = await supabase
          .from('negociacoes')
          .select('estagio_id')
          .eq('contato_id', conversa.contato_id)
          .eq('status', 'aberto')
          .limit(1)
          .maybeSingle();

        if (negociacao?.estagio_id) {
          const { data: estagio } = await supabase
            .from('estagios')
            .select('followup_ativo')
            .eq('id', negociacao.estagio_id)
            .single();

          if (estagio?.followup_ativo === false) {
            console.log(`[processar-followups] Conversa ${conversa.id}: etapa com follow-up desativado, pulando`);
            continue;
          }
        }

        // Verificar quantos follow-ups já foram enviados para esta conversa
        const { data: followupsExistentes, error: followupsError } = await supabase
          .from('followup_enviados')
          .select('id, tentativa, enviado_em, respondido')
          .eq('regra_id', regra.id)
          .eq('conversa_id', conversa.id)
          .order('tentativa', { ascending: false })
          .limit(1);

        if (followupsError) {
          console.error(`[processar-followups] Erro ao verificar followups existentes:`, followupsError);
          continue;
        }

        const ultimoFollowup = followupsExistentes?.[0];

        // Se já respondeu, pular
        if (ultimoFollowup?.respondido) {
          continue;
        }

        // Verificar se atingiu máximo de tentativas
        if (ultimoFollowup && ultimoFollowup.tentativa >= regra.max_tentativas) {
          continue;
        }

        // Verificar intervalo entre tentativas (intervalo agora em MINUTOS)
        if (ultimoFollowup) {
          const ultimoEnvio = new Date(ultimoFollowup.enviado_em);
          const intervaloMs = regra.intervalo_entre_tentativas * 60 * 1000; // minutos → ms
          if (Date.now() - ultimoEnvio.getTime() < intervaloMs) {
            continue;
          }
        }

        // Gerar mensagem de follow-up
        let mensagemFollowup: string;

        if (regra.tipo === 'texto_fixo') {
          mensagemFollowup = regra.mensagem_fixa || 'Olá! Gostaria de saber se posso ajudar em algo mais.';
        } else {
          // Tipo contextual_ia: buscar últimas mensagens e gerar resposta
          const { data: mensagens, error: mensagensError } = await supabase
            .from('mensagens')
            .select('conteudo, direcao, created_at')
            .eq('conversa_id', conversa.id)
            .order('created_at', { ascending: false })
            .limit(regra.quantidade_mensagens_contexto);

          if (mensagensError) {
            console.error(`[processar-followups] Erro ao buscar mensagens:`, mensagensError);
            continue;
          }

          // Montar contexto da conversa
          const contextoConversa = mensagens
            ?.reverse()
            .map(m => `${m.direcao === 'entrada' ? 'Lead' : 'Agente'}: ${m.conteudo}`)
            .join('\n') || '';

          // Buscar API key da conta
          const { data: conta, error: contaError } = await supabase
            .from('contas')
            .select('openai_api_key')
            .eq('id', regra.conta_id)
            .single();

          const openaiApiKey = conta?.openai_api_key;
          const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

          if (!openaiApiKey && !lovableApiKey) {
            console.error(`[processar-followups] Nenhuma API key disponível para conta ${regra.conta_id}`);
            continue;
          }

          // Chamar IA para gerar follow-up contextual
          const promptSistema = regra.prompt_followup || 
            `Você é um assistente fazendo follow-up de uma conversa. 
Analise o contexto e gere uma mensagem breve e amigável para retomar o contato.
Pergunte algo relacionado ao último assunto discutido.
Seja direto e profissional. Máximo 2 frases.`;

          const mensagensAI = [
            { role: 'system', content: promptSistema },
            { role: 'user', content: `Contexto da conversa:\n${contextoConversa}\n\nGere uma mensagem de follow-up:` }
          ];

          let respostaIA: string | null = null;

          // Tentar OpenAI primeiro, depois Lovable AI
          if (openaiApiKey) {
            try {
              const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${openaiApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'gpt-4o-mini',
                  messages: mensagensAI,
                  max_tokens: 200,
                  temperature: 0.7,
                }),
              });

              if (openaiResponse.ok) {
                const data = await openaiResponse.json();
                respostaIA = data.choices?.[0]?.message?.content?.trim();
              }
            } catch (error) {
              console.error('[processar-followups] Erro ao chamar OpenAI:', error);
            }
          }

          // Fallback para Lovable AI
          if (!respostaIA && lovableApiKey) {
            try {
              const lovableResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${lovableApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'google/gemini-2.5-flash',
                  messages: mensagensAI,
                }),
              });

              if (lovableResponse.ok) {
                const data = await lovableResponse.json();
                respostaIA = data.choices?.[0]?.message?.content?.trim();
              }
            } catch (error) {
              console.error('[processar-followups] Erro ao chamar Lovable AI:', error);
            }
          }

          if (!respostaIA) {
            console.error(`[processar-followups] Não foi possível gerar resposta IA para conversa ${conversa.id}`);
            continue;
          }

          mensagemFollowup = respostaIA;
        }

        // Buscar dados do contato para enviar mensagem
        const { data: contato, error: contatoError } = await supabase
          .from('contatos')
          .select('telefone')
          .eq('id', conversa.contato_id)
          .single();

        if (contatoError || !contato) {
          console.error(`[processar-followups] Erro ao buscar contato:`, contatoError);
          continue;
        }

        // Buscar conexão WhatsApp
        const { data: conexao, error: conexaoError } = await supabase
          .from('conexoes_whatsapp')
          .select('instance_name, token')
          .eq('id', conversa.conexao_id)
          .single();

        if (conexaoError || !conexao) {
          console.error(`[processar-followups] Erro ao buscar conexão:`, conexaoError);
          continue;
        }

        // Enviar mensagem via Evolution API
        const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
        const evolutionUrl = `${EVOLUTION_API_URL}/message/sendText/${conexao.instance_name}`;
        
        console.log(`[processar-followups] Enviando follow-up para ${contato.telefone} via ${conexao.instance_name}`);

        try {
          const evolutionResponse = await fetch(evolutionUrl, {
            method: 'POST',
            headers: {
              'apikey': evolutionApiKey || '',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              number: contato.telefone,
              text: mensagemFollowup,
            }),
          });

          if (!evolutionResponse.ok) {
            const errorText = await evolutionResponse.text();
            console.error(`[processar-followups] Erro ao enviar mensagem Evolution:`, errorText);
            continue;
          }

          console.log(`[processar-followups] Mensagem de follow-up enviada para conversa ${conversa.id}`);

          // Registrar mensagem no banco
          await supabase.from('mensagens').insert({
            conversa_id: conversa.id,
            contato_id: conversa.contato_id,
            conteudo: mensagemFollowup,
            direcao: 'saida',
            tipo: 'texto',
            enviada_por_ia: true,
            metadata: { followup_regra_id: regra.id },
          });

          // Atualizar última mensagem da conversa
          await supabase.from('conversas').update({
            ultima_mensagem: mensagemFollowup,
            ultima_mensagem_at: new Date().toISOString(),
          }).eq('id', conversa.id);

          // Registrar follow-up enviado
          await supabase.from('followup_enviados').insert({
            regra_id: regra.id,
            conversa_id: conversa.id,
            tentativa: (ultimoFollowup?.tentativa || 0) + 1,
            mensagem_enviada: mensagemFollowup,
          });

          followupsEnviados++;

        } catch (error) {
          console.error(`[processar-followups] Erro ao processar follow-up:`, error);
        }
      }
    }

    console.log(`[processar-followups] Processamento concluído. ${followupsEnviados} follow-ups enviados.`);

    return new Response(JSON.stringify({ 
      success: true, 
      followupsEnviados 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[processar-followups] Erro geral:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
