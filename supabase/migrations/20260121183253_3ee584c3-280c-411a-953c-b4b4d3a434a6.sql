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