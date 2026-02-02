
# Plano de Migração: Edge Functions → Cloudflare Workers

## Resumo Executivo

Este plano detalha como migrar as **51 Edge Functions** do Supabase para **Cloudflare Workers**, mantendo o frontend no Lovable e o banco de dados no Supabase externo (`vgesneiogwomqxwhkdvn`).

**Benefícios:**
- **Custo**: Cloudflare Workers tem 100.000 requests/dia grátis + $5/mês para 10M requests
- **Latência**: Edge global com ~30ms de resposta
- **Escalabilidade**: Sem limites de invocações como no Supabase

---

## Arquitetura Proposta

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ARQUITETURA HÍBRIDA                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────┐     ┌─────────────────────────┐     ┌──────────────────┐  │
│   │    FRONTEND     │     │   CLOUDFLARE WORKERS    │     │    SUPABASE      │  │
│   │    (Lovable)    │────▶│   (51 Functions)        │────▶│   (Database)     │  │
│   │                 │     │                         │     │                  │  │
│   │  React + Vite   │     │  - whatsapp-webhook     │     │  vgesneiogwomq   │  │
│   │  Tailwind CSS   │     │  - ai-responder         │     │  xwhkdvn         │  │
│   │                 │     │  - enviar-mensagem      │     │                  │  │
│   └─────────────────┘     │  - stripe-webhook       │     │  PostgreSQL      │  │
│                           │  - processar-followups  │     │  Auth            │  │
│                           │  - (+ 46 outras)        │     │  Storage         │  │
│                           └─────────────────────────┘     └──────────────────┘  │
│                                      │                                           │
│                                      ▼                                           │
│                           ┌─────────────────────────┐                           │
│                           │   CLOUDFLARE R2         │                           │
│                           │   (Mídia WhatsApp)      │                           │
│                           │   Sem egress fees       │                           │
│                           └─────────────────────────┘                           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Categorização das 51 Edge Functions

### Alta Prioridade (Alto Volume - Migrar Primeiro)
| # | Função | Requests/Mês | Complexidade |
|---|--------|--------------|--------------|
| 1 | `whatsapp-webhook` | ~50.000+ | Alta |
| 2 | `ai-responder` | ~30.000+ | Alta |
| 3 | `enviar-mensagem` | ~20.000+ | Média |
| 4 | `processar-resposta-agora` | ~15.000+ | Média |
| 5 | `processar-respostas-pendentes` | ~10.000+ | Média |

### Média Prioridade (Volume Moderado)
| # | Função | Complexidade |
|---|--------|--------------|
| 6 | `download-media` | Média |
| 7 | `processar-followups` | Média |
| 8 | `processar-followups-agendados` | Média |
| 9 | `processar-lembretes` | Média |
| 10 | `transcrever-audio` | Alta |
| 11 | `resumir-conversa` | Média |
| 12 | `registrar-log` | Baixa |

### Baixa Prioridade (Operações Pontuais)
| Categoria | Funções |
|-----------|---------|
| **Auth/Admin** | `signup-completo`, `reset-user-password`, `bootstrap-super-admin`, `criar-conta-admin`, `desativar-conta` |
| **Evolution API** | `evolution-connect`, `evolution-disconnect`, `evolution-connection-status`, `evolution-create-instance`, `evolution-delete-instance`, `evolution-set-webhook`, `evolution-fetch-messages` |
| **Meta/Instagram** | `meta-send-message`, `meta-download-media`, `meta-get-templates`, `meta-configure-webhook`, `meta-verify-webhook`, `instagram-connect`, `instagram-webhook` |
| **Stripe** | `stripe-webhook`, `stripe-checkout`, `stripe-customer-portal`, `stripe-test-connection` |
| **Google Calendar** | `google-calendar-auth`, `google-calendar-callback`, `google-calendar-refresh`, `google-calendar-actions` |
| **Utilitários** | `analisar-imagem`, `extrair-texto-pdf`, `api-externa`, `deletar-mensagem`, `executar-acao`, `transferir-atendimento`, `validar-limite-plano`, `verificar-limites-plano`, `send-push-notification` |
| **Cron Jobs** | `arquivar-mensagens-antigas`, `consolidar-uso-diario` |

