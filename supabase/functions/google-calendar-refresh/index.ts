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
    const { calendario_id } = await req.json();

    if (!calendario_id) {
      return new Response(
        JSON.stringify({ error: 'calendario_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[google-calendar-refresh] Renovando token para calendario:', calendario_id);

    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Configuração do servidor incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Buscar calendário
    const { data: calendario, error: fetchError } = await supabase
      .from('calendarios_google')
      .select('*')
      .eq('id', calendario_id)
      .single();

    if (fetchError || !calendario) {
      console.error('[google-calendar-refresh] Calendário não encontrado:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Calendário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!calendario.refresh_token) {
      console.error('[google-calendar-refresh] Refresh token não disponível');
      return new Response(
        JSON.stringify({ error: 'Refresh token não disponível. Reconecte o calendário.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Renovar token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: calendario.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('[google-calendar-refresh] Erro ao renovar:', tokenData);
      
      // Se o refresh token for inválido, desativar calendário
      if (tokenData.error === 'invalid_grant') {
        await supabase
          .from('calendarios_google')
          .update({ ativo: false })
          .eq('id', calendario_id);
      }

      return new Response(
        JSON.stringify({ error: tokenData.error_description || tokenData.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { access_token, expires_in } = tokenData;
    const token_expiry = new Date(Date.now() + expires_in * 1000).toISOString();

    // Atualizar no banco
    const { error: updateError } = await supabase
      .from('calendarios_google')
      .update({ access_token, token_expiry })
      .eq('id', calendario_id);

    if (updateError) {
      console.error('[google-calendar-refresh] Erro ao atualizar:', updateError);
      return new Response(
        JSON.stringify({ error: 'Erro ao salvar token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[google-calendar-refresh] Token renovado com sucesso');

    return new Response(
      JSON.stringify({ success: true, access_token, token_expiry }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[google-calendar-refresh] Erro:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
