// Headers CORS padrão para todas as respostas
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Response helper com CORS
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

// Response de erro com CORS
export function errorResponse(message: string, status = 500, details?: unknown): Response {
  return new Response(JSON.stringify({ error: message, details }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

// Resposta OPTIONS para preflight
export function optionsResponse(): Response {
  return new Response(null, { headers: corsHeaders });
}
