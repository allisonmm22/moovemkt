import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Esta função retorna as instruções de configuração do webhook Meta
// A configuração real é feita no Facebook Developer Dashboard
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conexao_id } = await req.json();

    console.log('=== META API: CONFIGURAR WEBHOOK ===');
    console.log('Conexão:', conexao_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar conexão
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

    // Gerar token de verificação se não existir
    let verifyToken = conexao.meta_webhook_verify_token;
    if (!verifyToken) {
      verifyToken = `verify_${conexao.id.replace(/-/g, '').slice(0, 16)}_${Date.now().toString(36)}`;
      
      // Salvar token gerado
      await supabase
        .from('conexoes_whatsapp')
        .update({ meta_webhook_verify_token: verifyToken })
        .eq('id', conexao_id);
    }

    // URL do webhook para configurar no Facebook Developer
    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;

    const instructions = {
      webhook_url: webhookUrl,
      verify_token: verifyToken,
      steps: [
        '1. Acesse o Facebook Developer (developers.facebook.com)',
        '2. Vá para seu App > WhatsApp > Configuração',
        '3. Na seção "Webhook", clique em "Editar"',
        '4. Cole a URL do Webhook abaixo',
        '5. Cole o Token de Verificação abaixo',
        '6. Selecione os campos: messages, message_deliveries, message_reads',
        '7. Clique em "Verificar e Salvar"',
      ],
      fields_to_subscribe: [
        'messages',
        'message_deliveries',
        'message_reads',
        'messaging_postbacks',
      ],
    };

    return new Response(JSON.stringify({ success: true, ...instructions }), {
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
