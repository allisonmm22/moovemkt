import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVOLUTION_API_URL = 'https://evolution.cognityx.com.br';
const META_API_URL = 'https://graph.facebook.com/v18.0';
const INSTAGRAM_API_URL = 'https://graph.instagram.com/v18.0';

// Função para fazer upload de mídia para Meta
async function uploadMediaToMeta(
  mediaUrl: string,
  accessToken: string,
  phoneNumberId: string,
  tipo: string
): Promise<string | null> {
  try {
    console.log('Meta upload: baixando mídia', { mediaUrl, tipo });

    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      console.error('Meta upload: erro ao baixar mídia', mediaResponse.status);
      return null;
    }

    const mediaBlob = await mediaResponse.blob();
    console.log('Meta upload: mídia baixada', { size: mediaBlob.size, contentType: mediaBlob.type });

    let mimeType = mediaBlob.type;

    if (tipo === 'audio') {
      // Meta API aceita: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg
      if (mimeType === 'audio/webm' || mimeType === 'audio/webm;codecs=opus') {
        mimeType = 'audio/ogg';
      }
    } else if (tipo === 'imagem') {
      if (!['image/jpeg', 'image/png'].includes(mimeType)) {
        mimeType = 'image/jpeg';
      }
    }

    const ext = tipo === 'audio' ? 'ogg' : tipo === 'imagem' ? 'jpg' : 'bin';

    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('file', mediaBlob, `media.${ext}`);
    formData.append('type', mimeType);

    console.log('Meta upload: enviando para /media', { mimeType });

    const uploadResponse = await fetch(`${META_API_URL}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    const uploadResult = await uploadResponse.json();
    console.log('Meta upload: resposta', JSON.stringify(uploadResult, null, 2));

    if (!uploadResponse.ok) {
      console.error('Meta upload: falhou', uploadResult);
      return null;
    }

    return uploadResult?.id ?? null;
  } catch (e) {
    console.error('Meta upload: erro inesperado', e);
    return null;
  }
}

// Função para enviar via Meta API
async function enviarViaMeta(
  conexao: any,
  telefone: string,
  mensagem: string,
  tipo: string,
  mediaUrl: string | null,
  supabase: any
): Promise<Response> {
  console.log('=== ENVIANDO VIA META API ===');

  if (!conexao.meta_phone_number_id || !conexao.meta_access_token) {
    return new Response(JSON.stringify({ error: 'Credenciais Meta API não configuradas' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const formattedNumber = telefone.replace(/\D/g, '');

  // Validação: mídia precisa de URL
  if ((tipo === 'imagem' || tipo === 'audio' || tipo === 'documento') && !mediaUrl) {
    return new Response(
      JSON.stringify({
        error: 'Mídia não informada',
        details: 'Para enviar imagem/áudio/documento pela API oficial, é obrigatório informar a URL da mídia (media_url).',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  let body: Record<string, unknown>;

  // Para mídia, faça upload e envie por ID (mais confiável) 
  let mediaId: string | null = null;
  if (mediaUrl && (tipo === 'imagem' || tipo === 'audio' || tipo === 'documento')) {
    mediaId = await uploadMediaToMeta(
      mediaUrl,
      conexao.meta_access_token,
      conexao.meta_phone_number_id,
      tipo
    );

    if (!mediaId) {
      return new Response(
        JSON.stringify({
          error: 'Falha ao fazer upload da mídia para o WhatsApp',
          details:
            'A API oficial do WhatsApp pode rejeitar alguns formatos (ex.: áudio webm). Tente enviar em OGG/MP3/AAC ou envie apenas texto.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  switch (tipo) {
    case 'imagem':
      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedNumber,
        type: 'image',
        image: mediaId
          ? { id: mediaId, caption: mensagem || undefined }
          : { link: mediaUrl, caption: mensagem || undefined },
      };
      break;
    case 'audio':
      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedNumber,
        type: 'audio',
        audio: mediaId ? { id: mediaId } : { link: mediaUrl },
      };
      break;
    case 'documento':
      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedNumber,
        type: 'document',
        document: mediaId
          ? { id: mediaId, filename: mensagem || 'documento' }
          : { link: mediaUrl, filename: mensagem || 'documento' },
      };
      break;
    default:
      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedNumber,
        type: 'text',
        text: { preview_url: false, body: mensagem },
      };
  }

  console.log('Enviando para Meta API:', JSON.stringify(body, null, 2));

  const response = await fetch(`${META_API_URL}/${conexao.meta_phone_number_id}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${conexao.meta_access_token}`,
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  console.log('Resposta Meta API:', JSON.stringify(result, null, 2));

  if (!response.ok) {
    await supabase.from('logs_atividade').insert({
      conta_id: conexao.conta_id,
      tipo: 'erro_whatsapp',
      descricao: `Erro ao enviar mensagem via Meta API para ${telefone}`,
      metadata: { erro: result, status_code: response.status, tipo_mensagem: tipo },
    });

    return new Response(JSON.stringify({ error: 'Erro ao enviar mensagem', details: result }), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const metaMsgId = result?.messages?.[0]?.id;
  return new Response(JSON.stringify({ success: true, result, meta_msg_id: metaMsgId }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Função para enviar via Instagram API
async function enviarViaInstagram(
  conexao: any,
  recipientId: string, // Instagram Scoped User ID (IGSID)
  mensagem: string,
  tipo: string,
  mediaUrl: string | null,
  supabase: any
): Promise<Response> {
  console.log('=== ENVIANDO VIA INSTAGRAM API ===');

  // Instagram usa os mesmos campos: meta_phone_number_id (Page ID) e meta_access_token
  if (!conexao.meta_phone_number_id || !conexao.meta_access_token) {
    return new Response(JSON.stringify({ error: 'Credenciais Instagram não configuradas' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const pageId = conexao.meta_phone_number_id;
  const accessToken = conexao.meta_access_token;

  let body: Record<string, unknown>;

  switch (tipo) {
    case 'imagem':
      if (!mediaUrl) {
        return new Response(JSON.stringify({ error: 'URL da imagem é obrigatória' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      body = {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'image',
            payload: { url: mediaUrl, is_reusable: true }
          }
        }
      };
      break;
    case 'audio':
      if (!mediaUrl) {
        return new Response(JSON.stringify({ error: 'URL do áudio é obrigatória' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      body = {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'audio',
            payload: { url: mediaUrl, is_reusable: true }
          }
        }
      };
      break;
    case 'documento':
      if (!mediaUrl) {
        return new Response(JSON.stringify({ error: 'URL do documento é obrigatória' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      body = {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'file',
            payload: { url: mediaUrl, is_reusable: true }
          }
        }
      };
      break;
    default:
      body = {
        recipient: { id: recipientId },
        message: { text: mensagem }
      };
  }

  console.log('Enviando para Instagram API:', JSON.stringify(body, null, 2));

  const response = await fetch(`${INSTAGRAM_API_URL}/${pageId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  console.log('Resposta Instagram API:', JSON.stringify(result, null, 2));

  if (!response.ok) {
    await supabase.from('logs_atividade').insert({
      conta_id: conexao.conta_id,
      tipo: 'erro_whatsapp',
      descricao: `Erro ao enviar mensagem via Instagram para ${recipientId}`,
      metadata: { erro: result, status_code: response.status, tipo_mensagem: tipo },
    });

    return new Response(JSON.stringify({ error: 'Erro ao enviar mensagem', details: result }), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const instaMsgId = result?.message_id;
  return new Response(JSON.stringify({ success: true, result, instagram_msg_id: instaMsgId }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conexao_id, telefone, mensagem, tipo = 'texto', media_url, media_base64, grupo_jid, mensagem_id } = await req.json();

    console.log('Enviando mensagem:', { conexao_id, telefone, tipo, hasBase64: !!media_base64, grupo_jid, mensagem_id });

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

    // ===== ROTEADOR: META API vs INSTAGRAM vs EVOLUTION API =====
    if (conexao.tipo_provedor === 'meta') {
      return await enviarViaMeta(conexao, telefone, mensagem, tipo, media_url, supabase);
    }

    // Instagram via Meta API direta (somente se tiver credenciais Meta configuradas)
    if (conexao.tipo_provedor === 'instagram' && conexao.meta_phone_number_id && conexao.meta_access_token) {
      // Para Instagram via Meta API, o "telefone" é o Instagram Scoped User ID (IGSID)
      return await enviarViaInstagram(conexao, telefone, mensagem, tipo, media_url, supabase);
    }
    
    // Instagram via Evolution API (quando não tem credenciais Meta, usa Evolution como provedor)
    // Continua para o código Evolution abaixo...

    // ===== CÓDIGO EVOLUTION (100% ORIGINAL ABAIXO) =====
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!evolutionApiKey) {
      console.error('EVOLUTION_API_KEY não configurada');
      return new Response(JSON.stringify({ error: 'API Key não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Formatar número (remover caracteres especiais) ou usar grupo_jid diretamente
    // Para Instagram via Evolution, usar IGSID (remover prefixo ig_ se existir para compatibilidade)
    let formattedNumber: string;
    if (grupo_jid) {
      formattedNumber = grupo_jid;
    } else if (conexao.tipo_provedor === 'instagram') {
      // Para Instagram, usar o IGSID diretamente (remover ig_ se existir)
      formattedNumber = telefone.startsWith('ig_') ? telefone.slice(3) : telefone;
    } else {
      // Para WhatsApp, limpar caracteres não numéricos
      formattedNumber = telefone.replace(/\D/g, '');
    }

    let evolutionUrl: string;
    let body: Record<string, unknown>;

    // Se tem base64, fazer upload para o storage EXTERNO primeiro
    let finalMediaUrl = media_url;
    
    if (media_base64) {
      // Cliente para Storage EXTERNO
      const externalSupabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
      const externalSupabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
      const externalSupabase = createClient(externalSupabaseUrl, externalSupabaseKey);
      
      // Determinar extensão e mimetype baseado no tipo
      let extension = 'bin';
      let mimeType = 'application/octet-stream';
      
      if (tipo === 'imagem') {
        extension = 'jpg';
        mimeType = 'image/jpeg';
      } else if (tipo === 'audio') {
        extension = 'mp3';
        mimeType = 'audio/mpeg';
      } else if (tipo === 'documento') {
        extension = 'pdf';
        mimeType = 'application/pdf';
      }
      
      const fileName = `${Date.now()}-upload.${extension}`;
      
      // Converter base64 para Uint8Array
      const binaryString = atob(media_base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const { error: uploadError } = await externalSupabase.storage
        .from('whatsapp-media')
        .upload(fileName, bytes, { contentType: mimeType });
      
      if (uploadError) {
        console.error('Erro ao fazer upload no Storage Externo:', uploadError);
        return new Response(JSON.stringify({ error: 'Erro ao fazer upload', details: uploadError }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const { data: urlData } = externalSupabase.storage
        .from('whatsapp-media')
        .getPublicUrl(fileName);
      finalMediaUrl = urlData.publicUrl;
      console.log('Upload realizado no Storage Externo:', finalMediaUrl);
    }

    // Determinar endpoint e body baseado no tipo
    switch (tipo) {
      case 'imagem':
        evolutionUrl = `${EVOLUTION_API_URL}/message/sendMedia/${conexao.instance_name}`;
        body = {
          number: formattedNumber,
          mediatype: 'image',
          media: finalMediaUrl,
        };
        // Só adiciona caption se tiver mensagem
        if (mensagem && mensagem.trim()) {
          body.caption = mensagem;
        }
        break;
      case 'audio':
        evolutionUrl = `${EVOLUTION_API_URL}/message/sendWhatsAppAudio/${conexao.instance_name}`;
        body = {
          number: formattedNumber,
          audio: finalMediaUrl,
        };
        break;
      case 'documento':
        evolutionUrl = `${EVOLUTION_API_URL}/message/sendMedia/${conexao.instance_name}`;
        body = {
          number: formattedNumber,
          mediatype: 'document',
          media: finalMediaUrl,
          fileName: mensagem || 'documento',
        };
        break;
      default:
        evolutionUrl = `${EVOLUTION_API_URL}/message/sendText/${conexao.instance_name}`;
        body = {
          number: formattedNumber,
          text: mensagem,
        };
    }

    console.log('Chamando Evolution API:', { evolutionUrl, body });
    
    const response = await fetch(evolutionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify(body),
    });

    // Ler resposta como texto primeiro para evitar erro de parse JSON
    const responseText = await response.text();
    let result: Record<string, unknown>;
    
    try {
      result = JSON.parse(responseText);
    } catch {
      // Resposta não é JSON válido (ex: "Bad Gateway")
      console.error('Resposta inválida da Evolution API:', responseText);
      
      await supabase.from('logs_atividade').insert({
        conta_id: conexao.conta_id,
        tipo: 'erro_whatsapp',
        descricao: `Erro ao enviar mensagem para ${telefone}`,
        metadata: { 
          erro: responseText,
          status_code: response.status,
          instance_name: conexao.instance_name,
          tipo_mensagem: tipo,
        },
      });
      
      return new Response(JSON.stringify({ 
        error: 'Erro na Evolution API', 
        details: responseText,
        status_code: response.status 
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('Resposta Evolution:', result);

    if (!response.ok) {
      console.error('Erro na Evolution API:', result);
      
      // Logar erro no sistema
      await supabase.from('logs_atividade').insert({
        conta_id: conexao.conta_id,
        tipo: 'erro_whatsapp',
        descricao: `Erro ao enviar mensagem para ${telefone}`,
        metadata: { 
          erro: result,
          status_code: response.status,
          instance_name: conexao.instance_name,
          tipo_mensagem: tipo,
        },
      });
      
      return new Response(JSON.stringify({ error: 'Erro ao enviar mensagem', details: result }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Salvar evolution_msg_id no metadata da mensagem para permitir deletar do WhatsApp
    const evolutionMsgId = (result as { key?: { id?: string } })?.key?.id;
    if (mensagem_id && evolutionMsgId) {
      console.log('Salvando evolution_msg_id:', evolutionMsgId, 'para mensagem_id:', mensagem_id);
      const { error: updateError } = await supabase
        .from('mensagens')
        .update({ 
          metadata: { evolution_msg_id: evolutionMsgId }
        })
        .eq('id', mensagem_id);
      
      if (updateError) {
        console.error('Erro ao salvar evolution_msg_id:', updateError);
      }
    }

    return new Response(JSON.stringify({ success: true, result, evolution_msg_id: evolutionMsgId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao enviar mensagem:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
