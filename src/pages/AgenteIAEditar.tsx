import { useState, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { 
  Bot, Save, Clock, Loader2, Sparkles, ArrowLeft, Pencil, Check, X,
  FileText, MessageCircle, HelpCircle, Zap, Layers, Calendar,
  ChevronDown, ChevronUp, Plus, GripVertical, Trash2, Crown,
  Settings2, CheckCircle2, Circle, AlertCircle, Power, Brain,
  Timer, SplitSquareHorizontal, CalendarCheck
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { extractTextFromTiptapJson } from '@/lib/richTextUtils';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { AcaoInteligenteModal } from '@/components/AcaoInteligenteModal';
import { RichTextEditor, type RichTextEditorRef } from '@/components/RichTextEditor';
import { DescricaoEditor, inserirAcaoNoEditor } from '@/components/DescricaoEditor';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AgendamentoTab } from '@/components/agente/AgendamentoTab';

interface AgentConfig {
  id: string;
  nome: string;
  tipo: 'principal' | 'secundario';
  prompt_sistema: string;
  modelo: string;
  temperatura: number;
  max_tokens: number;
  ativo: boolean;
  horario_inicio: string;
  horario_fim: string;
  dias_ativos: number[];
  mensagem_fora_horario: string;
  gatilho: string | null;
  descricao: string | null;
  atender_24h: boolean;
  tempo_espera_segundos: number;
  fracionar_mensagens: boolean;
  tamanho_max_fracao: number;
  delay_entre_fracoes: number;
  simular_digitacao: boolean;
  quantidade_mensagens_contexto: number;
  created_at?: string;
  updated_at?: string;
}

type Tab = 'regras' | 'prompt' | 'perguntas' | 'horario' | 'agendamento' | 'configuracao';

const MAX_CARACTERES = 15000;

const diasSemana = [
  { value: 0, label: 'Dom', fullLabel: 'Domingo' },
  { value: 1, label: 'Seg', fullLabel: 'Segunda' },
  { value: 2, label: 'Ter', fullLabel: 'Terça' },
  { value: 3, label: 'Qua', fullLabel: 'Quarta' },
  { value: 4, label: 'Qui', fullLabel: 'Quinta' },
  { value: 5, label: 'Sex', fullLabel: 'Sexta' },
  { value: 6, label: 'Sáb', fullLabel: 'Sábado' },
];

const modelos = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Rápido e Econômico' },
  { value: 'gpt-4o', label: 'GPT-4o', desc: 'Equilibrado' },
  { value: 'gpt-4.1-2025-04-14', label: 'GPT-4.1', desc: 'Flagship' },
  { value: 'gpt-4.1-mini-2025-04-14', label: 'GPT-4.1 Mini', desc: 'Leve' },
  { value: 'gpt-5-2025-08-07', label: 'GPT-5', desc: 'Mais Poderoso' },
  { value: 'gpt-5-mini-2025-08-07', label: 'GPT-5 Mini', desc: 'Otimizado' },
  { value: 'gpt-5-nano-2025-08-07', label: 'GPT-5 Nano', desc: 'Ultra Rápido' },
];

const tabConfig = [
  { 
    id: 'regras' as Tab, 
    label: 'Regras Gerais', 
    shortLabel: 'Regras',
    icon: FileText, 
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    group: 'config'
  },
  { 
    id: 'prompt' as Tab, 
    label: 'Prompt do Agente', 
    shortLabel: 'Prompt',
    icon: MessageCircle, 
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    group: 'config'
  },
  { 
    id: 'perguntas' as Tab, 
    label: 'Perguntas Frequentes', 
    shortLabel: 'FAQ',
    icon: HelpCircle, 
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/20',
    group: 'config'
  },
  { 
    id: 'horario' as Tab, 
    label: 'Horário de Funcionamento', 
    shortLabel: 'Horários',
    icon: Clock, 
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    group: 'operation'
  },
  { 
    id: 'agendamento' as Tab, 
    label: 'Agendamento', 
    shortLabel: 'Agendamento',
    icon: CalendarCheck, 
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500/20',
    group: 'operation'
  },
  { 
    id: 'configuracao' as Tab, 
    label: 'Modelo de IA', 
    shortLabel: 'Modelo',
    icon: Brain, 
    color: 'text-sky-500',
    bgColor: 'bg-sky-500/10',
    borderColor: 'border-sky-500/20',
    group: 'operation'
  },
];

