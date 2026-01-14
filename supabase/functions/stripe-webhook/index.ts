import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

// Função para verificar assinatura do Stripe
async function verifyStripeSignature(
  payload: string,
  signature: string,
  webhookSecret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    
    // Extrair timestamp e assinaturas do header
    const elements = signature.split(',');
    let timestamp = '';
    const signatures: string[] = [];
    
    for (const element of elements) {
      const [key, value] = element.split('=');
      if (key === 't') timestamp = value;
      if (key === 'v1') signatures.push(value);
    }
    
    if (!timestamp || signatures.length === 0) {
      console.error('[stripe-webhook] Assinatura mal formatada');
      return false;
    }
    
    // Verificar se timestamp não é muito antigo (5 minutos)
    const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (timestampAge > 300) {
      console.error('[stripe-webhook] Timestamp muito antigo:', timestampAge);
      return false;
    }
    
    // Calcular assinatura esperada
    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signedPayload)
    );
    
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Verificar se alguma das assinaturas bate
    return signatures.some(sig => sig === expectedSignature);
  } catch (error) {
    console.error('[stripe-webhook] Erro ao verificar assinatura:', error);
    return false;
  }
}

// Função auxiliar para buscar dados da subscription no Stripe
async function fetchStripeSubscription(subscriptionId: string, secretKey: string) {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: {
      'Authorization': `Bearer ${secretKey}`,
    },
  });
  
  if (!response.ok) {
    console.error('[stripe-webhook] Erro ao buscar subscription:', await response.text());
    return null;
  }
  
  return await response.json();
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar webhook secret e stripe secret key da tabela de configurações
    const { data: configData, error: configError } = await supabase
      .from('configuracoes_plataforma')
      .select('chave, valor')
      .in('chave', ['stripe_webhook_secret', 'stripe_secret_key']);

    if (configError) {
      console.error('[stripe-webhook] Erro ao buscar configurações:', configError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar configurações' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const webhookSecret = configData?.find(c => c.chave === 'stripe_webhook_secret')?.valor;
    const stripeSecretKey = configData?.find(c => c.chave === 'stripe_secret_key')?.valor;

    if (!webhookSecret) {
      console.error('[stripe-webhook] Webhook secret não configurado');
      return new Response(
        JSON.stringify({ error: 'Webhook secret não configurado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const signature = req.headers.get('stripe-signature');
    const payload = await req.text();

    if (!signature) {
      console.error('[stripe-webhook] Assinatura não fornecida');
      return new Response(
        JSON.stringify({ error: 'Assinatura não fornecida' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Verificar assinatura
    const isValid = await verifyStripeSignature(payload, signature, webhookSecret);
    if (!isValid) {
      console.error('[stripe-webhook] Assinatura inválida');
      return new Response(
        JSON.stringify({ error: 'Assinatura inválida' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const event = JSON.parse(payload);
    console.log('[stripe-webhook] Evento recebido:', event.type);

    // Processar eventos
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('[stripe-webhook] Checkout completado:', session.id);
        
        // Extrair metadados
        const contaId = session.metadata?.conta_id;
        const planoId = session.metadata?.plano_id;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        
        if (contaId && planoId) {
          // Buscar dados completos da subscription se disponível
          let subscriptionData: any = null;
          if (subscriptionId && stripeSecretKey) {
            subscriptionData = await fetchStripeSubscription(subscriptionId, stripeSecretKey);
          }
          
          // Preparar dados de atualização
          const updateData: any = { 
            plano_id: planoId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            stripe_subscription_status: 'active',
          };
          
          // Se temos dados da subscription, adicionar período
          if (subscriptionData) {
            updateData.stripe_current_period_start = new Date(subscriptionData.current_period_start * 1000).toISOString();
            updateData.stripe_current_period_end = new Date(subscriptionData.current_period_end * 1000).toISOString();
            updateData.stripe_cancel_at_period_end = subscriptionData.cancel_at_period_end || false;
          }
          
          // Atualizar conta
          const { error: updateError } = await supabase
            .from('contas')
            .update(updateData)
            .eq('id', contaId);
          
          if (updateError) {
            console.error('[stripe-webhook] Erro ao atualizar plano:', updateError);
          } else {
            console.log('[stripe-webhook] Plano e assinatura atualizados:', contaId);
            
            // Registrar log
            await supabase.from('logs_atividade').insert({
              conta_id: contaId,
              tipo: 'upgrade_plano',
              descricao: `Plano atualizado via Stripe`,
              metadata: { 
                session_id: session.id,
                plano_id: planoId,
                customer_id: customerId,
                subscription_id: subscriptionId,
                amount: session.amount_total,
                currency: session.currency
              }
            });
          }
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        console.log('[stripe-webhook] Fatura paga:', invoice.id);
        
        const customerId = invoice.customer;
        const subscriptionId = invoice.subscription;
        
        // Buscar conta pelo customer_id
        const { data: conta } = await supabase
          .from('contas')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();
        
        if (conta && subscriptionId && stripeSecretKey) {
          // Buscar dados atualizados da subscription
          const subscriptionData = await fetchStripeSubscription(subscriptionId, stripeSecretKey);
          
          if (subscriptionData) {
            await supabase
              .from('contas')
              .update({
                stripe_subscription_status: subscriptionData.status,
                stripe_current_period_start: new Date(subscriptionData.current_period_start * 1000).toISOString(),
                stripe_current_period_end: new Date(subscriptionData.current_period_end * 1000).toISOString(),
                stripe_cancel_at_period_end: subscriptionData.cancel_at_period_end || false,
              })
              .eq('id', conta.id);
            
            console.log('[stripe-webhook] Período de assinatura atualizado para conta:', conta.id);
            
            // Registrar log de renovação
            await supabase.from('logs_atividade').insert({
              conta_id: conta.id,
              tipo: 'renovacao_assinatura',
              descricao: `Assinatura renovada - Fatura paga`,
              metadata: { 
                invoice_id: invoice.id,
                amount: invoice.amount_paid,
                currency: invoice.currency
              }
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        console.log('[stripe-webhook] Assinatura atualizada:', subscription.id);
        
        // Buscar conta pela subscription_id
        const { data: conta } = await supabase
          .from('contas')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single();
        
        if (conta) {
          await supabase
            .from('contas')
            .update({
              stripe_subscription_status: subscription.status,
              stripe_current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              stripe_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              stripe_cancel_at_period_end: subscription.cancel_at_period_end || false,
            })
            .eq('id', conta.id);
          
          console.log('[stripe-webhook] Status da assinatura atualizado:', subscription.status);
          
          // Log se cancelamento agendado
          if (subscription.cancel_at_period_end) {
            await supabase.from('logs_atividade').insert({
              conta_id: conta.id,
              tipo: 'cancelamento_agendado',
              descricao: `Cancelamento agendado para o fim do período`,
              metadata: { 
                subscription_id: subscription.id,
                cancel_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null
              }
            });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        console.log('[stripe-webhook] Assinatura deletada:', subscription.id);
        
        // Buscar conta pela subscription_id
        const { data: conta } = await supabase
          .from('contas')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single();
        
        if (conta) {
          // Marcar assinatura como cancelada mas manter customer_id
          await supabase
            .from('contas')
            .update({
              stripe_subscription_status: 'canceled',
              stripe_subscription_id: null,
              stripe_current_period_end: null,
              stripe_cancel_at_period_end: false,
              plano_id: null, // Remove o plano (downgrade para free)
            })
            .eq('id', conta.id);
          
          console.log('[stripe-webhook] Assinatura removida da conta:', conta.id);
          
          await supabase.from('logs_atividade').insert({
            conta_id: conta.id,
            tipo: 'assinatura_cancelada',
            descricao: `Assinatura cancelada definitivamente`,
            metadata: { subscription_id: subscription.id }
          });
        }
        break;
      }

      default:
        console.log('[stripe-webhook] Evento não tratado:', event.type);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[stripe-webhook] Erro:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
