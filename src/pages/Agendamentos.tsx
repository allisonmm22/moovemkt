import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Calendar, Plus, Clock, Check, Loader2, ChevronLeft, ChevronRight, X, Pencil, Trash2, Video, MessageSquare, Bell, CheckCircle, AlertCircle, XCircle, RefreshCw, User } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface Agendamento {
  id: string;
  titulo: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string | null;
  concluido: boolean;
  contato_id: string | null;
  google_event_id: string | null;
  google_meet_link: string | null;
  contatos: {
    nome: string;
  } | null;
}

interface LembreteRegra {
  id: string;
  nome: string;
  minutos_antes: number;
  tipo: string;
  ativo: boolean;
}

interface LembreteEnviado {
  id: string;
  agendamento_id: string;
  regra_id: string;
  enviado_em: string;
  mensagem_enviada: string | null;
}

type LembreteStatus = 
  | { status: 'enviado'; data: string }
  | { status: 'pendente'; tempoRestante: number; dataEnvio: Date }
  | { status: 'sem_contato' }
  | { status: 'atrasado' }
  | { status: 'concluido' };

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAYS_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Helper: formatar tempo restante
const formatarTempoRestante = (ms: number): string => {
  const minutos = Math.floor(ms / 60000);
  const horas = Math.floor(minutos / 60);
  const dias = Math.floor(horas / 24);
  
  if (dias > 0) return `${dias}d ${horas % 24}h`;
  if (horas > 0) return `${horas}h ${minutos % 60}min`;
  return `${minutos}min`;
};

// Helper: calcular status do lembrete
const getLembreteStatus = (
  agendamento: Agendamento,
  regra: LembreteRegra,
  lembretesEnviados: LembreteEnviado[]
): LembreteStatus => {
  // Verificar se agendamento já foi concluído
  if (agendamento.concluido) {
    return { status: 'concluido' };
  }

  const dataAgendamento = new Date(agendamento.data_inicio);
  const dataEnvio = new Date(dataAgendamento.getTime() - regra.minutos_antes * 60 * 1000);
  const agora = new Date();
  
  // Verificar se já foi enviado
  const enviado = lembretesEnviados.find(l => 
    l.agendamento_id === agendamento.id && 
    l.regra_id === regra.id
  );
  
  if (enviado) {
    return { status: 'enviado', data: enviado.enviado_em };
  }
  
  // Verificar se tem contato
  if (!agendamento.contato_id) {
    return { status: 'sem_contato' };
  }
  
  // Verificar se está atrasado (data de envio já passou)
  if (dataEnvio < agora) {
    return { status: 'atrasado' };
  }
  
  // Calcular tempo restante
  const diffMs = dataEnvio.getTime() - agora.getTime();
  return { status: 'pendente', tempoRestante: diffMs, dataEnvio };
};

// Helper: formatar minutos em texto amigável
const formatarMinutosAntes = (minutos: number): string => {
  if (minutos >= 1440) {
    const dias = Math.floor(minutos / 1440);
    return `${dias}d antes`;
  }
  if (minutos >= 60) {
    const horas = Math.floor(minutos / 60);
    return `${horas}h antes`;
  }
  return `${minutos}min antes`;
};

interface Contato {
  id: string;
  nome: string;
  telefone: string;
}

