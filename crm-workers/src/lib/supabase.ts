import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../types';

// Cache de clientes Supabase (evitar recriação a cada request)
const clientCache = new Map<string, SupabaseClient>();

export function createSupabaseClient(env: Env): SupabaseClient {
  const key = `${env.SUPABASE_URL}:${env.SUPABASE_SERVICE_ROLE_KEY}`;
  
  if (clientCache.has(key)) {
    return clientCache.get(key)!;
  }
  
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  
  clientCache.set(key, client);
  return client;
}

export function createSupabaseAnonClient(env: Env): SupabaseClient {
  const key = `${env.SUPABASE_URL}:${env.SUPABASE_ANON_KEY}:anon`;
  
  if (clientCache.has(key)) {
    return clientCache.get(key)!;
  }
  
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  
  clientCache.set(key, client);
  return client;
}
