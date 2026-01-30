# 📋 Guia Completo de Migração para Supabase Externo

> **Projeto Destino:** `vgesneiogwomqxwhkdvn`  
> **URL:** `https://vgesneiogwomqxwhkdvn.supabase.co`

---

## 📑 Índice

1. [Script SQL Consolidado](#1-script-sql-consolidado)
2. [Comandos para Deploy das Edge Functions](#2-comandos-para-deploy-das-edge-functions)
3. [Lista de Secrets Necessários](#3-lista-de-secrets-necessários)
4. [Checklist de Webhooks](#4-checklist-de-webhooks)
5. [Ordem de Importação de Dados](#5-ordem-de-importação-de-dados)

---

## 1. Script SQL Consolidado

### Passo 1: Executar no SQL Editor do Supabase

Acesse: `https://supabase.com/dashboard/project/vgesneiogwomqxwhkdvn/sql/new`

### Migração 1: Schema Principal (execute primeiro)

O arquivo está em: `supabase/migrations/20260114023229_remix_migration_from_pg_dump.sql`

**Este arquivo contém:**
- Extensões necessárias (pg_cron, pg_graphql, pg_net, etc.)
- 6 tipos ENUM (app_role, direcao_mensagem, status_conexao, etc.)
- 6 funções auxiliares (get_user_conta_id, is_super_admin, etc.)
- 30+ tabelas com seus constraints
- 50+ índices de performance
- 25+ triggers para updated_at
- 100+ políticas RLS

### Migração 2: Realtime

```sql
-- Habilitar REPLICA IDENTITY FULL para capturar todas as colunas nas mudanças
ALTER TABLE public.mensagens REPLICA IDENTITY FULL;
ALTER TABLE public.conversas REPLICA IDENTITY FULL;

-- Adicionar tabelas à publicação supabase_realtime para eventos em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversas;
```

### Migração 3: Correção RLS para Service Role

```sql
-- =====================================================
-- CORREÇÃO DE SEGURANÇA: Políticas RLS Permissivas
-- =====================================================

-- 1. FOLLOWUPS_AGENDADOS
DROP POLICY IF EXISTS "Service role pode gerenciar followups" ON public.followups_agendados;

CREATE POLICY "Service role pode gerenciar followups"
ON public.followups_agendados
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Usuários podem ver followups da sua conta"
ON public.followups_agendados
FOR SELECT
TO authenticated
USING (conta_id = public.get_user_conta_id());

CREATE POLICY "Usuários podem criar followups da sua conta"
ON public.followups_agendados
FOR INSERT
TO authenticated
WITH CHECK (conta_id = public.get_user_conta_id());

CREATE POLICY "Usuários podem atualizar followups da sua conta"
ON public.followups_agendados
FOR UPDATE
TO authenticated
USING (conta_id = public.get_user_conta_id());

CREATE POLICY "Usuários podem deletar followups da sua conta"
ON public.followups_agendados
FOR DELETE
TO authenticated
USING (conta_id = public.get_user_conta_id());

-- 2. LOGS_ATIVIDADE
DROP POLICY IF EXISTS "Service role pode inserir logs" ON public.logs_atividade;

CREATE POLICY "Service role pode inserir logs"
ON public.logs_atividade
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Usuários podem inserir logs da sua conta"
ON public.logs_atividade
FOR INSERT
TO authenticated
WITH CHECK (conta_id = public.get_user_conta_id());

-- 3. MENSAGENS_PROCESSADAS
DROP POLICY IF EXISTS "Service role pode gerenciar mensagens processadas" ON public.mensagens_processadas;

CREATE POLICY "Service role pode gerenciar mensagens processadas"
ON public.mensagens_processadas
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. RESPOSTAS_PENDENTES
DROP POLICY IF EXISTS "Service role pode gerenciar respostas pendentes" ON public.respostas_pendentes;

CREATE POLICY "Service role pode gerenciar respostas pendentes"
ON public.respostas_pendentes
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. USO_TOKENS
DROP POLICY IF EXISTS "Service role pode inserir tokens" ON public.uso_tokens;

CREATE POLICY "Service role pode inserir tokens"
ON public.uso_tokens
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Usuários podem ver uso de tokens da sua conta"
ON public.uso_tokens
FOR SELECT
TO authenticated
USING (conta_id = public.get_user_conta_id());
```

### Migração 4: Tabela API Keys

```sql
-- Tabela para armazenar API Keys para integrações externas
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id UUID NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT 'API Key Principal',
  key TEXT NOT NULL UNIQUE,
  ativo BOOLEAN DEFAULT true,
  ultimo_uso TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_api_keys_conta_id ON public.api_keys(conta_id);
CREATE INDEX idx_api_keys_key ON public.api_keys(key);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários podem ver API keys da sua conta"
  ON public.api_keys FOR SELECT
  USING (conta_id = public.get_user_conta_id());

CREATE POLICY "Usuários podem criar API keys na sua conta"
  ON public.api_keys FOR INSERT
  WITH CHECK (conta_id = public.get_user_conta_id());

CREATE POLICY "Usuários podem atualizar API keys da sua conta"
  ON public.api_keys FOR UPDATE
  USING (conta_id = public.get_user_conta_id());

CREATE POLICY "Usuários podem deletar API keys da sua conta"
  ON public.api_keys FOR DELETE
  USING (conta_id = public.get_user_conta_id());

-- Trigger para atualizar updated_at
CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

### Migração 5: Índices de Performance + Tabela Arquivo

```sql
-- =============================================
-- FASE 1: ÍNDICES DE PERFORMANCE
-- =============================================

-- Índices para Mensagens
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa_created_desc 
ON mensagens (conversa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mensagens_conversa_ativa 
ON mensagens (conversa_id, created_at DESC) 
WHERE deletada = false;

CREATE INDEX IF NOT EXISTS idx_mensagens_direcao_created 
ON mensagens (conversa_id, direcao, created_at DESC);

-- Índices para Conversas
CREATE INDEX IF NOT EXISTS idx_conversas_conta_status_ultima 
ON conversas (conta_id, status, ultima_mensagem_at DESC) 
WHERE arquivada = false;

CREATE INDEX IF NOT EXISTS idx_conversas_atendente 
ON conversas (atendente_id, status) 
WHERE atendente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversas_conexao_contato 
ON conversas (conexao_id, contato_id);

-- Índices para Contatos
CREATE INDEX IF NOT EXISTS idx_contatos_conta_telefone_lower 
ON contatos (conta_id, lower(telefone));

CREATE INDEX IF NOT EXISTS idx_contatos_grupo_jid 
ON contatos (grupo_jid) 
WHERE grupo_jid IS NOT NULL;

-- Índices para Follow-ups e Agendamentos
CREATE INDEX IF NOT EXISTS idx_followups_agendados_pendentes 
ON followups_agendados (data_agendada, status) 
WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_agendamentos_proximos 
ON agendamentos (data_inicio, conta_id) 
WHERE concluido = false;

-- =============================================
-- FASE 2: OTIMIZAÇÃO RLS - Adicionar conta_id em mensagens
-- =============================================

-- 1. Adicionar coluna conta_id em mensagens
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS conta_id uuid REFERENCES contas(id);

-- 2. Criar índice para a nova coluna
CREATE INDEX IF NOT EXISTS idx_mensagens_conta_id 
ON mensagens (conta_id);

-- 3. Criar trigger para preencher automaticamente
CREATE OR REPLACE FUNCTION public.set_mensagem_conta_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.conta_id IS NULL THEN
    SELECT conta_id INTO NEW.conta_id 
    FROM conversas 
    WHERE id = NEW.conversa_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_mensagem_conta_id ON mensagens;
CREATE TRIGGER trg_set_mensagem_conta_id
BEFORE INSERT ON mensagens
FOR EACH ROW EXECUTE FUNCTION public.set_mensagem_conta_id();

-- =============================================
-- FASE 3: TABELA DE ARQUIVO DE MENSAGENS
-- =============================================

CREATE TABLE IF NOT EXISTS mensagens_arquivo (
  id uuid PRIMARY KEY,
  conversa_id uuid NOT NULL,
  contato_id uuid,
  usuario_id uuid,
  conta_id uuid,
  conteudo text NOT NULL,
  direcao text NOT NULL,
  tipo text,
  media_url text,
  metadata jsonb,
  lida boolean DEFAULT false,
  enviada_por_ia boolean DEFAULT false,
  enviada_por_dispositivo boolean DEFAULT false,
  deletada boolean DEFAULT false,
  deletada_em timestamp with time zone,
  deletada_por uuid,
  created_at timestamp with time zone NOT NULL,
  arquivada_em timestamp with time zone DEFAULT now()
);

-- Índices para consulta histórica
CREATE INDEX IF NOT EXISTS idx_mensagens_arquivo_conversa 
ON mensagens_arquivo (conversa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mensagens_arquivo_conta 
ON mensagens_arquivo (conta_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mensagens_arquivo_created 
ON mensagens_arquivo (created_at DESC);

-- RLS para mensagens_arquivo
ALTER TABLE mensagens_arquivo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios podem ver mensagens arquivadas da conta" ON mensagens_arquivo;
CREATE POLICY "Usuarios podem ver mensagens arquivadas da conta" 
ON mensagens_arquivo FOR SELECT 
USING (conta_id = get_user_conta_id());

-- =============================================
-- FASE 4: TABELA DE HISTÓRICO DE USO
-- =============================================

CREATE TABLE IF NOT EXISTS uso_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  data date NOT NULL,
  mensagens_enviadas integer DEFAULT 0,
  mensagens_recebidas integer DEFAULT 0,
  usuarios_ativos integer DEFAULT 0,
  conversas_ativas integer DEFAULT 0,
  leads_novos integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(conta_id, data)
);

-- RLS
ALTER TABLE uso_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios podem ver historico da conta" ON uso_historico;
CREATE POLICY "Usuarios podem ver historico da conta" 
ON uso_historico FOR SELECT 
USING (conta_id = get_user_conta_id());

DROP POLICY IF EXISTS "Super admin pode ver todo historico" ON uso_historico;
CREATE POLICY "Super admin pode ver todo historico" 
ON uso_historico FOR SELECT 
USING (is_super_admin());

-- Índices
CREATE INDEX IF NOT EXISTS idx_uso_historico_conta_data 
ON uso_historico (conta_id, data DESC);

CREATE INDEX IF NOT EXISTS idx_uso_historico_data 
ON uso_historico (data DESC);

-- =============================================
-- FASE 5: VIEW DE PERFORMANCE
-- =============================================

CREATE OR REPLACE VIEW v_performance_conta AS
SELECT 
  c.id as conta_id,
  c.nome as conta_nome,
  c.ativo,
  p.nome as plano_nome,
  p.limite_mensagens_mes,
  (SELECT COUNT(*) FROM usuarios WHERE conta_id = c.id) as total_usuarios,
  (SELECT COUNT(*) FROM conversas WHERE conta_id = c.id AND status = 'em_atendimento') as conversas_ativas,
  (SELECT COUNT(*) FROM conversas WHERE conta_id = c.id AND arquivada = false) as conversas_total,
  (SELECT COUNT(*) FROM contatos WHERE conta_id = c.id) as total_contatos
FROM contas c
LEFT JOIN planos p ON c.plano_id = p.id
WHERE c.ativo = true;

-- Grant access to authenticated users
GRANT SELECT ON v_performance_conta TO authenticated;
```

### Migração 6: Correção View Performance

```sql
-- Corrigir view de performance com SECURITY INVOKER (padrão)
DROP VIEW IF EXISTS v_performance_conta;

CREATE VIEW v_performance_conta 
WITH (security_invoker = true) AS
SELECT 
  c.id as conta_id,
  c.nome as conta_nome,
  c.ativo,
  p.nome as plano_nome,
  p.limite_mensagens_mes,
  (SELECT COUNT(*) FROM usuarios WHERE conta_id = c.id) as total_usuarios,
  (SELECT COUNT(*) FROM conversas WHERE conta_id = c.id AND status = 'em_atendimento') as conversas_ativas,
  (SELECT COUNT(*) FROM conversas WHERE conta_id = c.id AND arquivada = false) as conversas_total,
  (SELECT COUNT(*) FROM contatos WHERE conta_id = c.id) as total_contatos
FROM contas c
LEFT JOIN planos p ON c.plano_id = p.id
WHERE c.ativo = true;

GRANT SELECT ON v_performance_conta TO authenticated;

-- Preencher conta_id das mensagens existentes (em lotes para não travar)
UPDATE mensagens m 
SET conta_id = c.conta_id 
FROM conversas c 
WHERE m.conversa_id = c.id AND m.conta_id IS NULL;
```

### Migração 7: Push Notifications

```sql
-- Tabela para armazenar subscriptions de push notifications
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL,
  conta_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(usuario_id, endpoint)
);

-- Índices para busca rápida
CREATE INDEX idx_push_subscriptions_conta_id ON public.push_subscriptions(conta_id);
CREATE INDEX idx_push_subscriptions_usuario_id ON public.push_subscriptions(usuario_id);

-- Habilitar RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuarios podem ver suas subscriptions" 
ON public.push_subscriptions 
FOR SELECT 
USING (usuario_id = get_current_usuario_id());

CREATE POLICY "Usuarios podem criar suas subscriptions" 
ON public.push_subscriptions 
FOR INSERT 
WITH CHECK (usuario_id = get_current_usuario_id() AND conta_id = get_user_conta_id());

CREATE POLICY "Usuarios podem deletar suas subscriptions" 
ON public.push_subscriptions 
FOR DELETE 
USING (usuario_id = get_current_usuario_id());

CREATE POLICY "Service role pode gerenciar todas subscriptions" 
ON public.push_subscriptions 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_push_subscriptions_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
```

### Migração 8: Agente IA Conexão

```sql
-- Adicionar coluna para vincular agente IA à conexão WhatsApp
ALTER TABLE conexoes_whatsapp 
ADD COLUMN agente_ia_id UUID REFERENCES agent_ia(id) ON DELETE SET NULL;

-- Comentário explicativo
COMMENT ON COLUMN conexoes_whatsapp.agente_ia_id IS 
  'Agente IA vinculado a esta conexão. Quando uma mensagem chega neste número, este agente responde.';
```

### Migração 9: Criar Storage Bucket

```sql
-- Criar bucket para mídia do WhatsApp
INSERT INTO storage.buckets (id, name, public) 
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

-- Política para leitura pública
CREATE POLICY "Mídia pública para leitura" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'whatsapp-media');

-- Política para upload por service_role
CREATE POLICY "Service role pode fazer upload" 
ON storage.objects FOR INSERT 
TO service_role
WITH CHECK (bucket_id = 'whatsapp-media');
```

---

## 2. Comandos para Deploy das Edge Functions

### Pré-requisitos

```bash
# Instalar Supabase CLI
npm install -g supabase

# Fazer login
supabase login

# Linkar ao projeto
supabase link --project-ref vgesneiogwomqxwhkdvn
```

### Deploy de Todas as Funções

```bash
# Deploy de todas as funções de uma vez
supabase functions deploy --project-ref vgesneiogwomqxwhkdvn
```

### Deploy Individual (se necessário)

```bash
# WhatsApp/Evolution
supabase functions deploy whatsapp-webhook --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy evolution-connect --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy evolution-connection-status --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy evolution-create-instance --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy evolution-create-instance-instagram --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy evolution-delete-instance --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy evolution-disconnect --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy evolution-fetch-messages --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy evolution-set-webhook --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy enviar-mensagem --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy download-media --project-ref vgesneiogwomqxwhkdvn

# IA e Processamento
supabase functions deploy ai-responder --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy analisar-imagem --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy processar-resposta-agora --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy processar-respostas-pendentes --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy resumir-conversa --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy transcrever-audio --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy extrair-texto-pdf --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy executar-acao --project-ref vgesneiogwomqxwhkdvn

# Meta/Instagram
supabase functions deploy meta-configure-webhook --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy meta-download-media --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy meta-get-templates --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy meta-send-message --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy meta-verify-webhook --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy instagram-connect --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy instagram-webhook --project-ref vgesneiogwomqxwhkdvn

# Follow-ups e Lembretes
supabase functions deploy processar-followups --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy processar-followups-agendados --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy processar-lembretes --project-ref vgesneiogwomqxwhkdvn

# Google Calendar
supabase functions deploy google-calendar-auth --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy google-calendar-callback --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy google-calendar-refresh --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy google-calendar-actions --project-ref vgesneiogwomqxwhkdvn

# Stripe
supabase functions deploy stripe-checkout --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy stripe-customer-portal --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy stripe-test-connection --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy stripe-webhook --project-ref vgesneiogwomqxwhkdvn

# Autenticação e Usuários
supabase functions deploy signup-completo --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy reset-user-password --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy bootstrap-super-admin --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy criar-conta-admin --project-ref vgesneiogwomqxwhkdvn

# Administração
supabase functions deploy desativar-conta --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy validar-limite-plano --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy verificar-limites-plano --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy consolidar-uso-diario --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy arquivar-mensagens-antigas --project-ref vgesneiogwomqxwhkdvn

# Outros
supabase functions deploy api-externa --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy deletar-mensagem --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy registrar-log --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy send-push-notification --project-ref vgesneiogwomqxwhkdvn
supabase functions deploy transferir-atendimento --project-ref vgesneiogwomqxwhkdvn
```

### Lista Completa das 51 Edge Functions

| # | Nome | Categoria |
|---|------|-----------|
| 1 | ai-responder | IA |
| 2 | analisar-imagem | IA |
| 3 | api-externa | API |
| 4 | arquivar-mensagens-antigas | Admin |
| 5 | bootstrap-super-admin | Auth |
| 6 | consolidar-uso-diario | Admin |
| 7 | criar-conta-admin | Auth |
| 8 | deletar-mensagem | Mensagens |
| 9 | desativar-conta | Admin |
| 10 | download-media | Mídia |
| 11 | enviar-mensagem | Mensagens |
| 12 | evolution-connect | WhatsApp |
| 13 | evolution-connection-status | WhatsApp |
| 14 | evolution-create-instance | WhatsApp |
| 15 | evolution-create-instance-instagram | Instagram |
| 16 | evolution-delete-instance | WhatsApp |
| 17 | evolution-disconnect | WhatsApp |
| 18 | evolution-fetch-messages | WhatsApp |
| 19 | evolution-set-webhook | WhatsApp |
| 20 | executar-acao | IA |
| 21 | extrair-texto-pdf | IA |
| 22 | google-calendar-actions | Calendar |
| 23 | google-calendar-auth | Calendar |
| 24 | google-calendar-callback | Calendar |
| 25 | google-calendar-refresh | Calendar |
| 26 | instagram-connect | Instagram |
| 27 | instagram-webhook | Instagram |
| 28 | meta-configure-webhook | Meta |
| 29 | meta-download-media | Meta |
| 30 | meta-get-templates | Meta |
| 31 | meta-send-message | Meta |
| 32 | meta-verify-webhook | Meta |
| 33 | processar-followups | Follow-up |
| 34 | processar-followups-agendados | Follow-up |
| 35 | processar-lembretes | Lembretes |
| 36 | processar-resposta-agora | IA |
| 37 | processar-respostas-pendentes | IA |
| 38 | registrar-log | Log |
| 39 | reset-user-password | Auth |
| 40 | resumir-conversa | IA |
| 41 | send-push-notification | Notificações |
| 42 | signup-completo | Auth |
| 43 | stripe-checkout | Pagamento |
| 44 | stripe-customer-portal | Pagamento |
| 45 | stripe-test-connection | Pagamento |
| 46 | stripe-webhook | Pagamento |
| 47 | transcrever-audio | IA |
| 48 | transferir-atendimento | Atendimento |
| 49 | validar-limite-plano | Planos |
| 50 | verificar-limites-plano | Planos |
| 51 | whatsapp-webhook | WhatsApp |

---

## 3. Lista de Secrets Necessários

### Comandos para Configurar Secrets

```bash
# ========================================
# OBRIGATÓRIOS - WhatsApp/Evolution API
# ========================================
supabase secrets set EVOLUTION_API_KEY="sua_chave_evolution" --project-ref vgesneiogwomqxwhkdvn

# ========================================
# STORAGE EXTERNO (se usar storage separado)
# ========================================
supabase secrets set EXTERNAL_SUPABASE_URL="https://supabase.cognityx.com.br" --project-ref vgesneiogwomqxwhkdvn
supabase secrets set EXTERNAL_SUPABASE_ANON_KEY="sua_anon_key_externa" --project-ref vgesneiogwomqxwhkdvn
supabase secrets set EXTERNAL_SUPABASE_SERVICE_ROLE_KEY="sua_service_role_externa" --project-ref vgesneiogwomqxwhkdvn

# ========================================
# GOOGLE CALENDAR
# ========================================
supabase secrets set GOOGLE_CLIENT_ID="seu_client_id.apps.googleusercontent.com" --project-ref vgesneiogwomqxwhkdvn
supabase secrets set GOOGLE_CLIENT_SECRET="seu_client_secret" --project-ref vgesneiogwomqxwhkdvn

# ========================================
# META (WhatsApp Business API / Instagram)
# ========================================
supabase secrets set META_APP_ID="seu_app_id_meta" --project-ref vgesneiogwomqxwhkdvn
supabase secrets set META_APP_SECRET="seu_app_secret_meta" --project-ref vgesneiogwomqxwhkdvn

# ========================================
# STRIPE (Pagamentos)
# ========================================
supabase secrets set STRIPE_SECRET_KEY="sk_live_..." --project-ref vgesneiogwomqxwhkdvn

# ========================================
# PUSH NOTIFICATIONS (VAPID)
# ========================================
# Gerar novas chaves: npx web-push generate-vapid-keys
supabase secrets set VAPID_PUBLIC_KEY="sua_vapid_public_key" --project-ref vgesneiogwomqxwhkdvn
supabase secrets set VAPID_PRIVATE_KEY="sua_vapid_private_key" --project-ref vgesneiogwomqxwhkdvn
```

### Tabela de Secrets

| Secret | Onde Encontrar | Usado Por |
|--------|---------------|-----------|
| `EVOLUTION_API_KEY` | Painel Evolution API | whatsapp-webhook, evolution-*, enviar-mensagem |
| `EXTERNAL_SUPABASE_URL` | Seu storage externo | download-media, meta-download-media |
| `EXTERNAL_SUPABASE_ANON_KEY` | Seu storage externo | download-media, meta-download-media |
| `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` | Seu storage externo | download-media |
| `GOOGLE_CLIENT_ID` | Google Cloud Console | google-calendar-* |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console | google-calendar-* |
| `META_APP_ID` | Meta Business Suite | meta-*, instagram-* |
| `META_APP_SECRET` | Meta Business Suite | meta-*, instagram-* |
| `STRIPE_SECRET_KEY` | Dashboard Stripe | stripe-* |
| `VAPID_PUBLIC_KEY` | Gerar com web-push | send-push-notification |
| `VAPID_PRIVATE_KEY` | Gerar com web-push | send-push-notification |

### Gerar Chaves VAPID

```bash
# Instalar web-push
npm install -g web-push

# Gerar par de chaves
web-push generate-vapid-keys
```

---

## 4. Checklist de Webhooks

### Evolution API

**Dashboard Evolution → Configurações da Instância → Webhook**

| Configuração | Valor |
|--------------|-------|
| URL | `https://vgesneiogwomqxwhkdvn.supabase.co/functions/v1/whatsapp-webhook` |
| Eventos | `CONNECTION_UPDATE`, `STATUS_INSTANCE`, `MESSAGES_UPSERT` |

### Stripe

**Dashboard Stripe → Developers → Webhooks**

| Configuração | Valor |
|--------------|-------|
| Endpoint URL | `https://vgesneiogwomqxwhkdvn.supabase.co/functions/v1/stripe-webhook` |
| Eventos | `checkout.session.completed`, `customer.subscription.*`, `invoice.*` |

### Meta Business (WhatsApp Cloud API)

**Meta Business Suite → App Settings → Webhooks**

| Configuração | Valor |
|--------------|-------|
| Callback URL | `https://vgesneiogwomqxwhkdvn.supabase.co/functions/v1/whatsapp-webhook` |
| Verify Token | (configurado em `meta_webhook_verify_token` da conexão) |
| Campos | `messages`, `messaging_postbacks` |

### Instagram

**Meta Business Suite → Instagram Settings → Webhooks**

| Configuração | Valor |
|--------------|-------|
| Callback URL | `https://vgesneiogwomqxwhkdvn.supabase.co/functions/v1/instagram-webhook` |
| Campos | `messages`, `messaging_postbacks` |

### Google Calendar (OAuth Redirect)

**Google Cloud Console → APIs & Services → Credentials**

| Configuração | Valor |
|--------------|-------|
| Authorized redirect URIs | `https://vgesneiogwomqxwhkdvn.supabase.co/functions/v1/google-calendar-callback` |

### Mapeamento de URLs (Antiga → Nova)

| Serviço | URL Antiga | URL Nova |
|---------|-----------|----------|
| Evolution API | `https://mfaxpkfpackofxklccyl.supabase.co/functions/v1/whatsapp-webhook` | `https://vgesneiogwomqxwhkdvn.supabase.co/functions/v1/whatsapp-webhook` |
| Stripe | `https://mfaxpkfpackofxklccyl.supabase.co/functions/v1/stripe-webhook` | `https://vgesneiogwomqxwhkdvn.supabase.co/functions/v1/stripe-webhook` |
| Meta WhatsApp | `https://mfaxpkfpackofxklccyl.supabase.co/functions/v1/whatsapp-webhook` | `https://vgesneiogwomqxwhkdvn.supabase.co/functions/v1/whatsapp-webhook` |
| Instagram | `https://mfaxpkfpackofxklccyl.supabase.co/functions/v1/instagram-webhook` | `https://vgesneiogwomqxwhkdvn.supabase.co/functions/v1/instagram-webhook` |
| Google Calendar | `https://mfaxpkfpackofxklccyl.supabase.co/functions/v1/google-calendar-callback` | `https://vgesneiogwomqxwhkdvn.supabase.co/functions/v1/google-calendar-callback` |

---

## 5. Ordem de Importação de Dados

### Exportar do Lovable Cloud

Use o Table Editor ou SQL Editor para exportar cada tabela em CSV/JSON.

### Ordem de Importação (respeitando foreign keys)

```
1. planos (sem dependências)
2. contas (depende de: planos)
3. usuarios (depende de: contas, auth.users)
4. user_roles (depende de: auth.users)
5. agent_ia (depende de: contas)
6. agent_ia_etapas (depende de: agent_ia)
7. agent_ia_perguntas (depende de: agent_ia)
8. agent_ia_agendamento_config (depende de: agent_ia, calendarios_google)
9. agent_ia_agendamento_horarios (depende de: agent_ia_agendamento_config)
10. conexoes_whatsapp (depende de: contas, agent_ia)
11. contatos (depende de: contas)
12. conversas (depende de: contas, contatos, conexoes_whatsapp, usuarios, agent_ia)
13. mensagens (depende de: conversas, contatos, usuarios)
14. funis (depende de: contas)
15. estagios (depende de: funis)
16. negociacoes (depende de: contas, contatos, estagios, usuarios)
17. negociacao_historico (depende de: negociacoes, estagios, usuarios)
18. negociacao_notas (depende de: negociacoes, usuarios)
19. calendarios_google (depende de: contas)
20. agendamentos (depende de: contas, contatos, usuarios)
21. followup_regras (depende de: contas, agent_ia)
22. followup_enviados (depende de: followup_regras, conversas)
23. followups_agendados (depende de: contas, conversas, contatos, agent_ia)
24. lembrete_regras (depende de: contas)
25. lembrete_enviados (depende de: lembrete_regras, agendamentos, contatos)
26. tags (depende de: contas)
27. campos_personalizados_grupos (depende de: contas)
28. campos_personalizados (depende de: contas, campos_personalizados_grupos)
29. contato_campos_valores (depende de: contatos, campos_personalizados)
30. atendente_config (depende de: usuarios)
31. notificacoes (depende de: contas, usuarios)
32. logs_atividade (depende de: contas, usuarios)
33. uso_tokens (depende de: contas, conversas)
34. mensagens_processadas (depende de: contas)
35. respostas_pendentes (depende de: conversas)
36. transferencias_atendimento (depende de: conversas, usuarios)
37. configuracoes_plataforma (sem dependências - tabela global)
38. api_keys (depende de: contas)
39. push_subscriptions (depende de: usuarios, contas)
```

### ⚠️ Importante sobre Auth

Os usuários do `auth.users` **NÃO PODEM** ter suas senhas migradas (são hashes). Opções:

1. **Resetar senhas**: Peça para todos os usuários resetarem via "Esqueci minha senha"
2. **Criar novos usuários**: Use a Edge Function `signup-completo` para recriar

---

## ✅ Checklist Final

- [ ] Executar Migração 1 (Schema Principal - 3136 linhas)
- [ ] Executar Migração 2 (Realtime)
- [ ] Executar Migração 3 (Correção RLS)
- [ ] Executar Migração 4 (API Keys)
- [ ] Executar Migração 5 (Índices + Arquivo)
- [ ] Executar Migração 6 (View Performance)
- [ ] Executar Migração 7 (Push Notifications)
- [ ] Executar Migração 8 (Agente IA Conexão)
- [ ] Executar Migração 9 (Storage Bucket)
- [ ] Configurar todos os 11 Secrets
- [ ] Deploy das 51 Edge Functions
- [ ] Importar dados na ordem correta
- [ ] Atualizar webhook Evolution API
- [ ] Atualizar webhook Stripe
- [ ] Atualizar webhooks Meta
- [ ] Atualizar redirect Google Calendar
- [ ] Avisar o Lovable para atualizar o frontend
- [ ] Testar login (usuários precisam resetar senha)
- [ ] Testar recebimento de mensagens WhatsApp
- [ ] Testar envio de mensagens
- [ ] Testar pagamentos Stripe

---

## 📞 Próximo Passo

Quando você completar todas as etapas acima, me avise que eu atualizo o frontend para apontar para o novo Supabase!

**Tempo estimado:** 2-4 horas (depende do volume de dados)
