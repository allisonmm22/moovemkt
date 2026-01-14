import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Users, MessageSquare, TrendingUp, Phone, Power, Save, KeyRound, Coins, AlertTriangle, Calendar, Bot, GitBranch, Smartphone, CreditCard, Instagram, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface Plano {
  id: string;
  nome: string;
  limite_usuarios: number;
  limite_agentes: number;
  limite_funis: number;
  limite_conexoes_whatsapp: number;
  limite_conexoes_evolution: number;
  limite_conexoes_meta: number;
  permite_instagram: boolean;
  preco_mensal: number;
}

interface Conta {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
  plano_id: string | null;
}

interface UsoRecursos {
  usuarios: number;
  agentes: number;
  funis: number;
  conexoes: number;
  conexoes_evolution: number;
  conexoes_meta: number;
  conexoes_instagram: number;
}

interface Usuario {
  id: string;
  nome: string;
  email: string;
  is_admin: boolean;
  user_id: string;
  created_at: string;
}

interface Metricas {
  usuarios: number;
  conversas: number;
  negociacoes: number;
  contatos: number;
  total_tokens: number;
}

interface TokenUsage {
  id: string;
  provider: string;
  modelo: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  custo_estimado: number;
  created_at: string;
}

interface LogAtividade {
  id: string;
  tipo: string;
  descricao: string;
  metadata: any;
  usuario_id: string | null;
  created_at: string;
  usuario?: { nome: string } | null;
}

interface TokenStats {
  data: string;
  tokens: number;
  custo: number;
}

export default function AdminContaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [conta, setConta] = useState<Conta | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [metricas, setMetricas] = useState<Metricas>({ usuarios: 0, conversas: 0, negociacoes: 0, contatos: 0, total_tokens: 0 });
  const [loading, setLoading] = useState(true);
  const [editNome, setEditNome] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetPasswordModal, setResetPasswordModal] = useState<Usuario | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  
  // Estados para tokens e logs
  const [tokenUsage, setTokenUsage] = useState<TokenUsage[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenStats[]>([]);
  const [logs, setLogs] = useState<LogAtividade[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [periodoTokens, setPeriodoTokens] = useState('30');
  const [tipoLogFiltro, setTipoLogFiltro] = useState('todos');
  
  // Estados para planos
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [usoRecursos, setUsoRecursos] = useState<UsoRecursos>({ usuarios: 0, agentes: 0, funis: 0, conexoes: 0, conexoes_evolution: 0, conexoes_meta: 0, conexoes_instagram: 0 });
  const [savingPlano, setSavingPlano] = useState(false);

  useEffect(() => {
    if (id) {
      fetchContaData();
      fetchPlanos();
      fetchUsoRecursos();
    }
  }, [id]);

  const fetchContaData = async () => {
    if (!id) return;

    try {
      // Buscar conta
      const { data: contaData, error: contaError } = await supabase
        .from('contas')
        .select('*')
        .eq('id', id)
        .single();

      if (contaError) throw contaError;
      setConta({ 
        ...contaData, 
        ativo: (contaData as any).ativo ?? true,
        plano_id: (contaData as any).plano_id ?? null
      });
      setEditNome(contaData.nome);

      // Buscar usuários
      const { data: usuariosData } = await supabase
        .from('usuarios')
        .select('*')
        .eq('conta_id', id)
        .order('created_at', { ascending: false });

      setUsuarios(usuariosData || []);

      // Buscar métricas
      const [
        { count: conversasCount },
        { count: negociacoesCount },
        { count: contatosCount },
      ] = await Promise.all([
        supabase.from('conversas').select('*', { count: 'exact', head: true }).eq('conta_id', id),
        supabase.from('negociacoes').select('*', { count: 'exact', head: true }).eq('conta_id', id),
        supabase.from('contatos').select('*', { count: 'exact', head: true }).eq('conta_id', id),
      ]);

      // Buscar total de tokens
      const { data: tokensData } = await supabase
        .from('uso_tokens')
        .select('total_tokens')
        .eq('conta_id', id);
      
      const totalTokens = tokensData?.reduce((acc, t) => acc + (t.total_tokens || 0), 0) || 0;

      setMetricas({
        usuarios: usuariosData?.length || 0,
        conversas: conversasCount || 0,
        negociacoes: negociacoesCount || 0,
        contatos: contatosCount || 0,
        total_tokens: totalTokens,
      });
    } catch (error) {
      console.error('Erro ao buscar dados da conta:', error);
      toast.error('Erro ao carregar dados da conta');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlanos = async () => {
    try {
      const { data } = await supabase
        .from('planos')
        .select('*')
        .eq('ativo', true)
        .order('preco_mensal', { ascending: true });
      setPlanos(data || []);
    } catch (error) {
      console.error('Erro ao buscar planos:', error);
    }
  };

  const fetchUsoRecursos = async () => {
    if (!id) return;
    try {
      const [
        { count: agentesCount },
        { count: funisCount },
        { count: conexoesCount },
        { count: usuariosCount },
        { count: evolutionCount },
        { count: metaCount },
        { count: instagramCount },
      ] = await Promise.all([
        supabase.from('agent_ia').select('*', { count: 'exact', head: true }).eq('conta_id', id),
        supabase.from('funis').select('*', { count: 'exact', head: true }).eq('conta_id', id),
        supabase.from('conexoes_whatsapp').select('*', { count: 'exact', head: true }).eq('conta_id', id),
        supabase.from('usuarios').select('*', { count: 'exact', head: true }).eq('conta_id', id),
        supabase.from('conexoes_whatsapp').select('*', { count: 'exact', head: true }).eq('conta_id', id).eq('tipo_provedor', 'evolution'),
        supabase.from('conexoes_whatsapp').select('*', { count: 'exact', head: true }).eq('conta_id', id).eq('tipo_provedor', 'meta'),
        supabase.from('conexoes_whatsapp').select('*', { count: 'exact', head: true }).eq('conta_id', id).eq('tipo_provedor', 'instagram'),
      ]);
      setUsoRecursos({
        usuarios: usuariosCount || 0,
        agentes: agentesCount || 0,
        funis: funisCount || 0,
        conexoes: conexoesCount || 0,
        conexoes_evolution: evolutionCount || 0,
        conexoes_meta: metaCount || 0,
        conexoes_instagram: instagramCount || 0,
      });
    } catch (error) {
      console.error('Erro ao buscar uso de recursos:', error);
    }
  };

  const handlePlanoChange = async (planoId: string) => {
    if (!conta) return;
    setSavingPlano(true);
    try {
      const { error } = await supabase
        .from('contas')
        .update({ plano_id: planoId === 'none' ? null : planoId } as any)
        .eq('id', conta.id);
      if (error) throw error;
      setConta({ ...conta, plano_id: planoId === 'none' ? null : planoId });
      toast.success('Plano atualizado');
    } catch (error) {
      console.error('Erro ao atualizar plano:', error);
      toast.error('Erro ao atualizar plano');
    } finally {
      setSavingPlano(false);
    }
  };

  const fetchTokenUsage = async () => {
    if (!id) return;
    setLoadingTokens(true);
    
    try {
      const dataInicio = new Date();
      dataInicio.setDate(dataInicio.getDate() - parseInt(periodoTokens));
      
      const { data } = await supabase
        .from('uso_tokens')
        .select('*')
        .eq('conta_id', id)
        .gte('created_at', dataInicio.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);
      
      setTokenUsage(data || []);
      
      // Calcular estatísticas por dia
      const statsByDay: Record<string, { tokens: number; custo: number }> = {};
      (data || []).forEach((t) => {
        const dia = new Date(t.created_at).toLocaleDateString('pt-BR');
        if (!statsByDay[dia]) statsByDay[dia] = { tokens: 0, custo: 0 };
        statsByDay[dia].tokens += t.total_tokens;
        statsByDay[dia].custo += Number(t.custo_estimado) || 0;
      });
      
      const stats = Object.entries(statsByDay)
        .map(([data, vals]) => ({ data, ...vals }))
        .reverse();
      
      setTokenStats(stats);
    } catch (error) {
      console.error('Erro ao buscar uso de tokens:', error);
    } finally {
      setLoadingTokens(false);
    }
  };

  const fetchLogs = async () => {
    if (!id) return;
    setLoadingLogs(true);
    
    try {
      let query = supabase
        .from('logs_atividade')
        .select('*')
        .eq('conta_id', id)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (tipoLogFiltro !== 'todos') {
        query = query.eq('tipo', tipoLogFiltro);
      }
      
      const { data } = await query;
      
      // Buscar nomes dos usuários
      const logsComUsuarios = await Promise.all((data || []).map(async (log) => {
        if (log.usuario_id) {
          const { data: usuario } = await supabase
            .from('usuarios')
            .select('nome')
            .eq('id', log.usuario_id)
            .single();
          return { ...log, usuario };
        }
        return { ...log, usuario: null };
      }));
      
      setLogs(logsComUsuarios);
    } catch (error) {
      console.error('Erro ao buscar logs:', error);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (id) fetchTokenUsage();
  }, [id, periodoTokens]);

  useEffect(() => {
    if (id) fetchLogs();
  }, [id, tipoLogFiltro]);

  const handleSaveNome = async () => {
    if (!conta || !editNome.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('contas')
        .update({ nome: editNome.trim() })
        .eq('id', conta.id);

      if (error) throw error;
      setConta({ ...conta, nome: editNome.trim() });
      toast.success('Nome atualizado');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const toggleContaStatus = async () => {
    if (!conta) return;

    try {
      if (conta.ativo) {
        // Desativando → chamar edge function que desconecta integrações
        const { error } = await supabase.functions.invoke('desativar-conta', {
          body: { conta_id: conta.id }
        });
        if (error) throw error;
        setConta({ ...conta, ativo: false });
        toast.success('Conta desativada e integrações desconectadas');
      } else {
        // Reativando → apenas atualizar ativo
        const { error } = await supabase
          .from('contas')
          .update({ ativo: true } as any)
          .eq('id', conta.id);
        if (error) throw error;
        setConta({ ...conta, ativo: true });
        toast.success('Conta reativada');
      }
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      toast.error('Erro ao alterar status');
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordModal || !newPassword || newPassword.length < 6) {
      toast.error('Senha deve ter no mínimo 6 caracteres');
      return;
    }

    setResettingPassword(true);
    try {
      const { error } = await supabase.functions.invoke('reset-user-password', {
        body: { userId: resetPasswordModal.user_id, newPassword },
      });

      if (error) throw error;
      toast.success('Senha redefinida com sucesso');
      setResetPasswordModal(null);
      setNewPassword('');
    } catch (error) {
      console.error('Erro ao redefinir senha:', error);
      toast.error('Erro ao redefinir senha');
    } finally {
      setResettingPassword(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const getTipoLogIcon = (tipo: string) => {
    switch (tipo) {
      case 'erro_whatsapp': return '📱';
      case 'erro_ia': return '🤖';
      case 'erro_etapa': return '📊';
      case 'erro_transferencia': return '🔀';
      case 'erro_webhook': return '🔗';
      case 'erro_agendamento': return '📅';
      default: return '⚠️';
    }
  };

  const getTipoLogSeverity = (tipo: string) => {
    if (tipo.startsWith('erro_')) return 'destructive';
    return 'secondary';
  };

  const custoTotal = tokenUsage.reduce((acc, t) => acc + (Number(t.custo_estimado) || 0), 0);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (!conta) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Conta não encontrada</p>
          <Button variant="link" onClick={() => navigate('/admin/contas')}>
            Voltar para lista
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/contas')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{conta.nome}</h1>
            <p className="text-muted-foreground">Detalhes da conta</p>
          </div>
          <Badge variant={conta.ativo ? 'default' : 'secondary'} className="text-sm">
            {conta.ativo ? 'Ativa' : 'Inativa'}
          </Badge>
        </div>

        {/* Métricas */}
        <div className="grid gap-4 md:grid-cols-5">
          {[
            { label: 'Usuários', value: metricas.usuarios, icon: Users, color: 'text-blue-500' },
            { label: 'Conversas', value: metricas.conversas, icon: MessageSquare, color: 'text-green-500' },
            { label: 'Negociações', value: metricas.negociacoes, icon: TrendingUp, color: 'text-purple-500' },
            { label: 'Contatos', value: metricas.contatos, icon: Phone, color: 'text-orange-500' },
            { label: 'Tokens', value: formatNumber(metricas.total_tokens), icon: Coins, color: 'text-yellow-500' },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-4 p-4">
                <stat.icon className={`h-8 w-8 ${stat.color}`} />
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="info" className="space-y-4">
          <TabsList>
            <TabsTrigger value="info" className="gap-2">
              <Building2 className="h-4 w-4" />
              Info
            </TabsTrigger>
            <TabsTrigger value="usuarios" className="gap-2">
              <Users className="h-4 w-4" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="tokens" className="gap-2">
              <Coins className="h-4 w-4" />
              Tokens
            </TabsTrigger>
            <TabsTrigger value="erros" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Erros
            </TabsTrigger>
          </TabsList>

          {/* Tab Info */}
          <TabsContent value="info">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Informações da Conta
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome da Conta</Label>
                    <div className="flex gap-2">
                      <Input
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                      />
                      <Button
                        onClick={handleSaveNome}
                        disabled={saving || editNome === conta.nome}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Plano</Label>
                    <Select
                      value={conta.plano_id || 'none'}
                      onValueChange={handlePlanoChange}
                      disabled={savingPlano}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um plano" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="none">Sem plano</SelectItem>
                        {planos.map((plano) => (
                          <SelectItem key={plano.id} value={plano.id}>
                            {plano.nome} - R$ {plano.preco_mensal.toFixed(2)}/mês
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Criada em</Label>
                    <p className="text-muted-foreground">{formatDate(conta.created_at)}</p>
                  </div>

                  <Button
                    variant={conta.ativo ? 'destructive' : 'default'}
                    className="w-full"
                    onClick={toggleContaStatus}
                  >
                    <Power className="h-4 w-4 mr-2" />
                    {conta.ativo ? 'Desativar Conta' : 'Ativar Conta'}
                  </Button>
                </CardContent>
              </Card>

              {/* Card de Uso de Recursos */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Uso de Recursos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(() => {
                    const planoAtual = planos.find(p => p.id === conta.plano_id);
                    if (!planoAtual) {
                      return (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Selecione um plano para ver os limites
                        </p>
                      );
                    }
                    
                    const recursos = [
                      { 
                        label: 'Usuários', 
                        icon: Users, 
                        uso: usoRecursos.usuarios, 
                        limite: planoAtual.limite_usuarios,
                        color: 'bg-blue-500'
                      },
                      { 
                        label: 'Agentes IA', 
                        icon: Bot, 
                        uso: usoRecursos.agentes, 
                        limite: planoAtual.limite_agentes,
                        color: 'bg-purple-500'
                      },
                      { 
                        label: 'Funis CRM', 
                        icon: GitBranch, 
                        uso: usoRecursos.funis, 
                        limite: planoAtual.limite_funis,
                        color: 'bg-green-500'
                      },
                    ];
                    
                    const conexoes = [
                      { 
                        label: 'Evolution API', 
                        icon: Smartphone, 
                        uso: usoRecursos.conexoes_evolution, 
                        limite: (planoAtual as any).limite_conexoes_evolution ?? planoAtual.limite_conexoes_whatsapp,
                        color: 'text-emerald-500'
                      },
                      { 
                        label: 'Meta API', 
                        icon: Building2, 
                        uso: usoRecursos.conexoes_meta, 
                        limite: (planoAtual as any).limite_conexoes_meta ?? 0,
                        color: 'text-blue-500'
                      },
                    ];
                    
                    return (
                      <>
                        {recursos.map((recurso) => {
                          const percentual = recurso.limite >= 999 
                            ? 0 
                            : Math.min((recurso.uso / recurso.limite) * 100, 100);
                          const isAtLimit = recurso.uso >= recurso.limite && recurso.limite < 999;
                          
                          return (
                            <div key={recurso.label} className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <recurso.icon className="h-4 w-4 text-muted-foreground" />
                                  <span>{recurso.label}</span>
                                </div>
                                <span className={isAtLimit ? 'text-destructive font-medium' : ''}>
                                  {recurso.uso}/{recurso.limite >= 999 ? '∞' : recurso.limite}
                                  {isAtLimit && ' ⚠️'}
                                </span>
                              </div>
                              <Progress 
                                value={recurso.limite >= 999 ? 0 : percentual} 
                                className={`h-2 ${isAtLimit ? '[&>div]:bg-destructive' : ''}`}
                              />
                            </div>
                          );
                        })}
                        
                        {/* Seção de Conexões */}
                        <div className="border-t pt-4 mt-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Conexões</p>
                          
                          {conexoes.map((conexao) => {
                            const percentual = conexao.limite >= 999 
                              ? 0 
                              : conexao.limite > 0 ? Math.min((conexao.uso / conexao.limite) * 100, 100) : 0;
                            const isAtLimit = conexao.uso >= conexao.limite && conexao.limite > 0 && conexao.limite < 999;
                            const isDisabled = conexao.limite === 0;
                            
                            return (
                              <div key={conexao.label} className="space-y-2 mb-3">
                                <div className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-2">
                                    <conexao.icon className={`h-4 w-4 ${conexao.color}`} />
                                    <span className={isDisabled ? 'text-muted-foreground' : ''}>{conexao.label}</span>
                                  </div>
                                  <span className={isAtLimit ? 'text-destructive font-medium' : isDisabled ? 'text-muted-foreground' : ''}>
                                    {isDisabled ? 'Não permitido' : `${conexao.uso}/${conexao.limite >= 999 ? '∞' : conexao.limite}`}
                                    {isAtLimit && ' ⚠️'}
                                  </span>
                                </div>
                                {!isDisabled && (
                                  <Progress 
                                    value={percentual} 
                                    className={`h-2 ${isAtLimit ? '[&>div]:bg-destructive' : ''}`}
                                  />
                                )}
                              </div>
                            );
                          })}
                          
                          {/* Instagram */}
                          <div className="flex items-center justify-between text-sm py-2">
                            <div className="flex items-center gap-2">
                              <Instagram className="h-4 w-4 text-pink-500" />
                              <span>Instagram</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {usoRecursos.conexoes_instagram > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {usoRecursos.conexoes_instagram} ativa(s)
                                </span>
                              )}
                              {(planoAtual as any).permite_instagram ? (
                                <span className="flex items-center gap-1 text-emerald-500">
                                  <Check className="h-4 w-4" />
                                  Permitido
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <X className="h-4 w-4" />
                                  Não permitido
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab Usuários */}
          <TabsContent value="usuarios">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Usuários ({usuarios.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {usuarios.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    Nenhum usuário nesta conta
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Criado</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usuarios.map((usuario) => (
                        <TableRow key={usuario.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{usuario.nome}</p>
                              <p className="text-xs text-muted-foreground">{usuario.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={usuario.is_admin ? 'default' : 'secondary'}>
                              {usuario.is_admin ? 'Admin' : 'Usuário'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(usuario.created_at)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setResetPasswordModal(usuario)}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Tokens */}
          <TabsContent value="tokens">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Uso de Tokens</h3>
                <Select value={periodoTokens} onValueChange={setPeriodoTokens}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Últimos 7 dias</SelectItem>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="90">Últimos 90 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Resumo */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-primary">
                        {formatNumber(tokenUsage.reduce((acc, t) => acc + t.total_tokens, 0))}
                      </p>
                      <p className="text-sm text-muted-foreground">Total de Tokens</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-green-500">
                        ${custoTotal.toFixed(4)}
                      </p>
                      <p className="text-sm text-muted-foreground">Custo Estimado</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-blue-500">
                        {tokenUsage.length}
                      </p>
                      <p className="text-sm text-muted-foreground">Requisições</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Gráfico */}
              {tokenStats.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Uso ao longo do tempo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={tokenStats}>
                        <XAxis dataKey="data" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip 
                          formatter={(value: number) => [formatNumber(value), 'Tokens']}
                          labelFormatter={(label) => `Data: ${label}`}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="tokens" 
                          stroke="hsl(var(--primary))" 
                          fill="hsl(var(--primary) / 0.2)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Tabela de uso */}
              <Card>
                <CardHeader>
                  <CardTitle>Histórico de Uso</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingTokens ? (
                    <div className="flex justify-center py-8">
                      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : tokenUsage.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum uso de tokens registrado
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>Modelo</TableHead>
                          <TableHead className="text-right">Prompt</TableHead>
                          <TableHead className="text-right">Completion</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Custo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tokenUsage.slice(0, 20).map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="text-sm">{formatDateTime(t.created_at)}</TableCell>
                            <TableCell>
                              <Badge variant={t.provider === 'openai' ? 'default' : 'secondary'}>
                                {t.provider}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {t.modelo.split('/').pop()}
                            </TableCell>
                            <TableCell className="text-right">{t.prompt_tokens}</TableCell>
                            <TableCell className="text-right">{t.completion_tokens}</TableCell>
                            <TableCell className="text-right font-medium">{t.total_tokens}</TableCell>
                            <TableCell className="text-right text-green-600">
                              ${Number(t.custo_estimado).toFixed(6)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab Erros */}
          <TabsContent value="erros">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Monitoramento de Erros
                  </CardTitle>
                  <Select value={tipoLogFiltro} onValueChange={setTipoLogFiltro}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filtrar por tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os Erros</SelectItem>
                      <SelectItem value="erro_whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="erro_ia">Agente IA</SelectItem>
                      <SelectItem value="erro_etapa">Etapas CRM</SelectItem>
                      <SelectItem value="erro_transferencia">Transferências</SelectItem>
                      <SelectItem value="erro_webhook">Webhook</SelectItem>
                      <SelectItem value="erro_agendamento">Agendamentos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {loadingLogs ? (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : logs.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertTriangle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground">Nenhum erro registrado</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">O sistema está funcionando normalmente</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {logs.map((log) => (
                      <div 
                        key={log.id} 
                        className="flex items-start gap-3 p-4 rounded-lg border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors"
                      >
                        <span className="text-xl">{getTipoLogIcon(log.tipo)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground">{log.descricao || log.tipo}</span>
                            <Badge variant="destructive" className="text-xs">
                              {log.tipo.replace(/_/g, ' ').replace('erro ', '')}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDateTime(log.created_at)}</span>
                          </div>
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono overflow-x-auto">
                              <pre className="whitespace-pre-wrap text-muted-foreground">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal Reset Password */}
      <Dialog open={!!resetPasswordModal} onOpenChange={() => setResetPasswordModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Redefinir senha do usuário: <strong>{resetPasswordModal?.nome}</strong>
            </p>
            <div className="space-y-2">
              <Label>Nova Senha</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordModal(null)}>
              Cancelar
            </Button>
            <Button onClick={handleResetPassword} disabled={resettingPassword}>
              {resettingPassword ? 'Redefinindo...' : 'Redefinir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
