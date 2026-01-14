import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Bot, Search, Plus, Loader2, Pencil, Clock, Users, Key, Save, Eye, EyeOff, Trash2, Play, MessageSquare, RefreshCw, User, Sparkles, Crown, Zap, Power, PowerOff, Bell, ListChecks } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { NovoAgenteModal } from '@/components/NovoAgenteModal';
import { FollowUpRegraModal } from '@/components/FollowUpRegraModal';
import { LembreteRegraModal } from '@/components/LembreteRegraModal';
import { validarEExibirErro } from '@/hooks/useValidarLimitePlano';
import { format } from 'date-fns';
import { CamposPersonalizadosContent } from '@/components/campos/CamposPersonalizadosContent';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { OnboardingTooltip } from '@/components/onboarding/OnboardingTooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Agent {
  id: string;
  nome: string;
  tipo: 'principal' | 'secundario';
  ativo: boolean;
  gatilho: string | null;
  descricao: string | null;
  created_at?: string;
}

type SubPage = 'agentes' | 'followup' | 'lembretes' | 'sessoes' | 'campos-personalizados' | 'configuracao';

export default function AgenteIA() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isOnboardingActive, currentStep, completeStep, goToStep } = useOnboarding();
  const [agentes, setAgentes] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [subPage, setSubPage] = useState<SubPage>('agentes');
  const [showNovoAgenteModal, setShowNovoAgenteModal] = useState(false);

  useEffect(() => {
    if (usuario?.conta_id) {
      fetchAgentes();
    }
  }, [usuario]);

  // Completar onboarding quando visitar página de agentes
  useEffect(() => {
    if (isOnboardingActive && currentStep === 'configurar_agente' && agentes.length > 0) {
      completeStep('configurar_agente');
      goToStep('concluido');
    }
  }, [isOnboardingActive, currentStep, agentes.length]);

  const fetchAgentes = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_ia')
        .select('id, nome, tipo, ativo, gatilho, descricao, created_at')
        .eq('conta_id', usuario!.conta_id)
        .order('tipo', { ascending: true })
        .order('nome', { ascending: true });

      if (error) throw error;
      setAgentes((data || []).map(d => ({
        ...d,
        tipo: (d.tipo === 'secundario' ? 'secundario' : 'principal') as 'principal' | 'secundario'
      })));
    } catch (error) {
      console.error('Erro ao buscar agentes:', error);
      toast.error('Erro ao carregar agentes');
    } finally {
      setLoading(false);
    }
  };

  const toggleAgente = async (id: string, ativo: boolean) => {
    try {
      const { error } = await supabase
        .from('agent_ia')
        .update({ ativo: !ativo })
        .eq('id', id);

      if (error) throw error;

      setAgentes(agentes.map(a => 
        a.id === id ? { ...a, ativo: !ativo } : a
      ));
      
      toast.success(ativo ? 'Agente desativado' : 'Agente ativado');
    } catch (error) {
      console.error('Erro ao atualizar agente:', error);
      toast.error('Erro ao atualizar agente');
    }
  };

  const criarNovoAgente = async (nome: string, tipo: 'principal' | 'secundario') => {
    try {
      // Validar limite do plano
      const permitido = await validarEExibirErro(usuario!.conta_id, 'agentes');
      if (!permitido) return;

      const { data, error } = await supabase
        .from('agent_ia')
        .insert({
          conta_id: usuario!.conta_id,
          nome,
          tipo,
          ativo: false,
          prompt_sistema: 'Você é um assistente virtual amigável e profissional.',
          modelo: 'gpt-4o-mini',
        })
        .select('id')
        .single();

      if (error) throw error;

      toast.success('Agente criado! Configure-o agora.');
      navigate(`/agente-ia/${data.id}`);
    } catch (error) {
      console.error('Erro ao criar agente:', error);
      toast.error('Erro ao criar agente');
    }
  };

  const deleteAgente = async (id: string) => {
    try {
      // Deletar etapas e perguntas primeiro (cascade manual)
      await supabase.from('agent_ia_etapas').delete().eq('agent_ia_id', id);
      await supabase.from('agent_ia_perguntas').delete().eq('agent_ia_id', id);
      
      const { error } = await supabase
        .from('agent_ia')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setAgentes(agentes.filter(a => a.id !== id));
      toast.success('Agente excluído com sucesso');
    } catch (error) {
      console.error('Erro ao excluir agente:', error);
      toast.error('Erro ao excluir agente');
    }
  };

  const agentesFiltrados = agentes.filter(a =>
    a.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (a.gatilho && a.gatilho.toLowerCase().includes(busca.toLowerCase()))
  );

  const agentesPrincipais = agentesFiltrados.filter(a => a.tipo === 'principal');
  const agentesSecundarios = agentesFiltrados.filter(a => a.tipo === 'secundario');
  const agentesAtivos = agentes.filter(a => a.ativo).length;

  const subNavItems = [
    { id: 'agentes' as SubPage, label: 'Agentes', icon: Bot, count: agentes.length },
    { id: 'followup' as SubPage, label: 'Follow-up', icon: Clock },
    { id: 'lembretes' as SubPage, label: 'Lembretes', icon: Bell },
    { id: 'sessoes' as SubPage, label: 'Sessões', icon: Users },
    { id: 'campos-personalizados' as SubPage, label: 'Campos Personalizados', icon: ListChecks },
    { id: 'configuracao' as SubPage, label: 'Configuração', icon: Key },
  ];

  return (
    <MainLayout>
      <div className="flex flex-col md:flex-row h-full animate-fade-in">
        {/* Mobile Tabs */}
        {isMobile && (
          <div className="flex overflow-x-auto border-b border-border bg-card/50 px-2 py-2 gap-1">
            {subNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setSubPage(item.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                  subPage === item.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.count !== undefined && (
                  <span className={cn(
                    "text-xs px-1.5 rounded-full",
                    subPage === item.id 
                      ? 'bg-primary-foreground/20 text-primary-foreground' 
                      : 'bg-muted'
                  )}>
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Desktop Sub-Sidebar */}
        {!isMobile && (
          <div className="w-56 border-r border-border bg-card/50 flex flex-col">
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 shadow-lg shadow-primary/25">
                  <Bot className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Agentes IA</h2>
                  <p className="text-xs text-muted-foreground">Automação inteligente</p>
                </div>
              </div>
            </div>

            <nav className="flex-1 p-2 space-y-1">
              {subNavItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSubPage(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    subPage === item.id
                      ? 'bg-primary/10 text-primary shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </div>
                  {item.count !== undefined && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      subPage === item.id 
                        ? 'bg-primary/20 text-primary' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {item.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* Conteúdo Principal */}
        <div className="flex-1 overflow-auto bg-muted/30">
          {subPage === 'agentes' && (
            <div className="p-4 md:p-6 space-y-4 md:space-y-6">
              {/* Stats Cards - Horizontal scroll em mobile */}
              <div className={cn(
                "gap-3 md:gap-4",
                isMobile ? "flex overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory" : "grid grid-cols-1 md:grid-cols-3"
              )}>
                <Card className={cn(
                  "bg-gradient-to-br from-card to-card/80 border-border/50 hover:shadow-lg transition-shadow",
                  isMobile && "flex-shrink-0 w-[140px] snap-center"
                )}>
                  <CardContent className="p-3 md:p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs md:text-sm text-muted-foreground">Total</p>
                        <p className="text-xl md:text-2xl font-bold text-foreground">{agentes.length}</p>
                      </div>
                      <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Bot className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className={cn(
                  "bg-gradient-to-br from-card to-card/80 border-border/50 hover:shadow-lg transition-shadow",
                  isMobile && "flex-shrink-0 w-[140px] snap-center"
                )}>
                  <CardContent className="p-3 md:p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs md:text-sm text-muted-foreground">Ativos</p>
                        <p className="text-xl md:text-2xl font-bold text-emerald-500">{agentesAtivos}</p>
                      </div>
                      <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                        <Zap className="h-5 w-5 md:h-6 md:w-6 text-emerald-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className={cn(
                  "bg-gradient-to-br from-card to-card/80 border-border/50 hover:shadow-lg transition-shadow",
                  isMobile && "flex-shrink-0 w-[140px] snap-center"
                )}>
                  <CardContent className="p-3 md:p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs md:text-sm text-muted-foreground">Inativos</p>
                        <p className="text-xl md:text-2xl font-bold text-muted-foreground">{agentes.length - agentesAtivos}</p>
                      </div>
                      <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl bg-muted flex items-center justify-center">
                        <PowerOff className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Header com busca */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar..."
                    className="w-full h-10 pl-10 pr-4 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>
                <button
                  onClick={() => setShowNovoAgenteModal(true)}
                  className="flex items-center justify-center gap-2 h-10 px-4 md:px-5 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-medium hover:shadow-lg hover:shadow-primary/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Novo Agente</span>
                  <span className="sm:hidden">Novo</span>
                </button>
              </div>

              <NovoAgenteModal
                open={showNovoAgenteModal}
                onOpenChange={setShowNovoAgenteModal}
                onConfirm={criarNovoAgente}
              />

              {loading ? (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-40" />
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-48 rounded-xl" />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Agentes Principais */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10">
                        <Crown className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                          Agentes Principais
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        ({agentesPrincipais.length})
                      </span>
                    </div>
                    
                    {agentesPrincipais.length === 0 ? (
                      <EmptyAgentState type="principal" onCreate={() => setShowNovoAgenteModal(true)} />
                    ) : (
                      <OnboardingTooltip
                        title="Seus Agentes de IA"
                        description="Aqui você configura o comportamento do seu assistente virtual. Clique em Editar para personalizar as regras, etapas e FAQs."
                        step={4}
                        totalSteps={5}
                        position="bottom"
                        isVisible={isOnboardingActive && currentStep === 'configurar_agente'}
                        onNext={() => {
                          completeStep('configurar_agente');
                          goToStep('concluido');
                        }}
                      >
                        <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                          {agentesPrincipais.map((agente) => (
                            <AgentCard
                              key={agente.id}
                              agente={agente}
                              onToggle={() => toggleAgente(agente.id, agente.ativo)}
                              onEdit={() => navigate(`/agente-ia/${agente.id}`)}
                              onDelete={() => deleteAgente(agente.id)}
                            />
                          ))}
                        </div>
                      </OnboardingTooltip>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="border-t border-border/50" />

                  {/* Agentes Secundários */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold text-primary">
                          Agentes Secundários
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        ({agentesSecundarios.length})
                      </span>
                    </div>
                    
                    {agentesSecundarios.length === 0 ? (
                      <EmptyAgentState type="secundario" onCreate={() => setShowNovoAgenteModal(true)} />
                    ) : (
                      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                        {agentesSecundarios.map((agente) => (
                          <AgentCard
                            key={agente.id}
                            agente={agente}
                            onToggle={() => toggleAgente(agente.id, agente.ativo)}
                            onEdit={() => navigate(`/agente-ia/${agente.id}`)}
                            onDelete={() => deleteAgente(agente.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {subPage === 'followup' && (
            <FollowUpPage />
          )}

          {subPage === 'lembretes' && (
            <LembretesPage />
          )}

          {subPage === 'sessoes' && (
            <SessoesPage />
          )}

          {subPage === 'configuracao' && (
            <ConfiguracaoPage />
          )}

          {subPage === 'campos-personalizados' && (
            <CamposPersonalizadosContent />
          )}
        </div>
      </div>
    </MainLayout>
  );
}

// Empty State Component
function EmptyAgentState({ type, onCreate }: { type: 'principal' | 'secundario'; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-card border border-dashed border-border/70">
      <div className={`h-16 w-16 rounded-2xl flex items-center justify-center mb-4 ${
        type === 'principal' ? 'bg-amber-500/10' : 'bg-primary/10'
      }`}>
        <Bot className={`h-8 w-8 ${type === 'principal' ? 'text-amber-500' : 'text-primary'}`} />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">
        Nenhum agente {type}
      </h3>
      <p className="text-sm text-muted-foreground text-center mb-4 max-w-sm">
        {type === 'principal' 
          ? 'Crie um agente principal para atender automaticamente seus clientes'
          : 'Agentes secundários podem ser usados para tarefas específicas ou transferências'
        }
      </p>
      <button
        onClick={onCreate}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
      >
        <Plus className="h-4 w-4" />
        Criar Agente
      </button>
    </div>
  );
}

// Componente AgentCard Redesenhado
function AgentCard({ 
  agente, 
  onToggle, 
  onEdit,
  onDelete
}: { 
  agente: Agent; 
  onToggle: () => void; 
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isPrincipal = agente.tipo === 'principal';
  
  return (
    <Card className={`group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/30 ${
      agente.ativo ? 'border-emerald-500/30 bg-gradient-to-br from-card to-emerald-500/5' : 'bg-card'
    }`}>
      {/* Status Badge */}
      <div className="absolute top-3 right-3 z-10">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
          agente.ativo 
            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
            : 'bg-muted text-muted-foreground'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${agente.ativo ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
          {agente.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl shrink-0 transition-transform group-hover:scale-105 ${
            isPrincipal 
              ? 'bg-gradient-to-br from-amber-500/20 to-amber-500/5' 
              : 'bg-gradient-to-br from-primary/20 to-primary/5'
          }`}>
            <Bot className={`h-7 w-7 ${isPrincipal ? 'text-amber-500' : 'text-primary'}`} />
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <h3 className="font-semibold text-foreground truncate text-lg">{agente.nome}</h3>
            <p className={`text-xs font-medium ${isPrincipal ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}`}>
              {isPrincipal ? 'Principal' : 'Secundário'}
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[40px]">
          {agente.descricao || agente.gatilho || 'Sem descrição configurada'}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="flex items-center gap-1">
            {/* Botão Editar */}
            <button
              onClick={onEdit}
              className="p-2 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"
              title="Editar agente"
            >
              <Pencil className="h-4 w-4" />
            </button>
            
            {/* Botão Excluir */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                  title="Excluir agente"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. O agente "{agente.nome}" será 
                    excluído permanentemente junto com suas etapas e perguntas.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={onDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          
          {/* Toggle Ativo/Inativo */}
          <button
            onClick={onToggle}
            className={`relative h-7 w-12 rounded-full transition-all ${
              agente.ativo 
                ? 'bg-emerald-500 shadow-lg shadow-emerald-500/25' 
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            <div
              className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                agente.ativo ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// Página de Follow-up
function FollowUpPage() {
  const { usuario } = useAuth();
  const [regras, setRegras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRegra, setEditingRegra] = useState<any>(null);
  const [executando, setExecutando] = useState(false);

  useEffect(() => {
    if (usuario?.conta_id) {
      fetchRegras();
    }
  }, [usuario?.conta_id]);

  const fetchRegras = async () => {
    try {
      const { data, error } = await supabase
        .from('followup_regras')
        .select('*')
        .eq('conta_id', usuario!.conta_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRegras(data || []);
    } catch (error) {
      console.error('Erro ao buscar regras:', error);
      toast.error('Erro ao carregar regras de follow-up');
    } finally {
      setLoading(false);
    }
  };

  const toggleRegra = async (id: string, ativo: boolean) => {
    try {
      const { error } = await supabase
        .from('followup_regras')
        .update({ ativo: !ativo })
        .eq('id', id);

      if (error) throw error;

      setRegras(regras.map(r => r.id === id ? { ...r, ativo: !ativo } : r));
      toast.success(ativo ? 'Regra desativada' : 'Regra ativada');
    } catch (error) {
      console.error('Erro ao atualizar regra:', error);
      toast.error('Erro ao atualizar regra');
    }
  };

  const deleteRegra = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta regra?')) return;

    try {
      const { error } = await supabase
        .from('followup_regras')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setRegras(regras.filter(r => r.id !== id));
      toast.success('Regra excluída');
    } catch (error) {
      console.error('Erro ao excluir regra:', error);
      toast.error('Erro ao excluir regra');
    }
  };

  const executarFollowups = async () => {
    setExecutando(true);
    try {
      const { data, error } = await supabase.functions.invoke('processar-followups');
      
      if (error) throw error;
      
      toast.success(`Processamento concluído! ${data?.followupsEnviados || 0} follow-ups enviados.`);
    } catch (error) {
      console.error('Erro ao processar follow-ups:', error);
      toast.error('Erro ao processar follow-ups');
    } finally {
      setExecutando(false);
    }
  };

  const openEdit = (regra: any) => {
    setEditingRegra(regra);
    setShowModal(true);
  };

  const openNew = () => {
    setEditingRegra(null);
    setShowModal(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Follow-up Automático</h1>
          <p className="text-muted-foreground mt-1">
            Configure mensagens de acompanhamento para manter seus leads engajados
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={executarFollowups}
            disabled={executando}
            className="flex items-center gap-2 h-10 px-4 rounded-lg border border-border text-foreground font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {executando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Executar Agora
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nova Regra
          </button>
        </div>
      </div>

      <FollowUpRegraModal
        open={showModal}
        onOpenChange={setShowModal}
        regra={editingRegra}
        onSave={fetchRegras}
      />

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : regras.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 rounded-xl bg-card border border-border">
          <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-foreground mb-1">Nenhum follow-up configurado</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Crie mensagens automáticas para reengajar seus leads
          </p>
          <button
            onClick={openNew}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Criar Primeiro Follow-up
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {regras.map((regra) => (
            <div
              key={regra.id}
              className="group flex items-center justify-between p-4 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  regra.tipo === 'contextual_ia' ? 'bg-primary/20' : 'bg-muted'
                }`}>
                  {regra.tipo === 'contextual_ia' ? (
                    <Bot className="h-5 w-5 text-primary" />
                  ) : (
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{regra.nome}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      regra.tipo === 'contextual_ia' 
                        ? 'bg-primary/10 text-primary' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {regra.tipo === 'contextual_ia' ? 'IA Contextual' : 'Texto Fixo'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Após {regra.horas_sem_resposta >= 60 && regra.horas_sem_resposta % 60 === 0 
                      ? `${regra.horas_sem_resposta / 60}h` 
                      : `${regra.horas_sem_resposta} min`} sem resposta • Máx {regra.max_tentativas} tentativas
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(regra)}
                  className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-muted transition-all"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => deleteRegra(regra.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-destructive/10 transition-all"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </button>
                <button
                  onClick={() => toggleRegra(regra.id, regra.ativo)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    regra.ativo ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      regra.ativo ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="p-4 rounded-lg bg-muted/30 border border-dashed border-border">
        <h4 className="font-medium text-foreground mb-2">Como funciona</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• <strong>Texto Fixo:</strong> Envia a mesma mensagem para todos os leads</li>
          <li>• <strong>IA Contextual:</strong> A IA analisa a conversa e gera um follow-up personalizado</li>
          <li>• O sistema verifica conversas sem resposta e envia o follow-up automaticamente</li>
          <li>• Use "Executar Agora" para processar manualmente ou configure um cron job</li>
        </ul>
      </div>
    </div>
  );
}

// Interface para Sessão/Conversa
interface Sessao {
  id: string;
  status: string;
  agente_ia_ativo: boolean;
  ultima_mensagem: string | null;
  ultima_mensagem_at: string | null;
  created_at: string;
  contato: {
    id: string;
    nome: string;
    telefone: string;
    avatar_url: string | null;
  } | null;
  agente: {
    nome: string;
  } | null;
}

type StatusFilter = 'todos' | 'em_atendimento' | 'encerrado';

// Página de Sessões
function SessoesPage() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (usuario?.conta_id) {
      fetchSessoes();
    }
  }, [usuario?.conta_id]);

  const fetchSessoes = async () => {
    try {
      const { data, error } = await supabase
        .from('conversas')
        .select(`
          id,
          status,
          agente_ia_ativo,
          ultima_mensagem,
          ultima_mensagem_at,
          created_at,
          contato:contatos(id, nome, telefone, avatar_url),
          agente:agent_ia(nome)
        `)
        .eq('conta_id', usuario!.conta_id)
        .order('ultima_mensagem_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      setSessoes(data || []);
    } catch (error) {
      console.error('Erro ao buscar sessões:', error);
      toast.error('Erro ao carregar sessões');
    } finally {
      setLoading(false);
    }
  };

  const deleteSessao = async (id: string) => {
    setDeletingId(id);
    try {
      // Primeiro deletar as mensagens
      const { error: msgError } = await supabase
        .from('mensagens')
        .delete()
        .eq('conversa_id', id);

      if (msgError) throw msgError;

      // Depois deletar a conversa
      const { error } = await supabase
        .from('conversas')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setSessoes(sessoes.filter(s => s.id !== id));
      toast.success('Sessão excluída com sucesso');
    } catch (error) {
      console.error('Erro ao excluir sessão:', error);
      toast.error('Erro ao excluir sessão');
    } finally {
      setDeletingId(null);
    }
  };

  const sessoesFiltradas = sessoes.filter(s => {
    // Filtro de busca
    const matchBusca = !busca || 
      s.contato?.nome?.toLowerCase().includes(busca.toLowerCase()) ||
      s.contato?.telefone?.includes(busca);
    
    // Filtro de status
    const matchStatus = statusFilter === 'todos' || s.status === statusFilter;
    
    return matchBusca && matchStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'em_atendimento':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">Em atendimento</span>;
      case 'encerrado':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Encerrado</span>;
      case 'aguardando_cliente':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">Aguardando cliente</span>;
      default:
        return <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{status}</span>;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return format(new Date(dateStr), "dd/MM HH:mm", { locale: ptBR });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sessões</h1>
        <p className="text-muted-foreground mt-1">
          Visualize e gerencie as sessões de atendimento dos agentes
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full h-10 pl-10 pr-4 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2">
          {(['todos', 'em_atendimento', 'encerrado'] as StatusFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`h-10 px-4 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {status === 'todos' ? 'Todos' : status === 'em_atendimento' ? 'Em Atendimento' : 'Encerrados'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Sessões */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : sessoesFiltradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 rounded-xl bg-card border border-border">
          <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-foreground mb-1">
            {busca || statusFilter !== 'todos' ? 'Nenhuma sessão encontrada' : 'Nenhuma sessão registrada'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {busca || statusFilter !== 'todos' 
              ? 'Tente ajustar os filtros de busca' 
              : 'As sessões de atendimento aparecerão aqui'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessoesFiltradas.map((sessao) => (
            <div
              key={sessao.id}
              className="group flex items-center justify-between p-4 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                {/* Avatar */}
                {sessao.contato?.avatar_url ? (
                  <img 
                    src={sessao.contato.avatar_url} 
                    alt={sessao.contato.nome} 
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-lg font-semibold text-primary">
                      {sessao.contato?.nome?.charAt(0).toUpperCase() || '?'}
                    </span>
                  </div>
                )}

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => navigate(`/conversas?contato=${sessao.contato?.id}`)}
                      className="font-medium text-foreground hover:text-primary hover:underline truncate"
                    >
                      {sessao.contato?.nome || 'Desconhecido'}
                    </button>
                    <span className="text-sm text-muted-foreground">
                      {sessao.contato?.telefone}
                    </span>
                    {getStatusBadge(sessao.status)}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span className="truncate max-w-[300px]">
                      {sessao.ultima_mensagem || 'Sem mensagens'}
                    </span>
                    <span className="text-xs">•</span>
                    <span className="text-xs whitespace-nowrap">
                      {formatDate(sessao.ultima_mensagem_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`text-xs ${sessao.agente_ia_ativo ? 'text-primary' : 'text-amber-500'}`}>
                      {sessao.agente_ia_ativo ? (
                        <>
                          <Bot className="h-3 w-3 inline mr-1" />
                          IA Ativa
                        </>
                      ) : (
                        <>
                          <Users className="h-3 w-3 inline mr-1" />
                          Humano
                        </>
                      )}
                    </span>
                    {sessao.agente && (
                      <>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          Agente: {sessao.agente.nome}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Ações */}
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => navigate(`/conversas?contato=${sessao.contato?.id}`)}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  title="Ver conversa"
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </button>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="p-2 rounded-lg hover:bg-destructive/10 transition-colors"
                      title="Excluir sessão"
                      disabled={deletingId === sessao.id}
                    >
                      {deletingId === sessao.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir sessão?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita. A sessão de "{sessao.contato?.nome || 'Desconhecido'}" 
                        será excluída permanentemente, incluindo todo o histórico de mensagens.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => deleteSessao(sessao.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="p-4 rounded-lg bg-muted/30 border border-dashed border-border">
        <p className="text-sm text-muted-foreground">
          <strong>{sessoesFiltradas.length}</strong> sessão(ões) encontrada(s)
          {statusFilter !== 'todos' && ` com status "${statusFilter === 'em_atendimento' ? 'Em Atendimento' : 'Encerrado'}"`}
        </p>
      </div>
    </div>
  );
}

// Página de Configuração (API Key)
function ConfiguracaoPage() {
  const { usuario } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reabrirComIA, setReabrirComIA] = useState(true);
  const [savingReabrir, setSavingReabrir] = useState(false);

  useEffect(() => {
    if (usuario?.conta_id) {
      fetchConfig();
    }
  }, [usuario?.conta_id]);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('contas')
        .select('openai_api_key, reabrir_com_ia')
        .eq('id', usuario!.conta_id)
        .single();

      if (error) throw error;
      
      if (data?.openai_api_key) {
        setApiKey(data.openai_api_key);
      }
      setReabrirComIA(data?.reabrir_com_ia ?? true);
    } catch (error) {
      console.error('Erro ao buscar configurações:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveApiKey = async () => {
    if (!usuario?.conta_id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('contas')
        .update({ openai_api_key: apiKey })
        .eq('id', usuario.conta_id);

      if (error) throw error;
      toast.success('API Key salva com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar API key:', error);
      toast.error('Erro ao salvar API Key');
    } finally {
      setSaving(false);
    }
  };

  const handleReabrirChange = async (value: boolean) => {
    if (!usuario?.conta_id) return;

    setSavingReabrir(true);
    try {
      const { error } = await supabase
        .from('contas')
        .update({ reabrir_com_ia: value })
        .eq('id', usuario.conta_id);

      if (error) throw error;
      setReabrirComIA(value);
      toast.success('Configuração salva!');
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSavingReabrir(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuração</h1>
        <p className="text-muted-foreground mt-1">
          Configure sua chave de API e comportamento dos agentes de IA
        </p>
      </div>

      {/* API Key Section */}
      <div className="max-w-2xl rounded-xl bg-card border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Key className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">API Key da OpenAI</h2>
            <p className="text-sm text-muted-foreground">
              Esta chave será usada por todos os agentes da sua conta
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                OpenAI API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full h-11 px-4 pr-12 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Obtenha sua chave em{' '}
                <a 
                  href="https://platform.openai.com/api-keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  platform.openai.com/api-keys
                </a>
              </p>
            </div>

            <button
              onClick={saveApiKey}
              disabled={saving || !apiKey}
              className="flex items-center gap-2 h-10 px-6 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar API Key
            </button>
          </div>
        )}
      </div>

      {/* Comportamento ao Reabrir Conversa */}
      <div className="max-w-2xl rounded-xl bg-card border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <RefreshCw className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Comportamento ao Reabrir Conversa</h2>
            <p className="text-sm text-muted-foreground">
              Defina como conversas encerradas devem ser reabertas quando o lead envia nova mensagem
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            <label 
              className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                reabrirComIA 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-muted-foreground/50'
              } ${savingReabrir ? 'opacity-50 pointer-events-none' : ''}`}
              onClick={() => handleReabrirChange(true)}
            >
              <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                reabrirComIA ? 'border-primary' : 'border-muted-foreground/50'
              }`}>
                {reabrirComIA && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="font-medium text-foreground">Reabrir com Agente IA Principal</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  O agente de IA principal assume automaticamente a conversa, pronto para atender o lead
                </p>
              </div>
            </label>

            <label 
              className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                !reabrirComIA 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-muted-foreground/50'
              } ${savingReabrir ? 'opacity-50 pointer-events-none' : ''}`}
              onClick={() => handleReabrirChange(false)}
            >
              <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                !reabrirComIA ? 'border-primary' : 'border-muted-foreground/50'
              }`}>
                {!reabrirComIA && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-orange-500" />
                  <span className="font-medium text-foreground">Reabrir com Atendimento Humano</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  A conversa reabre aguardando um atendente humano assumir manualmente
                </p>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Status Info */}
      <div className={`max-w-2xl rounded-xl border p-4 ${apiKey ? 'bg-primary/5 border-primary/20' : 'bg-destructive/5 border-destructive/20'}`}>
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${apiKey ? 'bg-primary animate-pulse' : 'bg-destructive'}`} />
          <span className={`text-sm font-medium ${apiKey ? 'text-primary' : 'text-destructive'}`}>
            {apiKey ? 'API Key configurada - Agentes prontos para uso' : 'API Key não configurada - Configure para habilitar os agentes'}
          </span>
        </div>
      </div>
    </div>
  );
}

// Interface para Lembrete Regra
interface LembreteRegraItem {
  id: string;
  nome: string;
  minutos_antes: number;
  tipo: 'texto_fixo' | 'contextual_ia';
  mensagem_fixa: string | null;
  prompt_lembrete: string | null;
  incluir_link_meet: boolean;
  incluir_detalhes: boolean;
  ativo: boolean;
  created_at: string;
}

// Página de Lembretes
function LembretesPage() {
  const { usuario } = useAuth();
  const [regras, setRegras] = useState<LembreteRegraItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRegra, setEditingRegra] = useState<LembreteRegraItem | null>(null);
  const [executando, setExecutando] = useState(false);

  useEffect(() => {
    if (usuario?.conta_id) {
      fetchRegras();
    }
  }, [usuario?.conta_id]);

  const fetchRegras = async () => {
    try {
      const { data, error } = await supabase
        .from('lembrete_regras')
        .select('*')
        .eq('conta_id', usuario!.conta_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRegras((data || []).map(d => ({
        ...d,
        tipo: d.tipo as 'texto_fixo' | 'contextual_ia'
      })));
    } catch (error) {
      console.error('Erro ao buscar regras:', error);
      toast.error('Erro ao carregar regras de lembrete');
    } finally {
      setLoading(false);
    }
  };

  const toggleRegra = async (id: string, ativo: boolean) => {
    try {
      const { error } = await supabase
        .from('lembrete_regras')
        .update({ ativo: !ativo })
        .eq('id', id);

      if (error) throw error;

      setRegras(regras.map(r => r.id === id ? { ...r, ativo: !ativo } : r));
      toast.success(ativo ? 'Regra desativada' : 'Regra ativada');
    } catch (error) {
      console.error('Erro ao atualizar regra:', error);
      toast.error('Erro ao atualizar regra');
    }
  };

  const deleteRegra = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta regra?')) return;

    try {
      const { error } = await supabase
        .from('lembrete_regras')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setRegras(regras.filter(r => r.id !== id));
      toast.success('Regra excluída');
    } catch (error) {
      console.error('Erro ao excluir regra:', error);
      toast.error('Erro ao excluir regra');
    }
  };

  const executarLembretes = async () => {
    setExecutando(true);
    try {
      const { data, error } = await supabase.functions.invoke('processar-lembretes');
      
      if (error) throw error;
      
      toast.success(`Processamento concluído! ${data?.lembretesEnviados || 0} lembretes enviados.`);
    } catch (error) {
      console.error('Erro ao processar lembretes:', error);
      toast.error('Erro ao processar lembretes');
    } finally {
      setExecutando(false);
    }
  };

  const openEdit = (regra: LembreteRegraItem) => {
    setEditingRegra(regra);
    setShowModal(true);
  };

  const openNew = () => {
    setEditingRegra(null);
    setShowModal(true);
  };

  const formatTempo = (minutos: number): string => {
    if (minutos >= 1440) return `${minutos / 1440} dia${minutos / 1440 > 1 ? 's' : ''}`;
    if (minutos >= 60) return `${minutos / 60}h`;
    return `${minutos} min`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lembretes de Agendamentos</h1>
          <p className="text-muted-foreground mt-1">
            Envie lembretes automáticos antes das reuniões agendadas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={executarLembretes}
            disabled={executando}
            className="flex items-center gap-2 h-10 px-4 rounded-lg border border-border text-foreground font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {executando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Executar Agora
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nova Regra
          </button>
        </div>
      </div>

      <LembreteRegraModal
        open={showModal}
        onOpenChange={setShowModal}
        regra={editingRegra}
        onSave={fetchRegras}
      />

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : regras.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 rounded-xl bg-card border border-border">
          <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-foreground mb-1">Nenhum lembrete configurado</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Crie lembretes automáticos para suas reuniões
          </p>
          <button
            onClick={openNew}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Criar Primeiro Lembrete
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {regras.map((regra) => (
            <div
              key={regra.id}
              className="group flex items-center justify-between p-4 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  regra.tipo === 'contextual_ia' ? 'bg-primary/20' : 'bg-amber-500/20'
                }`}>
                  {regra.tipo === 'contextual_ia' ? (
                    <Bot className="h-5 w-5 text-primary" />
                  ) : (
                    <Bell className="h-5 w-5 text-amber-500" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{regra.nome}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      regra.tipo === 'contextual_ia' 
                        ? 'bg-primary/10 text-primary' 
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}>
                      {regra.tipo === 'contextual_ia' ? 'IA Contextual' : 'Texto Fixo'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatTempo(regra.minutos_antes)} antes da reunião
                    {regra.incluir_link_meet && ' • Inclui link Meet'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(regra)}
                  className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-muted transition-all"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => deleteRegra(regra.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-destructive/10 transition-all"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </button>
                <button
                  onClick={() => toggleRegra(regra.id, regra.ativo)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    regra.ativo ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      regra.ativo ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="p-4 rounded-lg bg-muted/30 border border-dashed border-border">
        <h4 className="font-medium text-foreground mb-2">Como funciona</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• <strong>Texto Fixo:</strong> Use variáveis como {"{{nome_contato}}"}, {"{{titulo}}"}, {"{{link_meet}}"}</li>
          <li>• <strong>IA Contextual:</strong> A IA gera uma mensagem personalizada com os detalhes do agendamento</li>
          <li>• O sistema verifica agendamentos próximos e envia lembretes automaticamente</li>
          <li>• Configure um cron job para executar a cada minuto para precisão nos envios</li>
        </ul>
      </div>
    </div>
  );
}
