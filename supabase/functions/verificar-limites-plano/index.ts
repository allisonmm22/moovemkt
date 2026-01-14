import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlanLimits {
  limite_usuarios: number;
  limite_agentes: number;
  limite_funis: number;
  limite_conexoes_evolution: number;
  limite_conexoes_meta: number;
  permite_instagram: boolean;
}

interface ResourceUsage {
  usuarios: number;
  agentes: number;
  funis: number;
  conexoes_evolution: number;
  conexoes_meta: number;
  conexoes_instagram: number;
}

const THRESHOLD = 0.8; // 80%

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[verificar-limites-plano] Iniciando verificação...');

    // Buscar todas as contas ativas com plano
    const { data: contas, error: contasError } = await supabase
      .from('contas')
      .select('id, nome, plano_id')
      .eq('ativo', true)
      .not('plano_id', 'is', null);

    if (contasError) {
      console.error('[verificar-limites-plano] Erro ao buscar contas:', contasError);
      throw contasError;
    }

    console.log(`[verificar-limites-plano] ${contas?.length || 0} contas com plano encontradas`);

    let alertasEnviados = 0;

    for (const conta of contas || []) {
      // Buscar limites do plano
      const { data: plano, error: planoError } = await supabase
        .from('planos')
        .select('limite_usuarios, limite_agentes, limite_funis, limite_conexoes_evolution, limite_conexoes_meta, permite_instagram')
        .eq('id', conta.plano_id)
        .single();

      if (planoError || !plano) {
        console.log(`[verificar-limites-plano] Plano não encontrado para conta ${conta.id}`);
        continue;
      }

      // Buscar uso atual
      const [usuarios, agentes, funis, conexoesEvolution, conexoesMeta, conexoesInstagram] = await Promise.all([
        supabase.from('usuarios').select('id', { count: 'exact', head: true }).eq('conta_id', conta.id),
        supabase.from('agent_ia').select('id', { count: 'exact', head: true }).eq('conta_id', conta.id),
        supabase.from('funis').select('id', { count: 'exact', head: true }).eq('conta_id', conta.id),
        supabase.from('conexoes_whatsapp').select('id', { count: 'exact', head: true }).eq('conta_id', conta.id).eq('tipo_provedor', 'evolution'),
        supabase.from('conexoes_whatsapp').select('id', { count: 'exact', head: true }).eq('conta_id', conta.id).eq('tipo_provedor', 'meta'),
        supabase.from('conexoes_whatsapp').select('id', { count: 'exact', head: true }).eq('conta_id', conta.id).eq('tipo_provedor', 'instagram'),
      ]);

      const usage: ResourceUsage = {
        usuarios: usuarios.count || 0,
        agentes: agentes.count || 0,
        funis: funis.count || 0,
        conexoes_evolution: conexoesEvolution.count || 0,
        conexoes_meta: conexoesMeta.count || 0,
        conexoes_instagram: conexoesInstagram.count || 0,
      };

      const limits: PlanLimits = plano as PlanLimits;

      // Verificar cada recurso
      const alertas: { recurso: string; atual: number; limite: number; porcentagem: number }[] = [];

      if (limits.limite_usuarios > 0 && usage.usuarios / limits.limite_usuarios >= THRESHOLD) {
        alertas.push({ recurso: 'Usuários', atual: usage.usuarios, limite: limits.limite_usuarios, porcentagem: Math.round((usage.usuarios / limits.limite_usuarios) * 100) });
      }
      if (limits.limite_agentes > 0 && usage.agentes / limits.limite_agentes >= THRESHOLD) {
        alertas.push({ recurso: 'Agentes IA', atual: usage.agentes, limite: limits.limite_agentes, porcentagem: Math.round((usage.agentes / limits.limite_agentes) * 100) });
      }
      if (limits.limite_funis > 0 && usage.funis / limits.limite_funis >= THRESHOLD) {
        alertas.push({ recurso: 'Funis', atual: usage.funis, limite: limits.limite_funis, porcentagem: Math.round((usage.funis / limits.limite_funis) * 100) });
      }
      if (limits.limite_conexoes_evolution > 0 && usage.conexoes_evolution / limits.limite_conexoes_evolution >= THRESHOLD) {
        alertas.push({ recurso: 'Conexões Evolution', atual: usage.conexoes_evolution, limite: limits.limite_conexoes_evolution, porcentagem: Math.round((usage.conexoes_evolution / limits.limite_conexoes_evolution) * 100) });
      }
      if (limits.limite_conexoes_meta > 0 && usage.conexoes_meta / limits.limite_conexoes_meta >= THRESHOLD) {
        alertas.push({ recurso: 'Conexões Meta', atual: usage.conexoes_meta, limite: limits.limite_conexoes_meta, porcentagem: Math.round((usage.conexoes_meta / limits.limite_conexoes_meta) * 100) });
      }

      // Criar notificações para cada alerta
      for (const alerta of alertas) {
        // Verificar se já existe notificação recente (últimas 24h) para evitar spam
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);

        const { data: notificacaoExistente } = await supabase
          .from('notificacoes')
          .select('id')
          .eq('conta_id', conta.id)
          .eq('tipo', 'limite_plano')
          .gte('created_at', ontem.toISOString())
          .like('titulo', `%${alerta.recurso}%`)
          .limit(1);

        if (notificacaoExistente && notificacaoExistente.length > 0) {
          console.log(`[verificar-limites-plano] Notificação já enviada recentemente para ${alerta.recurso} na conta ${conta.nome}`);
          continue;
        }

        // Criar notificação
        const { error: notifError } = await supabase
          .from('notificacoes')
          .insert({
            conta_id: conta.id,
            tipo: 'limite_plano',
            titulo: `⚠️ ${alerta.recurso}: ${alerta.porcentagem}% do limite`,
            mensagem: `Você está usando ${alerta.atual} de ${alerta.limite} ${alerta.recurso.toLowerCase()} do seu plano. Considere fazer upgrade para continuar crescendo.`,
            metadata: {
              recurso: alerta.recurso,
              atual: alerta.atual,
              limite: alerta.limite,
              porcentagem: alerta.porcentagem
            }
          });

        if (notifError) {
          console.error(`[verificar-limites-plano] Erro ao criar notificação:`, notifError);
        } else {
          console.log(`[verificar-limites-plano] Alerta criado: ${alerta.recurso} em ${alerta.porcentagem}% para conta ${conta.nome}`);
          alertasEnviados++;
        }
      }
    }

    console.log(`[verificar-limites-plano] Processamento concluído. ${alertasEnviados} alertas enviados.`);

    return new Response(
      JSON.stringify({ success: true, alertas_enviados: alertasEnviados }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[verificar-limites-plano] Erro:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
