import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ResourceType = 'usuarios' | 'agentes' | 'funis' | 'conexoes' | 'conexoes_evolution' | 'conexoes_meta' | 'instagram' | 'mensagens'

interface ValidationRequest {
  conta_id: string
  resource_type: ResourceType
}

interface PlanLimits {
  limite_usuarios: number
  limite_agentes: number
  limite_funis: number
  limite_conexoes_whatsapp: number
  limite_conexoes_evolution: number
  limite_conexoes_meta: number
  limite_mensagens_mes: number
  permite_instagram: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { conta_id, resource_type }: ValidationRequest = await req.json()

    if (!conta_id || !resource_type) {
      console.error('Missing required fields:', { conta_id, resource_type })
      return new Response(
        JSON.stringify({ error: 'conta_id e resource_type são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Validating limit for conta ${conta_id}, resource: ${resource_type}`)

    // Get conta with plan and Stripe period
    const { data: conta, error: contaError } = await supabase
      .from('contas')
      .select('plano_id, stripe_current_period_start, stripe_current_period_end')
      .eq('id', conta_id)
      .single()

    if (contaError || !conta) {
      console.error('Error fetching conta:', contaError)
      return new Response(
        JSON.stringify({ error: 'Conta não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If no plan assigned, allow unlimited (or you could block)
    if (!conta.plano_id) {
      console.log('No plan assigned, allowing creation')
      return new Response(
        JSON.stringify({ allowed: true, message: 'Sem plano atribuído, criação permitida' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get plan limits
    const { data: plano, error: planoError } = await supabase
      .from('planos')
      .select('nome, limite_usuarios, limite_agentes, limite_funis, limite_conexoes_whatsapp, limite_conexoes_evolution, limite_conexoes_meta, limite_mensagens_mes, permite_instagram')
      .eq('id', conta.plano_id)
      .single()

    if (planoError || !plano) {
      console.error('Error fetching plano:', planoError)
      return new Response(
        JSON.stringify({ error: 'Plano não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Plan limits:', plano)

    // Count current resources
    let currentCount = 0
    let limit = 0
    let resourceName = ''

    switch (resource_type) {
      case 'usuarios':
        const { count: userCount } = await supabase
          .from('usuarios')
          .select('*', { count: 'exact', head: true })
          .eq('conta_id', conta_id)
        currentCount = userCount || 0
        limit = plano.limite_usuarios
        resourceName = 'usuários'
        break

      case 'agentes':
        const { count: agentCount } = await supabase
          .from('agent_ia')
          .select('*', { count: 'exact', head: true })
          .eq('conta_id', conta_id)
        currentCount = agentCount || 0
        limit = plano.limite_agentes
        resourceName = 'agentes de IA'
        break

      case 'funis':
        const { count: funnelCount } = await supabase
          .from('funis')
          .select('*', { count: 'exact', head: true })
          .eq('conta_id', conta_id)
        currentCount = funnelCount || 0
        limit = plano.limite_funis
        resourceName = 'funis CRM'
        break

      case 'conexoes':
        // Legacy: conta todas as conexões WhatsApp
        const { count: connectionCount } = await supabase
          .from('conexoes_whatsapp')
          .select('*', { count: 'exact', head: true })
          .eq('conta_id', conta_id)
        currentCount = connectionCount || 0
        limit = plano.limite_conexoes_whatsapp
        resourceName = 'conexões WhatsApp'
        break

      case 'conexoes_evolution':
        // Conexões Evolution API específicas
        const { count: evolutionCount } = await supabase
          .from('conexoes_whatsapp')
          .select('*', { count: 'exact', head: true })
          .eq('conta_id', conta_id)
          .eq('tipo_provedor', 'evolution')
        currentCount = evolutionCount || 0
        limit = plano.limite_conexoes_evolution ?? plano.limite_conexoes_whatsapp
        resourceName = 'conexões Evolution API'
        break

      case 'conexoes_meta':
        // Conexões Meta API específicas
        const { count: metaCount } = await supabase
          .from('conexoes_whatsapp')
          .select('*', { count: 'exact', head: true })
          .eq('conta_id', conta_id)
          .eq('tipo_provedor', 'meta')
        currentCount = metaCount || 0
        limit = plano.limite_conexoes_meta ?? 0
        resourceName = 'conexões Meta API'
        break

      case 'instagram':
        // Verificar se plano permite Instagram
        if (!plano.permite_instagram) {
          return new Response(
            JSON.stringify({
              allowed: false,
              message: `Seu plano "${plano.nome}" não permite conexões Instagram. Faça upgrade para habilitar.`,
              current: 0,
              limit: 0,
              plan_name: plano.nome
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        // Se permite, retorna permitido (não tem limite de quantidade separado)
        return new Response(
          JSON.stringify({
            allowed: true,
            message: `Instagram habilitado no plano "${plano.nome}"`,
            current: 0,
            limit: 999,
            plan_name: plano.nome
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      case 'mensagens':
        // Contar mensagens do ciclo atual do plano (ou mês calendário como fallback)
        let inicioCiclo: Date
        if (conta.stripe_current_period_start) {
          inicioCiclo = new Date(conta.stripe_current_period_start)
        } else {
          // Fallback: primeiro dia do mês atual
          inicioCiclo = new Date()
          inicioCiclo.setDate(1)
          inicioCiclo.setHours(0, 0, 0, 0)
        }
        console.log(`Counting messages from: ${inicioCiclo.toISOString()}`)
        
        // Contar mensagens através das conversas da conta
        const { data: conversasIds } = await supabase
          .from('conversas')
          .select('id')
          .eq('conta_id', conta_id)
        
        const conversaIdList = conversasIds?.map(c => c.id) || []
        
        let msgCount = 0
        if (conversaIdList.length > 0) {
          const { count } = await supabase
            .from('mensagens')
            .select('*', { count: 'exact', head: true })
            .in('conversa_id', conversaIdList)
            .gte('created_at', inicioCiclo.toISOString())
            .eq('enviada_por_ia', true)
          msgCount = count || 0
        }
        
        currentCount = msgCount
        limit = plano.limite_mensagens_mes ?? 10000
        resourceName = 'mensagens/mês'
        
        // Se limite é 999999, considera ilimitado
        if (limit >= 999999) {
          return new Response(
            JSON.stringify({
              allowed: true,
              message: `Mensagens ilimitadas no plano "${plano.nome}"`,
              current: currentCount,
              limit: limit,
              plan_name: plano.nome
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        break

      default:
        return new Response(
          JSON.stringify({ error: 'Tipo de recurso inválido' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    console.log(`Current ${resource_type}: ${currentCount}, limit: ${limit}`)

    const allowed = currentCount < limit

    if (!allowed) {
      return new Response(
        JSON.stringify({
          allowed: false,
          message: `Limite de ${resourceName} atingido (${currentCount}/${limit}). Faça upgrade do plano "${plano.nome}" para criar mais.`,
          current: currentCount,
          limit: limit,
          plan_name: plano.nome
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        allowed: true,
        message: `Criação permitida (${currentCount}/${limit} ${resourceName})`,
        current: currentCount,
        limit: limit,
        plan_name: plano.nome
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error validating limit:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno ao validar limite' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