---

## Fase 1: Configuração do Ambiente Cloudflare

### 1.1 Criar Conta e Projeto

```bash
# Instalar Wrangler CLI
npm install -g wrangler

# Login na Cloudflare
wrangler login

# Criar projeto Workers
wrangler init crm-workers
```

### 1.2 Estrutura do Projeto

```text
crm-workers/
├── wrangler.toml
├── package.json
├── src/
│   ├── index.ts              # Router principal
│   ├── lib/
│   │   ├── supabase.ts       # Cliente Supabase
│   │   ├── cors.ts           # Headers CORS
│   │   └── utils.ts          # Funções utilitárias
│   ├── handlers/
│   │   ├── whatsapp-webhook.ts
│   │   ├── ai-responder.ts
│   │   ├── enviar-mensagem.ts
│   │   ├── stripe-webhook.ts
│   │   └── ... (demais handlers)
│   └── types/
│       └── index.ts
└── .dev.vars                  # Secrets locais
```

### 1.3 Configuração wrangler.toml

```toml
name = "crm-workers"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
SUPABASE_URL = "https://vgesneiogwomqxwhkdvn.supabase.co"

# Secrets (configurar via wrangler secret put)
# SUPABASE_SERVICE_ROLE_KEY
# EVOLUTION_API_KEY
# STRIPE_SECRET_KEY
# META_ACCESS_TOKEN
# GOOGLE_CLIENT_ID
# GOOGLE_CLIENT_SECRET
# VAPID_PRIVATE_KEY
# VAPID_PUBLIC_KEY

# Rotas personalizadas
[[routes]]
pattern = "api.seudominio.com/*"
zone_name = "seudominio.com"

# KV Storage (opcional, para cache)
[[kv_namespaces]]
binding = "CACHE"
id = "xxx"

# R2 Storage (para mídia)
[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "whatsapp-media"
```

---

## Fase 2: Migração do Código

### 2.1 Padrão de Conversão Deno → Node.js

**Antes (Supabase Edge Function - Deno):**
```typescript
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ... lógica
});
```

**Depois (Cloudflare Worker):**
```typescript
import { createClient } from '@supabase/supabase-js';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EVOLUTION_API_KEY: string;
  // ... outros secrets
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // ... mesma lógica
  }
}
```

### 2.2 Router Principal (src/index.ts)

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Importar handlers
import { handleWhatsappWebhook } from './handlers/whatsapp-webhook';
import { handleAiResponder } from './handlers/ai-responder';
import { handleEnviarMensagem } from './handlers/enviar-mensagem';
import { handleStripeWebhook } from './handlers/stripe-webhook';
// ... demais imports

const app = new Hono();

// CORS global
app.use('*', cors({
  origin: '*',
  allowHeaders: ['authorization', 'x-client-info', 'apikey', 'content-type'],
}));

// Rotas
app.all('/whatsapp-webhook', handleWhatsappWebhook);
app.post('/ai-responder', handleAiResponder);
app.post('/enviar-mensagem', handleEnviarMensagem);
app.all('/stripe-webhook', handleStripeWebhook);
// ... 47 rotas adicionais

export default app;
```

### 2.3 Exemplo Completo: whatsapp-webhook

```typescript
// src/handlers/whatsapp-webhook.ts
import { Context } from 'hono';
import { createSupabaseClient } from '../lib/supabase';
import { corsHeaders } from '../lib/cors';

