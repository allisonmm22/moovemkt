
# Plano de Migração do CRM para Supabase Externo

## Resumo Executivo

Este plano detalha como migrar seu sistema CRM do Lovable Cloud para seu próprio projeto Supabase, mantendo o frontend hospedado no Lovable.

**Credenciais do Novo Supabase:**
- **Project ID**: `vgesneiogwomqxwhkdvn`
- **URL**: `https://vgesneiogwomqxwhkdvn.supabase.co`
- **Anon Key**: `eyJhbGciOiJIUzI1...` (configurado)
- **Service Role**: `eyJhbGciOiJIUzI1...` (configurado)

---

## Etapas da Migração

### Etapa 1: Aplicar Schema no Banco de Dados Externo (Você faz)

Você precisa executar as 8 migrações SQL no seu Supabase externo, na ordem correta:

1. **Migração Principal** (3136 linhas) - Cria todas as tabelas, tipos, funções e políticas RLS
2. **Realtime** - Habilita realtime para mensagens e conversas
3. **Correção RLS** - Políticas de segurança para service_role
4. **API Keys** - Tabela para chaves de API externas
5. **Índices de Performance** - Otimizações de consulta
6. **View Performance** - Correção de security invoker
7. **Push Notifications** - Tabela de subscriptions
8. **Agente IA Conexão** - Vínculo entre agente e conexão WhatsApp

**Como fazer:**
1. Acesse seu Supabase Dashboard > SQL Editor
2. Execute cada arquivo SQL em ordem (da pasta `supabase/migrations/`)

---

### Etapa 2: Configurar Secrets no Supabase Externo (Você faz)

Seu projeto usa **12 secrets** que precisam ser configurados via Supabase CLI ou Dashboard:

| Secret | Onde Encontrar | Usado Por |
|--------|---------------|-----------|
| `EVOLUTION_API_KEY` | Sua conta Evolution API | WhatsApp webhooks, envio de mensagens |
| `EXTERNAL_SUPABASE_URL` | Storage externo (se usar) | Upload de mídia |
| `EXTERNAL_SUPABASE_ANON_KEY` | Storage externo | Upload de mídia |
| `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` | Storage externo | Upload de mídia |
| `GOOGLE_CLIENT_ID` | Console Google Cloud | Integração Google Calendar |
| `GOOGLE_CLIENT_SECRET` | Console Google Cloud | Integração Google Calendar |
| `META_APP_ID` | Meta Business Suite | WhatsApp/Instagram Meta API |
| `META_APP_SECRET` | Meta Business Suite | WhatsApp/Instagram Meta API |
| `STRIPE_SECRET_KEY` | Dashboard Stripe | Pagamentos/Assinaturas |
| `VAPID_PRIVATE_KEY` | Gerar novo | Push notifications |
| `VAPID_PUBLIC_KEY` | Gerar novo | Push notifications |

**Comando CLI:**
```bash
supabase secrets set EVOLUTION_API_KEY="sua_chave" --project-ref vgesneiogwomqxwhkdvn
```

---

### Etapa 3: Deploy das Edge Functions (Você faz)

O projeto tem **51 Edge Functions** que precisam ser deployed:

```bash
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Fazer deploy de todas as funções
cd seu-projeto
supabase functions deploy --project-ref vgesneiogwomqxwhkdvn
```

**Lista das 51 funções:**
```text
ai-responder, analisar-imagem, api-externa, arquivar-mensagens-antigas,
bootstrap-super-admin, consolidar-uso-diario, criar-conta-admin, 
deletar-mensagem, desativar-conta, download-media, enviar-mensagem,
evolution-connect, evolution-connection-status, evolution-create-instance,
evolution-create-instance-instagram, evolution-delete-instance, 
evolution-disconnect, evolution-fetch-messages, evolution-set-webhook,
executar-acao, extrair-texto-pdf, google-calendar-actions,
google-calendar-auth, google-calendar-callback, google-calendar-refresh,
instagram-connect, instagram-webhook, meta-configure-webhook,
meta-download-media, meta-get-templates, meta-send-message,
meta-verify-webhook, processar-followups, processar-followups-agendados,
processar-lembretes, processar-resposta-agora, processar-respostas-pendentes,
registrar-log, reset-user-password, resumir-conversa, send-push-notification,
signup-completo, stripe-checkout, stripe-customer-portal, stripe-test-connection,
stripe-webhook, transcrever-audio, transferir-atendimento, validar-limite-plano,
verificar-limites-plano, whatsapp-webhook
```

