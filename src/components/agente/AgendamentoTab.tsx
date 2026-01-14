import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { 
  Calendar, Save, Loader2, Plus, Trash2, Clock, 
  Video, AlertCircle, ChevronDown, ChevronUp, Info
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface AgendamentoConfig {
  id?: string;
  agent_ia_id: string;
  ativo: boolean;
  tipo_agenda: 'interno' | 'google';
  google_calendar_id: string | null;
  duracao_padrao: number;
  limite_por_horario: number;
  intervalo_entre_agendamentos: number;
  antecedencia_minima_horas: number;
  antecedencia_maxima_dias: number;
  nome_agendamento: string;
  descricao_agendamento: string;
  prompt_consulta_horarios: string;
  prompt_marcacao_horario: string;
  gerar_meet: boolean;
  horario_inicio_dia: string;
  horario_fim_dia: string;
}

interface HorarioSlot {
  id?: string;
  config_id?: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  ativo: boolean;
}

interface CalendarioGoogle {
  id: string;
  nome: string;
  email_google: string;
}

const diasSemana = [
  { value: 0, label: 'Domingo', shortLabel: 'Dom' },
  { value: 1, label: 'Segunda', shortLabel: 'Seg' },
  { value: 2, label: 'Terça', shortLabel: 'Ter' },
  { value: 3, label: 'Quarta', shortLabel: 'Qua' },
  { value: 4, label: 'Quinta', shortLabel: 'Qui' },
  { value: 5, label: 'Sexta', shortLabel: 'Sex' },
  { value: 6, label: 'Sábado', shortLabel: 'Sáb' },
];

const duracoesDisponiveis = [
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 45, label: '45 minutos' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1h30' },
  { value: 120, label: '2 horas' },
];

interface AgendamentoTabProps {
  agentId: string;
}

export function AgendamentoTab({ agentId }: AgendamentoTabProps) {
  const { usuario } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AgendamentoConfig>({
    agent_ia_id: agentId,
    ativo: false,
    tipo_agenda: 'interno',
    google_calendar_id: null,
    duracao_padrao: 60,
    limite_por_horario: 1,
    intervalo_entre_agendamentos: 0,
    antecedencia_minima_horas: 1,
    antecedencia_maxima_dias: 30,
    nome_agendamento: '',
    descricao_agendamento: '',
    prompt_consulta_horarios: 'Quando o lead perguntar sobre disponibilidade, agenda, horários ou quiser marcar uma reunião.',
    prompt_marcacao_horario: 'Quando o lead confirmar um horário específico para agendar.',
    gerar_meet: true,
    horario_inicio_dia: '08:00',
    horario_fim_dia: '18:00',
  });
  const [horarios, setHorarios] = useState<HorarioSlot[]>([]);
  const [calendarios, setCalendarios] = useState<CalendarioGoogle[]>([]);
  const [openInstrucoes, setOpenInstrucoes] = useState(false);

  useEffect(() => {
    if (agentId && usuario?.conta_id) {
      loadData();
    }
  }, [agentId, usuario?.conta_id]);

  const loadData = async () => {
    try {
      // Carregar config de agendamento
      const { data: configData } = await supabase
        .from('agent_ia_agendamento_config')
        .select('*')
        .eq('agent_ia_id', agentId)
        .maybeSingle();

      if (configData) {
        setConfig({
          ...configData,
          tipo_agenda: configData.tipo_agenda as 'interno' | 'google',
          horario_inicio_dia: configData.horario_inicio_dia?.substring(0, 5) || '08:00',
          horario_fim_dia: configData.horario_fim_dia?.substring(0, 5) || '18:00',
        });

        // Carregar horários
        const { data: horariosData } = await supabase
          .from('agent_ia_agendamento_horarios')
          .select('*')
          .eq('config_id', configData.id)
          .order('dia_semana')
          .order('hora_inicio');

        if (horariosData) {
          setHorarios(horariosData);
        }
      }

      // Carregar calendários Google da conta
      const { data: calendariosData } = await supabase
        .from('calendarios_google')
        .select('id, nome, email_google')
        .eq('conta_id', usuario!.conta_id)
        .eq('ativo', true);

      if (calendariosData) {
        setCalendarios(calendariosData);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar configurações de agendamento');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let configId = config.id;

      if (configId) {
        // Atualizar config existente
        const { error } = await supabase
          .from('agent_ia_agendamento_config')
          .update({
            ativo: config.ativo,
            tipo_agenda: config.tipo_agenda,
            google_calendar_id: config.google_calendar_id,
            duracao_padrao: config.duracao_padrao,
            limite_por_horario: config.limite_por_horario,
            intervalo_entre_agendamentos: config.intervalo_entre_agendamentos,
            antecedencia_minima_horas: config.antecedencia_minima_horas,
            antecedencia_maxima_dias: config.antecedencia_maxima_dias,
            nome_agendamento: config.nome_agendamento,
            descricao_agendamento: config.descricao_agendamento,
            prompt_consulta_horarios: config.prompt_consulta_horarios,
            prompt_marcacao_horario: config.prompt_marcacao_horario,
            gerar_meet: config.gerar_meet,
            horario_inicio_dia: config.horario_inicio_dia,
            horario_fim_dia: config.horario_fim_dia,
          })
          .eq('id', configId);

        if (error) throw error;
      } else {
        // Criar nova config
        const { data, error } = await supabase
          .from('agent_ia_agendamento_config')
          .insert({
            agent_ia_id: agentId,
            ativo: config.ativo,
            tipo_agenda: config.tipo_agenda,
            google_calendar_id: config.google_calendar_id,
            duracao_padrao: config.duracao_padrao,
            limite_por_horario: config.limite_por_horario,
            intervalo_entre_agendamentos: config.intervalo_entre_agendamentos,
            antecedencia_minima_horas: config.antecedencia_minima_horas,
            antecedencia_maxima_dias: config.antecedencia_maxima_dias,
            nome_agendamento: config.nome_agendamento,
            descricao_agendamento: config.descricao_agendamento,
            prompt_consulta_horarios: config.prompt_consulta_horarios,
            prompt_marcacao_horario: config.prompt_marcacao_horario,
            gerar_meet: config.gerar_meet,
            horario_inicio_dia: config.horario_inicio_dia,
            horario_fim_dia: config.horario_fim_dia,
          })
          .select()
          .single();

        if (error) throw error;
        configId = data.id;
        setConfig({ ...config, id: configId });
      }

      // Salvar horários
      if (configId) {
        // Deletar horários antigos
        await supabase
          .from('agent_ia_agendamento_horarios')
          .delete()
          .eq('config_id', configId);

        // Inserir novos horários
        if (horarios.length > 0) {
          const horariosToInsert = horarios.map(h => ({
            config_id: configId,
            dia_semana: h.dia_semana,
            hora_inicio: h.hora_inicio,
            hora_fim: h.hora_fim,
            ativo: h.ativo,
          }));

          const { error: horariosError } = await supabase
            .from('agent_ia_agendamento_horarios')
            .insert(horariosToInsert);

          if (horariosError) throw horariosError;
        }
      }

      toast.success('Configurações de agendamento salvas!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const addHorario = (diaSemana: number) => {
    setHorarios([
      ...horarios,
      {
        dia_semana: diaSemana,
        hora_inicio: '09:00',
        hora_fim: '18:00',
        ativo: true,
      }
    ]);
  };

  const updateHorario = (index: number, field: keyof HorarioSlot, value: any) => {
    const newHorarios = [...horarios];
    newHorarios[index] = { ...newHorarios[index], [field]: value };
    setHorarios(newHorarios);
  };

  const removeHorario = (index: number) => {
    setHorarios(horarios.filter((_, i) => i !== index));
  };

  const getHorariosPorDia = (dia: number) => {
    return horarios
      .map((h, index) => ({ ...h, originalIndex: index }))
      .filter(h => h.dia_semana === dia);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="h-12 w-12 rounded-xl bg-rose-500/10 flex items-center justify-center">
          <Calendar className="h-6 w-6 text-rose-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Agendamento</h2>
          <p className="text-sm text-muted-foreground">
            Configure a agenda interna para controlar horários disponíveis
          </p>
        </div>
      </div>

      {/* Toggle Ativo */}
      <Card className="border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                config.ativo ? 'bg-rose-500/20' : 'bg-muted'
              }`}>
                <Calendar className={`h-5 w-5 ${config.ativo ? 'text-rose-500' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium text-foreground">Módulo de Agendamento</p>
                <p className="text-sm text-muted-foreground">
                  {config.ativo ? 'Ativo - IA pode agendar reuniões' : 'Desativado'}
                </p>
              </div>
            </div>
            <Switch
              checked={config.ativo}
              onCheckedChange={(checked) => setConfig({ ...config, ativo: checked })}
            />
          </div>

          {config.ativo && (
            <div className="mt-6 pt-6 border-t border-border">
              <label className="text-sm font-medium text-foreground mb-3 block">
                Tipo de Agenda
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setConfig({ ...config, tipo_agenda: 'interno' })}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    config.tipo_agenda === 'interno'
                      ? 'border-rose-500 bg-rose-500/10'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className={`h-4 w-4 ${config.tipo_agenda === 'interno' ? 'text-rose-500' : 'text-muted-foreground'}`} />
                    <span className={`font-medium ${config.tipo_agenda === 'interno' ? 'text-foreground' : 'text-muted-foreground'}`}>
                      Agenda Interna
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Define horários disponíveis localmente. Google Calendar usado apenas para criar eventos.
                  </p>
                </button>

                <button
                  onClick={() => setConfig({ ...config, tipo_agenda: 'google' })}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    config.tipo_agenda === 'google'
                      ? 'border-rose-500 bg-rose-500/10'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className={`h-4 w-4 ${config.tipo_agenda === 'google' ? 'text-rose-500' : 'text-muted-foreground'}`} />
                    <span className={`font-medium ${config.tipo_agenda === 'google' ? 'text-foreground' : 'text-muted-foreground'}`}>
                      Google Calendar
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Consulta disponibilidade diretamente no Google Calendar.
                  </p>
                </button>
              </div>

              {config.tipo_agenda === 'google' && (
                <div className="mt-4">
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Calendário Google
                  </label>
                  {calendarios.length > 0 ? (
                    <Select
                      value={config.google_calendar_id || ''}
                      onValueChange={(v) => setConfig({ ...config, google_calendar_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um calendário" />
                      </SelectTrigger>
                      <SelectContent>
                        {calendarios.map((cal) => (
                          <SelectItem key={cal.id} value={cal.id}>
                            {cal.nome} ({cal.email_google})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <p className="text-sm text-amber-500">
                        Nenhum calendário conectado. Conecte em Integrações → Google Calendar.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {config.ativo && (
        <>
          {/* Prompts */}
          <Card className="border-border">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Gatilhos de Ativação</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Consulta de Horários
                  </label>
                  <textarea
                    value={config.prompt_consulta_horarios}
                    onChange={(e) => setConfig({ ...config, prompt_consulta_horarios: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none text-sm"
                    placeholder="Quando a IA deve consultar disponibilidade..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Instruções de quando a IA deve verificar os horários disponíveis
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Marcação de Horário
                  </label>
                  <textarea
                    value={config.prompt_marcacao_horario}
                    onChange={(e) => setConfig({ ...config, prompt_marcacao_horario: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none text-sm"
                    placeholder="Quando a IA deve criar o agendamento..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Instruções de quando a IA deve criar o evento no calendário
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Configurações */}
          <Card className="border-border">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Configurações</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Duração Padrão
                  </label>
                  <Select
                    value={config.duracao_padrao.toString()}
                    onValueChange={(v) => setConfig({ ...config, duracao_padrao: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {duracoesDisponiveis.map((d) => (
                        <SelectItem key={d.value} value={d.value.toString()}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Limite por Horário
                  </label>
                  <Select
                    value={config.limite_por_horario.toString()}
                    onValueChange={(v) => setConfig({ ...config, limite_por_horario: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={n.toString()}>
                          {n} agendamento{n > 1 ? 's' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Horário de Início
                  </label>
                  <Select
                    value={config.horario_inicio_dia}
                    onValueChange={(v) => setConfig({ ...config, horario_inicio_dia: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 13 }, (_, i) => i + 6).map((h) => (
                        <SelectItem key={h} value={`${h.toString().padStart(2, '0')}:00`}>
                          {h}h
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Horário de Fim
                  </label>
                  <Select
                    value={config.horario_fim_dia}
                    onValueChange={(v) => setConfig({ ...config, horario_fim_dia: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 13 }, (_, i) => i + 12).map((h) => (
                        <SelectItem key={h} value={`${h.toString().padStart(2, '0')}:00`}>
                          {h}h
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Info className="h-3 w-3" />
                A IA só oferecerá horários entre {config.horario_inicio_dia?.substring(0, 2) || '08'}h e {config.horario_fim_dia?.substring(0, 2) || '18'}h
              </p>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Antecedência Mínima
                  </label>
                  <Select
                    value={config.antecedencia_minima_horas.toString()}
                    onValueChange={(v) => setConfig({ ...config, antecedencia_minima_horas: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 4, 6, 12, 24, 48].map((h) => (
                        <SelectItem key={h} value={h.toString()}>
                          {h < 24 ? `${h} hora${h > 1 ? 's' : ''}` : `${h/24} dia${h/24 > 1 ? 's' : ''}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Agendar até
                  </label>
                  <Select
                    value={config.antecedencia_maxima_dias.toString()}
                    onValueChange={(v) => setConfig({ ...config, antecedencia_maxima_dias: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[7, 14, 30, 60, 90].map((d) => (
                        <SelectItem key={d} value={d.toString()}>
                          {d} dias
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
                <div className="flex items-center gap-3">
                  <Video className={`h-5 w-5 ${config.gerar_meet ? 'text-rose-500' : 'text-muted-foreground'}`} />
                  <div>
                    <p className="font-medium text-foreground">Gerar Link do Google Meet</p>
                    <p className="text-sm text-muted-foreground">
                      Criar automaticamente link de videoconferência
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.gerar_meet}
                  onCheckedChange={(checked) => setConfig({ ...config, gerar_meet: checked })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Instruções para IA */}
          <Collapsible open={openInstrucoes} onOpenChange={setOpenInstrucoes}>
            <Card className="border-border">
              <CollapsibleTrigger className="w-full">
                <CardContent className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Info className="h-5 w-5 text-muted-foreground" />
                    <div className="text-left">
                      <p className="font-medium text-foreground">Instruções para IA</p>
                      <p className="text-sm text-muted-foreground">
                        Como a IA deve criar nome e descrição do evento
                      </p>
                    </div>
                  </div>
                  {openInstrucoes ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </CardContent>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="px-6 pb-6 pt-0 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Nome do Agendamento
                    </label>
                    <textarea
                      value={config.nome_agendamento}
                      onChange={(e) => setConfig({ ...config, nome_agendamento: e.target.value })}
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none text-sm"
                      placeholder="Ex: Use o formato 'Reunião - [Nome do Lead]' ou 'Consulta - [Tipo de Serviço]'"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Descrição do Agendamento
                    </label>
                    <textarea
                      value={config.descricao_agendamento}
                      onChange={(e) => setConfig({ ...config, descricao_agendamento: e.target.value })}
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none text-sm"
                      placeholder="Ex: Inclua o motivo da reunião e dados do contato"
                    />
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Horários Disponíveis - Apenas para agenda interna */}
          {config.tipo_agenda === 'interno' && (
            <Card className="border-border">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Horários Disponíveis</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Configure os horários em que o agendamento está disponível para cada dia da semana
                </p>

                <div className="space-y-4">
                  {diasSemana.map((dia) => {
                    const horariosNoDia = getHorariosPorDia(dia.value);
                    
                    return (
                      <div key={dia.value} className="p-4 rounded-xl border border-border bg-muted/20">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-medium text-foreground">{dia.label}</span>
                          <button
                            onClick={() => addHorario(dia.value)}
                            className="flex items-center gap-1 text-sm text-rose-500 hover:text-rose-600 transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                            Adicionar
                          </button>
                        </div>

                        {horariosNoDia.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">
                            Nenhum horário disponível
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {horariosNoDia.map((horario) => (
                              <div key={horario.originalIndex} className="flex items-center gap-3 p-2 rounded-lg bg-background">
                                <input
                                  type="time"
                                  value={horario.hora_inicio}
                                  onChange={(e) => updateHorario(horario.originalIndex, 'hora_inicio', e.target.value)}
                                  className="px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                                />
                                <span className="text-muted-foreground">até</span>
                                <input
                                  type="time"
                                  value={horario.hora_fim}
                                  onChange={(e) => updateHorario(horario.originalIndex, 'hora_fim', e.target.value)}
                                  className="px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                                />
                                <Switch
                                  checked={horario.ativo}
                                  onCheckedChange={(checked) => updateHorario(horario.originalIndex, 'ativo', checked)}
                                />
                                <button
                                  onClick={() => removeHorario(horario.originalIndex)}
                                  className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Botão Salvar */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 h-11 px-6 rounded-xl bg-rose-500 text-white font-medium hover:bg-rose-600 transition-colors disabled:opacity-50 shadow-lg shadow-rose-500/25"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Configurações de Agendamento
          </button>
        </>
      )}
    </div>
  );
}