export async function handleWhatsappWebhook(c: Context) {
  const env = c.env;
  
  // Verificação GET (Meta webhook)
  if (c.req.method === 'GET') {
    const url = new URL(c.req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token && challenge) {
      const supabase = createSupabaseClient(env);
      const { data: conexao } = await supabase
        .from('conexoes_whatsapp')
        .select('id')
        .eq('meta_webhook_verify_token', token)
        .single();

      if (conexao || token.startsWith('verify_')) {
        return new Response(challenge, { status: 200 });
      }
    }
    return new Response('Forbidden', { status: 403 });
  }

  // POST: Processar webhook
  const payload = await c.req.json();
  const supabase = createSupabaseClient(env);

  // Detectar origem: Meta API vs Evolution API
  if (payload.object === 'whatsapp_business_account') {
    return await processarWebhookMeta(payload, supabase, env);
  }

  // Evolution API
  return await processarWebhookEvolution(payload, supabase, env);
}

async function processarWebhookMeta(payload: any, supabase: any, env: any) {
  // ... mesma lógica do Supabase Edge Function
  // (1490 linhas adaptadas)
}

async function processarWebhookEvolution(payload: any, supabase: any, env: any) {
  // ... mesma lógica
}
```

---

## Fase 3: Configuração de Secrets

### 3.1 Adicionar Secrets no Cloudflare

```bash
# Supabase
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put SUPABASE_ANON_KEY

# Evolution API
wrangler secret put EVOLUTION_API_KEY

# Stripe
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET

# Meta/Instagram
wrangler secret put META_APP_ID
wrangler secret put META_APP_SECRET

# Google Calendar
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# Push Notifications
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_PUBLIC_KEY
```

---

## Fase 4: Atualização do Frontend

### 4.1 Criar Cliente API Centralizado

```typescript
// src/lib/api.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.seudominio.com';

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
```

### 4.2 Atualizar Chamadas no Frontend

**Antes:**
```typescript
const { data, error } = await supabase.functions.invoke('enviar-mensagem', {
  body: { conexao_id, telefone, mensagem }
});
```

**Depois:**
```typescript
import { callWorker } from '@/lib/api';

const response = await callWorker('enviar-mensagem', {
  method: 'POST',
  body: JSON.stringify({ conexao_id, telefone, mensagem })
});
const data = await response.json();
```

### 4.3 Variáveis de Ambiente

```env
# .env
VITE_SUPABASE_URL="https://vgesneiogwomqxwhkdvn.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIs..."
VITE_SUPABASE_PROJECT_ID="vgesneiogwomqxwhkdvn"
VITE_API_URL="https://api.seudominio.com"
```

---

## Fase 5: Configurar Webhooks Externos

### 5.1 URLs Antigas vs Novas

| Serviço | URL Antiga (Supabase) | URL Nova (Cloudflare) |
|---------|----------------------|----------------------|
| Evolution API | `https://vgesneiogwomqxwhkdvn.supabase.co/functions/v1/whatsapp-webhook` | `https://api.seudominio.com/whatsapp-webhook` |
| Stripe | `.../stripe-webhook` | `https://api.seudominio.com/stripe-webhook` |
| Meta Business | `.../whatsapp-webhook` | `https://api.seudominio.com/whatsapp-webhook` |
| Instagram | `.../instagram-webhook` | `https://api.seudominio.com/instagram-webhook` |
| Google OAuth | `.../google-calendar-callback` | `https://api.seudominio.com/google-calendar-callback` |

---

## Fase 6: Cron Jobs (Scheduled Workers)

### 6.1 Configurar Cron Triggers

```toml
# wrangler.toml
[triggers]
crons = [
  "*/5 * * * *",   # processar-respostas-pendentes (cada 5 min)
  "*/5 * * * *",   # processar-followups-agendados
  "*/10 * * * *",  # processar-lembretes
  "0 3 * * *",     # arquivar-mensagens-antigas (3h da manhã)
  "0 4 * * *",     # consolidar-uso-diario (4h da manhã)
]
```

### 6.2 Handler de Cron

```typescript
// src/index.ts
export default {
  async fetch(request: Request, env: Env) {
    // ... rotas HTTP
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const trigger = event.cron;
    
    switch (trigger) {
      case '*/5 * * * *':
        await processarRespostasPendentes(env);
        await processarFollowupsAgendados(env);
        break;
      case '*/10 * * * *':
        await processarLembretes(env);
        break;
      case '0 3 * * *':
        await arquivarMensagensAntigas(env);
        break;
      case '0 4 * * *':
        await consolidarUsoDiario(env);
        break;
    }
  }
}
```

