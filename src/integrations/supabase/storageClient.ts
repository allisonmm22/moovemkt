import { createClient } from '@supabase/supabase-js';

// Cliente Supabase para Storage EXTERNO
// Usado para upload de mídias do WhatsApp/Instagram
const EXTERNAL_SUPABASE_URL = 'https://supabase.cognityx.com.br';
const EXTERNAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.8l3_WCUXZTFek1jVESJsH-0s_2t6ZdAOsxvx3d62gzw';

export const storageClient = createClient(
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_ANON_KEY
);

export const EXTERNAL_STORAGE_URL = EXTERNAL_SUPABASE_URL;
