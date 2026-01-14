import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import {
  TrendingUp,
  Users,
  MessageSquare,
  DollarSign,
  Plug,
  PlugZap,
  Sparkles,
  Zap,
  RefreshCw,
  Trophy,
  XCircle,
  Bot,
  Clock,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOnboarding } from '@/contexts/OnboardingContext';

import { EscolhaConexaoModal } from '@/components/onboarding/EscolhaConexaoModal';
import { Button } from '@/components/ui/button';
import { differenceInDays, format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DashboardStats {
  totalNegociacoes: number;
  valorTotal: number;
  totalContatos: number;
  totalMensagens: number;
  mensagensEsteMes: number;
  limiteMensagens: number;
  nomePlano: string;
  conexaoStatus: 'conectado' | 'desconectado' | 'aguardando';
  openaiConfigurado: boolean;
  agenteConfigurado: boolean;
  diasParaReset: number | null;
  dataReset: string | null;
  // Novas métricas
  negociacoesGanhas: number;
  negociacoesPerdidas: number;
  valorGanho: number;
  valorPerdido: number;
  taxaConversao: number;
  conversasAtivas: number;
  mensagensIAHoje: number;
}

interface ConversaRecente {
  id: string;
  ultima_mensagem: string | null;
  ultima_mensagem_at: string | null;
  status: string | null;
  contato: {
    id: string;
    nome: string;
    avatar_url: string | null;
    telefone: string;
  } | null;
}

interface NegociacaoRecente {
  id: string;
  titulo: string;
  valor: number | null;
  status: string | null;
  created_at: string;
  estagio: {
    id: string;
    nome: string;
    cor: string | null;
    tipo: string | null;
  } | null;
  contato: {
    id: string;
    nome: string;
  } | null;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const isMobile = useIsMobile();
  const { isOnboardingActive, currentStep, startOnboarding } = useOnboarding();
  const [showEscolhaConexao, setShowEscolhaConexao] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalNegociacoes: 0,
    valorTotal: 0,
    totalContatos: 0,
    totalMensagens: 0,
    mensagensEsteMes: 0,
    limiteMensagens: 10000,
    nomePlano: 'Starter',
    conexaoStatus: 'desconectado',
    openaiConfigurado: false,
    agenteConfigurado: false,
    diasParaReset: null,
    dataReset: null,
    negociacoesGanhas: 0,
    negociacoesPerdidas: 0,
    valorGanho: 0,
    valorPerdido: 0,
    taxaConversao: 0,
    conversasAtivas: 0,
    mensagensIAHoje: 0,
  });
  const [conversasRecentes, setConversasRecentes] = useState<ConversaRecente[]>([]);
  const [negociacoesRecentes, setNegociacoesRecentes] = useState<NegociacaoRecente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (usuario?.conta_id) {
      fetchStats();
      fetchConversasRecentes();
      fetchNegociacoesRecentes();
    }
  }, [usuario]);

  useEffect(() => {
    if (isOnboardingActive && currentStep === 'escolha_conexao') {
      setShowEscolhaConexao(true);
    }
  }, [isOnboardingActive, currentStep]);

  const fetchConversasRecentes = async () => {
    const { data } = await supabase
      .from('conversas')
      .select(`
        id, 
        ultima_mensagem, 
        ultima_mensagem_at, 
        status,
        contato:contatos(id, nome, avatar_url, telefone)
      `)
      .eq('conta_id', usuario!.conta_id)
      .order('ultima_mensagem_at', { ascending: false })
      .limit(5);

    if (data) {
      setConversasRecentes(data as unknown as ConversaRecente[]);
    }
  };

  const fetchNegociacoesRecentes = async () => {
    const { data } = await supabase
      .from('negociacoes')
      .select(`
        id, 
        titulo, 
        valor, 
        status,
        created_at,
        estagio:estagios(id, nome, cor, tipo),
        contato:contatos(id, nome)
      `)
      .eq('conta_id', usuario!.conta_id)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (data) {
      setNegociacoesRecentes(data as unknown as NegociacaoRecente[]);
    }
  };

  const fetchStats = async () => {
    try {
      // Buscar negociações com informação de etapa para calcular ganho/perda
      const { data: negociacoesComEstagio } = await supabase
        .from('negociacoes')
        .select(`
          id, 
          valor, 
          status,
          estagio:estagios(tipo)
        `)
        .eq('conta_id', usuario!.conta_id);

      // Calcular métricas de ganho/perda pelo tipo da etapa
      const ganhas = negociacoesComEstagio?.filter(n => (n.estagio as any)?.tipo === 'ganho') || [];
      const perdidas = negociacoesComEstagio?.filter(n => (n.estagio as any)?.tipo === 'perdido') || [];
      const abertas = negociacoesComEstagio?.filter(n => (n.estagio as any)?.tipo === 'normal' || !(n.estagio as any)?.tipo) || [];
      
      const valorGanho = ganhas.reduce((acc, n) => acc + Number(n.valor || 0), 0);
      const valorPerdido = perdidas.reduce((acc, n) => acc + Number(n.valor || 0), 0);
      const valorAberto = abertas.reduce((acc, n) => acc + Number(n.valor || 0), 0);
      
      const totalFechadas = ganhas.length + perdidas.length;
      const taxaConversao = totalFechadas > 0 ? (ganhas.length / totalFechadas) * 100 : 0;

      const [contatos, conexao, contaComPlano, agentes, conversasAtivas] = await Promise.all([
        supabase.from('contatos').select('id', { count: 'exact' }).eq('conta_id', usuario!.conta_id),
        supabase.from('conexoes_whatsapp').select('status').eq('conta_id', usuario!.conta_id).maybeSingle(),
        supabase
          .from('contas')
          .select('openai_api_key, stripe_current_period_start, stripe_current_period_end, plano:planos(nome, limite_mensagens_mes)')
          .eq('id', usuario!.conta_id)
          .single(),
        supabase.from('agent_ia').select('id, prompt_sistema').eq('conta_id', usuario!.conta_id),
        supabase.from('conversas').select('id', { count: 'exact' }).eq('conta_id', usuario!.conta_id).in('status', ['em_atendimento', 'aguardando_cliente']),
      ]);

      // Determinar início do ciclo (Stripe ou primeiro dia do mês)
      let inicioCiclo: Date;
      let fimCiclo: Date | null = null;
      
      if (contaComPlano.data?.stripe_current_period_start) {
        inicioCiclo = new Date(contaComPlano.data.stripe_current_period_start);
        fimCiclo = contaComPlano.data.stripe_current_period_end 
          ? new Date(contaComPlano.data.stripe_current_period_end) 
          : null;
      } else {
        inicioCiclo = new Date();
        inicioCiclo.setDate(1);
        inicioCiclo.setHours(0, 0, 0, 0);
        fimCiclo = new Date(inicioCiclo.getFullYear(), inicioCiclo.getMonth() + 1, 0);
      }

      // Contar mensagens IA do ciclo atual
      const { count: mensagensMesCount } = await supabase
        .from('mensagens')
        .select('id', { count: 'exact' })
        .gte('created_at', inicioCiclo.toISOString())
        .eq('enviada_por_ia', true);

      // Contar mensagens IA de hoje
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const { count: mensagensIAHoje } = await supabase
        .from('mensagens')
        .select('id', { count: 'exact' })
        .gte('created_at', hoje.toISOString())
        .eq('enviada_por_ia', true);

      const temAgente = agentes.data && agentes.data.length > 0 && 
        agentes.data.some(a => a.prompt_sistema && a.prompt_sistema.length > 50);

      const planoData = contaComPlano.data?.plano as { nome: string; limite_mensagens_mes: number } | null;

      const diasParaReset = fimCiclo ? differenceInDays(fimCiclo, new Date()) : null;
      const dataReset = fimCiclo ? format(fimCiclo, "dd 'de' MMMM", { locale: ptBR }) : null;

      setStats({
        totalNegociacoes: abertas.length,
        valorTotal: valorAberto,
        totalContatos: contatos.count || 0,
        totalMensagens: 0,
        mensagensEsteMes: mensagensMesCount || 0,
        limiteMensagens: planoData?.limite_mensagens_mes || 10000,
        nomePlano: planoData?.nome || 'Sem plano',
        conexaoStatus: (conexao.data?.status as any) || 'desconectado',
        openaiConfigurado: !!contaComPlano.data?.openai_api_key,
        agenteConfigurado: temAgente,
        diasParaReset,
        dataReset,
        negociacoesGanhas: ganhas.length,
        negociacoesPerdidas: perdidas.length,
        valorGanho,
        valorPerdido,
        taxaConversao,
        conversasAtivas: conversasAtivas.count || 0,
        mensagensIAHoje: mensagensIAHoje || 0,
      });
    } catch (error) {
      console.error('Erro ao buscar stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleStartTutorial = () => {
    startOnboarding();
    setShowEscolhaConexao(true);
  };

  const percentualUso = stats.limiteMensagens >= 999999 
    ? 0 
    : Math.min((stats.mensagensEsteMes / stats.limiteMensagens) * 100, 100);
  
  const getUsageColor = () => {
    if (percentualUso >= 90) return 'text-destructive';
    if (percentualUso >= 70) return 'text-warning';
    return 'text-success';
  };

  const getProgressColor = () => {
    if (percentualUso >= 90) return 'bg-destructive';
    if (percentualUso >= 70) return 'bg-warning';
    return 'bg-success';
  };

  const formatNumber = (num: number) => {
    if (num >= 999999) return '∞';
    return num.toLocaleString('pt-BR');
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
  };

  const needsSetup = stats.conexaoStatus !== 'conectado' || 
    !stats.openaiConfigurado || 
    !stats.agenteConfigurado;

  const getEstagioIcon = (tipo: string | null) => {
    if (tipo === 'ganho') return <Trophy className="h-4 w-4 text-success" />;
    if (tipo === 'perdido') return <XCircle className="h-4 w-4 text-destructive" />;
    return <Clock className="h-4 w-4 text-warning" />;
  };

  return (
    <MainLayout>
      <div className="space-y-6 md:space-y-8 animate-fade-in px-4 md:px-0">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Bem-vindo, {usuario?.nome?.split(' ')[0]}!
            </p>
          </div>
          {!isOnboardingActive && !loading && needsSetup && (
            <Button onClick={handleStartTutorial} className="gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Iniciar Tutorial</span>
            </Button>
          )}
        </div>


        {/* Status da Conexão */}
        <div className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-card border border-border">
          <div
            className={`flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl flex-shrink-0 ${
              stats.conexaoStatus === 'conectado' ? 'bg-success/20' : 'bg-muted'
            }`}
          >
            {stats.conexaoStatus === 'conectado' ? (
              <PlugZap className="h-5 w-5 md:h-6 md:w-6 text-success" />
            ) : (
              <Plug className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs md:text-sm text-muted-foreground">Status WhatsApp</p>
            <p
              className={`font-semibold text-sm md:text-base truncate ${
                stats.conexaoStatus === 'conectado' ? 'text-success' : 'text-muted-foreground'
              }`}
            >
              {stats.conexaoStatus === 'conectado'
                ? 'Conectado'
                : stats.conexaoStatus === 'aguardando'
                ? 'Aguardando QR'
                : 'Desconectado'}
            </p>
          </div>
          {stats.conexaoStatus !== 'conectado' && (
            <a
              href="/conexao"
              className="px-3 md:px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs md:text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
            >
              Configurar
            </a>
          )}
        </div>

        {/* Card de Uso do Plano */}
        {!loading && (
          <div className="p-4 md:p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Zap className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm md:text-base">Uso do Plano</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">{stats.nomePlano}</p>
                </div>
              </div>
              <div className={`text-right ${getUsageColor()}`}>
                <p className="text-xl md:text-2xl font-bold">{percentualUso.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">utilizado</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Mensagens IA este ciclo</span>
                <span className="font-medium text-foreground">
                  {formatNumber(stats.mensagensEsteMes)} / {formatNumber(stats.limiteMensagens)}
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${getProgressColor()}`}
                  style={{ width: `${Math.min(percentualUso, 100)}%` }}
                />
              </div>
              
              {stats.diasParaReset !== null && stats.diasParaReset >= 0 && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Reinicia em <span className="font-medium text-foreground">{stats.diasParaReset} dias</span>
                    {stats.dataReset && <span className="text-xs ml-1">({stats.dataReset})</span>}
                  </span>
                </div>
              )}
              
              {percentualUso >= 80 && (
                <p className="text-xs text-warning mt-2">
                  ⚠️ Você está próximo do limite. Considere fazer upgrade do seu plano.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Cards de Vendas - Linha 1 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {/* Pipeline */}
          <div className="p-4 md:p-5 rounded-xl bg-card border border-border hover:border-primary/50 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-lg md:text-xl font-bold text-foreground">{formatCurrency(stats.valorTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.totalNegociacoes} negociações em aberto</p>
          </div>

          {/* Ganhos */}
          <div className="p-4 md:p-5 rounded-xl bg-card border border-success/30 hover:border-success/50 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
                <Trophy className="h-5 w-5 text-success" />
              </div>
            </div>
            <p className="text-lg md:text-xl font-bold text-success">{formatCurrency(stats.valorGanho)}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.negociacoesGanhas} negociações ganhas</p>
          </div>

          {/* Perdidos */}
          <div className="p-4 md:p-5 rounded-xl bg-card border border-destructive/30 hover:border-destructive/50 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
            </div>
            <p className="text-lg md:text-xl font-bold text-destructive">{formatCurrency(stats.valorPerdido)}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.negociacoesPerdidas} negociações perdidas</p>
          </div>

          {/* Taxa de Conversão */}
          <div className="p-4 md:p-5 rounded-xl bg-card border border-border hover:border-primary/50 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info/10">
                <TrendingUp className="h-5 w-5 text-info" />
              </div>
            </div>
            <p className="text-lg md:text-xl font-bold text-foreground">{stats.taxaConversao.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">Taxa de conversão</p>
          </div>
        </div>

        {/* Cards Operacionais - Linha 2 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {/* Contatos */}
          <div className="p-4 md:p-5 rounded-xl bg-card border border-border hover:border-primary/50 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info/10">
                <Users className="h-5 w-5 text-info" />
              </div>
            </div>
            <p className="text-lg md:text-xl font-bold text-foreground">{stats.totalContatos}</p>
            <p className="text-xs text-muted-foreground mt-1">Total de contatos</p>
          </div>

          {/* Conversas */}
          <div className="p-4 md:p-5 rounded-xl bg-card border border-border hover:border-primary/50 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10">
                <MessageSquare className="h-5 w-5 text-warning" />
              </div>
            </div>
            <p className="text-lg md:text-xl font-bold text-foreground">{stats.conversasAtivas}</p>
            <p className="text-xs text-muted-foreground mt-1">Conversas ativas</p>
          </div>

          {/* IA Hoje */}
          <div className="p-4 md:p-5 rounded-xl bg-card border border-border hover:border-primary/50 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-lg md:text-xl font-bold text-foreground">{stats.mensagensIAHoje}</p>
            <p className="text-xs text-muted-foreground mt-1">Mensagens IA hoje</p>
          </div>

          {/* Uso Mensal */}
          <div className="p-4 md:p-5 rounded-xl bg-card border border-border hover:border-primary/50 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
                <Zap className="h-5 w-5 text-success" />
              </div>
            </div>
            <p className="text-lg md:text-xl font-bold text-foreground">{formatNumber(stats.mensagensEsteMes)}</p>
            <p className="text-xs text-muted-foreground mt-1">/ {formatNumber(stats.limiteMensagens)} mensagens</p>
          </div>
        </div>

        {/* Barra de Performance */}
        {(stats.negociacoesGanhas > 0 || stats.negociacoesPerdidas > 0) && (
          <div className="p-4 md:p-6 rounded-xl bg-card border border-border">
            <h3 className="text-base md:text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-warning" />
              Resumo de Performance
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-20">Ganhos</span>
                <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-success transition-all duration-500"
                    style={{ width: `${stats.taxaConversao}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-success w-20 text-right">
                  {stats.taxaConversao.toFixed(1)}% ({stats.negociacoesGanhas})
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-20">Perdas</span>
                <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-destructive transition-all duration-500"
                    style={{ width: `${100 - stats.taxaConversao}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-destructive w-20 text-right">
                  {(100 - stats.taxaConversao).toFixed(1)}% ({stats.negociacoesPerdidas})
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Últimas Conversas e Negociações */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Últimas Conversas */}
          <div className="p-4 md:p-6 rounded-xl bg-card border border-border">
            <h3 className="text-base md:text-lg font-semibold text-foreground mb-3 md:mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Últimas Conversas
            </h3>
            <div className="space-y-3 md:space-y-4">
              {conversasRecentes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma conversa ainda</p>
              ) : (
                conversasRecentes.map((conversa) => (
                  <div
                    key={conversa.id}
                    onClick={() => navigate(`/conversas?contato=${conversa.contato?.id}`)}
                    className="flex items-center gap-3 md:gap-4 p-2.5 md:p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                  >
                    {conversa.contato?.avatar_url ? (
                      <img 
                        src={conversa.contato.avatar_url} 
                        alt={conversa.contato.nome}
                        className="h-9 w-9 md:h-10 md:w-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold text-sm md:text-base flex-shrink-0">
                        {getInitials(conversa.contato?.nome || 'C')}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground truncate text-sm md:text-base">
                          {conversa.contato?.nome || 'Contato'}
                        </p>
                        {conversa.status === 'encerrado' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            Encerrado
                          </span>
                        )}
                      </div>
                      <p className="text-xs md:text-sm text-muted-foreground truncate">
                        {conversa.ultima_mensagem || 'Sem mensagens'}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground flex-shrink-0">
                      {formatRelativeTime(conversa.ultima_mensagem_at)}
                    </div>
                  </div>
                ))
              )}
              <a
                href="/conversas"
                className="block text-center text-sm text-primary hover:underline pt-1"
              >
                Ver todas
              </a>
            </div>
          </div>

          {/* Negociações Recentes */}
          <div className="p-4 md:p-6 rounded-xl bg-card border border-border">
            <h3 className="text-base md:text-lg font-semibold text-foreground mb-3 md:mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              Negociações Recentes
            </h3>
            <div className="space-y-3 md:space-y-4">
              {negociacoesRecentes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma negociação ainda</p>
              ) : (
                negociacoesRecentes.map((neg) => (
                  <div
                    key={neg.id}
                    onClick={() => navigate('/crm')}
                    className="flex items-center gap-3 md:gap-4 p-2.5 md:p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                  >
                    <div className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full flex-shrink-0"
                      style={{ 
                        backgroundColor: neg.estagio?.tipo === 'ganho' 
                          ? 'hsl(var(--success) / 0.2)' 
                          : neg.estagio?.tipo === 'perdido'
                          ? 'hsl(var(--destructive) / 0.2)'
                          : 'hsl(var(--warning) / 0.2)'
                      }}
                    >
                      {getEstagioIcon(neg.estagio?.tipo || null)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate text-sm md:text-base">
                        {neg.titulo}
                      </p>
                      <div className="flex items-center gap-2">
                        <span 
                          className="inline-flex items-center text-xs px-1.5 py-0.5 rounded"
                          style={{ 
                            backgroundColor: `${neg.estagio?.cor || '#6b7280'}20`,
                            color: neg.estagio?.cor || '#6b7280'
                          }}
                        >
                          {neg.estagio?.nome || 'Sem etapa'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {neg.contato?.nome}
                        </span>
                      </div>
                    </div>
                    <div className={`text-xs md:text-sm font-semibold flex-shrink-0 ${
                      neg.estagio?.tipo === 'ganho' 
                        ? 'text-success' 
                        : neg.estagio?.tipo === 'perdido'
                        ? 'text-destructive'
                        : 'text-foreground'
                    }`}>
                      {formatCurrency(neg.valor || 0)}
                    </div>
                  </div>
                ))
              )}
              <a href="/crm" className="block text-center text-sm text-primary hover:underline pt-1">
                Ver todas
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Escolha de Conexão */}
      <EscolhaConexaoModal 
        open={showEscolhaConexao} 
        onOpenChange={setShowEscolhaConexao}
      />
    </MainLayout>
  );
}
