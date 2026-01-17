import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[consolidar-uso] Iniciando consolidação de uso diário');

    // Data de ontem (consolidamos sempre o dia anterior)
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    ontem.setHours(0, 0, 0, 0);
    const dataStr = ontem.toISOString().split('T')[0];

    const inicioDia = new Date(ontem);
    const fimDia = new Date(ontem);
    fimDia.setHours(23, 59, 59, 999);

    console.log(`[consolidar-uso] Consolidando data: ${dataStr}`);

    // Buscar todas as contas ativas
    const { data: contas, error: contasError } = await supabase
      .from('contas')
      .select('id, nome, plano_id')
      .eq('ativo', true);

    if (contasError) {
      console.error('[consolidar-uso] Erro ao buscar contas:', contasError);
      throw contasError;
    }

    console.log(`[consolidar-uso] Processando ${contas?.length || 0} contas`);

    const resultados = [];

    for (const conta of contas || []) {
      try {
        // Contar mensagens enviadas (saída)
        const { count: msgEnviadas } = await supabase
          .from('mensagens')
          .select('*', { count: 'exact', head: true })
          .eq('conta_id', conta.id)
          .eq('direcao', 'saida')
          .gte('created_at', inicioDia.toISOString())
          .lte('created_at', fimDia.toISOString());

        // Contar mensagens recebidas (entrada)
        const { count: msgRecebidas } = await supabase
          .from('mensagens')
          .select('*', { count: 'exact', head: true })
          .eq('conta_id', conta.id)
          .eq('direcao', 'entrada')
          .gte('created_at', inicioDia.toISOString())
          .lte('created_at', fimDia.toISOString());

        // Contar conversas ativas
        const { count: conversasAtivas } = await supabase
          .from('conversas')
          .select('*', { count: 'exact', head: true })
          .eq('conta_id', conta.id)
          .eq('status', 'em_atendimento');

        // Contar novos leads (contatos criados no dia)
        const { count: leadsNovos } = await supabase
          .from('contatos')
          .select('*', { count: 'exact', head: true })
          .eq('conta_id', conta.id)
          .gte('created_at', inicioDia.toISOString())
          .lte('created_at', fimDia.toISOString());

        // Contar usuários ativos (que enviaram mensagens)
        const { data: usuariosAtivos } = await supabase
          .from('mensagens')
          .select('usuario_id')
          .eq('conta_id', conta.id)
          .eq('direcao', 'saida')
          .not('usuario_id', 'is', null)
          .gte('created_at', inicioDia.toISOString())
          .lte('created_at', fimDia.toISOString());

        const usuariosUnicos = new Set(usuariosAtivos?.map(u => u.usuario_id) || []);

        // Inserir ou atualizar registro
        const { error: upsertError } = await supabase
          .from('uso_historico')
          .upsert({
            conta_id: conta.id,
            data: dataStr,
            mensagens_enviadas: msgEnviadas || 0,
            mensagens_recebidas: msgRecebidas || 0,
            usuarios_ativos: usuariosUnicos.size,
            conversas_ativas: conversasAtivas || 0,
            leads_novos: leadsNovos || 0
          }, { onConflict: 'conta_id,data' });

        if (upsertError) {
          console.error(`[consolidar-uso] Erro ao salvar uso da conta ${conta.id}:`, upsertError);
          continue;
        }

        resultados.push({
          conta_id: conta.id,
          conta_nome: conta.nome,
          mensagens_enviadas: msgEnviadas || 0,
          mensagens_recebidas: msgRecebidas || 0
        });

        // Verificar limites e criar alertas
        if (conta.plano_id) {
          const { data: plano } = await supabase
            .from('planos')
            .select('limite_mensagens_mes')
            .eq('id', conta.plano_id)
            .single();

          if (plano?.limite_mensagens_mes) {
            // Calcular uso do mês atual
            const inicioMes = new Date(ontem.getFullYear(), ontem.getMonth(), 1);
            const { count: msgMes } = await supabase
              .from('mensagens')
              .select('*', { count: 'exact', head: true })
              .eq('conta_id', conta.id)
              .eq('direcao', 'saida')
              .gte('created_at', inicioMes.toISOString());

            const percentual = ((msgMes || 0) / plano.limite_mensagens_mes) * 100;

            // Criar alertas em 70%, 80%, 90% e 100%
            const thresholds = [70, 80, 90, 100];
            for (const threshold of thresholds) {
              if (percentual >= threshold) {
                // Verificar se já enviou alerta para este threshold neste mês
                const { count: alertaExistente } = await supabase
                  .from('notificacoes')
                  .select('*', { count: 'exact', head: true })
                  .eq('conta_id', conta.id)
                  .eq('tipo', 'limite_mensagens')
                  .gte('created_at', inicioMes.toISOString())
                  .contains('metadata', { threshold });

                if (!alertaExistente || alertaExistente === 0) {
                  const titulo = percentual >= 100 
                    ? '⚠️ Limite de mensagens atingido!'
                    : `📊 ${threshold}% do limite de mensagens`;
                  
                  const mensagem = percentual >= 100
                    ? `Você atingiu o limite de ${plano.limite_mensagens_mes} mensagens do seu plano.`
                    : `Você já usou ${threshold}% do seu limite mensal de mensagens.`;

                  await supabase.from('notificacoes').insert({
                    conta_id: conta.id,
                    tipo: 'limite_mensagens',
                    titulo,
                    mensagem,
                    link: '/configuracoes',
                    metadata: { threshold, percentual, usado: msgMes, limite: plano.limite_mensagens_mes }
                  });

                  console.log(`[consolidar-uso] Alerta ${threshold}% criado para conta ${conta.nome}`);
                }
                break; // Só cria um alerta por vez
              }
            }
          }
        }

      } catch (contaError) {
        console.error(`[consolidar-uso] Erro ao processar conta ${conta.id}:`, contaError);
      }
    }

    console.log(`[consolidar-uso] Consolidação concluída. ${resultados.length} contas processadas`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: dataStr,
        contas_processadas: resultados.length,
        resultados
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[consolidar-uso] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
