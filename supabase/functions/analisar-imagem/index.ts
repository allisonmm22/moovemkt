import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imagem_base64, mime_type, openai_api_key } = await req.json();

    console.log('=== ANALISAR IMAGEM ===');
    console.log('MIME type:', mime_type);
    console.log('Base64 length:', imagem_base64?.length || 0);

    if (!imagem_base64 || !openai_api_key) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: 'Parâmetros obrigatórios faltando' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Garantir que temos o prefixo correto para data URL
    let imageDataUrl = imagem_base64;
    if (!imagem_base64.startsWith('data:')) {
      const mimeTypeNormalized = mime_type || 'image/jpeg';
      imageDataUrl = `data:${mimeTypeNormalized};base64,${imagem_base64}`;
    }

    console.log('Chamando OpenAI Vision API...');

    // Prompt otimizado para contexto de CRM/vendas
    const promptAnalise = `Você é um assistente de análise de imagens para um CRM de vendas via WhatsApp.
Analise esta imagem e forneça uma descrição objetiva e útil para atendimento comercial.

Identifique e descreva:
1. O tipo de imagem (foto, documento, comprovante, produto, screenshot, etc)
2. Se houver texto legível, transcreva as informações mais importantes
3. Se for um comprovante de pagamento: identifique valor, data, tipo de pagamento (PIX, TED, boleto, etc)
4. Se for um produto: identifique marca, modelo, cor, características visíveis
5. Se for um documento: identifique tipo e informações relevantes
6. Se for um screenshot: descreva o que está sendo mostrado

Seja objetivo e extraia as informações mais úteis para um atendimento comercial.
Responda em português brasileiro.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openai_api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Modelo econômico com suporte a visão
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: promptAnalise,
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl,
                  detail: 'auto', // Deixar o modelo decidir a resolução
                },
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro OpenAI Vision:', response.status, errorText);
      
      return new Response(
        JSON.stringify({ sucesso: false, erro: `Erro OpenAI: ${response.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const descricao = data.choices?.[0]?.message?.content || '';

    console.log('Descrição obtida:', descricao.substring(0, 200) + '...');

    return new Response(
      JSON.stringify({ 
        sucesso: true, 
        descricao,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao analisar imagem:', errorMessage);
    
    return new Response(
      JSON.stringify({ sucesso: false, erro: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
