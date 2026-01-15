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