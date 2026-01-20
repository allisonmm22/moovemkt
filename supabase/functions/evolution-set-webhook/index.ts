import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVOLUTION_API_URL = 'https://evolution.cognityx.com.br';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conexao_id } = await req.json();

    if (!conexao_id) {
      return new Response(JSON.stringify({ error: 'conexao_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!evolutionApiKey) {
      return new Response(JSON.stringify({ error: 'EVOLUTION_API_KEY não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar conexão
    const { data: conexao, error: conexaoError } = await supabase
      .from('conexoes_whatsapp')
      .select('*')
      .eq('id', conexao_id)
      .single();

    if (conexaoError || !conexao) {
      return new Response(JSON.stringify({ error: 'Conexão não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;
    console.log('Reconfigurando webhook para:', conexao.instance_name);
    console.log('URL do webhook:', webhookUrl);

    // Configurar webhook na Evolution API (formato v2 sem wrapper object)
    const webhookResponse = await fetch(`${EVOLUTION_API_URL}/webhook/set/${conexao.instance_name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        webhook: {
          url: webhookUrl,
          enabled: true,
          byEvents: false,
          base64: true,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
            'STATUS_INSTANCE',
          ],
        },
      }),
    });

    const webhookResult = await webhookResponse.json();
    console.log('Resposta da Evolution API:', JSON.stringify(webhookResult));

    if (!webhookResponse.ok) {
      return new Response(JSON.stringify({ 
        error: webhookResult.message || 'Erro ao configurar webhook',
        details: webhookResult
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Atualizar webhook_url no banco
    await supabase
      .from('conexoes_whatsapp')
      .update({ webhook_url: webhookUrl })
      .eq('id', conexao_id);

    console.log('Webhook reconfigurado com sucesso');

    return new Response(JSON.stringify({ 
      success: true,
      webhook_url: webhookUrl,
      webhookBase64: true,
      evolution_response: webhookResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao configurar webhook:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
