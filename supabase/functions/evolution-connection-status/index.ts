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

    console.log('Verificando status da instância:', conexao.instance_name);

    // Verificar status na Evolution API
    const statusResponse = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${conexao.instance_name}`, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    const statusResult = await statusResponse.json();
    console.log('Resposta status:', JSON.stringify(statusResult));

    // Mapear status da Evolution para nosso enum
    let status: 'conectado' | 'desconectado' | 'aguardando' = 'desconectado';
    let numero = conexao.numero;
    let instanceExists = true;

    // Verificar se a instância existe (404 ou mensagem de erro)
    if (!statusResponse.ok || statusResult.error || 
        (statusResult.response?.message && Array.isArray(statusResult.response.message) && 
         statusResult.response.message.some((m: string) => m.includes('does not exist')))) {
      console.log('Instância não existe na Evolution API');
      status = 'desconectado';
      instanceExists = false;
    } else if (statusResult.instance?.state === 'open') {
      status = 'conectado';
      // Tentar extrair o número de vários campos possíveis
      if (statusResult.instance?.owner) {
        numero = statusResult.instance.owner.split('@')[0];
      } else if (statusResult.instance?.wuid) {
        numero = statusResult.instance.wuid.split('@')[0];
      } else if (statusResult.instance?.phoneNumber) {
        numero = statusResult.instance.phoneNumber.replace(/\D/g, '');
      } else if (statusResult.instance?.profilePictureUrl) {
        // Último recurso: manter número existente
        console.log('Número não encontrado na resposta, mantendo existente');
      }
    } else if (statusResult.instance?.state === 'connecting') {
      status = 'aguardando';
    }

    // Atualizar status no banco
    await supabase
      .from('conexoes_whatsapp')
      .update({ 
        status,
        numero: numero || conexao.numero,
      })
      .eq('id', conexao_id);

    return new Response(JSON.stringify({ 
      success: true, 
      status,
      numero,
      evolution_state: statusResult.instance?.state || 'not_found',
      instance_exists: instanceExists,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao verificar status:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