export default function Agendamentos() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [regrasLembrete, setRegrasLembrete] = useState<LembreteRegra[]>([]);
  const [lembretesEnviados, setLembretesEnviados] = useState<LembreteEnviado[]>([]);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [gerarMeet, setGerarMeet] = useState(true);
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    data_inicio: '',
    hora_inicio: '',
    contato_id: '',
  });

  // Estados para edição
  const [editingAgendamento, setEditingAgendamento] = useState<Agendamento | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    titulo: '',
    descricao: '',
    data_inicio: '',
    hora_inicio: '',
    contato_id: '',
  });

  // Estados para exclusão
  const [deletingAgendamento, setDeletingAgendamento] = useState<Agendamento | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    if (usuario?.conta_id) {
      // Executa sincronização e depois busca agendamentos sequencialmente
      const init = async () => {
        await sincronizarGoogleCalendar();
        await fetchAgendamentos();
      };
      init();
    }
  }, [usuario, currentDate]);

  const sincronizarGoogleCalendar = async (manual = false) => {
    if (!usuario?.conta_id) return;
    
    // Evitar execuções paralelas
    if (syncing) return;
    setSyncing(true);
    
    try {
      // Buscar calendário Google ativo
      const { data: calendarios } = await supabase
        .from('calendarios_google')
        .select('id')
        .eq('conta_id', usuario.conta_id)
        .eq('ativo', true)
        .limit(1);

      if (!calendarios?.length) {
        if (manual) toast.info('Nenhum Google Calendar conectado');
        return;
      }

      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

      // Consultar eventos do Google Calendar
      const { data: googleResult, error: googleError } = await supabase.functions.invoke('google-calendar-actions', {
        body: {
          operacao: 'consultar',
          calendario_id: calendarios[0].id,
          dados: {
            data_inicio: startOfMonth.toISOString(),
            data_fim: endOfMonth.toISOString(),
          }
        }
      });

      if (googleError || !googleResult?.eventos) {
        console.error('Erro ao consultar Google Calendar:', googleError);
        if (manual) toast.error('Erro ao sincronizar com Google Calendar');
        return;
      }

      // Usar upsert para evitar duplicatas (constraint: google_event_id + conta_id)
      const eventosParaUpsert = googleResult.eventos.map((evento: any) => ({
        conta_id: usuario.conta_id,
        usuario_id: usuario.id,
        titulo: evento.titulo || 'Evento sem título',
        descricao: evento.descricao || null,
        data_inicio: evento.inicio,
        data_fim: evento.fim || evento.inicio,
        google_event_id: evento.id,
      }));

      if (eventosParaUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('agendamentos')
          .upsert(eventosParaUpsert, {
            onConflict: 'google_event_id,conta_id',
            ignoreDuplicates: false
          });

        if (upsertError) {
          console.error('Erro ao upsert agendamentos:', upsertError);
          if (manual) toast.error('Erro ao sincronizar eventos');
          return;
        }
      }

      if (manual) {
        toast.success(`${eventosParaUpsert.length} evento(s) sincronizado(s)`);
        fetchAgendamentos();
      }
    } catch (error) {
      console.error('Erro na sincronização:', error);
      if (manual) toast.error('Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const fetchAgendamentos = async () => {
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      // Buscar agendamentos
      const { data: agendamentosData, error: agendamentosError } = await supabase
        .from('agendamentos')
        .select(`*, contatos(nome)`)
        .eq('conta_id', usuario!.conta_id)
        .gte('data_inicio', startOfMonth.toISOString())
        .lte('data_inicio', endOfMonth.toISOString())
        .order('data_inicio');

      if (agendamentosError) throw agendamentosError;

      // Buscar regras de lembrete ativas
      const { data: regrasData } = await supabase
        .from('lembrete_regras')
        .select('id, nome, minutos_antes, tipo, ativo')
        .eq('conta_id', usuario!.conta_id)
        .eq('ativo', true);

      // Buscar lembretes já enviados para os agendamentos do mês
      const agendamentoIds = (agendamentosData || []).map(a => a.id);
      let lembretesData: LembreteEnviado[] = [];
      
      if (agendamentoIds.length > 0) {
        const { data } = await supabase
          .from('lembrete_enviados')
          .select('id, agendamento_id, regra_id, enviado_em, mensagem_enviada')
          .in('agendamento_id', agendamentoIds);
        lembretesData = data || [];
      }

      // Buscar contatos
      const { data: contatosData } = await supabase
        .from('contatos')
        .select('id, nome, telefone')
        .eq('conta_id', usuario!.conta_id)
        .eq('is_grupo', false)
        .order('nome');

      setAgendamentos(agendamentosData || []);
      setRegrasLembrete(regrasData || []);
      setLembretesEnviados(lembretesData);
      setContatos(contatosData || []);
    } catch (error) {
      console.error('Erro ao buscar agendamentos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAgendamento = async () => {
    if (!formData.titulo || !formData.data_inicio || !formData.hora_inicio) {
      toast.error('Preencha título, data e hora');
      return;
    }

    setActionLoading(true);
    try {
      const dataInicio = new Date(`${formData.data_inicio}T${formData.hora_inicio}`);
      const dataFim = new Date(dataInicio.getTime() + 60 * 60 * 1000); // +1 hora

      let googleEventId: string | null = null;
      let googleMeetLink: string | null = null;

      // Verificar se tem calendário Google ativo
      const { data: calendarios } = await supabase
        .from('calendarios_google')
        .select('id')
        .eq('conta_id', usuario!.conta_id)
        .eq('ativo', true)
        .limit(1);

      if (calendarios && calendarios.length > 0) {
        // Criar evento no Google Calendar com Meet
        const { data: googleResult, error: googleError } = await supabase.functions.invoke('google-calendar-actions', {
          body: {
            operacao: 'criar',
            calendario_id: calendarios[0].id,
            dados: {
              titulo: formData.titulo,
              descricao: formData.descricao || '',
              data_inicio: dataInicio.toISOString(),
              data_fim: dataFim.toISOString(),
              gerar_meet: gerarMeet,
            }
          }
        });

        if (!googleError && googleResult?.id) {
          googleEventId = googleResult.id;
          googleMeetLink = googleResult.meet_link || null;
        } else if (googleError) {
          console.error('Erro ao criar no Google Calendar:', googleError);
        }
      }

      // Salvar no banco local
      const { error } = await supabase.from('agendamentos').insert({
        conta_id: usuario!.conta_id,
        usuario_id: usuario!.id,
        titulo: formData.titulo,
        descricao: formData.descricao || null,
        data_inicio: dataInicio.toISOString(),
        data_fim: dataFim.toISOString(),
        google_event_id: googleEventId,
        google_meet_link: googleMeetLink,
        contato_id: formData.contato_id || null,
      });

      if (error) throw error;

      toast.success(googleEventId 
        ? 'Agendamento criado e sincronizado com Google Calendar!' 
        : 'Agendamento criado!'
      );
      setShowModal(false);
      setFormData({ titulo: '', descricao: '', data_inicio: '', hora_inicio: '', contato_id: '' });
      setGerarMeet(true);
      fetchAgendamentos();
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
      toast.error('Erro ao criar agendamento');
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = (agendamento: Agendamento) => {
    const dataInicio = new Date(agendamento.data_inicio);
    setEditingAgendamento(agendamento);
    setEditFormData({
      titulo: agendamento.titulo,
      descricao: agendamento.descricao || '',
      data_inicio: dataInicio.toISOString().split('T')[0],
      hora_inicio: dataInicio.toTimeString().slice(0, 5),
      contato_id: agendamento.contato_id || '',
    });
    setShowEditModal(true);
  };

  const handleUpdateAgendamento = async () => {
    if (!editingAgendamento || !editFormData.titulo || !editFormData.data_inicio || !editFormData.hora_inicio) {
      toast.error('Preencha título, data e hora');
      return;
    }

    setActionLoading(true);
    try {
      const novaDataInicio = new Date(`${editFormData.data_inicio}T${editFormData.hora_inicio}`);
      const novaDataFim = new Date(novaDataInicio.getTime() + 60 * 60 * 1000); // +1 hora

      // Atualizar no banco local
      const { error } = await supabase
        .from('agendamentos')
        .update({
          titulo: editFormData.titulo,
          descricao: editFormData.descricao || null,
          data_inicio: novaDataInicio.toISOString(),
          data_fim: novaDataFim.toISOString(),
          contato_id: editFormData.contato_id || null,
        })
        .eq('id', editingAgendamento.id);

      if (error) throw error;

      // Se tem google_event_id, sincronizar com Google Calendar
      if (editingAgendamento.google_event_id) {
        try {
          // Buscar calendário associado
          const { data: calendarios } = await supabase
            .from('calendarios_google')
            .select('id')
            .eq('conta_id', usuario!.conta_id)
            .eq('ativo', true)
            .limit(1);

          if (calendarios && calendarios.length > 0) {
            await supabase.functions.invoke('google-calendar-actions', {
              body: {
                operacao: 'reagendar',
                calendario_id: calendarios[0].id,
                dados: {
                  evento_id: editingAgendamento.google_event_id,
                  nova_data_inicio: novaDataInicio.toISOString(),
                  nova_data_fim: novaDataFim.toISOString(),
                }
              }
            });
          }
        } catch (calendarError) {
          console.error('Erro ao sincronizar com Google Calendar:', calendarError);
          // Não falhar a operação por causa do Google Calendar
        }
      }

      toast.success('Agendamento atualizado!');
      setShowEditModal(false);
      setEditingAgendamento(null);
      fetchAgendamentos();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar agendamento');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmDelete = (agendamento: Agendamento) => {
    setDeletingAgendamento(agendamento);
    setShowDeleteConfirm(true);
  };

  const handleDeleteAgendamento = async () => {
    if (!deletingAgendamento) return;

    setActionLoading(true);
    try {
      // Se tem google_event_id, deletar do Google Calendar primeiro
      if (deletingAgendamento.google_event_id) {
        try {
          // Buscar calendário associado
          const { data: calendarios } = await supabase
            .from('calendarios_google')
            .select('id')
            .eq('conta_id', usuario!.conta_id)
            .eq('ativo', true)
            .limit(1);

          if (calendarios && calendarios.length > 0) {
            await supabase.functions.invoke('google-calendar-actions', {
              body: {
                operacao: 'deletar',
                calendario_id: calendarios[0].id,
                dados: {
                  evento_id: deletingAgendamento.google_event_id
                }
              }
            });
          }
        } catch (calendarError) {
          console.error('Erro ao deletar do Google Calendar:', calendarError);
          // Não falhar a operação por causa do Google Calendar
        }
      }

      // Deletar do banco local
      const { error } = await supabase
        .from('agendamentos')
        .delete()
        .eq('id', deletingAgendamento.id);

      if (error) throw error;

      toast.success('Agendamento excluído!');
      setShowDeleteConfirm(false);
      setDeletingAgendamento(null);
      fetchAgendamentos();
    } catch (error) {
      console.error('Erro ao deletar:', error);
      toast.error('Erro ao excluir agendamento');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleConcluido = async (id: string, concluido: boolean) => {
    try {
      const { error } = await supabase
        .from('agendamentos')
        .update({ concluido: !concluido })
        .eq('id', id);

      if (error) throw error;
      fetchAgendamentos();
    } catch (error) {
      toast.error('Erro ao atualizar');
    }
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
      return newDate;
    });
    setSelectedDate(null);
  };

  const getMonthName = () => {
    return currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  // Gerar grid do calendário
  const generateCalendarGrid = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    const startDay = firstDayOfMonth.getDay();
    const daysInMonth = lastDayOfMonth.getDate();
    
    const grid: (Date | null)[] = [];
    
    // Dias do mês anterior
    const prevMonth = new Date(year, month, 0);
    for (let i = startDay - 1; i >= 0; i--) {
      grid.push(new Date(year, month - 1, prevMonth.getDate() - i));
    }
    
    // Dias do mês atual
    for (let day = 1; day <= daysInMonth; day++) {
      grid.push(new Date(year, month, day));
    }
    
    // Dias do próximo mês para completar a grade
    const remainingDays = 42 - grid.length;
    for (let day = 1; day <= remainingDays; day++) {
      grid.push(new Date(year, month + 1, day));
    }
    
    return grid;
  };

  const getAgendamentosForDate = (date: Date) => {
    return agendamentos.filter((a) => {
      const aDate = new Date(a.data_inicio);
      return (
        aDate.getDate() === date.getDate() &&
        aDate.getMonth() === date.getMonth() &&
        aDate.getFullYear() === date.getFullYear()
      );
    });
  };

  const isToday = (date: Date) => {
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth();
  };

  const isSelected = (date: Date) => {
    if (!selectedDate) return false;
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
  };

  const openNewAgendamentoModal = (prefilledDate?: Date) => {
    if (prefilledDate) {
      const dateStr = prefilledDate.toISOString().split('T')[0];
      setFormData({ ...formData, data_inicio: dateStr });
    }
    setShowModal(true);
  };

  const calendarGrid = generateCalendarGrid();
  const selectedDateAgendamentos = selectedDate ? getAgendamentosForDate(selectedDate) : [];

  return (
    <MainLayout>
      <div className="space-y-4 md:space-y-6 animate-fade-in px-4 md:px-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Agendamentos</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 hidden sm:block">
              Organize suas tarefas e compromissos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => sincronizarGoogleCalendar(true)}
              disabled={syncing}
              className="h-10 px-3 rounded-lg bg-muted text-muted-foreground font-medium flex items-center gap-2 hover:bg-muted/80 transition-colors disabled:opacity-50"
              title="Sincronizar com Google Calendar"
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
            <button
              onClick={() => openNewAgendamentoModal()}
              className="h-10 px-3 md:px-4 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span className="hidden sm:inline">Novo Agendamento</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 md:gap-6">
          {/* Calendário */}
          <div className="flex-1">
            {/* Navegação do Mês */}
            <div className="flex items-center justify-between p-3 md:p-4 rounded-t-xl bg-card border border-border border-b-0">
              <button
                onClick={() => navigateMonth('prev')}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h2 className="text-base md:text-lg font-semibold text-foreground capitalize">{getMonthName()}</h2>
              <button
                onClick={() => navigateMonth('next')}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Grid do Calendário */}
            <div className="bg-card border border-border rounded-b-xl overflow-hidden">
              {/* Cabeçalho dos dias da semana */}
              <div className="grid grid-cols-7 border-b border-border">
                {(isMobile ? WEEKDAYS_SHORT : WEEKDAYS).map((day, i) => (
                  <div
                    key={i}
                    className="py-2 md:py-3 text-center text-xs md:text-sm font-medium text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Dias do mês */}
              {loading ? (
                <div className="flex items-center justify-center h-96">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="grid grid-cols-7">
                  {calendarGrid.map((date, index) => {
                    if (!date) return <div key={index} />;
                    
                    const dayAgendamentos = getAgendamentosForDate(date);
                    const isTodayDate = isToday(date);
                    const isCurrentMonthDate = isCurrentMonth(date);
                    const isSelectedDate = isSelected(date);

                    return (
                      <div
                        key={index}
                        onClick={() => handleDayClick(date)}
                        className={cn(
                          'min-h-[60px] md:min-h-[100px] p-1 md:p-2 border-b border-r border-border cursor-pointer transition-colors hover:bg-muted/50',
                          !isCurrentMonthDate && 'bg-muted/30',
                          isSelectedDate && 'bg-primary/10 ring-2 ring-primary ring-inset',
                          isTodayDate && !isSelectedDate && 'bg-primary/5'
                        )}
                      >
                        <div className="flex items-center justify-between mb-0.5 md:mb-1">
                          <span
                            className={cn(
                              'text-xs md:text-sm font-medium w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full',
                              !isCurrentMonthDate && 'text-muted-foreground/50',
                              isTodayDate && 'bg-primary text-primary-foreground',
                              isCurrentMonthDate && !isTodayDate && 'text-foreground'
                            )}
                          >
                            {date.getDate()}
                          </span>
                          {dayAgendamentos.length > 0 && (
                            <span className="text-[10px] md:text-xs text-muted-foreground">
                              {dayAgendamentos.length}
                            </span>
                          )}
                        </div>

                        {/* Mini cards - esconder texto em mobile */}
                        {!isMobile && (
                          <div className="space-y-1">
                            {dayAgendamentos.slice(0, 2).map((a) => (
                              <div
                                key={a.id}
                                className={cn(
                                  'text-xs px-1.5 py-0.5 rounded truncate flex items-center gap-1',
                                  a.concluido
                                    ? 'bg-muted text-muted-foreground line-through'
                                    : 'bg-primary/10 text-primary'
                                )}
                              >
                                {a.google_event_id && (
                                  <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                  </svg>
                                )}
                                <span className="truncate">{a.titulo}</span>
                              </div>
                            ))}
                            {dayAgendamentos.length > 2 && (
                              <span className="text-xs text-muted-foreground pl-1">
                                +{dayAgendamentos.length - 2} mais
                              </span>
                            )}
                          </div>
                        )}
                        {/* Indicadores em mobile */}
                        {isMobile && dayAgendamentos.length > 0 && (
                          <div className="flex gap-0.5 justify-center mt-1">
                            {dayAgendamentos.slice(0, 3).map((_, i) => (
                              <div key={i} className="w-1 h-1 rounded-full bg-primary" />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar de Detalhes do Dia - Desktop */}
          {!isMobile && (
            <div className="w-80 flex-shrink-0">
              <div className="bg-card border border-border rounded-xl p-4 sticky top-4">
                {selectedDate ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-foreground">
                          {selectedDate.toLocaleDateString('pt-BR', {
                            weekday: 'long',
                            day: 'numeric',
                          })}
                        </h3>
                        <p className="text-sm text-muted-foreground capitalize">
                          {selectedDate.toLocaleDateString('pt-BR', {
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedDate(null)}
                        className="p-1 rounded hover:bg-muted transition-colors"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>

                  {selectedDateAgendamentos.length === 0 ? (
                    <div className="text-center py-8">
                      <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground mb-4">
                        Nenhum agendamento neste dia
                      </p>
                      <button
                        onClick={() => openNewAgendamentoModal(selectedDate)}
                        className="text-sm text-primary hover:underline"
                      >
                        + Criar agendamento
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedDateAgendamentos.map((agendamento) => (
                        <div
                          key={agendamento.id}
                          className={cn(
                            'p-3 rounded-lg bg-muted/50 border border-border transition-all',
                            agendamento.concluido && 'opacity-50'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => toggleConcluido(agendamento.id, agendamento.concluido)}
                              className={cn(
                                'flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors flex-shrink-0 mt-0.5',
                                agendamento.concluido
                                  ? 'bg-primary border-primary'
                                  : 'border-muted-foreground hover:border-primary'
                              )}
                            >
                              {agendamento.concluido && (
                                <Check className="h-3 w-3 text-primary-foreground" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {agendamento.google_event_id && (
                                  <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                  </svg>
                                )}
                                <h4
                                  className={cn(
                                    'font-medium text-sm text-foreground',
                                    agendamento.concluido && 'line-through'
                                  )}
                                >
                                  {agendamento.titulo}
                                </h4>
                              </div>
                              {agendamento.descricao && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {agendamento.descricao}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {formatTime(agendamento.data_inicio)}
                                </div>
                                {agendamento.contatos && agendamento.contato_id && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/conversas?contato=${agendamento.contato_id}`);
                                    }}
                                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                                    title="Abrir conversa"
                                  >
                                    <MessageSquare className="h-3 w-3" />
                                    {agendamento.contatos.nome}
                                  </button>
                                )}
                              </div>
                              {agendamento.google_meet_link && (
                                <a
                                  href={agendamento.google_meet_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs text-blue-500 hover:underline mt-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Video className="h-3 w-3" />
                                  Google Meet
                                </a>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditModal(agendamento);
                                }}
                                className="p-1.5 rounded hover:bg-muted transition-colors"
                                title="Editar"
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  confirmDelete(agendamento);
                                }}
                                className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </button>
                            </div>
                          </div>
                          
                          {/* Seção de Lembretes */}
                          {regrasLembrete.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <div className="flex items-center gap-1.5 mb-2">
                                <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground">Lembretes</span>
                              </div>
                              <div className="space-y-1.5">
                                {regrasLembrete.map((regra) => {
                                  const status = getLembreteStatus(agendamento, regra, lembretesEnviados);
                                  
                                  return (
                                    <div key={regra.id} className="flex items-center gap-2 text-xs">
                                      {status.status === 'enviado' && (
                                        <>
                                          <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                          <span className="text-muted-foreground">{formatarMinutosAntes(regra.minutos_antes)}:</span>
                                          <span className="text-green-600">
                                            Enviado {new Date(status.data).toLocaleString('pt-BR', { 
                                              day: '2-digit', 
                                              month: '2-digit', 
                                              hour: '2-digit', 
                                              minute: '2-digit' 
                                            })}
                                          </span>
                                        </>
                                      )}
                                      {status.status === 'pendente' && (
                                        <>
                                          <Clock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                                          <span className="text-muted-foreground">{formatarMinutosAntes(regra.minutos_antes)}:</span>
                                          <span className="text-amber-600">
                                            Em {formatarTempoRestante(status.tempoRestante)}
                                          </span>
                                        </>
                                      )}
                                      {status.status === 'sem_contato' && (
                                        <>
                                          <AlertCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                          <span className="text-muted-foreground">{formatarMinutosAntes(regra.minutos_antes)}:</span>
                                          <span className="text-muted-foreground italic">Sem contato</span>
                                        </>
                                      )}
                                      {status.status === 'atrasado' && (
                                        <>
                                          <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                                          <span className="text-muted-foreground">{formatarMinutosAntes(regra.minutos_antes)}:</span>
                                          <span className="text-destructive">Não enviado</span>
                                        </>
                                      )}
                                      {status.status === 'concluido' && (
                                        <>
                                          <Check className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                          <span className="text-muted-foreground">{formatarMinutosAntes(regra.minutos_antes)}:</span>
                                          <span className="text-muted-foreground italic">Concluído</span>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      <button
                        onClick={() => openNewAgendamentoModal(selectedDate)}
                        className="w-full py-2 text-sm text-primary hover:underline"
                      >
                        + Novo agendamento
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Selecione um dia no calendário para ver os agendamentos
                  </p>
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        {/* Modal de Criar */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-card rounded-2xl border border-border p-6 animate-scale-in">
              <h2 className="text-xl font-semibold text-foreground mb-6">Novo Agendamento</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Título *</label>
                  <input
                    type="text"
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    className="w-full h-11 px-4 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Ex: Reunião com cliente"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Descrição
                  </label>
                  <textarea
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="Detalhes do agendamento..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Contato <span className="text-muted-foreground text-xs">(opcional)</span>
                  </label>
                  <Select 
                    value={formData.contato_id} 
                    onValueChange={(value) => setFormData({ ...formData, contato_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="w-full h-11">
                      <SelectValue placeholder="Selecione um contato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum contato</SelectItem>
                      {contatos.map((contato) => (
                        <SelectItem key={contato.id} value={contato.id}>
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{contato.nome}</span>
                            <span className="text-muted-foreground text-xs">- {contato.telefone}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Data *</label>
                    <input
                      type="date"
                      value={formData.data_inicio}
                      onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                      className="w-full h-11 px-4 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Hora *</label>
                    <input
                      type="time"
                      value={formData.hora_inicio}
                      onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
                      className="w-full h-11 px-4 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setGerarMeet(!gerarMeet)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      gerarMeet ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        gerarMeet ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">Gerar link do Google Meet</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowModal(false);
                    setFormData({ titulo: '', descricao: '', data_inicio: '', hora_inicio: '', contato_id: '' });
                    setGerarMeet(true);
                  }}
                  className="flex-1 h-11 rounded-lg bg-muted text-foreground font-medium hover:bg-muted/80 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddAgendamento}
                  className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                >
                  Criar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Editar */}
        {showEditModal && editingAgendamento && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-card rounded-2xl border border-border p-6 animate-scale-in">
              <h2 className="text-xl font-semibold text-foreground mb-6">Editar Agendamento</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Título *</label>
                  <input
                    type="text"
                    value={editFormData.titulo}
                    onChange={(e) => setEditFormData({ ...editFormData, titulo: e.target.value })}
                    className="w-full h-11 px-4 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Ex: Reunião com cliente"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Descrição
                  </label>
                  <textarea
                    value={editFormData.descricao}
                    onChange={(e) => setEditFormData({ ...editFormData, descricao: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="Detalhes do agendamento..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Contato <span className="text-muted-foreground text-xs">(opcional)</span>
                  </label>
                  <Select 
                    value={editFormData.contato_id} 
                    onValueChange={(value) => setEditFormData({ ...editFormData, contato_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="w-full h-11">
                      <SelectValue placeholder="Selecione um contato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum contato</SelectItem>
                      {contatos.map((contato) => (
                        <SelectItem key={contato.id} value={contato.id}>
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{contato.nome}</span>
                            <span className="text-muted-foreground text-xs">- {contato.telefone}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Data *</label>
                    <input
                      type="date"
                      value={editFormData.data_inicio}
                      onChange={(e) => setEditFormData({ ...editFormData, data_inicio: e.target.value })}
                      className="w-full h-11 px-4 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Hora *</label>
                    <input
                      type="time"
                      value={editFormData.hora_inicio}
                      onChange={(e) => setEditFormData({ ...editFormData, hora_inicio: e.target.value })}
                      className="w-full h-11 px-4 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                {editingAgendamento.google_meet_link && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-2 text-sm text-blue-500">
                      <Video className="h-4 w-4" />
                      <span className="font-medium">Google Meet</span>
                    </div>
                    <a
                      href={editingAgendamento.google_meet_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline mt-1 block truncate"
                    >
                      {editingAgendamento.google_meet_link}
                    </a>
                  </div>
                )}

                {editingAgendamento.google_event_id && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Sincronizado com Google Calendar
                  </p>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingAgendamento(null);
                  }}
                  disabled={actionLoading}
                  className="flex-1 h-11 rounded-lg bg-muted text-foreground font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateAgendamento}
                  disabled={actionLoading}
                  className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Confirmação de Exclusão */}
        {showDeleteConfirm && deletingAgendamento && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-card rounded-2xl border border-border p-6 animate-scale-in">
              <h2 className="text-lg font-semibold text-foreground mb-2">Excluir agendamento?</h2>
              <p className="text-sm text-muted-foreground mb-4">
                "{deletingAgendamento.titulo}" será removido permanentemente.
                {deletingAgendamento.google_event_id && (
                  <span className="block mt-1 text-orange-500">
                    Este evento também será removido do Google Calendar.
                  </span>
                )}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletingAgendamento(null);
                  }}
                  disabled={actionLoading}
                  className="flex-1 h-10 rounded-lg bg-muted text-foreground font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteAgendamento}
                  disabled={actionLoading}
                  className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Drawer para detalhes do dia */}
        {isMobile && (
          <Drawer open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
            <DrawerContent className="max-h-[85vh]">
              <DrawerHeader className="border-b border-border pb-3">
                <DrawerTitle>
                  {selectedDate?.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </DrawerTitle>
              </DrawerHeader>
              <div className="p-4 overflow-y-auto">
                {selectedDateAgendamentos.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground mb-4">
                      Nenhum agendamento neste dia
                    </p>
                    <button
                      onClick={() => {
                        setSelectedDate(null);
                        setTimeout(() => openNewAgendamentoModal(selectedDate!), 100);
                      }}
                      className="text-sm text-primary hover:underline"
                    >
                      + Criar agendamento
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDateAgendamentos.map((agendamento) => (
                      <div
                        key={agendamento.id}
                        className={cn(
                          'p-3 rounded-lg bg-muted/50 border border-border',
                          agendamento.concluido && 'opacity-50'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleConcluido(agendamento.id, agendamento.concluido)}
                            className={cn(
                              'flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors flex-shrink-0 mt-0.5',
                              agendamento.concluido
                                ? 'bg-primary border-primary'
                                : 'border-muted-foreground hover:border-primary'
                            )}
                          >
                            {agendamento.concluido && (
                              <Check className="h-3 w-3 text-primary-foreground" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <h4 className={cn('font-medium text-sm text-foreground', agendamento.concluido && 'line-through')}>
                              {agendamento.titulo}
                            </h4>
                            {agendamento.descricao && (
                              <p className="text-xs text-muted-foreground mt-0.5">{agendamento.descricao}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatTime(agendamento.data_inicio)}
                              </div>
                              {agendamento.contatos && agendamento.contato_id && (
                                <button
                                  onClick={() => {
                                    setSelectedDate(null);
                                    navigate(`/conversas?contato=${agendamento.contato_id}`);
                                  }}
                                  className="flex items-center gap-1 text-xs text-primary"
                                >
                                  <MessageSquare className="h-3 w-3" />
                                  {agendamento.contatos.nome}
                                </button>
                              )}
                            </div>
                            {agendamento.google_meet_link && (
                              <a
                                href={agendamento.google_meet_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-500 mt-1"
                              >
                                <Video className="h-3 w-3" />
                                Google Meet
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setSelectedDate(null);
                                setTimeout(() => openEditModal(agendamento), 100);
                              }}
                              className="p-1.5 rounded hover:bg-muted transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedDate(null);
                                setTimeout(() => confirmDelete(agendamento), 100);
                              }}
                              className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          </div>
                        </div>
                        
                        {/* Seção de Lembretes - Mobile */}
                        {regrasLembrete.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground">Lembretes</span>
                            </div>
                            <div className="space-y-1.5">
                              {regrasLembrete.map((regra) => {
                                const status = getLembreteStatus(agendamento, regra, lembretesEnviados);
                                
                                return (
                                  <div key={regra.id} className="flex items-center gap-2 text-xs">
                                    {status.status === 'enviado' && (
                                      <>
                                        <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                        <span className="text-muted-foreground">{formatarMinutosAntes(regra.minutos_antes)}:</span>
                                        <span className="text-green-600">
                                          Enviado {new Date(status.data).toLocaleString('pt-BR', { 
                                            day: '2-digit', 
                                            month: '2-digit', 
                                            hour: '2-digit', 
                                            minute: '2-digit' 
                                          })}
                                        </span>
                                      </>
                                    )}
                                    {status.status === 'pendente' && (
                                      <>
                                        <Clock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                                        <span className="text-muted-foreground">{formatarMinutosAntes(regra.minutos_antes)}:</span>
                                        <span className="text-amber-600">
                                          Em {formatarTempoRestante(status.tempoRestante)}
                                        </span>
                                      </>
                                    )}
                                    {status.status === 'sem_contato' && (
                                      <>
                                        <AlertCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                        <span className="text-muted-foreground">{formatarMinutosAntes(regra.minutos_antes)}:</span>
                                        <span className="text-muted-foreground italic">Sem contato</span>
                                      </>
                                    )}
                                    {status.status === 'atrasado' && (
                                      <>
                                        <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                                        <span className="text-muted-foreground">{formatarMinutosAntes(regra.minutos_antes)}:</span>
                                        <span className="text-destructive">Não enviado</span>
                                      </>
                                    )}
                                    {status.status === 'concluido' && (
                                      <>
                                        <Check className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                        <span className="text-muted-foreground">{formatarMinutosAntes(regra.minutos_antes)}:</span>
                                        <span className="text-muted-foreground italic">Concluído</span>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    
                    <button
                      onClick={() => {
                        const date = selectedDate;
                        setSelectedDate(null);
                        setTimeout(() => openNewAgendamentoModal(date!), 100);
                      }}
                      className="w-full py-2 text-sm text-primary hover:underline"
                    >
                      + Novo agendamento
                    </button>
                  </div>
                )}
              </div>
            </DrawerContent>
          </Drawer>
        )}
      </div>
    </MainLayout>
  );
}
