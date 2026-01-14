import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Processa base64 em chunks para evitar problemas de memória
function processBase64Chunks(base64String: string, chunkSize = 32768): Uint8Array {
  const chunks: Uint8Array[] = [];
  let position = 0;
  
  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);
    
    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }
    
    chunks.push(bytes);
    position += chunkSize;
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audio_base64, mime_type, openai_api_key } = await req.json();

    console.log('=== TRANSCREVER AUDIO ===');
    console.log('Mime type:', mime_type);
    console.log('Base64 length:', audio_base64?.length || 0);

    if (!audio_base64) {
      return new Response(
        JSON.stringify({ sucesso: false, error: 'Áudio não fornecido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!openai_api_key) {
      console.log('Chave OpenAI não configurada, pulando transcrição');
      return new Response(
        JSON.stringify({ sucesso: false, error: 'Chave OpenAI não configurada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Converter base64 para bytes
    const audioBytes = processBase64Chunks(audio_base64);
    console.log('Áudio convertido:', audioBytes.length, 'bytes');

    // Determinar extensão do arquivo baseado no mime type
    let extension = 'ogg';
    if (mime_type?.includes('mpeg') || mime_type?.includes('mp3')) {
      extension = 'mp3';
    } else if (mime_type?.includes('mp4') || mime_type?.includes('m4a')) {
      extension = 'm4a';
    } else if (mime_type?.includes('wav')) {
      extension = 'wav';
    } else if (mime_type?.includes('webm')) {
      extension = 'webm';
    }

    // Preparar FormData para enviar ao Whisper
    const formData = new FormData();
    // Criar ArrayBuffer novo para garantir tipagem correta
    const buffer = new ArrayBuffer(audioBytes.length);
    const view = new Uint8Array(buffer);
    view.set(audioBytes);
    const blob = new Blob([buffer], { type: mime_type || 'audio/ogg' });
    formData.append('file', blob, `audio.${extension}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    console.log('Enviando para OpenAI Whisper...');

    // Chamar API do Whisper
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openai_api_key}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro Whisper:', response.status, errorText);
      return new Response(
        JSON.stringify({ sucesso: false, error: `Whisper error: ${response.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const transcricao = result.text || '';

    console.log('Transcrição concluída:', transcricao.substring(0, 100), '...');

    return new Response(
      JSON.stringify({ sucesso: true, transcricao }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro na transcrição:', errorMessage);
    return new Response(
      JSON.stringify({ sucesso: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
