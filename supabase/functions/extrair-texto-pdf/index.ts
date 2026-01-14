import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TEXT_LENGTH = 4000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdf_base64, mime_type, conta_id } = await req.json();

    console.log('=== EXTRAIR TEXTO PDF ===');
    console.log('MIME type:', mime_type);
    console.log('Conta ID:', conta_id);

    if (!pdf_base64) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: 'pdf_base64 obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar API key da OpenAI da conta
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let openaiApiKey: string | null = null;

    if (conta_id) {
      const { data: conta } = await supabase
        .from('contas')
        .select('openai_api_key')
        .eq('id', conta_id)
        .single();

      openaiApiKey = conta?.openai_api_key || null;
    }

    if (!openaiApiKey) {
      console.log('Sem API key OpenAI configurada, não é possível extrair texto do PDF');
      return new Response(
        JSON.stringify({ 
          sucesso: false, 
          erro: 'API key OpenAI não configurada para esta conta' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Remover prefixo data:application/pdf;base64, se existir
    let base64Data = pdf_base64;
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }

    console.log('PDF base64 length:', base64Data.length);

    // Usar GPT-4o para analisar o PDF como documento
    // A API OpenAI suporta PDFs diretamente no formato base64
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Você é um extrator de texto de documentos PDF. Sua tarefa é:
1. Extrair TODO o texto visível do documento
2. Manter a estrutura e formatação básica (parágrafos, listas)
3. Identificar informações importantes como: valores, datas, nomes, termos contratuais
4. Se for um documento técnico, resumir os pontos principais
5. Retornar o texto em português de forma organizada

IMPORTANTE: Retorne APENAS o texto extraído, sem comentários adicionais.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'file',
                file: {
                  filename: 'document.pdf',
                  file_data: `data:application/pdf;base64,${base64Data}`
                }
              },
              {
                type: 'text',
                text: 'Extraia todo o texto deste documento PDF de forma organizada.'
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Erro OpenAI:', errorData);
      
      // Tentar com Lovable AI como fallback
      console.log('Tentando fallback com Lovable AI...');
      
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableApiKey) {
        return new Response(
          JSON.stringify({ 
            sucesso: false, 
            erro: 'Não foi possível processar o PDF: ' + (errorData.error?.message || 'Erro desconhecido')
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Lovable AI não suporta PDF diretamente, retornar erro
      return new Response(
        JSON.stringify({ 
          sucesso: false, 
          erro: 'Não foi possível processar o PDF com a API configurada'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    let texto = data.choices?.[0]?.message?.content || '';

    console.log('Texto extraído:', texto.length, 'caracteres');

    // Limpar texto
    texto = texto.trim();

    // Limitar o tamanho do texto
    if (texto.length > MAX_TEXT_LENGTH) {
      texto = texto.substring(0, MAX_TEXT_LENGTH) + '... [texto truncado]';
      console.log('Texto truncado para', MAX_TEXT_LENGTH, 'caracteres');
    }

    if (!texto || texto.length < 10) {
      return new Response(
        JSON.stringify({ 
          sucesso: false, 
          erro: 'Não foi possível extrair texto do PDF (pode ser um PDF de imagem/escaneado ou protegido)' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extração concluída com sucesso');
    console.log('Preview:', texto.substring(0, 200) + '...');

    return new Response(
      JSON.stringify({ 
        sucesso: true, 
        texto,
        caracteres: texto.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Erro ao extrair texto do PDF:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ sucesso: false, erro: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
