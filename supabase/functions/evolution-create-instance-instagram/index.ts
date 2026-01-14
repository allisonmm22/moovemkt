import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gera uma instance_key única para Instagram
function generateInstanceKey(contaId: string): string {
  const prefix = contaId.slice(0, 8);
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `ig_${prefix}_${timestamp}${random}`;
}

// Gera token de verificação único
function generateVerifyToken(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `verify_${timestamp}_${random}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { nome, conta_id, instagram_page_id, instagram_access_token, instagram_username } = await req.json();
    
    if (!nome || !conta_id) {
      return new Response(JSON.stringify({ error: 'nome e conta_id são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Gerar instance_key única para Instagram
    const instanceKey = generateInstanceKey(conta_id);
    const verifyToken = generateVerifyToken();
    
    console.log('Criando conexão Instagram:', instanceKey, 'Nome:', nome);

    // Instagram usa Meta Graph API, não Evolution API
    // Salvamos a conexão como tipo 'instagram' e depois o usuário configura via Meta
    const { data: conexao, error: insertError } = await supabase
      .from('conexoes_whatsapp')
      .insert({
        conta_id,
        instance_name: instanceKey,
        token: 'meta-api', // Placeholder - será substituído pelo access_token real
        status: 'desconectado',
        nome: nome,
        tipo_provedor: 'instagram',
        tipo_canal: 'instagram',
        meta_webhook_verify_token: verifyToken,
        // Se já temos as credenciais, preenchemos
        meta_access_token: instagram_access_token || null,
        meta_phone_number_id: instagram_page_id || null, // Reutilizando campo para page_id
      })
      .select()
      .single();

    if (insertError) {
      console.error('Erro ao salvar conexão Instagram:', insertError);
      return new Response(JSON.stringify({ error: 'Erro ao salvar conexão no banco' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Conexão Instagram salva com sucesso:', conexao.id);

    return new Response(JSON.stringify({ 
      success: true, 
      conexao,
      message: 'Conexão Instagram criada. Configure as credenciais da Meta API para conectar.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao criar conexão Instagram:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
