import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API_URL = 'https://graph.facebook.com/v18.0';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conexao_id } = await req.json();

    console.log('=== META API: BUSCANDO TEMPLATES ===');
    console.log('Conexão:', conexao_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar conexão com credenciais Meta
    const { data: conexao, error } = await supabase
      .from('conexoes_whatsapp')
      .select('*')
      .eq('id', conexao_id)
      .single();

    if (error || !conexao) {
      console.error('Conexão não encontrada:', conexao_id);
      return new Response(JSON.stringify({ error: 'Conexão não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (conexao.tipo_provedor !== 'meta') {
      console.error('Conexão não é do tipo Meta');
      return new Response(JSON.stringify({ error: 'Esta função é apenas para conexões Meta API' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!conexao.meta_business_account_id || !conexao.meta_access_token) {
      console.error('Credenciais Meta não configuradas');
      return new Response(JSON.stringify({ error: 'Credenciais Meta API não configuradas' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar templates aprovados
    const response = await fetch(
      `${META_API_URL}/${conexao.meta_business_account_id}/message_templates?status=APPROVED`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${conexao.meta_access_token}`,
        },
      }
    );

    const result = await response.json();
    console.log('Resposta Meta API:', JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.error('Erro ao buscar templates:', result);
      return new Response(JSON.stringify({ error: 'Erro ao buscar templates', details: result }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mapear templates para formato simplificado
    const templates = (result.data || []).map((template: any) => ({
      id: template.id,
      name: template.name,
      category: template.category,
      language: template.language,
      status: template.status,
      components: template.components,
    }));

    return new Response(JSON.stringify({ success: true, templates }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao buscar templates:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
