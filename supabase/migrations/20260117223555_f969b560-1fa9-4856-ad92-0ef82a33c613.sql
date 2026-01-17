
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
