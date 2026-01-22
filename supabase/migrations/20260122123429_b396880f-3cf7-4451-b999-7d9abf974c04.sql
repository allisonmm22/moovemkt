-- Adicionar coluna para vincular agente IA à conexão WhatsApp
ALTER TABLE conexoes_whatsapp 
ADD COLUMN agente_ia_id UUID REFERENCES agent_ia(id) ON DELETE SET NULL;

-- Comentário explicativo
COMMENT ON COLUMN conexoes_whatsapp.agente_ia_id IS 
  'Agente IA vinculado a esta conexão. Quando uma mensagem chega neste número, este agente responde.';