import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVOLUTION_API_URL = 'https://evolution.cognityx.com.br';

// Gera uma instance_key única
function generateInstanceKey(contaId: string): string {
  const prefix = contaId.slice(0, 8);
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `inst_${prefix}_${timestamp}${random}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { nome, conta_id } = await req.json();
    
    if (!nome || !conta_id) {
      return new Response(JSON.stringify({ error: 'nome e conta_id são obrigatórios' }), {
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

    // Gerar instance_key única
    const instanceKey = generateInstanceKey(conta_id);
    
    console.log('Criando instância na Evolution API:', instanceKey, 'Nome:', nome);

    // Construir URL do webhook
    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;
    console.log('Webhook URL:', webhookUrl);

    // Criar instância na Evolution API COM webhook configurado na mesma chamada
    const createResponse = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        instanceName: instanceKey,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          url: webhookUrl,
          byEvents: false,
          base64: true,
          events: [
            'MESSAGES_UPSERT',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
          ],
        },
      }),
    });

    const createResult = await createResponse.json();
    console.log('Resposta da criação:', JSON.stringify(createResult));

    if (!createResponse.ok) {
      return new Response(JSON.stringify({ 
        error: createResult.message || 'Erro ao criar instância na Evolution API' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Webhook já configurado na criação da instância
    console.log('Webhook configurado na criação da instância');

    // Salvar conexão no banco de dados
    const { data: conexao, error: insertError } = await supabase
      .from('conexoes_whatsapp')
      .insert({
        conta_id,
        instance_name: instanceKey,
        token: evolutionApiKey,
        webhook_url: webhookUrl,
        status: 'desconectado',
        nome: nome,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Erro ao salvar conexão:', insertError);
      return new Response(JSON.stringify({ error: 'Erro ao salvar conexão no banco' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Conexão salva com sucesso:', conexao.id);

    return new Response(JSON.stringify({ 
      success: true, 
      conexao,
      evolution: createResult,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao criar instância:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
