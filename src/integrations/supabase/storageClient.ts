import { createClient } from '@supabase/supabase-js';

// Cliente Supabase para Storage LOCAL
// Usa as mesmas variáveis do projeto
const STORAGE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const STORAGE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const storageClient = createClient(
  STORAGE_SUPABASE_URL,
  STORAGE_SUPABASE_ANON_KEY
);

export const EXTERNAL_STORAGE_URL = STORAGE_SUPABASE_URL;
