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

    // Buscar conexão para obter instance_name
    const { data: conexao, error: fetchError } = await supabase
      .from('conexoes_whatsapp')
      .select('instance_name')
      .eq('id', conexao_id)
      .single();

    if (fetchError || !conexao) {
      console.error('Erro ao buscar conexão:', fetchError);
      return new Response(JSON.stringify({ error: 'Conexão não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const instanceName = conexao.instance_name;
    console.log('Deletando instância da Evolution API:', instanceName);

    // Deletar instância na Evolution API
    const deleteResponse = await fetch(`${EVOLUTION_API_URL}/instance/delete/${instanceName}`, {
      method: 'DELETE',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    const deleteResult = await deleteResponse.json();
    console.log('Resposta da Evolution API:', JSON.stringify(deleteResult));

    // Mesmo se a Evolution retornar erro (instância já não existe), deletamos do banco
    if (!deleteResponse.ok) {
      console.warn('Evolution API retornou erro (continuando com delete local):', deleteResult);
    }

    // Deletar do banco de dados
    const { error: deleteError } = await supabase
      .from('conexoes_whatsapp')
      .delete()
      .eq('id', conexao_id);

    if (deleteError) {
      console.error('Erro ao deletar conexão do banco:', deleteError);
      return new Response(JSON.stringify({ error: 'Erro ao deletar conexão do banco' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Conexão deletada com sucesso:', conexao_id);

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Instância deletada da Evolution e do banco de dados'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao deletar instância:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