---

### Etapa 4: Exportar e Importar Dados (Você faz)

**Ordem de importação (respeitando dependências):**

1. `planos` (primeiro, não tem dependências)
2. `contas` (depende de planos)
3. `usuarios` (depende de contas)
4. `user_roles` (depende de usuarios)
5. `agent_ia` (depende de contas)
6. `conexoes_whatsapp` (depende de contas)
7. `contatos` (depende de contas)
8. `conversas` (depende de contatos, conexoes)
9. `mensagens` (depende de conversas)
10. Demais tabelas auxiliares

**Aviso:** Usuários do Supabase Auth precisarão **resetar senhas** - as senhas são hasheadas e não podem ser migradas.

---

### Etapa 5: Atualizar Webhooks Externos (Você faz)

Atualize as URLs nos serviços externos:

| Serviço | URL Antiga | URL Nova |
|---------|-----------|----------|
| Evolution API | `https://mfaxpkfpackofxklccyl.supabase.co/functions/v1/whatsapp-webhook` | `https://vgesneiogwomqxwhkdvn.supabase.co/functions/v1/whatsapp-webhook` |
| Stripe Webhook | `...mfaxpkfpackofxklccyl.../stripe-webhook` | `...vgesneiogwomqxwhkdvn.../stripe-webhook` |
| Meta Business | `...mfaxpkfpackofxklccyl.../whatsapp-webhook` | `...vgesneiogwomqxwhkdvn.../whatsapp-webhook` |
| Instagram | `...mfaxpkfpackofxklccyl.../instagram-webhook` | `...vgesneiogwomqxwhkdvn.../instagram-webhook` |

---

### Etapa 6: Atualizar Frontend (Eu posso fazer)

Depois que você completar as etapas acima, eu posso atualizar o arquivo `.env` do frontend:

**De:**
```env
VITE_SUPABASE_PROJECT_ID="mfaxpkfpackofxklccyl"
VITE_SUPABASE_URL="https://mfaxpkfpackofxklccyl.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJ...antigo..."
```

**Para:**
```env
VITE_SUPABASE_PROJECT_ID="vgesneiogwomqxwhkdvn"
VITE_SUPABASE_URL="https://vgesneiogwomqxwhkdvn.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnZXNuZWlvZ3dvbXF4d2hrZHZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTQ4NDIsImV4cCI6MjA4NTM3MDg0Mn0.tn3doFqnOUVie-prYOdp1pD63jJZR--iy-rUnEsgb3c"
```

**Também preciso atualizar `src/integrations/supabase/client.ts`** para apontar para o novo projeto.

---

## Checklist de Migração

- [ ] 1. Executar 8 migrações SQL no Supabase externo
- [ ] 2. Configurar 12 secrets no Supabase externo
- [ ] 3. Deploy das 51 Edge Functions
- [ ] 4. Exportar dados do Lovable Cloud
- [ ] 5. Importar dados no Supabase externo
- [ ] 6. Reconfigurar Evolution API webhook
- [ ] 7. Reconfigurar Stripe webhook
- [ ] 8. Reconfigurar Meta webhooks
- [ ] 9. Me avisar para atualizar o frontend
- [ ] 10. Testar login/cadastro (usuários precisam resetar senha)
- [ ] 11. Testar recebimento de mensagens WhatsApp
- [ ] 12. Testar envio de mensagens

---

## Arquivos Técnicos

**Migrations a aplicar (em ordem):**
1. `20260114023229_remix_migration_from_pg_dump.sql` - Schema principal
2. `20260115003048_*.sql` - Realtime
3. `20260115021012_*.sql` - Correção RLS
4. `20260115224858_*.sql` - API Keys
5. `20260117223524_*.sql` - Índices performance
6. `20260117223555_*.sql` - View performance
7. `20260121183253_*.sql` - Push notifications
8. `20260122123429_*.sql` - Agente IA conexão

---

## Próximos Passos

Quando você tiver completado as etapas 1 a 5, me avise que eu faço a etapa 6 (atualizar o frontend) para seu sistema apontar para o novo Supabase.

**Tempo estimado:** 2-4 horas para migração completa (depende do volume de dados)
