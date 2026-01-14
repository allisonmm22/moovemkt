import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar Stripe key da tabela de configurações (onde o admin salva a chave live)
    const { data: configData, error: configError } = await supabaseClient
      .from('configuracoes_plataforma')
      .select('valor')
      .eq('chave', 'stripe_secret_key')
      .maybeSingle();

    if (configError || !configData?.valor) {
      console.error('Stripe secret key não configurada:', configError);
      return new Response(
        JSON.stringify({ error: 'Stripe não configurado. Configure a chave na página de Pagamentos.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripeKey = configData.valor;
    console.log('Using Stripe key from database, starts with:', stripeKey.substring(0, 10));

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const { plano_id, conta_id, success_url, cancel_url } = await req.json();

    if (!plano_id || !conta_id) {
      return new Response(
        JSON.stringify({ error: 'plano_id e conta_id são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating checkout for plano:', plano_id, 'conta:', conta_id);

    // Buscar dados do plano
    const { data: plano, error: planoError } = await supabaseClient
      .from('planos')
      .select('*')
      .eq('id', plano_id)
      .single();

    if (planoError || !plano) {
      console.error('Plano not found:', planoError);
      return new Response(
        JSON.stringify({ error: 'Plano não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar dados da conta
    const { data: conta, error: contaError } = await supabaseClient
      .from('contas')
      .select('*, usuarios(*)')
      .eq('id', conta_id)
      .single();

    if (contaError || !conta) {
      console.error('Conta not found:', contaError);
      return new Response(
        JSON.stringify({ error: 'Conta não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar email do admin da conta
    const adminUser = conta.usuarios?.find((u: any) => u.is_admin) || conta.usuarios?.[0];
    const customerEmail = adminUser?.email;

    // Criar ou buscar cliente no Stripe
    let customerId: string | undefined;
    
    if (customerEmail) {
      const existingCustomers = await stripe.customers.list({
        email: customerEmail,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
      } else {
        const newCustomer = await stripe.customers.create({
          email: customerEmail,
          name: conta.nome,
          metadata: {
            conta_id: conta_id,
          },
        });
        customerId = newCustomer.id;
      }
    }

    // Criar preço no Stripe (ou usar um existente)
    const priceInCents = Math.round((plano.preco_mensal || 0) * 100);
    
    // Criar produto e preço dinâmicos
    const product = await stripe.products.create({
      name: `${plano.nome} - ZapCRM`,
      description: plano.descricao || `Plano ${plano.nome}`,
      metadata: {
        plano_id: plano_id,
      },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: priceInCents,
      currency: 'brl',
      recurring: {
        interval: 'month',
      },
    });

    // Criar sessão de checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : customerEmail,
      payment_method_types: ['card'],
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: success_url || `${req.headers.get('origin')}/upgrade?success=true&plano=${plano.nome}`,
      cancel_url: cancel_url || `${req.headers.get('origin')}/upgrade?canceled=true`,
      metadata: {
        conta_id: conta_id,
        plano_id: plano_id,
      },
      subscription_data: {
        metadata: {
          conta_id: conta_id,
          plano_id: plano_id,
        },
      },
      locale: 'pt-BR',
      allow_promotion_codes: true,
    });

    console.log('Checkout session created:', session.id);

    return new Response(
      JSON.stringify({ 
        url: session.url,
        session_id: session.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error creating checkout session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao criar sessão de pagamento';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
