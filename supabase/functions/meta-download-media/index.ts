import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { media_id, access_token, media_type, conta_id } = await req.json();

    if (!media_id || !access_token) {
      return new Response(
        JSON.stringify({ error: 'media_id e access_token são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('=== META DOWNLOAD MEDIA ===');
    console.log('Media ID:', media_id);
    console.log('Media Type:', media_type);

    // Passo 1: Obter URL temporária do arquivo via Graph API
    const mediaInfoResponse = await fetch(
      `https://graph.facebook.com/v22.0/${media_id}`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      }
    );

    if (!mediaInfoResponse.ok) {
      const errorData = await mediaInfoResponse.json();
      console.error('Erro ao obter info da mídia:', errorData);
      return new Response(
        JSON.stringify({ error: 'Erro ao obter informações da mídia', details: errorData }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mediaInfo = await mediaInfoResponse.json();
    console.log('Media Info:', mediaInfo);

    const mediaUrl = mediaInfo.url;
    const mimeType = mediaInfo.mime_type || 'application/octet-stream';

    if (!mediaUrl) {
      return new Response(
        JSON.stringify({ error: 'URL da mídia não encontrada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Passo 2: Baixar o arquivo binário
    const fileResponse = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });

    if (!fileResponse.ok) {
      console.error('Erro ao baixar arquivo:', fileResponse.status);
      return new Response(
        JSON.stringify({ error: 'Erro ao baixar arquivo da Meta' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fileBuffer = await fileResponse.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);
    console.log('Arquivo baixado, tamanho:', fileBytes.length);

    // Converter para base64
    const base64Data = btoa(String.fromCharCode(...fileBytes));

    // Determinar extensão do arquivo
    let extension = 'bin';
    if (mimeType.includes('audio')) {
      if (mimeType.includes('ogg')) extension = 'ogg';
      else if (mimeType.includes('mp4') || mimeType.includes('m4a')) extension = 'm4a';
      else if (mimeType.includes('mpeg')) extension = 'mp3';
      else extension = 'ogg';
    } else if (mimeType.includes('image')) {
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) extension = 'jpg';
      else if (mimeType.includes('png')) extension = 'png';
      else if (mimeType.includes('webp')) extension = 'webp';
      else extension = 'jpg';
    } else if (mimeType.includes('video')) {
      extension = 'mp4';
    } else if (mimeType.includes('pdf')) {
      extension = 'pdf';
    } else if (mimeType.includes('document') || mimeType.includes('msword')) {
      extension = 'doc';
    }

    // Passo 3: Upload para Storage EXTERNO
    const externalSupabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const externalSupabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const externalSupabase = createClient(externalSupabaseUrl, externalSupabaseKey);

    const fileName = `meta_${media_id}_${Date.now()}.${extension}`;
    const filePath = `${conta_id || 'unknown'}/${fileName}`;

    const { data: uploadData, error: uploadError } = await externalSupabase.storage
      .from('whatsapp-media')
      .upload(filePath, fileBytes, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error('Erro ao fazer upload para Storage Externo:', uploadError);
      // Retornar base64 mesmo se upload falhar
      return new Response(
        JSON.stringify({
          success: true,
          base64: base64Data,
          mime_type: mimeType,
          url: null,
          error_upload: uploadError.message,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Obter URL pública do Storage Externo
    const { data: publicUrlData } = externalSupabase.storage
      .from('whatsapp-media')
      .getPublicUrl(filePath);

    console.log('Upload concluído:', publicUrlData.publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrlData.publicUrl,
        base64: base64Data,
        mime_type: mimeType,
        file_path: filePath,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro no download de mídia Meta:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