---

## Fase 7: Cloudflare R2 para Mídia

### 7.1 Configurar Bucket R2

```bash
# Criar bucket
wrangler r2 bucket create whatsapp-media

# Configurar CORS
wrangler r2 bucket cors put whatsapp-media --rules '[{
  "AllowedOrigins": ["*"],
  "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}]'

# Configurar domínio público
wrangler r2 bucket domain add whatsapp-media --domain media.seudominio.com
```

### 7.2 Adaptar Upload de Mídia

```typescript
// src/handlers/enviar-mensagem.ts
async function uploadMediaToR2(
  env: Env,
  base64: string,
  tipo: string
): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${tipo === 'audio' ? 'mp3' : 'jpg'}`;
  
  await env.MEDIA_BUCKET.put(fileName, bytes, {
    httpMetadata: {
      contentType: tipo === 'audio' ? 'audio/mpeg' : 'image/jpeg',
    },
  });
  
  return `https://media.seudominio.com/${fileName}`;
}
```

---

## Cronograma de Implementação

| Fase | Duração | Descrição |
|------|---------|-----------|
| **Fase 1** | 1 dia | Setup Cloudflare + Wrangler + Estrutura |
| **Fase 2** | 3-5 dias | Migrar 5 funções de alta prioridade |
| **Fase 3** | 1 dia | Configurar todos os secrets |
| **Fase 4** | 1 dia | Atualizar frontend com novo cliente API |
| **Fase 5** | 1 dia | Reconfigurar webhooks externos |
| **Fase 6** | 1 dia | Configurar Cron Jobs |
| **Fase 7** | 1 dia | Configurar R2 para mídia |
| **Fase 8** | 2-3 dias | Migrar 46 funções restantes |
| **Testes** | 2-3 dias | Testes end-to-end |

**Total: 13-17 dias**

---

## Comparativo de Custos

| Métrica | Supabase Pro | Cloudflare Workers |
|---------|-------------|-------------------|
| **Invocações** | 500k/mês incluídas | 10M/mês por $5 |
| **Custo adicional** | $2/100k invocações | $0.30/1M invocações |
| **Storage (R2)** | N/A | 10GB grátis + $0.015/GB |
| **Egress** | Incluso (limitado) | **GRÁTIS (R2)** |

**Para 100 clientes (2M requests/mês):**
- Supabase: ~$30-50/mês extra
- Cloudflare: ~$5/mês total

---

## Arquivos a Criar

1. **Configuração**
   - `crm-workers/wrangler.toml`
   - `crm-workers/package.json`
   - `crm-workers/tsconfig.json`

2. **Código Base**
   - `crm-workers/src/index.ts` (Router principal)
   - `crm-workers/src/lib/supabase.ts`
   - `crm-workers/src/lib/cors.ts`
   - `crm-workers/src/lib/utils.ts`

3. **51 Handlers** (um para cada função)
   - `crm-workers/src/handlers/whatsapp-webhook.ts`
   - `crm-workers/src/handlers/ai-responder.ts`
   - `crm-workers/src/handlers/enviar-mensagem.ts`
   - ... (48 arquivos adicionais)

4. **Frontend**
   - `src/lib/api.ts` (Cliente API centralizado)
   - Atualizar `.env` com `VITE_API_URL`

---

## Próximos Passos

Quando você aprovar este plano, posso:

1. **Criar a estrutura completa** do projeto Cloudflare Workers
2. **Migrar as 5 funções críticas** primeiro (whatsapp-webhook, ai-responder, enviar-mensagem, processar-resposta-agora, processar-respostas-pendentes)
3. **Criar o cliente API** no frontend para chamar os Workers
4. **Documentar** os comandos para deploy e configuração de secrets

A implementação será feita em fases para minimizar riscos e permitir testes incrementais.
