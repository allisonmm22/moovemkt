// Tipos compartilhados para Cloudflare Workers

export interface Env {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  
  // Evolution API (WhatsApp)
  EVOLUTION_API_KEY: string;
  
  // Stripe
  STRIPE_SECRET_KEY: string;
  
  // Meta (WhatsApp/Instagram)
  META_APP_ID: string;
  META_APP_SECRET: string;
  
  // Google Calendar
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  
  // Push Notifications
  VAPID_PRIVATE_KEY: string;
  VAPID_PUBLIC_KEY: string;
  
  // Lovable AI
  LOVABLE_API_KEY: string;
  
  // R2 Storage (opcional)
  MEDIA_BUCKET?: R2Bucket;
  
  // KV Storage (opcional)
  CACHE?: KVNamespace;
}

export interface Conexao {
  id: string;
  conta_id: string;
  instance_name: string;
  token: string;
  tipo_provedor?: string;
  tipo_canal?: string;
  meta_phone_number_id?: string;
  meta_access_token?: string;
  meta_webhook_verify_token?: string;
  status?: string;
  agente_ia_id?: string;
}

export interface Contato {
  id: string;
  conta_id: string;
  nome: string;
  telefone: string;
  email?: string;
  avatar_url?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  is_grupo?: boolean;
  grupo_jid?: string;
  canal?: string;
}

export interface Conversa {
  id: string;
  conta_id: string;
  contato_id: string;
  conexao_id?: string;
  status?: string;
  agente_ia_ativo?: boolean;
  agente_ia_id?: string;
  nao_lidas?: number;
  ultima_mensagem?: string;
  ultima_mensagem_at?: string;
  arquivada?: boolean;
  canal?: string;
}

export interface Mensagem {
  id: string;
  conversa_id: string;
  contato_id?: string;
  conteudo: string;
  direcao: 'entrada' | 'saida';
  tipo: 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'sticker' | 'sistema';
  media_url?: string;
  metadata?: Record<string, any>;
  enviada_por_ia?: boolean;
  enviada_por_dispositivo?: boolean;
  created_at?: string;
}

export interface AgenteIA {
  id: string;
  conta_id: string;
  nome?: string;
  prompt_sistema?: string;
  modelo?: string;
  temperatura?: number;
  tempo_espera_segundos?: number;
  fracionar_mensagens?: boolean;
  tamanho_max_fracao?: number;
  delay_entre_fracoes?: number;
  simular_digitacao?: boolean;
  ativo?: boolean;
}

export interface AIResponse {
  resposta: string;
  provider: string;
  acoes?: Acao[];
  tokens?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  mensagemJaSalva?: boolean;
  should_respond?: boolean;
}

export interface Acao {
  tipo: 'etapa' | 'tag' | 'transferir' | 'notificar' | 'finalizar' | 'nome' | 'negociacao' | 'agenda' | 'campo' | 'obter' | 'followup' | 'verificar_cliente';
  valor?: string;
  calendario_id?: string;
}

export interface RespostaPendente {
  id: string;
  conversa_id: string;
  responder_em: string;
  processando?: boolean;
}
