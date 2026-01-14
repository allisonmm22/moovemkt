import { useState, useEffect } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  lida: boolean;
  link: string | null;
  created_at: string;
}

export function NotificacoesDropdown() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const naoLidas = notificacoes.filter(n => !n.lida).length;

  useEffect(() => {
    if (usuario?.conta_id) {
      fetchNotificacoes();
      
      // Subscribe to realtime updates
      const channel = supabase
        .channel('notificacoes-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notificacoes',
          },
          () => {
            fetchNotificacoes();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [usuario?.conta_id]);

  const fetchNotificacoes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notificacoes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setNotificacoes(data || []);
    } catch (error) {
      console.error('Erro ao buscar notificações:', error);
    } finally {
      setLoading(false);
    }
  };

  const marcarComoLida = async (id: string) => {
    try {
      await supabase
        .from('notificacoes')
        .update({ lida: true })
        .eq('id', id);

      setNotificacoes(prev =>
        prev.map(n => (n.id === id ? { ...n, lida: true } : n))
      );
    } catch (error) {
      console.error('Erro ao marcar como lida:', error);
    }
  };

  const marcarTodasComoLidas = async () => {
    try {
      const idsNaoLidas = notificacoes.filter(n => !n.lida).map(n => n.id);
      if (idsNaoLidas.length === 0) return;

      await supabase
        .from('notificacoes')
        .update({ lida: true })
        .in('id', idsNaoLidas);

      setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })));
    } catch (error) {
      console.error('Erro ao marcar todas como lidas:', error);
    }
  };

  const handleNotificacaoClick = (notificacao: Notificacao) => {
    marcarComoLida(notificacao.id);
    if (notificacao.link) {
      navigate(notificacao.link);
      setOpen(false);
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'mudanca_estagio':
        return '📊';
      case 'nova_negociacao':
        return '💼';
      case 'mensagem':
        return '💬';
      default:
        return '🔔';
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
          {naoLidas > 0 ? (
            <span className="h-5 w-5 flex items-center justify-center bg-destructive text-destructive-foreground text-xs font-bold rounded-full">
              {naoLidas > 9 ? '9+' : naoLidas}
            </span>
          ) : (
            <span className="h-5 w-5 flex items-center justify-center bg-muted text-muted-foreground text-xs font-medium rounded-full">
              0
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-foreground">Notificações</h3>
          {naoLidas > 0 && (
            <button
              onClick={marcarTodasComoLidas}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Check className="h-3 w-3" />
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : notificacoes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            notificacoes.map(notificacao => (
              <button
                key={notificacao.id}
                onClick={() => handleNotificacaoClick(notificacao)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors",
                  !notificacao.lida && "bg-primary/5"
                )}
              >
                <div className="flex gap-3">
                  <span className="text-lg">{getTipoIcon(notificacao.tipo)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        "text-sm line-clamp-1",
                        !notificacao.lida ? "font-semibold text-foreground" : "text-foreground"
                      )}>
                        {notificacao.titulo}
                      </p>
                      {!notificacao.lida && (
                        <span className="h-2 w-2 bg-primary rounded-full shrink-0 mt-1.5" />
                      )}
                    </div>
                    {notificacao.mensagem && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {notificacao.mensagem}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(notificacao.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
