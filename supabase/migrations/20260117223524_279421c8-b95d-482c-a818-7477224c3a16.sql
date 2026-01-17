
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
