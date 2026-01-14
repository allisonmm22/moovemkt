import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper para garantir token válido
async function getValidAccessToken(supabase: any, calendario: any): Promise<string | null> {
  const now = new Date();
  const expiry = new Date(calendario.token_expiry);

  // Se token ainda é válido (com margem de 5 minutos)
  if (expiry > new Date(now.getTime() + 5 * 60 * 1000)) {
    return calendario.access_token;
  }

  console.log('[google-calendar-actions] Token expirado, renovando...');

  const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
  const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!calendario.refresh_token) {
    console.error('[google-calendar-actions] Refresh token não disponível');
    return null;
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      client_secret: GOOGLE_CLIENT_SECRET!,
      refresh_token: calendario.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    console.error('[google-calendar-actions] Erro ao renovar token:', tokenData);
    return null;
  }

  const { access_token, expires_in } = tokenData;
  const token_expiry = new Date(Date.now() + expires_in * 1000).toISOString();

  await supabase
    .from('calendarios_google')
    .update({ access_token, token_expiry })
    .eq('id', calendario.id);

  return access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { operacao, calendario_id, dados } = await req.json();

    console.log('[google-calendar-actions] Operação:', operacao, 'Calendário:', calendario_id);

    if (!operacao || !calendario_id) {
      return new Response(
        JSON.stringify({ error: 'operacao e calendario_id são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Buscar calendário
    const { data: calendario, error: fetchError } = await supabase
      .from('calendarios_google')
      .select('*')
      .eq('id', calendario_id)
      .single();

    if (fetchError || !calendario) {
      return new Response(
        JSON.stringify({ error: 'Calendário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!calendario.ativo) {
      return new Response(
        JSON.stringify({ error: 'Calendário desativado. Reconecte-o.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await getValidAccessToken(supabase, calendario);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Não foi possível obter token válido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const calendarId = calendario.calendar_id || 'primary';
    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`;

    let result;

    switch (operacao) {
      case 'consultar': {
        // Consultar eventos em um período
        const { data_inicio, data_fim } = dados || {};
        
        // Default: hoje até 7 dias
        const timeMin = data_inicio || new Date().toISOString();
        const timeMax = data_fim || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const eventsUrl = `${baseUrl}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
        
        const eventsResponse = await fetch(eventsUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const eventsData = await eventsResponse.json();

        if (eventsData.error) {
          console.error('[google-calendar-actions] Erro ao consultar:', eventsData.error);
          return new Response(
            JSON.stringify({ error: eventsData.error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Formatar eventos para retorno
        const eventos = (eventsData.items || []).map((event: any) => ({
          id: event.id,
          titulo: event.summary,
          descricao: event.description,
          inicio: event.start?.dateTime || event.start?.date,
          fim: event.end?.dateTime || event.end?.date,
          local: event.location,
          link: event.htmlLink,
        }));

        result = { eventos, total: eventos.length };
        console.log(`[google-calendar-actions] ${eventos.length} eventos encontrados`);
        break;
      }

      case 'criar': {
        // Criar novo evento
        const { titulo, data_inicio, data_fim, descricao, local, duracao_minutos, gerar_meet } = dados || {};

        if (!titulo || !data_inicio) {
          return new Response(
            JSON.stringify({ error: 'titulo e data_inicio são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Calcular fim baseado na duração (se não tiver data_fim explícita)
        const duracao = duracao_minutos || 60; // default 1 hora
        const endTime = data_fim || new Date(new Date(data_inicio).getTime() + duracao * 60 * 1000).toISOString();

        const eventPayload: any = {
          summary: titulo,
          description: descricao,
          location: local,
          start: { dateTime: data_inicio, timeZone: 'America/Sao_Paulo' },
          end: { dateTime: endTime, timeZone: 'America/Sao_Paulo' },
        };

        // Adicionar conferência Google Meet se solicitado
        if (gerar_meet) {
          eventPayload.conferenceData = {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          };
        }

        // Adicionar conferenceDataVersion na URL se usar Meet
        const createUrl = gerar_meet 
          ? `${baseUrl}/events?conferenceDataVersion=1`
          : `${baseUrl}/events`;

        const createResponse = await fetch(createUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventPayload),
        });

        const createData = await createResponse.json();

        if (createData.error) {
          console.error('[google-calendar-actions] Erro ao criar:', createData.error);
          return new Response(
            JSON.stringify({ error: createData.error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Extrair link do Google Meet se existir
        const meetLink = createData.hangoutLink || 
                         createData.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ||
                         null;

        result = {
          id: createData.id,
          titulo: createData.summary,
          inicio: createData.start?.dateTime,
          fim: createData.end?.dateTime,
          link: createData.htmlLink,
          meet_link: meetLink,
        };
        console.log('[google-calendar-actions] Evento criado:', result.id, meetLink ? `com Meet: ${meetLink}` : 'sem Meet');
        break;
      }

      case 'reagendar': {
        // Reagendar evento existente
        const { evento_id, nova_data_inicio, nova_data_fim } = dados || {};

        if (!evento_id || !nova_data_inicio) {
          return new Response(
            JSON.stringify({ error: 'evento_id e nova_data_inicio são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Buscar evento atual para manter duração se não especificado novo fim
        const getEventResponse = await fetch(`${baseUrl}/events/${evento_id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const currentEvent = await getEventResponse.json();

        if (currentEvent.error) {
          return new Response(
            JSON.stringify({ error: 'Evento não encontrado' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Calcular nova data fim mantendo a duração original
        let endTime = nova_data_fim;
        if (!endTime && currentEvent.start?.dateTime && currentEvent.end?.dateTime) {
          const originalDuration = new Date(currentEvent.end.dateTime).getTime() - new Date(currentEvent.start.dateTime).getTime();
          endTime = new Date(new Date(nova_data_inicio).getTime() + originalDuration).toISOString();
        } else if (!endTime) {
          endTime = new Date(new Date(nova_data_inicio).getTime() + 60 * 60 * 1000).toISOString();
        }

        const updatePayload = {
          start: { dateTime: nova_data_inicio, timeZone: 'America/Sao_Paulo' },
          end: { dateTime: endTime, timeZone: 'America/Sao_Paulo' },
        };

        const updateResponse = await fetch(`${baseUrl}/events/${evento_id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatePayload),
        });

        const updateData = await updateResponse.json();

        if (updateData.error) {
          console.error('[google-calendar-actions] Erro ao reagendar:', updateData.error);
          return new Response(
            JSON.stringify({ error: updateData.error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = {
          id: updateData.id,
          titulo: updateData.summary,
          inicio: updateData.start?.dateTime,
          fim: updateData.end?.dateTime,
          link: updateData.htmlLink,
        };
        console.log('[google-calendar-actions] Evento reagendado:', result.id);
        break;
      }

      case 'deletar': {
        const { evento_id } = dados || {};

        if (!evento_id) {
          return new Response(
            JSON.stringify({ error: 'evento_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const deleteResponse = await fetch(`${baseUrl}/events/${evento_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!deleteResponse.ok && deleteResponse.status !== 204) {
          const deleteError = await deleteResponse.json();
          return new Response(
            JSON.stringify({ error: deleteError.error?.message || 'Erro ao deletar' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { success: true, message: 'Evento deletado com sucesso' };
        console.log('[google-calendar-actions] Evento deletado:', evento_id);
        break;
      }

      case 'listar_calendarios': {
        // Listar calendários disponíveis na conta Google
        const calendarsResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const calendarsData = await calendarsResponse.json();

        if (calendarsData.error) {
          return new Response(
            JSON.stringify({ error: calendarsData.error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const calendarios = (calendarsData.items || []).map((cal: any) => ({
          id: cal.id,
          nome: cal.summary,
          descricao: cal.description,
          cor: cal.backgroundColor,
          primario: cal.primary || false,
        }));

        result = { calendarios };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Operação desconhecida: ${operacao}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[google-calendar-actions] Erro:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
