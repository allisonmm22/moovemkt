// Cliente API centralizado para Cloudflare Workers
// Use este arquivo para chamar os Workers ao invés de supabase.functions.invoke

// URL base da API - configurar após deploy dos Workers
// Em desenvolvimento, usar localhost; em produção, usar domínio customizado
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://crm-workers.YOUR_ACCOUNT.workers.dev';

export interface WorkerResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

/**
 * Chamada genérica para Cloudflare Workers
 * 
 * @example
 * // Enviar mensagem
 * const response = await callWorker('enviar-mensagem', {
 *   method: 'POST',
 *   body: JSON.stringify({ conexao_id, telefone, mensagem })
 * });
 * const data = await response.json();
 * 
 * @example
 * // Com autenticação
 * const response = await callWorker('ai-responder', {
 *   method: 'POST',
 *   body: JSON.stringify({ conversa_id, mensagem }),
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 */
export async function callWorker(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE_URL}/${endpoint}`;

  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * Chamada tipada com parsing automático do JSON
 * 
 * @example
 * const { data, error } = await invokeWorker<{ success: boolean }>('enviar-mensagem', {
 *   conexao_id: '123',
 *   telefone: '5511999999999',
 *   mensagem: 'Olá!'
 * });
 */
export async function invokeWorker<T = unknown>(
  endpoint: string,
  body?: Record<string, unknown>,
  options: RequestInit = {}
): Promise<WorkerResponse<T>> {
  try {
    const response = await callWorker(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Erro desconhecido',
        details: data.details,
      };
    }

    return {
      success: true,
      data: data as T,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro de conexão',
    };
  }
}

// ===== HELPERS ESPECÍFICOS =====

/**
 * Enviar mensagem via WhatsApp/Instagram
 */
export async function enviarMensagem(params: {
  conexao_id: string;
  telefone: string;
  mensagem: string;
  tipo?: 'texto' | 'imagem' | 'audio' | 'documento';
  media_url?: string;
}) {
  return invokeWorker<{ success: boolean; result?: unknown }>('enviar-mensagem', params);
}

/**
 * Chamar AI para gerar resposta
 */
export async function gerarRespostaIA(params: {
  conversa_id: string;
  mensagem: string;
  conta_id: string;
  transcricao?: string;
  descricao_imagem?: string;
}) {
  return invokeWorker<{
    should_respond: boolean;
    resposta?: string;
    provider?: string;
  }>('ai-responder', params);
}

/**
 * Processar resposta pendente imediatamente
 */
export async function processarRespostaAgora(conversa_id: string) {
  return invokeWorker<{ success: boolean }>('processar-resposta-agora', { conversa_id });
}

// ===== VERIFICAÇÃO DE DISPONIBILIDADE =====

/**
 * Verificar se o Worker está disponível
 */
export async function checkWorkerHealth(): Promise<boolean> {
  try {
    const response = await callWorker('health', { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Obter URL da API configurada
 */
export function getApiUrl(): string {
  return API_BASE_URL;
}

/**
 * Verificar se está usando Workers (vs Supabase Edge Functions)
 */
export function isUsingWorkers(): boolean {
  return !API_BASE_URL.includes('supabase.co');
}
