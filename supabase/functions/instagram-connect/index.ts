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

    if (conexao.tipo_canal !== 'instagram' && conexao.tipo_provedor !== 'instagram') {
      return new Response(JSON.stringify({ error: 'Esta conexão não é do tipo Instagram' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Iniciando conexão Instagram para instância:', conexao.instance_name);

    // Chamar Evolution API para obter URL de OAuth do Instagram
    const connectResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${conexao.instance_name}`, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    const connectResult = await connectResponse.json();
    console.log('Resposta da conexão Instagram:', JSON.stringify(connectResult));

    if (!connectResponse.ok) {
      return new Response(JSON.stringify({ 
        error: connectResult.message || 'Erro ao conectar Instagram' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Atualizar status para aguardando
    await supabase
      .from('conexoes_whatsapp')
      .update({ status: 'aguardando' })
      .eq('id', conexao_id);

    // Retornar URL de OAuth
    const oauthUrl = connectResult.oauthUrl || connectResult.oauth_url || connectResult.url || null;

    return new Response(JSON.stringify({ 
      success: true,
      oauth_url: oauthUrl,
      result: connectResult,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao conectar Instagram:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
