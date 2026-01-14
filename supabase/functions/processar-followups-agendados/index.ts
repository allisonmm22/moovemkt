import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FollowupAgendado {
  id: string;
  conta_id: string;
  conversa_id: string;
  contato_id: string;
  agente_ia_id: string | null;
  data_agendada: string;
  motivo: string | null;
  contexto: string | null;
  status: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔄 Iniciando processamento de follow-ups agendados...');

    // Buscar follow-ups pendentes que já passaram do horário
    const agora = new Date().toISOString();
    
    const { data: followups, error: fetchError } = await supabase
      .from('followups_agendados')
      .select('*')
      .eq('status', 'pendente')
      .lte('data_agendada', agora)
      .order('data_agendada', { ascending: true })
      .limit(20);

    if (fetchError) {
      console.error('❌ Erro ao buscar follow-ups:', fetchError);
      throw fetchError;
    }

    if (!followups || followups.length === 0) {
      console.log('✅ Nenhum follow-up pendente para processar');
      return new Response(
        JSON.stringify({ sucesso: true, mensagem: 'Nenhum follow-up pendente', processados: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Encontrados ${followups.length} follow-ups para processar`);

    let processados = 0;
    let erros = 0;

    for (const followup of followups as FollowupAgendado[]) {
      try {
        console.log(`\n📅 Processando follow-up ${followup.id}...`);

        // Buscar dados da conversa
        const { data: conversa } = await supabase
          .from('conversas')
          .select('id, conexao_id, agente_ia_ativo, status')
          .eq('id', followup.conversa_id)
          .single();

        if (!conversa) {
          console.log('⚠️ Conversa não encontrada, cancelando follow-up');
          await supabase
            .from('followups_agendados')
            .update({ status: 'cancelado', enviado_em: new Date().toISOString() })
            .eq('id', followup.id);
          continue;
        }

        // Verificar se conversa está encerrada
        if (conversa.status === 'encerrado') {
          console.log('⚠️ Conversa encerrada, cancelando follow-up');
          await supabase
            .from('followups_agendados')
            .update({ status: 'cancelado', enviado_em: new Date().toISOString() })
            .eq('id', followup.id);
          continue;
        }

        // Buscar contato
        const { data: contato } = await supabase
          .from('contatos')
          .select('nome, telefone')
          .eq('id', followup.contato_id)
          .single();

        if (!contato) {
          console.log('⚠️ Contato não encontrado');
          continue;
        }

        // Buscar conta para chave OpenAI
        const { data: conta } = await supabase
          .from('contas')
          .select('openai_api_key')
          .eq('id', followup.conta_id)
          .single();

        // Gerar mensagem de follow-up
        let mensagemFollowup: string;

        if (conta?.openai_api_key) {
          // Gerar mensagem contextual com IA
          try {
            const prompt = `Você é um assistente que precisa retornar a um lead que pediu para falar depois.

Contexto da última conversa:
${followup.contexto || 'Não disponível'}

Motivo do retorno: ${followup.motivo || 'Lead pediu para retornar'}

Gere uma mensagem curta (máximo 2 frases) e amigável para retomar a conversa. Seja natural e mencione que está retornando conforme combinado. NÃO use aspas na resposta.`;

            const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${conta.openai_api_key}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                  { role: 'system', content: prompt },
                  { role: 'user', content: 'Gere a mensagem de retorno.' }
                ],
                max_tokens: 150,
                temperature: 0.7,
              }),
            });

            const aiResult = await openaiResponse.json();
            mensagemFollowup = aiResult.choices?.[0]?.message?.content?.trim() || 
              `Olá ${contato.nome}! Estou retornando conforme combinamos. Posso ajudar você agora?`;
          } catch (aiError) {
            console.error('⚠️ Erro ao gerar mensagem com IA:', aiError);
            mensagemFollowup = `Olá ${contato.nome}! Estou retornando conforme combinamos. Posso ajudar você agora?`;
          }
        } else {
          // Mensagem padrão
          mensagemFollowup = `Olá ${contato.nome}! Estou retornando conforme combinamos. Posso ajudar você agora?`;
        }

        console.log('📤 Mensagem gerada:', mensagemFollowup);

        // Enviar mensagem via função enviar-mensagem (roteador central)
        const enviarResponse = await supabase.functions.invoke('enviar-mensagem', {
          body: {
            conexao_id: conversa.conexao_id,
            telefone: contato.telefone,
            mensagem: mensagemFollowup,
            tipo: 'texto',
          },
        });

        if (enviarResponse.error) {
          console.error('❌ Erro ao enviar mensagem:', enviarResponse.error);
          erros++;
          continue;
        }

        console.log('✅ Mensagem enviada com sucesso');

        // Registrar mensagem na tabela
        await supabase.from('mensagens').insert({
          conversa_id: followup.conversa_id,
          conteudo: mensagemFollowup,
          direcao: 'saida',
          tipo: 'texto',
          enviada_por_ia: true,
          metadata: {
            followup_id: followup.id,
            tipo: 'followup_agendado',
          },
        });

        // Atualizar conversa
        await supabase
          .from('conversas')
          .update({
            ultima_mensagem: mensagemFollowup,
            ultima_mensagem_at: new Date().toISOString(),
            status: 'em_atendimento',
          })
          .eq('id', followup.conversa_id);

        // Marcar follow-up como enviado
        await supabase
          .from('followups_agendados')
          .update({
            status: 'enviado',
            enviado_em: new Date().toISOString(),
            mensagem_enviada: mensagemFollowup,
          })
          .eq('id', followup.id);

        processados++;
        console.log(`✅ Follow-up ${followup.id} processado com sucesso`);

      } catch (followupError) {
        console.error(`❌ Erro ao processar follow-up ${followup.id}:`, followupError);
        erros++;
      }
    }

    console.log(`\n📊 Resumo: ${processados} processados, ${erros} erros`);

    return new Response(
      JSON.stringify({
        sucesso: true,
        mensagem: `Processamento concluído`,
        processados,
        erros,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Erro geral:', errorMessage);
    return new Response(
      JSON.stringify({ sucesso: false, mensagem: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
