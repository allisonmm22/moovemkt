import { supabase } from '@/integrations/supabase/client';

export type TipoLog = 
  | 'erro_etapa'           // Erro ao mover negociação de etapa
  | 'erro_transferencia'   // Erro ao transferir conversa
  | 'erro_whatsapp'        // Erro de conexão/envio WhatsApp
  | 'erro_ia'              // Erro na resposta da IA
  | 'erro_webhook'         // Erro no webhook
  | 'erro_agendamento';    // Erro ao criar/editar agendamento

interface LogOptions {
  contaId: string;
  usuarioId?: string;
  tipo: TipoLog;
  descricao: string;
  metadata?: Record<string, unknown>;
}

export async function registrarLog(options: LogOptions): Promise<void> {
  const { contaId, usuarioId, tipo, descricao, metadata } = options;
  
  try {
    await supabase.functions.invoke('registrar-log', {
      body: {
        conta_id: contaId,
        usuario_id: usuarioId,
        tipo,
        descricao,
        metadata,
      },
    });
  } catch (error) {
    // Log silenciosamente para não interferir no fluxo principal
    console.error('Erro ao registrar log de atividade:', error);
  }
}
