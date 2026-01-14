import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVOLUTION_API_URL = 'https://press-evolution.vempix.com.br';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conta_id } = await req.json();

    if (!conta_id) {
      return new Response(
        JSON.stringify({ error: 'conta_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[desativar-conta] Iniciando desativação da conta ${conta_id}`);

    // Buscar todas as conexões da conta
    const { data: conexoes, error: conexoesError } = await supabase
      .from('conexoes_whatsapp')
      .select('id, tipo_provedor, instance_name, status')
      .eq('conta_id', conta_id);

    if (conexoesError) {
      console.error('[desativar-conta] Erro ao buscar conexões:', conexoesError);
      throw conexoesError;
    }

    console.log(`[desativar-conta] Encontradas ${conexoes?.length || 0} conexões`);

    // Desconectar cada conexão
    for (const conexao of conexoes || []) {
      console.log(`[desativar-conta] Desconectando conexão ${conexao.id} (${conexao.tipo_provedor})`);

      // Para conexões Evolution, chamar API de logout
      if (conexao.tipo_provedor === 'evolution' && conexao.status === 'conectado') {
        try {
          const logoutResponse = await fetch(
            `${EVOLUTION_API_URL}/instance/logout/${conexao.instance_name}`,
            {
              method: 'DELETE',
              headers: {
                'apikey': evolutionApiKey,
                'Content-Type': 'application/json',
              },
            }
          );

          if (!logoutResponse.ok) {
            console.warn(`[desativar-conta] Aviso ao desconectar Evolution ${conexao.instance_name}:`, await logoutResponse.text());
          } else {
            console.log(`[desativar-conta] Evolution ${conexao.instance_name} desconectado com sucesso`);
          }
        } catch (evolError) {
          console.warn(`[desativar-conta] Erro ao desconectar Evolution ${conexao.instance_name}:`, evolError);
          // Continuar mesmo se falhar
        }
      }

      // Atualizar status no banco para todas as conexões
      const { error: updateError } = await supabase
        .from('conexoes_whatsapp')
        .update({ status: 'desconectado', qrcode: null })
        .eq('id', conexao.id);

      if (updateError) {
        console.warn(`[desativar-conta] Erro ao atualizar conexão ${conexao.id}:`, updateError);
      }
    }

    // Desativar a conta
    const { error: contaError } = await supabase
      .from('contas')
      .update({ ativo: false })
      .eq('id', conta_id);

    if (contaError) {
      console.error('[desativar-conta] Erro ao desativar conta:', contaError);
      throw contaError;
    }

    console.log(`[desativar-conta] Conta ${conta_id} desativada com sucesso`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Conta desativada e integrações desconectadas',
        conexoes_desconectadas: conexoes?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[desativar-conta] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
