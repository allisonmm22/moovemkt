import type { Context } from 'hono';
import type { Env } from '../types';
import { createSupabaseClient } from '../lib/supabase';
import { jsonResponse, errorResponse } from '../lib/cors';
import { EVOLUTION_API_URL, META_API_URL, INSTAGRAM_API_URL, fetchWithRetry } from '../lib/utils';

// Upload mídia para Meta
async function uploadMediaToMeta(
  mediaUrl: string,
  accessToken: string,
  phoneNumberId: string,
  tipo: string
): Promise<string | null> {
  try {
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) return null;

    const mediaBlob = await mediaResponse.blob();
    let mimeType = mediaBlob.type;

    if (tipo === 'audio') {
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

    const uploadResponse = await fetch(`${META_API_URL}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    const uploadResult = await uploadResponse.json();
    return uploadResult?.id ?? null;
  } catch {
    return null;
  }
}

// Enviar via Meta API
async function enviarViaMeta(
  conexao: any,
  telefone: string,
  mensagem: string,
  tipo: string,
  mediaUrl: string | null,
  supabase: any
): Promise<Response> {
  if (!conexao.meta_phone_number_id || !conexao.meta_access_token) {
    return errorResponse('Credenciais Meta API não configuradas', 400);
  }

  const formattedNumber = telefone.replace(/\D/g, '');

  if ((tipo === 'imagem' || tipo === 'audio' || tipo === 'documento') && !mediaUrl) {
    return errorResponse('Mídia não informada para envio de mídia', 400);
  }

  let body: Record<string, unknown>;
  let mediaId: string | null = null;

  if (mediaUrl && (tipo === 'imagem' || tipo === 'audio' || tipo === 'documento')) {
    mediaId = await uploadMediaToMeta(mediaUrl, conexao.meta_access_token, conexao.meta_phone_number_id, tipo);
    if (!mediaId) {
      return errorResponse('Falha ao fazer upload da mídia', 400);
    }
  }

  switch (tipo) {
    case 'imagem':
      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedNumber,
        type: 'image',
        image: mediaId ? { id: mediaId, caption: mensagem || undefined } : { link: mediaUrl, caption: mensagem || undefined },
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
        document: mediaId ? { id: mediaId, filename: mensagem || 'documento' } : { link: mediaUrl, filename: mensagem || 'documento' },
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

  const response = await fetch(`${META_API_URL}/${conexao.meta_phone_number_id}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${conexao.meta_access_token}`,
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (!response.ok) {
    await supabase.from('logs_atividade').insert({
      conta_id: conexao.conta_id,
      tipo: 'erro_whatsapp',
      descricao: `Erro ao enviar mensagem via Meta API para ${telefone}`,
      metadata: { erro: result, status_code: response.status },
    });

    return errorResponse('Erro ao enviar mensagem', response.status, result);
  }

  return jsonResponse({ success: true, result, meta_msg_id: result?.messages?.[0]?.id });
}

// Enviar via Instagram
async function enviarViaInstagram(
  conexao: any,
  recipientId: string,
  mensagem: string,
  tipo: string,
  mediaUrl: string | null,
  supabase: any
): Promise<Response> {
  if (!conexao.meta_phone_number_id || !conexao.meta_access_token) {
    return errorResponse('Credenciais Instagram não configuradas', 400);
  }

  const pageId = conexao.meta_phone_number_id;
  const accessToken = conexao.meta_access_token;

  let body: Record<string, unknown>;

  switch (tipo) {
    case 'imagem':
      if (!mediaUrl) return errorResponse('URL da imagem é obrigatória', 400);
      body = {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'image',
            payload: { url: mediaUrl, is_reusable: true },
          },
        },
      };
      break;
    case 'audio':
      if (!mediaUrl) return errorResponse('URL do áudio é obrigatória', 400);
      body = {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'audio',
            payload: { url: mediaUrl, is_reusable: true },
          },
        },
      };
      break;
    default:
      body = {
        recipient: { id: recipientId },
        message: { text: mensagem },
      };
  }

  const response = await fetch(`${INSTAGRAM_API_URL}/${pageId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (!response.ok) {
    await supabase.from('logs_atividade').insert({
      conta_id: conexao.conta_id,
      tipo: 'erro_whatsapp',
      descricao: `Erro ao enviar mensagem via Instagram para ${recipientId}`,
      metadata: { erro: result, status_code: response.status },
    });

    return errorResponse('Erro ao enviar mensagem', response.status, result);
  }

  return jsonResponse({ success: true, result, instagram_msg_id: result?.message_id });
}

export async function handleEnviarMensagem(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env;
  const supabase = createSupabaseClient(env);

  try {
    const { conexao_id, telefone, mensagem, tipo = 'texto', media_url, media_base64, grupo_jid } = await c.req.json();

    console.log('Enviando mensagem:', { conexao_id, telefone, tipo });

    // Buscar conexão
    const { data: conexao, error } = await supabase
      .from('conexoes_whatsapp')
      .select('*')
      .eq('id', conexao_id)
      .single();

    if (error || !conexao) {
      return errorResponse('Conexão não encontrada', 404);
    }

    // Roteador: Meta API vs Instagram vs Evolution API
    if (conexao.tipo_provedor === 'meta') {
      return await enviarViaMeta(conexao, telefone, mensagem, tipo, media_url, supabase);
    }

    if (conexao.tipo_provedor === 'instagram' && conexao.meta_phone_number_id && conexao.meta_access_token) {
      return await enviarViaInstagram(conexao, telefone, mensagem, tipo, media_url, supabase);
    }

    // Evolution API
    if (!env.EVOLUTION_API_KEY) {
      return errorResponse('EVOLUTION_API_KEY não configurada', 500);
    }

    let formattedNumber: string;
    if (grupo_jid) {
      formattedNumber = grupo_jid;
    } else if (conexao.tipo_provedor === 'instagram') {
      formattedNumber = telefone.startsWith('ig_') ? telefone.slice(3) : telefone;
    } else {
      formattedNumber = telefone.replace(/\D/g, '');
    }

    let evolutionUrl: string;
    let body: Record<string, unknown>;
    let finalMediaUrl = media_url;

    // Upload base64 se necessário (usando Storage externo)
    if (media_base64) {
      // Para produção, configurar R2 ou outro storage
      console.log('Base64 upload não implementado para Workers ainda');
    }

    switch (tipo) {
      case 'imagem':
        evolutionUrl = `${EVOLUTION_API_URL}/message/sendMedia/${conexao.instance_name}`;
        body = {
          number: formattedNumber,
          mediatype: 'image',
          media: finalMediaUrl,
        };
        if (mensagem) body.caption = mensagem;
        break;

      case 'audio':
        evolutionUrl = `${EVOLUTION_API_URL}/message/sendMedia/${conexao.instance_name}`;
        body = {
          number: formattedNumber,
          mediatype: 'audio',
          media: finalMediaUrl,
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

    console.log('Enviando via Evolution:', evolutionUrl);

    const response = await fetchWithRetry(evolutionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.EVOLUTION_API_KEY,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!response.ok) {
      await supabase.from('logs_atividade').insert({
        conta_id: conexao.conta_id,
        tipo: 'erro_whatsapp',
        descricao: `Erro ao enviar mensagem via Evolution para ${telefone}`,
        metadata: { erro: result, status_code: response.status },
      });

      return errorResponse('Erro ao enviar mensagem', response.status, result);
    }

    console.log('Mensagem enviada com sucesso');

    return jsonResponse({
      success: true,
      result,
      evolution_msg_id: result?.key?.id,
    });
  } catch (error) {
    console.error('Erro enviar-mensagem:', error);
    return errorResponse('Erro interno', 500, error);
  }
}
