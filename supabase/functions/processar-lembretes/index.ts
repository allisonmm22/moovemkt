import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVOLUTION_API_URL = 'https://evolution.cognityx.com.br';

interface LembreteRegra {
  id: string;
  conta_id: string;
  nome: string;
  minutos_antes: number;
  tipo: 'texto_fixo' | 'contextual_ia';
  mensagem_fixa: string | null;
  prompt_lembrete: string | null;
  incluir_link_meet: boolean;
  incluir_detalhes: boolean;
  ativo: boolean;
}

interface Agendamento {
  id: string;
  titulo: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string | null;
  google_meet_link: string | null;
  contato_id: string | null;
  conta_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[processar-lembretes] Iniciando processamento...');

    // OTIMIZAÇÃO: Early-exit - verificar se há agendamentos nas próximas 6 horas
    const agora = new Date();
    const limite = new Date(agora.getTime() + 6 * 60 * 60 * 1000); // 6 horas
    
    const { count: agendamentosProximos } = await supabase
      .from('agendamentos')
      .select('*', { count: 'exact', head: true })
      .eq('concluido', false)
      .gte('data_inicio', agora.toISOString())
      .lte('data_inicio', limite.toISOString())
      .not('contato_id', 'is', null);
    
    if (!agendamentosProximos || agendamentosProximos === 0) {
      console.log('[processar-lembretes] Nenhum agendamento nas próximas 6h, encerrando.');
      return new Response(JSON.stringify({ message: 'Nenhum agendamento próximo', skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`[processar-lembretes] ${agendamentosProximos} agendamentos nas próximas 6h`);

    // Buscar todas as regras de lembrete ativas
    const { data: regras, error: regrasError } = await supabase
      .from('lembrete_regras')
      .select('*')
      .eq('ativo', true);

    if (regrasError) {
      console.error('[processar-lembretes] Erro ao buscar regras:', regrasError);
      throw regrasError;
    }

    if (!regras || regras.length === 0) {
      console.log('[processar-lembretes] Nenhuma regra ativa encontrada');
      return new Response(JSON.stringify({ message: 'Nenhuma regra ativa' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[processar-lembretes] ${regras.length} regras ativas encontradas`);

    let lembretesEnviados = 0;

    for (const regra of regras as LembreteRegra[]) {
      console.log(`[processar-lembretes] Processando regra: ${regra.nome} (${regra.minutos_antes} min antes)`);

      // Calcular janela de tempo para os agendamentos elegíveis
      // Agendamentos que começam em exatamente minutos_antes a partir de agora
      const agora = new Date();
      const janelaInicio = new Date(agora.getTime() + (regra.minutos_antes - 1) * 60 * 1000);
      const janelaFim = new Date(agora.getTime() + (regra.minutos_antes + 1) * 60 * 1000);

      console.log(`[processar-lembretes] Janela de busca: ${janelaInicio.toISOString()} - ${janelaFim.toISOString()}`);

      // Buscar agendamentos elegíveis
      const { data: agendamentos, error: agendamentosError } = await supabase
        .from('agendamentos')
        .select('*')
        .eq('conta_id', regra.conta_id)
        .eq('concluido', false)
        .gte('data_inicio', janelaInicio.toISOString())
        .lte('data_inicio', janelaFim.toISOString())
        .not('contato_id', 'is', null);

      if (agendamentosError) {
        console.error(`[processar-lembretes] Erro ao buscar agendamentos:`, agendamentosError);
        continue;
      }

      if (!agendamentos || agendamentos.length === 0) {
        console.log(`[processar-lembretes] Nenhum agendamento elegível para regra: ${regra.nome}`);
        continue;
      }

      console.log(`[processar-lembretes] ${agendamentos.length} agendamentos elegíveis para regra: ${regra.nome}`);

      for (const agendamento of agendamentos as Agendamento[]) {
        // Verificar se já foi enviado lembrete para este agendamento com esta regra
        const { data: lembreteExistente, error: lembreteError } = await supabase
          .from('lembrete_enviados')
          .select('id')
          .eq('regra_id', regra.id)
          .eq('agendamento_id', agendamento.id)
          .maybeSingle();

        if (lembreteError) {
          console.error(`[processar-lembretes] Erro ao verificar lembrete existente:`, lembreteError);
          continue;
        }

        if (lembreteExistente) {
          console.log(`[processar-lembretes] Lembrete já enviado para agendamento ${agendamento.id}`);
          continue;
        }

        // Buscar dados do contato
        const { data: contato, error: contatoError } = await supabase
          .from('contatos')
          .select('id, nome, telefone')
          .eq('id', agendamento.contato_id)
          .single();

        if (contatoError || !contato) {
          console.error(`[processar-lembretes] Erro ao buscar contato:`, contatoError);
          continue;
        }

        // Buscar conversa ativa com o contato
        const { data: conversa, error: conversaError } = await supabase
          .from('conversas')
          .select('id, conexao_id')
          .eq('contato_id', contato.id)
          .eq('conta_id', regra.conta_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (conversaError || !conversa) {
          console.error(`[processar-lembretes] Erro ao buscar conversa ou conversa não encontrada:`, conversaError);
          continue;
        }

        // Buscar conexão WhatsApp
        const { data: conexao, error: conexaoError } = await supabase
          .from('conexoes_whatsapp')
          .select('instance_name, token')
          .eq('id', conversa.conexao_id)
          .single();

        if (conexaoError || !conexao) {
          console.error(`[processar-lembretes] Erro ao buscar conexão:`, conexaoError);
          continue;
        }

        // Formatar data/hora para exibição
        const dataAgendamento = new Date(agendamento.data_inicio);
        const dataFormatada = dataAgendamento.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
        });
        const horaFormatada = dataAgendamento.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        });

        // Gerar mensagem de lembrete
        let mensagemLembrete: string;

        if (regra.tipo === 'texto_fixo') {
          // Substituir variáveis no template
          mensagemLembrete = regra.mensagem_fixa || 'Olá! Lembrete do seu agendamento.';
          mensagemLembrete = mensagemLembrete
            .replace(/\{\{nome_contato\}\}/g, contato.nome)
            .replace(/\{\{titulo\}\}/g, agendamento.titulo)
            .replace(/\{\{data\}\}/g, dataFormatada)
            .replace(/\{\{hora\}\}/g, horaFormatada)
            .replace(/\{\{descricao\}\}/g, agendamento.descricao || '')
            .replace(/\{\{link_meet\}\}/g, regra.incluir_link_meet && agendamento.google_meet_link 
              ? `📹 Link da reunião: ${agendamento.google_meet_link}` 
              : '');
        } else {
          // Tipo contextual_ia: usar IA para gerar mensagem
          const { data: conta, error: contaError } = await supabase
            .from('contas')
            .select('openai_api_key')
            .eq('id', regra.conta_id)
            .single();

          const openaiApiKey = conta?.openai_api_key;
          const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

          if (!openaiApiKey && !lovableApiKey) {
            console.error(`[processar-lembretes] Nenhuma API key disponível para conta ${regra.conta_id}`);
            continue;
          }

          const promptSistema = regra.prompt_lembrete || 
            `Você é um assistente enviando um lembrete de reunião.
Gere uma mensagem breve e amigável lembrando o lead sobre o agendamento.
Seja direto e profissional. Máximo 3 frases.`;

          const contextoAgendamento = `
Detalhes do agendamento:
- Nome do lead: ${contato.nome}
- Título: ${agendamento.titulo}
- Data: ${dataFormatada}
- Hora: ${horaFormatada}
${agendamento.descricao ? `- Descrição: ${agendamento.descricao}` : ''}
${agendamento.google_meet_link ? `- Link Meet: ${agendamento.google_meet_link}` : ''}

Gere uma mensagem de lembrete para este agendamento:`;

          const mensagensAI = [
            { role: 'system', content: promptSistema },
            { role: 'user', content: contextoAgendamento }
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
              console.error('[processar-lembretes] Erro ao chamar OpenAI:', error);
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
              console.error('[processar-lembretes] Erro ao chamar Lovable AI:', error);
            }
          }

          if (!respostaIA) {
            console.error(`[processar-lembretes] Não foi possível gerar resposta IA para agendamento ${agendamento.id}`);
            continue;
          }

          mensagemLembrete = respostaIA;

          // Adicionar link meet se configurado e disponível
          if (regra.incluir_link_meet && agendamento.google_meet_link && !mensagemLembrete.includes(agendamento.google_meet_link)) {
            mensagemLembrete += `\n\n📹 Link da reunião: ${agendamento.google_meet_link}`;
          }
        }

        // Enviar mensagem via Evolution API
        const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
        const evolutionUrl = `${EVOLUTION_API_URL}/message/sendText/${conexao.instance_name}`;
        
        console.log(`[processar-lembretes] Enviando lembrete para ${contato.telefone} via ${conexao.instance_name}`);

        try {
          const evolutionResponse = await fetch(evolutionUrl, {
            method: 'POST',
            headers: {
              'apikey': evolutionApiKey || '',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              number: contato.telefone,
              text: mensagemLembrete,
            }),
          });

          if (!evolutionResponse.ok) {
            const errorText = await evolutionResponse.text();
            console.error(`[processar-lembretes] Erro ao enviar mensagem Evolution:`, errorText);
            continue;
          }

          console.log(`[processar-lembretes] Lembrete enviado para agendamento ${agendamento.id}`);

          // Registrar mensagem no banco
          await supabase.from('mensagens').insert({
            conversa_id: conversa.id,
            contato_id: contato.id,
            conteudo: mensagemLembrete,
            direcao: 'saida',
            tipo: 'texto',
            enviada_por_ia: true,
            metadata: { lembrete_regra_id: regra.id, agendamento_id: agendamento.id },
          });

          // Atualizar última mensagem da conversa
          await supabase.from('conversas').update({
            ultima_mensagem: mensagemLembrete,
            ultima_mensagem_at: new Date().toISOString(),
          }).eq('id', conversa.id);

          // Registrar lembrete enviado
          await supabase.from('lembrete_enviados').insert({
            regra_id: regra.id,
            agendamento_id: agendamento.id,
            contato_id: contato.id,
            mensagem_enviada: mensagemLembrete,
          });

          lembretesEnviados++;

        } catch (error) {
          console.error(`[processar-lembretes] Erro ao processar lembrete:`, error);
        }
      }
    }

    console.log(`[processar-lembretes] Processamento concluído. ${lembretesEnviados} lembretes enviados.`);

    return new Response(JSON.stringify({ 
      success: true, 
      lembretesEnviados 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[processar-lembretes] Erro geral:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
