-- Habilitar REPLICA IDENTITY FULL para capturar todas as colunas nas mudanças
ALTER TABLE public.mensagens REPLICA IDENTITY FULL;
ALTER TABLE public.conversas REPLICA IDENTITY FULL;

-- Adicionar tabelas à publicação supabase_realtime para eventos em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversas;