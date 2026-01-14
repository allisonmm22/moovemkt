import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CreditCard, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  ExternalLink,
  Users,
  Bot,
  Kanban,
  MessageSquare,
  Plug,
  Crown,
  Loader2,
  ArrowUpRight,
  RefreshCw
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PlanoInfo {
  id: string;
  nome: string;
  preco_mensal: number;
  limite_usuarios: number;
  limite_agentes: number;
  limite_funis: number;
  limite_conexoes_whatsapp: number;
  limite_conexoes_evolution: number;
  limite_conexoes_meta: number;
  limite_mensagens_mes: number;
  permite_instagram: boolean;
}

interface ContaAssinatura {
  created_at: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  stripe_current_period_start: string | null;
  stripe_current_period_end: string | null;
  stripe_cancel_at_period_end: boolean;
  plano: PlanoInfo | null;
}

interface UsageData {
  usuarios: number;
  agentes: number;
  funis: number;
  conexoes_evolution: number;
  conexoes_meta: number;
  mensagens_mes: number;
}

export default function MinhaAssinatura() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [assinatura, setAssinatura] = useState<ContaAssinatura | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    if (usuario?.conta_id) {
      fetchAssinatura();
      fetchUsage();
    }
  }, [usuario?.conta_id]);

  const fetchAssinatura = async () => {
    try {
      const { data, error } = await supabase
        .from('contas')
        .select(`
          created_at,
          stripe_customer_id,
          stripe_subscription_id,
          stripe_subscription_status,
          stripe_current_period_start,
          stripe_current_period_end,
          stripe_cancel_at_period_end,
          plano:planos(
            id,
            nome,
            preco_mensal,
            limite_usuarios,
            limite_agentes,
            limite_funis,
            limite_conexoes_whatsapp,
            limite_conexoes_evolution,
            limite_conexoes_meta,
            limite_mensagens_mes,
            permite_instagram
          )
        `)
        .eq('id', usuario!.conta_id)
        .single();

      if (error) throw error;
      setAssinatura(data as any);
    } catch (error) {
      console.error('Erro ao buscar assinatura:', error);
      toast.error('Erro ao carregar dados da assinatura');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsage = async () => {
    try {
      const contaId = usuario!.conta_id;
      
      // Buscar dados da conta para pegar o período do Stripe
      const { data: contaData } = await supabase
        .from('contas')
        .select('stripe_current_period_start, stripe_current_period_end')
        .eq('id', contaId)
        .single();
      
      // Determinar início do ciclo
      let inicioCiclo: Date;
      if (contaData?.stripe_current_period_start) {
        inicioCiclo = new Date(contaData.stripe_current_period_start);
      } else {
        // Fallback: primeiro dia do mês atual
        inicioCiclo = new Date();
        inicioCiclo.setDate(1);
        inicioCiclo.setHours(0, 0, 0, 0);
      }

      // Buscar contagens em paralelo
      const [usuariosRes, agentesRes, funisRes, conexoesRes, mensagensRes] = await Promise.all([
        supabase.from('usuarios').select('id', { count: 'exact', head: true }).eq('conta_id', contaId),
        supabase.from('agent_ia').select('id', { count: 'exact', head: true }).eq('conta_id', contaId),
        supabase.from('funis').select('id', { count: 'exact', head: true }).eq('conta_id', contaId),
        supabase.from('conexoes_whatsapp').select('id, tipo_provedor').eq('conta_id', contaId),
        // Mensagens IA do ciclo atual
        supabase.from('mensagens')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', inicioCiclo.toISOString())
          .eq('enviada_por_ia', true)
      ]);

      const conexoes = conexoesRes.data || [];
      const conexoesEvolution = conexoes.filter(c => c.tipo_provedor === 'evolution' || !c.tipo_provedor).length;
      const conexoesMeta = conexoes.filter(c => c.tipo_provedor === 'meta').length;

      setUsage({
        usuarios: usuariosRes.count || 0,
        agentes: agentesRes.count || 0,
        funis: funisRes.count || 0,
        conexoes_evolution: conexoesEvolution,
        conexoes_meta: conexoesMeta,
        mensagens_mes: mensagensRes.count || 0,
      });
    } catch (error) {
      console.error('Erro ao buscar uso:', error);
    }
  };

  const handleOpenPortal = async () => {
    if (!assinatura?.stripe_customer_id) {
      toast.error('Nenhuma assinatura ativa');
      return;
    }

    setLoadingPortal(true);
    try {
      const response = await supabase.functions.invoke('stripe-customer-portal', {
        body: { return_url: window.location.href },
      });

      if (response.error) throw response.error;
      
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      console.error('Erro ao abrir portal:', error);
      toast.error('Erro ao abrir portal de pagamentos');
    } finally {
      setLoadingPortal(false);
    }
  };

  const handlePagar = async () => {
    if (!assinatura?.plano?.id) {
      toast.error('Selecione um plano primeiro');
      navigate('/upgrade');
      return;
    }

    if (!usuario?.conta_id) {
      toast.error('Conta não encontrada');
      return;
    }

    setLoadingCheckout(true);
    try {
      const response = await supabase.functions.invoke('stripe-checkout', {
        body: { 
          plano_id: assinatura.plano.id,
          conta_id: usuario.conta_id,
          success_url: `${window.location.origin}/minha-assinatura?success=true`,
          cancel_url: `${window.location.origin}/minha-assinatura?canceled=true`,
        },
      });

      if (response.error) throw response.error;
      
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      console.error('Erro ao iniciar pagamento:', error);
      toast.error('Erro ao iniciar pagamento');
    } finally {
      setLoadingCheckout(false);
    }
  };

  const getStatusInfo = (status: string | null) => {
    switch (status) {
      case 'active':
        return { label: 'Ativo', color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: CheckCircle };
      case 'canceled':
        return { label: 'Cancelado', color: 'text-destructive', bg: 'bg-destructive/10', icon: XCircle };
      case 'past_due':
        return { label: 'Pagamento Pendente', color: 'text-amber-500', bg: 'bg-amber-500/10', icon: AlertTriangle };
      case 'trialing':
        return { label: 'Período de Teste', color: 'text-blue-500', bg: 'bg-blue-500/10', icon: Calendar };
      default:
        return { label: 'Sem Assinatura', color: 'text-muted-foreground', bg: 'bg-muted', icon: XCircle };
    }
  };

  const UsageBar = ({ current, max, label, icon: Icon }: { current: number; max: number; label: string; icon: any }) => {
    const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;
    const isNearLimit = percentage >= 80;
    const isAtLimit = percentage >= 100;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground">{label}</span>
          </div>
          <span className={isAtLimit ? 'text-destructive font-medium' : isNearLimit ? 'text-amber-500' : 'text-muted-foreground'}>
            {current.toLocaleString('pt-BR')}/{max.toLocaleString('pt-BR')}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${
              isAtLimit ? 'bg-destructive' : isNearLimit ? 'bg-amber-500' : 'bg-primary'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const statusInfo = getStatusInfo(assinatura?.stripe_subscription_status);
  const StatusIcon = statusInfo.icon;
  const diasRestantes = assinatura?.stripe_current_period_end 
    ? differenceInDays(new Date(assinatura.stripe_current_period_end), new Date())
    : null;

  return (
    <MainLayout>
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <CreditCard className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Minha Assinatura</h1>
          <p className="text-sm text-muted-foreground">Gerencie seu plano e pagamentos</p>
        </div>
      </div>

      {/* Plano Atual */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-6 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <Crown className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  {assinatura?.plano?.nome || 'Plano Gratuito'}
                </h2>
                <p className="text-2xl font-bold text-primary mt-1">
                  {assinatura?.plano?.preco_mensal 
                    ? `R$ ${assinatura.plano.preco_mensal.toFixed(2).replace('.', ',')}/mês`
                    : 'Grátis'
                  }
                </p>
              </div>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${statusInfo.bg}`}>
              <StatusIcon className={`h-4 w-4 ${statusInfo.color}`} />
              <span className={`text-sm font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-muted/30 space-y-3">
          {/* Data de contratação - sempre visível */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Data de contratação:</span>
            <span className="text-sm font-medium text-foreground">
              {format(new Date(assinatura.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </span>
          </div>
          
          {/* Próximo pagamento - só quando tem Stripe configurado */}
          {assinatura.stripe_current_period_end ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {assinatura.stripe_cancel_at_period_end 
                    ? 'Acesso até:'
                    : 'Próximo pagamento:'
                  }
                </span>
                <span className="text-sm font-medium text-foreground">
                  {format(new Date(assinatura.stripe_current_period_end), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </span>
              </div>
              {diasRestantes !== null && diasRestantes >= 0 && (
                <span className={`text-sm ${diasRestantes <= 7 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {diasRestantes} dias restantes
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              <span className="text-sm">Pagamento não configurado</span>
            </div>
          )}
          
          {assinatura.stripe_cancel_at_period_end && (
            <p className="text-sm text-amber-500 mt-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Cancelamento agendado. Após essa data, sua conta será movida para o plano gratuito.
            </p>
          )}
        </div>

        <div className="p-6 flex flex-wrap gap-3">
          {/* Botão Pagar - aparece quando tem plano mas assinatura não está ativa */}
          {assinatura?.plano && assinatura.stripe_subscription_status !== 'active' && (
            <button
              onClick={handlePagar}
              disabled={loadingCheckout}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {loadingCheckout ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              <span>Pagar Agora</span>
            </button>
          )}
          
          {assinatura?.stripe_customer_id && (
            <button
              onClick={handleOpenPortal}
              disabled={loadingPortal}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
            >
              {loadingPortal ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              <span>Gerenciar Pagamento</span>
            </button>
          )}
          <button
            onClick={() => navigate('/upgrade')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <ArrowUpRight className="h-4 w-4" />
            <span>{assinatura?.plano ? 'Mudar Plano' : 'Fazer Upgrade'}</span>
          </button>
        </div>
      </div>

      {/* Uso do Plano */}
      {assinatura?.plano && usage && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Uso do Plano</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <UsageBar 
                current={usage.mensagens_mes} 
                max={assinatura.plano.limite_mensagens_mes} 
                label="Mensagens IA este ciclo" 
                icon={MessageSquare}
              />
              {diasRestantes !== null && diasRestantes >= 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground ml-6">
                  <RefreshCw className="h-3 w-3" />
                  <span>Reinicia em {diasRestantes} dias</span>
                </div>
              )}
            </div>
            <UsageBar 
              current={usage.usuarios} 
              max={assinatura.plano.limite_usuarios} 
              label="Usuários" 
              icon={Users}
            />
            <UsageBar 
              current={usage.agentes} 
              max={assinatura.plano.limite_agentes} 
              label="Agentes IA" 
              icon={Bot}
            />
            <UsageBar 
              current={usage.funis} 
              max={assinatura.plano.limite_funis} 
              label="Funis" 
              icon={Kanban}
            />
            <UsageBar 
              current={usage.conexoes_evolution} 
              max={assinatura.plano.limite_conexoes_evolution} 
              label="Conexões WhatsApp (Evolution)" 
              icon={Plug}
            />
            {assinatura.plano.limite_conexoes_meta > 0 && (
              <UsageBar 
                current={usage.conexoes_meta} 
                max={assinatura.plano.limite_conexoes_meta} 
                label="Conexões WhatsApp (Meta API)" 
                icon={Plug}
              />
            )}
          </div>
        </div>
      )}

      {/* Recursos Incluídos */}
      {assinatura?.plano && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Recursos Incluídos</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>{assinatura.plano.limite_usuarios} usuários</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>{assinatura.plano.limite_agentes} agentes IA</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>{assinatura.plano.limite_funis} funis</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>{assinatura.plano.limite_conexoes_evolution} conexões Evolution</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>{assinatura.plano.limite_mensagens_mes.toLocaleString('pt-BR')} msg/mês</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {assinatura.plano.permite_instagram ? (
                <>
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span>Instagram Direct</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Instagram Direct</span>
                </>
              )}
            </div>
            {assinatura.plano.limite_conexoes_meta > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span>{assinatura.plano.limite_conexoes_meta} conexões Meta API</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sem plano */}
      {!assinatura?.plano && (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <Crown className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Você está no plano gratuito</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Faça upgrade para desbloquear mais recursos e aumentar seus limites.
          </p>
          <button
            onClick={() => navigate('/upgrade')}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <ArrowUpRight className="h-4 w-4" />
            <span>Ver Planos</span>
          </button>
        </div>
      )}
    </div>
    </MainLayout>
  );
}
