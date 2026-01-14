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
    const { data: conexao, error: fetchError } = await supabase
      .from('conexoes_whatsapp')
      .select('*')
      .eq('id', conexao_id)
      .single();

    if (fetchError || !conexao) {
      return new Response(JSON.stringify({ error: 'Conexão não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Meta API connections don't use QR codes
    if (conexao.tipo_provedor === 'meta') {
      return new Response(JSON.stringify({ 
        error: 'Conexões Meta API não utilizam QR Code. Configure as credenciais diretamente.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Gerando QR Code para instância:', conexao.instance_name);

    // Buscar QR Code da Evolution API
    const connectResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${conexao.instance_name}`, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    const connectResult = await connectResponse.json();
    console.log('Resposta connect:', JSON.stringify(connectResult));

    if (!connectResponse.ok) {
      return new Response(JSON.stringify({ 
        error: connectResult.message || 'Erro ao gerar QR Code' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Atualizar status para aguardando
    await supabase
      .from('conexoes_whatsapp')
      .update({ 
        status: 'aguardando',
        qrcode: connectResult.base64 || null,
      })
      .eq('id', conexao_id);

    return new Response(JSON.stringify({ 
      success: true, 
      qrcode: connectResult.base64,
      pairingCode: connectResult.pairingCode,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao conectar:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
