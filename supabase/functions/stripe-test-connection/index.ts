import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { secret_key } = await req.json();

    if (!secret_key) {
      return new Response(
        JSON.stringify({ success: false, message: 'Secret key não fornecida' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validar formato da chave
    if (!secret_key.startsWith('sk_test_') && !secret_key.startsWith('sk_live_')) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Formato inválido. A chave deve começar com sk_test_ ou sk_live_' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Testar conexão com Stripe API
    const response = await fetch('https://api.stripe.com/v1/account', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secret_key}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[stripe-test-connection] Erro Stripe:', errorData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: errorData.error?.message || 'Erro ao conectar com Stripe' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const accountData = await response.json();
    console.log('[stripe-test-connection] Conexão OK:', accountData.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Conexão estabelecida com sucesso',
        account_id: accountData.id,
        account_name: accountData.settings?.dashboard?.display_name || accountData.business_profile?.name || 'Conta Stripe',
        mode: secret_key.startsWith('sk_live_') ? 'live' : 'test'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[stripe-test-connection] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Erro interno ao testar conexão' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});