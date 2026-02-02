# CRM Workers - Cloudflare Workers Migration

Este projeto contém as Edge Functions do CRM migradas de Supabase para Cloudflare Workers.

## Pré-requisitos

- Node.js 18+
- Conta Cloudflare (gratuita ou paga)
- Wrangler CLI instalado: `npm install -g wrangler`

## Setup Inicial

### 1. Login na Cloudflare

```bash
cd crm-workers
wrangler login
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Configurar Secrets

Configure cada secret usando o comando:

```bash
# Supabase
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put SUPABASE_ANON_KEY

# Evolution API (WhatsApp)
wrangler secret put EVOLUTION_API_KEY

# Stripe
wrangler secret put STRIPE_SECRET_KEY

# Meta (WhatsApp/Instagram)
wrangler secret put META_APP_ID
wrangler secret put META_APP_SECRET

# Google Calendar
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# Push Notifications
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_PUBLIC_KEY

# Lovable AI
wrangler secret put LOVABLE_API_KEY
```

### 4. Desenvolvimento Local

```bash
npm run dev
```

Isso inicia um servidor local em `http://localhost:8787`

### 5. Deploy para Produção

```bash
npm run deploy
```

Após o deploy, você receberá uma URL como:
`https://crm-workers.<seu-account>.workers.dev`

## Configuração de Domínio Customizado

Para usar um domínio como `api.seudominio.com`:

1. Adicione seu domínio ao Cloudflare
2. Edite `wrangler.toml`:

```toml
[[routes]]
pattern = "api.seudominio.com/*"
zone_name = "seudominio.com"
```

3. Faça deploy novamente

## Configuração do R2 (Storage)

Para armazenar mídia sem egress fees:

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

# Adicionar domínio público (opcional)
wrangler r2 bucket domain add whatsapp-media --domain media.seudominio.com
```

Depois, descomente a seção R2 no `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "whatsapp-media"
```

## Funções Implementadas

### Alta Prioridade (Prontas)
- ✅ `whatsapp-webhook` - Recebe webhooks da Evolution API e Meta API
- ✅ `ai-responder` - Gera respostas com IA (Lovable AI ou OpenAI)
- ✅ `enviar-mensagem` - Envia mensagens via Evolution/Meta/Instagram
- ✅ `processar-resposta-agora` - Processa resposta individual com debounce
- ✅ `processar-respostas-pendentes` - Batch processing de respostas

### Cron Jobs (Scheduled Workers)
- ✅ `*/5 * * * *` - processar-respostas-pendentes + processar-followups
- ✅ `*/10 * * * *` - processar-lembretes
- ✅ `0 3 * * *` - arquivar-mensagens-antigas
- ✅ `0 4 * * *` - consolidar-uso-diario

### Média Prioridade (A migrar)
- ⬜ `download-media`
- ⬜ `processar-followups`
- ⬜ `processar-followups-agendados`
- ⬜ `processar-lembretes`
- ⬜ `transcrever-audio`
- ⬜ `resumir-conversa`
- ⬜ `registrar-log`

### Baixa Prioridade (A migrar)
- ⬜ Auth/Admin (5 funções)
- ⬜ Evolution API (7 funções)
- ⬜ Meta/Instagram (7 funções)
- ⬜ Stripe (4 funções)
- ⬜ Google Calendar (4 funções)
- ⬜ Utilitários (9 funções)

## Atualização de Webhooks

Após o deploy, atualize os webhooks externos:

| Serviço | Nova URL |
|---------|----------|
| Evolution API | `https://api.seudominio.com/whatsapp-webhook` |
| Stripe | `https://api.seudominio.com/stripe-webhook` |
| Meta Business | `https://api.seudominio.com/whatsapp-webhook` |
| Instagram | `https://api.seudominio.com/instagram-webhook` |
| Google OAuth | `https://api.seudominio.com/google-calendar-callback` |

## Logs e Debugging

```bash
# Ver logs em tempo real
wrangler tail

# Ver logs filtrados
wrangler tail --format pretty
```

## Custos Estimados

| Recurso | Gratuito | Pago ($5/mês) |
|---------|----------|---------------|
| Requests | 100K/dia | 10M/mês |
| CPU Time | 10ms/request | 50ms/request |
| R2 Storage | 10GB | $0.015/GB |
| R2 Egress | Ilimitado | Ilimitado |

Para 100 clientes (~2M requests/mês): **~$5/mês total**

## Estrutura do Projeto

```
crm-workers/
├── package.json
├── wrangler.toml
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts              # Router principal + Cron handler
    ├── types/
    │   └── index.ts          # Tipos TypeScript
    ├── lib/
    │   ├── supabase.ts       # Cliente Supabase
    │   ├── cors.ts           # Headers CORS
    │   └── utils.ts          # Utilitários
    └── handlers/
        ├── cron.ts           # Handlers de Cron Jobs
        ├── whatsapp-webhook.ts
        ├── ai-responder.ts
        ├── enviar-mensagem.ts
        ├── processar-resposta-agora.ts
        └── processar-respostas-pendentes.ts
```

## Migração do Frontend

Para o frontend Lovable usar os Workers:

1. Adicione `VITE_API_URL` no `.env`
2. Use o cliente `src/lib/api.ts` para chamadas
3. Substitua `supabase.functions.invoke()` por `callWorker()`

Exemplo:
```typescript
// Antes
const { data } = await supabase.functions.invoke('enviar-mensagem', { body: { ... } });

// Depois
import { callWorker } from '@/lib/api';
const response = await callWorker('enviar-mensagem', { method: 'POST', body: JSON.stringify({ ... }) });
const data = await response.json();
```
