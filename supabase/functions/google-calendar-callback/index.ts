import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    console.log('[google-calendar-callback] Callback recebido');

    if (error) {
      console.error('[google-calendar-callback] Erro do Google:', error);
      return new Response(
        `<!DOCTYPE html><html><body><script>window.opener?.postMessage({type:'google-calendar-error',error:'${error}'},'*');window.close();</script>Erro: ${error}</body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } }
      );
    }

    if (!code || !state) {
      console.error('[google-calendar-callback] Parâmetros ausentes');
      return new Response(
        '<!DOCTYPE html><html><body><script>window.opener?.postMessage({type:"google-calendar-error",error:"Parâmetros inválidos"},"*");window.close();</script>Parâmetros inválidos</body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } }
      );
    }

    // Decodificar state
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch (e) {
      console.error('[google-calendar-callback] State inválido');
      return new Response(
        '<!DOCTYPE html><html><body><script>window.opener?.postMessage({type:"google-calendar-error",error:"State inválido"},"*");window.close();</script>State inválido</body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } }
      );
    }

    const { conta_id, redirect_url } = stateData;
    console.log('[google-calendar-callback] conta_id:', conta_id);

    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[google-calendar-callback] Configuração ausente');
      return new Response(
        '<!DOCTYPE html><html><body><script>window.opener?.postMessage({type:"google-calendar-error",error:"Configuração do servidor incompleta"},"*");window.close();</script>Configuração incompleta</body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } }
      );
    }

    const callbackUrl = `${SUPABASE_URL}/functions/v1/google-calendar-callback`;

    // Trocar code por tokens
    console.log('[google-calendar-callback] Trocando code por tokens...');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('[google-calendar-callback] Erro ao obter tokens:', tokenData);
      return new Response(
        `<!DOCTYPE html><html><body><script>window.opener?.postMessage({type:"google-calendar-error",error:"${tokenData.error_description || tokenData.error}"},"*");window.close();</script>Erro: ${tokenData.error}</body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } }
      );
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    console.log('[google-calendar-callback] Tokens obtidos com sucesso');

    // Buscar informações do usuário Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userInfo = await userInfoResponse.json();
    console.log('[google-calendar-callback] Email Google:', userInfo.email);

    // Calcular data de expiração do token
    const token_expiry = new Date(Date.now() + expires_in * 1000).toISOString();

    // Salvar no banco de dados
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Verificar se já existe calendário com mesmo email para esta conta
    const { data: existingCalendar } = await supabase
      .from('calendarios_google')
      .select('id')
      .eq('conta_id', conta_id)
      .eq('email_google', userInfo.email)
      .single();

    if (existingCalendar) {
      // Atualizar tokens existentes
      const { error: updateError } = await supabase
        .from('calendarios_google')
        .update({
          access_token,
          refresh_token: refresh_token || undefined,
          token_expiry,
          ativo: true,
        })
        .eq('id', existingCalendar.id);

      if (updateError) {
        console.error('[google-calendar-callback] Erro ao atualizar:', updateError);
        return new Response(
          `<!DOCTYPE html><html><body><script>window.opener?.postMessage({type:"google-calendar-error",error:"Erro ao salvar: ${updateError.message}"},"*");window.close();</script>Erro</body></html>`,
          { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } }
        );
      }
      console.log('[google-calendar-callback] Calendário atualizado');
    } else {
      // Criar novo calendário
      const { error: insertError } = await supabase
        .from('calendarios_google')
        .insert({
          conta_id,
          nome: userInfo.name || userInfo.email.split('@')[0],
          email_google: userInfo.email,
          access_token,
          refresh_token,
          token_expiry,
          calendar_id: 'primary',
        });

      if (insertError) {
        console.error('[google-calendar-callback] Erro ao inserir:', insertError);
        return new Response(
          `<!DOCTYPE html><html><body><script>window.opener?.postMessage({type:"google-calendar-error",error:"Erro ao salvar: ${insertError.message}"},"*");window.close();</script>Erro</body></html>`,
          { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } }
        );
      }
      console.log('[google-calendar-callback] Novo calendário criado');
    }

    // Sucesso - fechar popup e notificar janela pai
    const successHtml = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Conectado!</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .card {
            background: white;
            padding: 48px 56px;
            border-radius: 20px;
            text-align: center;
            box-shadow: 0 25px 80px rgba(0,0,0,0.3);
            animation: slideUp 0.4s ease-out;
          }
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .check {
            width: 72px;
            height: 72px;
            background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 36px;
            color: white;
            box-shadow: 0 8px 24px rgba(34, 197, 94, 0.4);
          }
          h1 { 
            color: #1f2937; 
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 8px;
          }
          p { 
            color: #6b7280; 
            font-size: 15px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="check">✓</div>
          <h1>Conta conectada com sucesso!</h1>
          <p>Esta janela fechará automaticamente...</p>
        </div>
        <script>
          window.opener?.postMessage({type:'google-calendar-success'},'*');
          setTimeout(() => window.close(), 1500);
        </script>
      </body>
      </html>
    `;

    return new Response(successHtml, { 
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
      } 
    });

  } catch (error: unknown) {
    console.error('[google-calendar-callback] Erro:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      `<!DOCTYPE html><html><body><script>window.opener?.postMessage({type:"google-calendar-error",error:"${message}"},"*");window.close();</script>Erro: ${message}</body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } }
    );
  }
});
