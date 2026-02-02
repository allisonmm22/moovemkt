import type { Context } from 'hono';
import type { Env } from '../types';
import { createSupabaseClient } from '../lib/supabase';
import { EVOLUTION_API_URL } from '../lib/utils';

// Cron handlers para Scheduled Workers

export async function runProcessarRespostasPendentes(env: Env): Promise<void> {
  console.log('[CRON] Processando respostas pendentes...');
  
  const supabase = createSupabaseClient(env);
  const agora = new Date().toISOString();
  
  const { data: pendentes, error } = await supabase
    .from('respostas_pendentes')
    .select('id, conversa_id')
    .lte('responder_em', agora)
    .eq('processando', false)
    .limit(50);
  
  if (error) {
    console.error('[CRON] Erro ao buscar pendentes:', error);
    return;
  }
  
  if (!pendentes || pendentes.length === 0) {
    console.log('[CRON] Nenhuma resposta pendente');
    return;
  }
  
  console.log(`[CRON] ${pendentes.length} respostas pendentes encontradas`);
  
  // Processar em paralelo (limitado a 10 por vez)
  const batch = pendentes.slice(0, 10);
  
  await Promise.all(batch.map(async (pendente) => {
    try {
      // Adquirir lock
      const { data: locked } = await supabase
        .from('respostas_pendentes')
        .update({ processando: true })
        .eq('id', pendente.id)
        .eq('processando', false)
        .select()
        .maybeSingle();
      
      if (!locked) return;
      
      // Chamar processar-resposta-agora internamente
      const response = await fetch(`${env.SUPABASE_URL}/functions/v1/processar-resposta-agora`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ conversa_id: pendente.conversa_id }),
      });
      
      console.log(`[CRON] Conversa ${pendente.conversa_id}: ${response.status}`);
    } catch (err) {
      console.error(`[CRON] Erro conversa ${pendente.conversa_id}:`, err);
    }
  }));
}

export async function runProcessarFollowups(env: Env): Promise<void> {
  console.log('[CRON] Processando followups agendados...');
  
  try {
    const response = await fetch(`${env.SUPABASE_URL}/functions/v1/processar-followups-agendados`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({}),
    });
    console.log(`[CRON] Followups: ${response.status}`);
  } catch (err) {
    console.error('[CRON] Erro followups:', err);
  }
}

export async function runProcessarLembretes(env: Env): Promise<void> {
  console.log('[CRON] Processando lembretes...');
  
  try {
    const response = await fetch(`${env.SUPABASE_URL}/functions/v1/processar-lembretes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({}),
    });
    console.log(`[CRON] Lembretes: ${response.status}`);
  } catch (err) {
    console.error('[CRON] Erro lembretes:', err);
  }
}

export async function runArquivarMensagens(env: Env): Promise<void> {
  console.log('[CRON] Arquivando mensagens antigas...');
  
  try {
    const response = await fetch(`${env.SUPABASE_URL}/functions/v1/arquivar-mensagens-antigas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({}),
    });
    console.log(`[CRON] Arquivar: ${response.status}`);
  } catch (err) {
    console.error('[CRON] Erro arquivar:', err);
  }
}

export async function runConsolidarUso(env: Env): Promise<void> {
  console.log('[CRON] Consolidando uso diário...');
  
  try {
    const response = await fetch(`${env.SUPABASE_URL}/functions/v1/consolidar-uso-diario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({}),
    });
    console.log(`[CRON] Consolidar: ${response.status}`);
  } catch (err) {
    console.error('[CRON] Erro consolidar:', err);
  }
}
