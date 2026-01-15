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
    const { instance_name, message_id, message_type } = await req.json();

    console.log('=== DOWNLOAD MEDIA ===');
    console.log('Instance:', instance_name);
    console.log('Message ID:', message_id);
    console.log('Type:', message_type);

    // Cliente para banco de dados (Lovable Cloud)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Cliente para Storage EXTERNO
    const externalSupabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const externalSupabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const externalSupabase = createClient(externalSupabaseUrl, externalSupabaseKey);
    
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;

    // Buscar mídia em base64 da Evolution API
    const mediaResponse = await fetch(
      `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instance_name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify({
          message: {
            key: {
              id: message_id,
            },
          },
          convertToMp4: false,
        }),
      }
    );

    if (!mediaResponse.ok) {
      const errorText = await mediaResponse.text();
      console.error('Erro ao buscar mídia da Evolution:', errorText);
      return new Response(JSON.stringify({ error: 'Erro ao buscar mídia', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mediaData = await mediaResponse.json();
    console.log('Mídia recebida da Evolution');

    const base64Data = mediaData.base64;
    const mimeType = mediaData.mimetype || getMimeType(message_type);
    
    if (!base64Data) {
      console.error('Base64 não encontrado na resposta');
      return new Response(JSON.stringify({ error: 'Base64 não encontrado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Converter base64 para Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Gerar nome do arquivo
    const extension = getExtension(mimeType, message_type);
    const fileName = `${Date.now()}-${message_id}.${extension}`;

    // Upload para o Storage EXTERNO
    const { data: uploadData, error: uploadError } = await externalSupabase.storage
      .from('whatsapp-media')
      .upload(fileName, bytes, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Erro ao fazer upload:', uploadError);
      return new Response(JSON.stringify({ error: 'Erro ao fazer upload', details: uploadError }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Upload realizado no Storage Externo:', uploadData.path);

    // Obter URL pública do Storage Externo
    const { data: urlData } = externalSupabase.storage
      .from('whatsapp-media')
      .getPublicUrl(fileName);

    console.log('URL pública:', urlData.publicUrl);

    return new Response(JSON.stringify({ 
      success: true, 
      url: urlData.publicUrl,
      fileName,
      base64: base64Data,
      mimeType: mimeType,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro no download-media:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getMimeType(type: string): string {
  switch (type) {
    case 'imagem':
    case 'image':
      return 'image/jpeg';
    case 'audio':
      return 'audio/ogg';
    case 'video':
      return 'video/mp4';
    case 'documento':
    case 'document':
      return 'application/octet-stream';
    default:
      return 'application/octet-stream';
  }
}

function getExtension(mimeType: string, type: string): string {
  // Extrair extensão do mimetype
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('pdf')) return 'pdf';
  
  // Fallback baseado no tipo
  switch (type) {
    case 'imagem':
    case 'image':
      return 'jpg';
    case 'audio':
      return 'ogg';
    case 'video':
      return 'mp4';
    default:
      return 'bin';
  }
}
