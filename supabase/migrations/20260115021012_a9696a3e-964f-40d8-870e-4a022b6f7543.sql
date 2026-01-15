
-- =====================================================
-- CORREÇÃO DE SEGURANÇA: Políticas RLS Permissivas
-- =====================================================

-- 1. FOLLOWUPS_AGENDADOS
-- Remover política permissiva
DROP POLICY IF EXISTS "Service role pode gerenciar followups" ON public.followups_agendados;

-- Política para service_role (Edge Functions)
CREATE POLICY "Service role pode gerenciar followups"
ON public.followups_agendados
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Política para usuários autenticados (mesma conta)
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
