import { useState, useEffect } from 'react';
import { Calendar, Clock, X, RefreshCw, Check, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface FollowupAgendado {
  id: string;
  data_agendada: string;
  motivo: string | null;
  status: string;
  criado_por: string | null;
  created_at: string;
  enviado_em: string | null;
  mensagem_enviada: string | null;
}

interface FollowupsAgendadosSectionProps {
  contatoId: string;
}

export function FollowupsAgendadosSection({ contatoId }: FollowupsAgendadosSectionProps) {
  const [followups, setFollowups] = useState<FollowupAgendado[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [showCancelados, setShowCancelados] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const fetchFollowups = async () => {
    try {
      const { data, error } = await supabase
        .from('followups_agendados')
        .select('id, data_agendada, motivo, status, criado_por, created_at, enviado_em, mensagem_enviada')
        .eq('contato_id', contatoId)
        .order('data_agendada', { ascending: false })
        .limit(20);

      if (error) throw error;
      setFollowups(data || []);
    } catch (error) {
      console.error('Erro ao buscar follow-ups:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFollowups();

    const channel = supabase
      .channel(`followups-${contatoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'followups_agendados',
          filter: `contato_id=eq.${contatoId}`
        },
        () => {
          fetchFollowups();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contatoId]);

  const handleCancelar = async () => {
    if (!cancelarId) return;
    
    setCancelando(true);
    try {
      const { error } = await supabase
        .from('followups_agendados')
        .update({ status: 'cancelado' })
        .eq('id', cancelarId);

      if (error) throw error;
      
      toast.success('Follow-up cancelado');
      fetchFollowups();
    } catch (error) {
      console.error('Erro ao cancelar follow-up:', error);
      toast.error('Erro ao cancelar follow-up');
    } finally {
      setCancelando(false);
      setCancelarId(null);
    }
  };

  const pendentes = followups.filter(f => f.status === 'pendente');
  const enviados = followups.filter(f => f.status === 'enviado');
  const cancelados = followups.filter(f => f.status === 'cancelado');

  if (loading) {
    return (
      <div className="mt-4 bg-card rounded-2xl border border-border shadow-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-foreground">Follow-ups</span>
        </div>
        <div className="flex items-center justify-center py-4">
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="mt-4 bg-card rounded-2xl border border-border shadow-lg p-4">
          <CollapsibleTrigger className="flex items-center justify-between w-full cursor-pointer hover:bg-muted/50 rounded -m-2 p-2 transition-colors">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold text-foreground">Follow-ups</span>
            </div>
            <div className="flex items-center gap-2">
              {followups.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground rounded-full">
                  {followups.length} total
                </span>
              )}
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            {followups.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3 mt-2">
                Nenhum follow-up agendado
              </p>
            ) : (
              <div className="space-y-3 mt-3">
                {/* Pendentes */}
                {pendentes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                        Pendentes ({pendentes.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {pendentes.map((followup) => (
                        <FollowupCard 
                          key={followup.id} 
                          followup={followup} 
                          onCancel={() => setCancelarId(followup.id)} 
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Enviados */}
                {enviados.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                        Enviados ({enviados.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {enviados.map((followup) => (
                        <FollowupCard key={followup.id} followup={followup} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Cancelados - Colapsado */}
                {cancelados.length > 0 && (
                  <Collapsible open={showCancelados} onOpenChange={setShowCancelados}>
                    <CollapsibleTrigger className="flex items-center gap-1.5 w-full hover:bg-muted/50 rounded py-1 -mx-1 px-1 transition-colors">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        Cancelados ({cancelados.length})
                      </span>
                      {showCancelados ? (
                        <ChevronUp className="h-3 w-3 text-muted-foreground ml-auto" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-2 mt-2">
                        {cancelados.map((followup) => (
                          <FollowupCard key={followup.id} followup={followup} />
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>

      <AlertDialog open={!!cancelarId} onOpenChange={(open) => !open && setCancelarId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Follow-up?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O follow-up não será enviado automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancelar}
              disabled={cancelando}
              className="bg-red-500 hover:bg-red-600"
            >
              {cancelando ? 'Cancelando...' : 'Cancelar Follow-up'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface FollowupCardProps {
  followup: FollowupAgendado;
  onCancel?: () => void;
}

function FollowupCard({ followup, onCancel }: FollowupCardProps) {
  const dataAgendada = new Date(followup.data_agendada);
  const agora = new Date();
  const isPendente = followup.status === 'pendente';
  const isEnviado = followup.status === 'enviado';
  const isCancelado = followup.status === 'cancelado';
  const isAtrasado = isPendente && dataAgendada < agora;

  const getBgClass = () => {
    if (isCancelado) return 'bg-muted/50 border-border opacity-60';
    if (isEnviado) return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
    if (isAtrasado) return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
  };

  const getIconColor = () => {
    if (isCancelado) return 'text-muted-foreground';
    if (isEnviado) return 'text-emerald-500';
    if (isAtrasado) return 'text-red-500';
    return 'text-amber-500';
  };

  const getTextColor = () => {
    if (isCancelado) return 'text-muted-foreground';
    if (isEnviado) return 'text-emerald-700 dark:text-emerald-300';
    if (isAtrasado) return 'text-red-700 dark:text-red-300';
    return 'text-amber-700 dark:text-amber-300';
  };

  return (
    <div className={`p-3 rounded-xl border transition-colors ${getBgClass()}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {isEnviado ? (
              <Check className={`h-3.5 w-3.5 ${getIconColor()}`} />
            ) : (
              <Clock className={`h-3.5 w-3.5 ${getIconColor()}`} />
            )}
            <span className={`text-sm font-medium ${getTextColor()}`}>
              {format(dataAgendada, "dd/MM 'às' HH:mm", { locale: ptBR })}
            </span>
            {isAtrasado && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-600 dark:text-red-400 rounded">
                Atrasado
              </span>
            )}
            {isEnviado && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded flex items-center gap-0.5">
                <Send className="h-2.5 w-2.5" />
                Enviado
              </span>
            )}
            {isCancelado && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground rounded">
                Cancelado
              </span>
            )}
          </div>
          
          {followup.motivo && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {followup.motivo}
            </p>
          )}

          {isEnviado && followup.enviado_em && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
              📤 Enviado em {format(new Date(followup.enviado_em), "dd/MM 'às' HH:mm", { locale: ptBR })}
            </p>
          )}

          {isEnviado && followup.mensagem_enviada && (
            <p className="text-[10px] text-muted-foreground mt-1 italic line-clamp-1">
              "{followup.mensagem_enviada}"
            </p>
          )}
          
          <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            {followup.criado_por === 'agente_ia' ? '🤖 Criado pelo agente' : '👤 Criado manualmente'}
          </p>
        </div>
        
        {isPendente && onCancel && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-red-100 dark:hover:bg-red-900/30"
            onClick={onCancel}
          >
            <X className="h-4 w-4 text-red-500" />
          </Button>
        )}
      </div>
    </div>
  );
}