export default function AgenteIAEditar() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('regras');
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [etapasCaracteres, setEtapasCaracteres] = useState(0);
  const [perguntasCaracteres, setPerguntasCaracteres] = useState(0);
  const [etapasCount, setEtapasCount] = useState(0);
  const [perguntasCount, setPerguntasCount] = useState(0);

  const carregarCaracteresEtapas = async (agentId: string) => {
    const { data: etapas } = await supabase
      .from('agent_ia_etapas')
      .select('nome, descricao')
      .eq('agent_ia_id', agentId);
    
    if (etapas) {
      const total = etapas.reduce((acc, e) => {
        return acc + (e.nome?.length || 0) + (e.descricao?.length || 0);
      }, 0);
      setEtapasCaracteres(total);
      setEtapasCount(etapas.length);
    }
  };

  const carregarCaracteresPerguntas = async (agentId: string) => {
    const { data: perguntas } = await supabase
      .from('agent_ia_perguntas')
      .select('pergunta, resposta')
      .eq('agent_ia_id', agentId);
    
    if (perguntas) {
      const total = perguntas.reduce((acc, p) => {
        return acc + (p.pergunta?.length || 0) + (p.resposta?.length || 0);
      }, 0);
      setPerguntasCaracteres(total);
      setPerguntasCount(perguntas.length);
    }
  };

  useEffect(() => {
    if (usuario?.conta_id && id) {
      fetchConfig();
    }
  }, [usuario, id]);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_ia')
        .select('*')
        .eq('id', id)
        .eq('conta_id', usuario!.conta_id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig({
          ...data,
          temperatura: Number(data.temperatura),
          tipo: (data.tipo === 'secundario' ? 'secundario' : 'principal') as 'principal' | 'secundario',
          atender_24h: data.atender_24h ?? false,
          tempo_espera_segundos: data.tempo_espera_segundos ?? 5,
          fracionar_mensagens: data.fracionar_mensagens ?? false,
          tamanho_max_fracao: data.tamanho_max_fracao ?? 500,
          delay_entre_fracoes: data.delay_entre_fracoes ?? 2,
          simular_digitacao: data.simular_digitacao ?? false,
          quantidade_mensagens_contexto: data.quantidade_mensagens_contexto ?? 20,
        });
        setTempName(data.nome || '');
        
        carregarCaracteresEtapas(data.id);
        carregarCaracteresPerguntas(data.id);
      } else {
        toast.error('Agente não encontrado');
        navigate('/agente-ia');
      }
    } catch (error) {
      console.error('Erro ao buscar config:', error);
      toast.error('Erro ao carregar agente');
      navigate('/agente-ia');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('agent_ia')
        .update({
          nome: config.nome,
          tipo: config.tipo,
          prompt_sistema: config.prompt_sistema,
          modelo: config.modelo,
          temperatura: config.temperatura,
          max_tokens: config.max_tokens,
          ativo: config.ativo,
          horario_inicio: config.horario_inicio,
          horario_fim: config.horario_fim,
          dias_ativos: config.dias_ativos,
          mensagem_fora_horario: config.mensagem_fora_horario,
          gatilho: config.gatilho,
          descricao: config.descricao,
          atender_24h: config.atender_24h,
          tempo_espera_segundos: config.tempo_espera_segundos,
          fracionar_mensagens: config.fracionar_mensagens,
          tamanho_max_fracao: config.tamanho_max_fracao,
          delay_entre_fracoes: config.delay_entre_fracoes,
          simular_digitacao: config.simular_digitacao,
          quantidade_mensagens_contexto: config.quantidade_mensagens_contexto,
        })
        .eq('id', config.id);

      if (error) throw error;
      toast.success('Configurações salvas!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleNameSave = () => {
    if (config && tempName.trim()) {
      setConfig({ ...config, nome: tempName.trim() });
      setEditingName(false);
    }
  };

  const toggleDia = (dia: number) => {
    if (!config) return;

    const novosDias = config.dias_ativos.includes(dia)
      ? config.dias_ativos.filter((d) => d !== dia)
      : [...config.dias_ativos, dia].sort();

    setConfig({ ...config, dias_ativos: novosDias });
  };

  const caracteresUsados = (config?.prompt_sistema?.length || 0) + etapasCaracteres + perguntasCaracteres;
  const porcentagemUsada = (caracteresUsados / MAX_CARACTERES) * 100;

  // Calcular progresso de configuração
  const calcularProgresso = () => {
    if (!config) return 0;
    let pontos = 0;
    let total = 5;
    
    if (config.prompt_sistema && config.prompt_sistema.length > 50) pontos++;
    if (etapasCount > 0) pontos++;
    if (perguntasCount > 0) pontos++;
    if (config.dias_ativos.length > 0 || config.atender_24h) pontos++;
    if (config.modelo) pontos++;
    
    return Math.round((pontos / total) * 100);
  };

  const getTabStatus = (tabId: Tab): 'complete' | 'partial' | 'empty' => {
    if (!config) return 'empty';
    
    switch (tabId) {
      case 'regras':
        if (config.prompt_sistema && config.prompt_sistema.length > 100) return 'complete';
        if (config.prompt_sistema && config.prompt_sistema.length > 0) return 'partial';
        return 'empty';
      case 'prompt':
        if (etapasCaracteres > 100) return 'complete';
        if (etapasCaracteres > 0) return 'partial';
        return 'empty';
      case 'perguntas':
        if (perguntasCount >= 3) return 'complete';
        if (perguntasCount > 0) return 'partial';
        return 'empty';
      case 'horario':
        if (config.atender_24h || (config.dias_ativos.length > 0 && config.horario_inicio && config.horario_fim)) return 'complete';
        return 'empty';
      case 'agendamento':
        return 'empty'; // Status dinâmico pode ser implementado depois
      case 'configuracao':
        return config.modelo ? 'complete' : 'empty';
      default:
        return 'empty';
    }
  };

  const getTabCount = (tabId: Tab): number | null => {
    switch (tabId) {
      case 'perguntas':
        return perguntasCount;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Carregando agente...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!config) {
    return (
      <MainLayout>
        <div className="text-center text-muted-foreground py-12">
          <Bot className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p>Agente não encontrado</p>
        </div>
      </MainLayout>
    );
  }

  const progresso = calcularProgresso();

  return (
    <MainLayout>
      <div className="flex flex-col h-full animate-fade-in">
        {/* Premium Header */}
        <div className="border-b border-border bg-gradient-to-r from-card via-card to-card/80">
          {/* Breadcrumb */}
          <div className="px-6 pt-4">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/agente-ia" className="text-muted-foreground hover:text-foreground">
                    Agentes IA
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{config.nome}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Main Header Content */}
          <div className="flex items-center justify-between p-6 pt-4">
            <div className="flex items-center gap-5">
              <button
                onClick={() => navigate('/agente-ia')}
                className="flex items-center justify-center h-10 w-10 rounded-xl hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-muted-foreground" />
              </button>
              
              {/* Gradient Avatar */}
              <div className={`relative flex h-14 w-14 items-center justify-center rounded-2xl ${
                config.tipo === 'principal' 
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600' 
                  : 'bg-gradient-to-br from-primary to-emerald-600'
              } shadow-lg`}>
                <Bot className="h-7 w-7 text-white" />
                {config.tipo === 'principal' && (
                  <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-amber-400 flex items-center justify-center shadow-md">
                    <Crown className="h-3 w-3 text-amber-900" />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-3">
                  {editingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        className="h-9 px-3 rounded-lg border border-border bg-input text-foreground text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleNameSave();
                          if (e.key === 'Escape') setEditingName(false);
                        }}
                      />
                      <button onClick={handleNameSave} className="p-2 rounded-lg hover:bg-muted">
                        <Check className="h-4 w-4 text-primary" />
                      </button>
                      <button onClick={() => setEditingName(false)} className="p-2 rounded-lg hover:bg-muted">
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h1 className="text-xl font-bold text-foreground">{config.nome}</h1>
                      <button
                        onClick={() => {
                          setTempName(config.nome);
                          setEditingName(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    config.tipo === 'principal' 
                      ? 'bg-amber-500/15 text-amber-500' 
                      : 'bg-primary/15 text-primary'
                  }`}>
                    {config.tipo === 'principal' && <Crown className="h-3 w-3" />}
                    {config.tipo === 'principal' ? 'Principal' : 'Secundário'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {progresso}% configurado
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Status Toggle */}
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-muted/50">
                <div className={`flex items-center gap-2 ${config.ativo ? 'text-primary' : 'text-muted-foreground'}`}>
                  <Power className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {config.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <button
                  onClick={() => setConfig({ ...config, ativo: !config.ativo })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    config.ativo ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      config.ativo ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/25"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </button>
            </div>
          </div>
        </div>

        {/* Content with Sidebar */}
        <div className="flex flex-1 overflow-hidden">
          {/* Redesigned Sidebar */}
          <div className="w-72 border-r border-border bg-gradient-to-b from-card/50 to-background flex flex-col">
            {/* Progress Card */}
            <div className="p-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Progresso</p>
                      <p className="text-lg font-bold text-foreground">{progresso}%</p>
                    </div>
                  </div>
                  <Progress value={progresso} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {progresso < 100 ? 'Continue configurando para melhor desempenho' : 'Configuração completa!'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Character Gauge */}
            <div className="px-4 pb-4">
              <Card className={`${porcentagemUsada > 80 ? 'border-destructive/30 bg-destructive/5' : 'border-border'}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Caracteres
                    </span>
                    <span className={`text-xs font-medium ${porcentagemUsada > 80 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {Math.round(porcentagemUsada)}%
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-foreground mb-2">
                    {caracteresUsados.toLocaleString()}
                    <span className="text-sm font-normal text-muted-foreground"> / {MAX_CARACTERES.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        porcentagemUsada > 80 ? 'bg-destructive' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(porcentagemUsada, 100)}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
              {/* Configuration Group */}
              <div className="mb-4">
                <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Configuração
                </p>
                {tabConfig.filter(t => t.group === 'config').map((tab) => {
                  const status = getTabStatus(tab.id);
                  const count = getTabCount(tab.id);
                  const isActive = activeTab === tab.id;
                  
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all group ${
                        isActive 
                          ? `${tab.bgColor} ${tab.borderColor} border shadow-sm` 
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center transition-colors ${
                        isActive ? tab.bgColor : 'bg-muted group-hover:bg-muted/80'
                      }`}>
                        <tab.icon className={`h-4.5 w-4.5 ${isActive ? tab.color : 'text-muted-foreground'}`} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>
                            {tab.shortLabel}
                          </span>
                          {count !== null && count > 0 && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              isActive ? `${tab.bgColor} ${tab.color}` : 'bg-muted text-muted-foreground'
                            }`}>
                              {count}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {status === 'complete' && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                        {status === 'partial' && (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                        {status === 'empty' && (
                          <Circle className="h-4 w-4 text-muted-foreground/50" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Operation Group */}
              <div>
                <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Operação
                </p>
                {tabConfig.filter(t => t.group === 'operation').map((tab) => {
                  const status = getTabStatus(tab.id);
                  const isActive = activeTab === tab.id;
                  
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all group ${
                        isActive 
                          ? `${tab.bgColor} ${tab.borderColor} border shadow-sm` 
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center transition-colors ${
                        isActive ? tab.bgColor : 'bg-muted group-hover:bg-muted/80'
                      }`}>
                        <tab.icon className={`h-4.5 w-4.5 ${isActive ? tab.color : 'text-muted-foreground'}`} />
                      </div>
                      <div className="flex-1 text-left">
                        <span className={`font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>
                          {tab.shortLabel}
                        </span>
                      </div>
                      <div className="flex-shrink-0">
                        {status === 'complete' && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                        {status === 'empty' && (
                          <Circle className="h-4 w-4 text-muted-foreground/50" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* Trigger Info */}
            <div className="p-3 m-3 mt-auto rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Zap className="h-4 w-4" />
                <span className="text-sm font-semibold">Gatilho</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {config.gatilho || 'Sem gatilho - responde na primeira mensagem recebida'}
              </p>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-auto">
            <div className="p-8 animate-fade-in">
              {activeTab === 'regras' && (
                <RegrasGeraisTab 
                  config={config} 
                  setConfig={setConfig}
                  onSave={handleSave}
                  saving={saving}
                />
              )}

              {activeTab === 'prompt' && config && (
                <PromptAgenteTab 
                  agentId={config.id} 
                  onCaracteresChange={setEtapasCaracteres}
                />
              )}

              {activeTab === 'perguntas' && config && (
                <PerguntasFrequentesTab 
                  agentId={config.id} 
                  onCaracteresChange={setPerguntasCaracteres}
                  onCountChange={setPerguntasCount}
                />
              )}

              {activeTab === 'horario' && config && (
                <HorarioFuncionamentoTab 
                  config={config}
                  setConfig={setConfig}
                  onSave={handleSave}
                  saving={saving}
                  toggleDia={toggleDia}
                />
              )}

              {activeTab === 'agendamento' && config && (
                <AgendamentoTab agentId={config.id} />
              )}

              {activeTab === 'configuracao' && config && (
                <ConfiguracaoAPITab 
                  config={config}
                  setConfig={setConfig}
                  onSave={handleSave}
                  saving={saving}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

// Tab: Regras Gerais
function RegrasGeraisTab({ 
  config, 
  setConfig, 
  onSave, 
  saving
}: { 
  config: AgentConfig;
  setConfig: (c: AgentConfig) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <FileText className="h-6 w-6 text-blue-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Regras Gerais</h2>
          <p className="text-sm text-muted-foreground">
            Defina a personalidade e comportamento base do agente
          </p>
        </div>
      </div>

      {/* Editor Card */}
      <Card className="border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-foreground">
              Prompt do Sistema
            </label>
            <span className="text-xs text-muted-foreground">
              {config.prompt_sistema?.length || 0} caracteres
            </span>
          </div>
          <textarea
            value={config.prompt_sistema}
            onChange={(e) => setConfig({ ...config, prompt_sistema: e.target.value })}
            rows={18}
            className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none font-mono text-sm leading-relaxed transition-all"
            placeholder="Você é um assistente virtual especializado em...

Regras de comportamento:
1. Sempre seja cordial e profissional
2. Responda de forma clara e objetiva
3. Quando não souber, pergunte ou transfira

Tom de voz:
- Amigável mas profissional
- Empático com as necessidades do cliente"
          />
          <p className="text-xs text-muted-foreground mt-3">
            💡 Dica: Seja específico sobre personalidade, tom de voz e limitações do agente
          </p>
        </CardContent>
      </Card>

      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 h-11 px-6 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 shadow-lg shadow-blue-500/25"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Salvar Regras Gerais
      </button>
    </div>
  );
}

// Tab: Prompt do Agente (único, sempre aberto)
function PromptAgenteTab({ 
  agentId, 
  onCaracteresChange,
}: { 
  agentId: string;
  onCaracteresChange: (count: number) => void;
}) {
  const [prompt, setPrompt] = useState<{
    id: string;
    nome: string;
    descricao: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalAcao, setModalAcao] = useState(false);
  const editorRef = useRef<RichTextEditorRef>(null);

  useEffect(() => {
    if (prompt) {
      const total = (prompt.nome?.length || 0) + (prompt.descricao?.length || 0);
      onCaracteresChange(total);
    }
  }, [prompt, onCaracteresChange]);

  useEffect(() => {
    fetchPrompt();
  }, [agentId]);

  const fetchPrompt = async () => {
    try {
      // Buscar a primeira etapa existente (única)
      const { data, error } = await supabase
        .from('agent_ia_etapas')
        .select('*')
        .eq('agent_ia_id', agentId)
        .order('numero', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPrompt({
          id: data.id,
          nome: data.nome,
          descricao: data.descricao || '',
        });
      } else {
        // Criar prompt padrão se não existir
        const novoId = crypto.randomUUID();
        setPrompt({
          id: novoId,
          nome: 'Prompt Principal',
          descricao: '',
        });
      }
    } catch (error) {
      console.error('Erro ao buscar prompt:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcaoInsert = (action: string) => {
    if (editorRef.current) {
      editorRef.current.insertAction(action);
    }
  };

  const savePrompt = async () => {
    if (!prompt) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('agent_ia_etapas')
        .upsert({
          id: prompt.id,
          agent_ia_id: agentId,
          numero: 1,
          tipo: null,
          nome: prompt.nome,
          descricao: prompt.descricao,
        });

      if (error) throw error;
      toast.success('Prompt do agente salvo com sucesso');
    } catch (error) {
      console.error('Erro ao salvar prompt:', error);
      toast.error('Erro ao salvar prompt');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!prompt) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <AcaoInteligenteModal
        isOpen={modalAcao}
        onClose={() => setModalAcao(false)}
        onInsert={handleAcaoInsert}
        agentId={agentId}
      />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <MessageCircle className="h-6 w-6 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Prompt do Agente</h2>
          <p className="text-sm text-muted-foreground">
            Configure o comportamento e fluxo de atendimento do agente
          </p>
        </div>
      </div>

      {/* Editor Card - sempre aberto */}
      <Card className="border-emerald-500/30 shadow-lg shadow-emerald-500/10">
        <CardContent className="p-6 space-y-4">
          {/* Nome do Prompt */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Nome do Prompt
            </label>
            <input
              type="text"
              value={prompt.nome}
              onChange={(e) => setPrompt({ ...prompt, nome: e.target.value })}
              className="w-full h-11 px-4 rounded-xl bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              placeholder="Ex: Prompt Principal"
            />
          </div>

          {/* Descrição / Comportamento */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">
                Descrição / Comportamento
              </label>
              <button 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                onClick={() => setModalAcao(true)}
              >
                <Sparkles className="h-3.5 w-3.5" />
                @ Ação Inteligente
              </button>
            </div>
            
            <RichTextEditor
              ref={editorRef}
              value={prompt.descricao}
              onChange={(value) => setPrompt({ ...prompt, descricao: value })}
              placeholder="Descreva o comportamento do agente...

Exemplos de instruções:
- Apresente-se e pergunte o nome do cliente
- Colete informações sobre as necessidades
- Ofereça os produtos/serviços relevantes
- Use ações inteligentes para automatizar tarefas"
              onAcaoClick={() => setModalAcao(true)}
            />
            <p className="text-xs text-muted-foreground mt-2">
              💡 Digite <span className="text-emerald-500 font-medium">@</span> para inserir ações inteligentes
            </p>
          </div>

          {/* Character count */}
          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {(prompt.nome?.length || 0) + (prompt.descricao?.length || 0)} caracteres
            </span>
            <button 
              onClick={savePrompt}
              disabled={saving}
              className="flex items-center gap-2 h-10 px-5 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/25"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Prompt
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Tab: Perguntas Frequentes
interface Pergunta {
  id: string;
  pergunta: string;
  resposta: string;
  expandido: boolean;
  ordem: number;
}

interface ConfirmDeletePergunta {
  show: boolean;
  id: string;
  pergunta: string;
}

function PerguntasFrequentesTab({ 
  agentId,
  onCaracteresChange,
  onCountChange
}: { 
  agentId: string;
  onCaracteresChange: (count: number) => void;
  onCountChange: (count: number) => void;
}) {
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeletePergunta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const totalCaracteres = perguntas.reduce((acc, p) => {
      return acc + (p.pergunta?.length || 0) + (p.resposta?.length || 0);
    }, 0);
    onCaracteresChange(totalCaracteres);
    onCountChange(perguntas.length);
  }, [perguntas, onCaracteresChange, onCountChange]);

  useEffect(() => {
    fetchPerguntas();
  }, [agentId]);

  const fetchPerguntas = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_ia_perguntas')
        .select('*')
        .eq('agent_ia_id', agentId)
        .order('ordem', { ascending: true });

      if (error) throw error;

      setPerguntas((data || []).map((p, index) => ({
        id: p.id,
        pergunta: p.pergunta,
        resposta: p.resposta,
        ordem: p.ordem || index,
        expandido: false,
      })));
    } catch (error) {
      console.error('Erro ao buscar perguntas:', error);
    } finally {
      setLoading(false);
    }
  };

  const addPergunta = () => {
    const novaPergunta: Pergunta = {
      id: crypto.randomUUID(),
      pergunta: '',
      resposta: '',
      ordem: perguntas.length,
      expandido: true,
    };
    setPerguntas([...perguntas, novaPergunta]);
  };

  const handleDeleteClick = (item: Pergunta) => {
    setConfirmDelete({ show: true, id: item.id, pergunta: item.pergunta || 'Nova Pergunta' });
  };

  const confirmDeletePergunta = async () => {
    if (confirmDelete) {
      try {
        await supabase
          .from('agent_ia_perguntas')
          .delete()
          .eq('id', confirmDelete.id);

        setPerguntas(perguntas.filter(p => p.id !== confirmDelete.id));
        toast.success('Pergunta excluída com sucesso');
      } catch (error) {
        console.error('Erro ao excluir:', error);
      }
      setConfirmDelete(null);
    }
  };

  const updatePergunta = (id: string, field: keyof Pergunta, value: string) => {
    setPerguntas(perguntas.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const togglePergunta = (id: string) => {
    setPerguntas(perguntas.map(p => 
      p.id === id ? { ...p, expandido: !p.expandido } : p
    ));
  };

  const savePergunta = async (id: string) => {
    const item = perguntas.find(p => p.id === id);
    if (!item) return;

    if (!item.pergunta.trim() || !item.resposta.trim()) {
      toast.error('Preencha a pergunta e a resposta');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('agent_ia_perguntas')
        .upsert({
          id: item.id,
          agent_ia_id: agentId,
          pergunta: item.pergunta,
          resposta: item.resposta,
          ordem: item.ordem,
        });

      if (error) throw error;

      toast.success('Pergunta salva com sucesso');
      togglePergunta(id);
    } catch (error) {
      console.error('Erro ao salvar pergunta:', error);
      toast.error('Erro ao salvar pergunta');
    } finally {
      setSaving(false);
    }
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
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md border border-border shadow-2xl animate-scale-in">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Confirmar Exclusão
            </h3>
            <p className="text-muted-foreground mb-6">
              Tem certeza que deseja excluir a pergunta "{confirmDelete.pergunta}"? 
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl border border-border text-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDeletePergunta}
                className="px-4 py-2 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <HelpCircle className="h-6 w-6 text-violet-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Perguntas Frequentes</h2>
            <p className="text-sm text-muted-foreground">
              Configure respostas automáticas para perguntas comuns
            </p>
          </div>
        </div>
        <button 
          onClick={addPergunta}
          className="flex items-center gap-2 h-11 px-5 rounded-xl bg-violet-500 text-white font-medium hover:bg-violet-600 transition-colors shadow-lg shadow-violet-500/25"
        >
          <Plus className="h-4 w-4" />
          Nova Pergunta
        </button>
      </div>

      {perguntas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
              <HelpCircle className="h-8 w-8 text-violet-500/50" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">Nenhuma pergunta configurada</h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
              Adicione perguntas frequentes para respostas mais rápidas e consistentes
            </p>
            <button 
              onClick={addPergunta}
              className="flex items-center gap-2 h-11 px-5 rounded-xl bg-violet-500 text-white font-medium hover:bg-violet-600 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Criar Primeira Pergunta
            </button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4">
            {perguntas.map((item, index) => (
              <Card 
                key={item.id}
                className={`transition-all duration-300 ${
                  item.expandido ? 'border-violet-500/30 shadow-lg shadow-violet-500/10' : 'hover:border-border/80'
                }`}
              >
                <CardContent className="p-0">
                  <div className="flex items-center gap-4 p-4">
                    <div className={`flex items-center justify-center h-10 w-10 rounded-xl text-sm font-bold ${
                      item.expandido 
                        ? 'bg-violet-500 text-white' 
                        : 'bg-violet-500/10 text-violet-500'
                    }`}>
                      {index + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate">
                        {item.pergunta || 'Nova Pergunta'}
                      </h3>
                      {!item.expandido && item.resposta && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">
                          {item.resposta.substring(0, 60)}...
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => togglePergunta(item.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                          item.expandido 
                            ? 'bg-violet-500/10 text-violet-500' 
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {item.expandido ? (
                          <>
                            <ChevronUp className="h-4 w-4" />
                            Fechar
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4" />
                            Editar
                          </>
                        )}
                      </button>

                      <button 
                        onClick={() => handleDeleteClick(item)}
                        className="p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {item.expandido && (
                    <div className="px-4 pb-4 pt-2 border-t border-border animate-fade-in">
                      <div className="space-y-4 ml-14">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Pergunta
                          </label>
                          <input
                            type="text"
                            value={item.pergunta}
                            onChange={(e) => updatePergunta(item.id, 'pergunta', e.target.value)}
                            placeholder="Ex: Qual o horário de funcionamento?"
                            className="w-full h-11 px-4 rounded-xl bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            Resposta
                          </label>
                          <textarea
                            rows={4}
                            value={item.resposta}
                            onChange={(e) => updatePergunta(item.id, 'resposta', e.target.value)}
                            placeholder="Digite a resposta para esta pergunta..."
                            className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none text-sm transition-all"
                          />
                        </div>

                        <div className="flex justify-end">
                          <button 
                            onClick={() => savePergunta(item.id)}
                            disabled={saving}
                            className="flex items-center gap-2 h-10 px-5 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-50"
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Salvar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <button 
            onClick={addPergunta}
            className="w-full flex items-center justify-center gap-2 h-14 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-violet-500/50 hover:text-violet-500 hover:bg-violet-500/5 transition-all"
          >
            <Plus className="h-5 w-5" />
            Adicionar Nova Pergunta
          </button>
        </>
      )}
    </div>
  );
}

// Tab: Horário de Funcionamento
function HorarioFuncionamentoTab({ 
  config, 
  setConfig, 
  onSave, 
  saving,
  toggleDia
}: { 
  config: AgentConfig;
  setConfig: (c: AgentConfig) => void;
  onSave: () => void;
  saving: boolean;
  toggleDia: (dia: number) => void;
}) {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <Clock className="h-6 w-6 text-amber-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Horário de Funcionamento</h2>
          <p className="text-sm text-muted-foreground">
            Configure quando o agente estará disponível para atender
          </p>
        </div>
      </div>

      {/* Toggle 24h */}
      <Card className={`transition-all ${config.atender_24h ? 'border-amber-500/30 bg-amber-500/5' : ''}`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                config.atender_24h ? 'bg-amber-500' : 'bg-muted'
              }`}>
                <Timer className={`h-6 w-6 ${config.atender_24h ? 'text-white' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Atendimento 24 horas</h3>
                <p className="text-sm text-muted-foreground">
                  Quando ativado, o agente responde a qualquer hora
                </p>
              </div>
            </div>
            <button
              onClick={() => setConfig({ ...config, atender_24h: !config.atender_24h })}
              className={`relative h-7 w-14 rounded-full transition-colors ${
                config.atender_24h ? 'bg-amber-500' : 'bg-border'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  config.atender_24h ? 'translate-x-7' : ''
                }`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Configuração de Horário */}
      <Card className={`transition-opacity ${config.atender_24h ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="font-semibold text-foreground mb-4">Dias de Atendimento</h3>
            <div className="flex flex-wrap gap-2">
              {diasSemana.map((dia) => (
                <button
                  key={dia.value}
                  onClick={() => toggleDia(dia.value)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    config.dias_ativos.includes(dia.value)
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {dia.fullLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Início do Expediente
              </label>
              <input
                type="time"
                value={config.horario_inicio}
                onChange={(e) => setConfig({ ...config, horario_inicio: e.target.value })}
                className="w-full h-12 px-4 rounded-xl bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Fim do Expediente
              </label>
              <input
                type="time"
                value={config.horario_fim}
                onChange={(e) => setConfig({ ...config, horario_fim: e.target.value })}
                className="w-full h-12 px-4 rounded-xl bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mensagem Fora do Horário */}
      <Card className={`transition-opacity ${config.atender_24h ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <MessageCircle className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold text-foreground">Mensagem Fora do Horário</h3>
          </div>
          <textarea
            value={config.mensagem_fora_horario}
            onChange={(e) => setConfig({ ...config, mensagem_fora_horario: e.target.value })}
            rows={4}
            className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none transition-all"
            placeholder="Ex: Obrigado pelo contato! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h."
          />
        </CardContent>
      </Card>

      {/* Status Preview */}
      <Card className={`${config.atender_24h ? 'border-amber-500/30 bg-amber-500/5' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${config.atender_24h ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground'}`} />
            <span className="text-sm font-medium text-foreground">
              {config.atender_24h 
                ? 'Atendimento 24/7 - O agente responde a qualquer momento'
                : `Atendimento: ${config.dias_ativos.map(d => diasSemana.find(ds => ds.value === d)?.label).join(', ')} das ${config.horario_inicio} às ${config.horario_fim}`
              }
            </span>
          </div>
        </CardContent>
      </Card>

      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 h-11 px-6 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 shadow-lg shadow-amber-500/25"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Salvar Configurações de Horário
      </button>
    </div>
  );
}

// Tab: Modelo de IA
function ConfiguracaoAPITab({ 
  config, 
  setConfig, 
  onSave, 
  saving 
}: { 
  config: AgentConfig;
  setConfig: (c: AgentConfig) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="h-12 w-12 rounded-xl bg-sky-500/10 flex items-center justify-center">
          <Brain className="h-6 w-6 text-sky-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Modelo de IA</h2>
          <p className="text-sm text-muted-foreground">
            Configure o comportamento e capacidade do modelo de IA
          </p>
        </div>
      </div>

      {/* Response Debounce */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Timer className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Tempo de Espera</h3>
              <p className="text-sm text-muted-foreground">
                Aguarda o lead parar de digitar antes de responder
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">
                Segundos de espera
              </span>
              <span className="text-lg font-bold text-amber-500">{config.tempo_espera_segundos}s</span>
            </div>
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={config.tempo_espera_segundos}
              onChange={(e) => setConfig({ ...config, tempo_espera_segundos: parseInt(e.target.value) })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>1s (rápido)</span>
              <span>30s (aguarda mais)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Context Message Limit */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Layers className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Limite de Contexto</h3>
              <p className="text-sm text-muted-foreground">
                Quantidade de mensagens que a IA considera ao responder
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">
                Mensagens no contexto
              </span>
              <span className="text-lg font-bold text-violet-500">{config.quantidade_mensagens_contexto || 20}</span>
            </div>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={config.quantidade_mensagens_contexto || 20}
              onChange={(e) => setConfig({ ...config, quantidade_mensagens_contexto: parseInt(e.target.value) })}
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>5 (econômico)</span>
              <span>50 (máx contexto)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Menos mensagens = respostas mais rápidas e econômicas. Mais mensagens = melhor memória da conversa.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Message Splitting */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <SplitSquareHorizontal className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Fracionamento de Mensagens</h3>
                <p className="text-sm text-muted-foreground">
                  Divide mensagens longas, simulando comportamento humano
                </p>
              </div>
            </div>
            <button
              onClick={() => setConfig({ ...config, fracionar_mensagens: !config.fracionar_mensagens })}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                config.fracionar_mensagens ? 'bg-emerald-500' : 'bg-border'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  config.fracionar_mensagens ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {config.fracionar_mensagens && (
            <div className="space-y-4 pt-4 border-t border-border animate-fade-in">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Tamanho máximo por mensagem ({config.tamanho_max_fracao} caracteres)
                </label>
                <input
                  type="range"
                  min="100"
                  max="1000"
                  step="50"
                  value={config.tamanho_max_fracao}
                  onChange={(e) => setConfig({ ...config, tamanho_max_fracao: parseInt(e.target.value) })}
                  className="w-full accent-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Delay entre frações ({config.delay_entre_fracoes}s)
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={config.delay_entre_fracoes}
                  onChange={(e) => setConfig({ ...config, delay_entre_fracoes: parseInt(e.target.value) })}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Model Selection */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold text-foreground mb-4">Modelo de Linguagem</h3>
          <div className="grid grid-cols-2 gap-3">
            {modelos.map((modelo) => (
              <button
                key={modelo.value}
                onClick={() => setConfig({ ...config, modelo: modelo.value })}
                className={`p-4 rounded-xl text-left transition-all ${
                  config.modelo === modelo.value
                    ? 'bg-sky-500/10 border-2 border-sky-500/50 shadow-lg shadow-sky-500/10'
                    : 'bg-muted/50 border-2 border-transparent hover:border-border'
                }`}
              >
                <div className="font-medium text-foreground">{modelo.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{modelo.desc}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Advanced Settings */}
      <Card>
        <CardContent className="p-6 space-y-6">
          <h3 className="font-semibold text-foreground">Configurações Avançadas</h3>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">
                Temperatura (Criatividade)
              </label>
              <span className="text-sm font-bold text-sky-500">{config.temperatura.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={config.temperatura}
              onChange={(e) => setConfig({ ...config, temperatura: parseFloat(e.target.value) })}
              className="w-full accent-sky-500"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0 (Preciso)</span>
              <span>2 (Criativo)</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">
                Max Tokens (Tamanho da resposta)
              </label>
              <span className="text-sm font-bold text-sky-500">{config.max_tokens}</span>
            </div>
            <input
              type="range"
              min="100"
              max="4000"
              step="100"
              value={config.max_tokens}
              onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) })}
              className="w-full accent-sky-500"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>100 (Curto)</span>
              <span>4000 (Longo)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 h-11 px-6 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 transition-colors disabled:opacity-50 shadow-lg shadow-sky-500/25"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Salvar Configurações do Modelo
      </button>
    </div>
  );
}
