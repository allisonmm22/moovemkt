import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Activity, TrendingUp, Users, MessageSquare, AlertTriangle, RefreshCw, Database, Archive } from "lucide-react";
import { toast } from "sonner";

interface ContaPerformance {
  conta_id: string;
  conta_nome: string;
  ativo: boolean;
  plano_nome: string | null;
  limite_mensagens_mes: number | null;
  total_usuarios: number;
  conversas_ativas: number;
  conversas_total: number;
  total_contatos: number;
}

interface UsoHistorico {
  conta_id: string;
  data: string;
  mensagens_enviadas: number;
  mensagens_recebidas: number;
  usuarios_ativos: number;
  conversas_ativas: number;
  leads_novos: number;
}

interface MetricasGerais {
  total_contas: number;
  total_usuarios: number;
  total_mensagens_hoje: number;
  total_conversas_ativas: number;
  media_mensagens_por_conta: number;
}

export default function AdminPerformance() {
  const [loading, setLoading] = useState(true);
  const [contasPerformance, setContasPerformance] = useState<ContaPerformance[]>([]);
  const [usoHoje, setUsoHoje] = useState<UsoHistorico[]>([]);
  const [metricas, setMetricas] = useState<MetricasGerais>({
    total_contas: 0,
    total_usuarios: 0,
    total_mensagens_hoje: 0,
    total_conversas_ativas: 0,
    media_mensagens_por_conta: 0
  });
  const [executandoArquivamento, setExecutandoArquivamento] = useState(false);
  const [executandoConsolidacao, setExecutandoConsolidacao] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Buscar performance por conta
      const { data: performance, error: perfError } = await supabase
        .from('v_performance_conta')
        .select('*');

      if (perfError) throw perfError;
      setContasPerformance(performance || []);

      // Buscar uso de hoje
      const hoje = new Date().toISOString().split('T')[0];
      const { data: uso, error: usoError } = await supabase
        .from('uso_historico')
        .select('*')
        .eq('data', hoje);

      if (!usoError) {
        setUsoHoje(uso || []);
      }

      // Calcular métricas gerais
      const totalContas = performance?.length || 0;
      const totalUsuarios = performance?.reduce((sum, c) => sum + (c.total_usuarios || 0), 0) || 0;
      const totalConversasAtivas = performance?.reduce((sum, c) => sum + (c.conversas_ativas || 0), 0) || 0;
      const totalMensagensHoje = uso?.reduce((sum, u) => sum + (u.mensagens_enviadas || 0) + (u.mensagens_recebidas || 0), 0) || 0;

      setMetricas({
        total_contas: totalContas,
        total_usuarios: totalUsuarios,
        total_mensagens_hoje: totalMensagensHoje,
        total_conversas_ativas: totalConversasAtivas,
        media_mensagens_por_conta: totalContas > 0 ? Math.round(totalMensagensHoje / totalContas) : 0
      });

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados de performance');
    } finally {
      setLoading(false);
    }
  };

  const executarArquivamento = async () => {
    setExecutandoArquivamento(true);
    try {
      const { data, error } = await supabase.functions.invoke('arquivar-mensagens-antigas');
      
      if (error) throw error;
      
      toast.success(`Arquivamento concluído: ${data.arquivadas} mensagens arquivadas`);
      fetchData();
    } catch (error) {
      console.error('Erro ao executar arquivamento:', error);
      toast.error('Erro ao executar arquivamento');
    } finally {
      setExecutandoArquivamento(false);
    }
  };

  const executarConsolidacao = async () => {
    setExecutandoConsolidacao(true);
    try {
      const { data, error } = await supabase.functions.invoke('consolidar-uso-diario');
      
      if (error) throw error;
      
      toast.success(`Consolidação concluída: ${data.contas_processadas} contas processadas`);
      fetchData();
    } catch (error) {
      console.error('Erro ao executar consolidação:', error);
      toast.error('Erro ao executar consolidação');
    } finally {
      setExecutandoConsolidacao(false);
    }
  };

  const calcularPercentualUso = (conta: ContaPerformance) => {
    const uso = usoHoje.find(u => u.conta_id === conta.conta_id);
    if (!uso || !conta.limite_mensagens_mes) return 0;
    
    // Estimar uso mensal baseado no uso de hoje
    const usoDiario = uso.mensagens_enviadas + uso.mensagens_recebidas;
    const estimativaMensal = usoDiario * 30;
    return Math.min(100, Math.round((estimativaMensal / conta.limite_mensagens_mes) * 100));
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Título */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Performance do Sistema</h1>
          <p className="text-muted-foreground">Monitore o uso de recursos e performance das contas</p>
        </div>

        {/* Métricas Gerais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Contas Ativas</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-500" />
                {metricas.total_contas}
              </CardTitle>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Usuários Totais</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                {metricas.total_usuarios}
              </CardTitle>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Conversas Ativas</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Activity className="h-5 w-5 text-purple-500" />
                {metricas.total_conversas_ativas}
              </CardTitle>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Mensagens Hoje</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-orange-500" />
                {metricas.total_mensagens_hoje}
              </CardTitle>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Média/Conta Hoje</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-cyan-500" />
                {metricas.media_mensagens_por_conta}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Ações de Manutenção */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ações de Manutenção</CardTitle>
            <CardDescription>Execute tarefas de manutenção do sistema</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4 flex-wrap">
            <Button 
              variant="outline" 
              onClick={executarArquivamento}
              disabled={executandoArquivamento}
            >
              {executandoArquivamento ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Archive className="h-4 w-4 mr-2" />
              )}
              Arquivar Mensagens Antigas
            </Button>
            
            <Button 
              variant="outline" 
              onClick={executarConsolidacao}
              disabled={executandoConsolidacao}
            >
              {executandoConsolidacao ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TrendingUp className="h-4 w-4 mr-2" />
              )}
              Consolidar Uso Diário
            </Button>
            
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar Dados
            </Button>
          </CardContent>
        </Card>

        {/* Tabela de Performance por Conta */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Performance por Conta</CardTitle>
            <CardDescription>Visão geral de uso de recursos por conta</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-center">Usuários</TableHead>
                  <TableHead className="text-center">Conv. Ativas</TableHead>
                  <TableHead className="text-center">Contatos</TableHead>
                  <TableHead>Uso Estimado</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contasPerformance.map((conta) => {
                  const percentualUso = calcularPercentualUso(conta);
                  const usoHojeConta = usoHoje.find(u => u.conta_id === conta.conta_id);
                  
                  return (
                    <TableRow key={conta.conta_id}>
                      <TableCell className="font-medium">{conta.conta_nome}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{conta.plano_nome || 'Sem plano'}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{conta.total_usuarios}</TableCell>
                      <TableCell className="text-center">{conta.conversas_ativas}</TableCell>
                      <TableCell className="text-center">{conta.total_contatos}</TableCell>
                      <TableCell>
                        {conta.limite_mensagens_mes ? (
                          <div className="flex items-center gap-2">
                            <Progress 
                              value={percentualUso} 
                              className={`w-20 ${percentualUso >= 80 ? 'bg-red-200' : ''}`}
                            />
                            <span className={`text-xs ${percentualUso >= 80 ? 'text-red-500' : 'text-muted-foreground'}`}>
                              {percentualUso}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {percentualUso >= 90 ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Crítico
                          </Badge>
                        ) : percentualUso >= 70 ? (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-600 gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Atenção
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {contasPerformance.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhuma conta encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Uso Diário Detalhado */}
        {usoHoje.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Uso de Hoje</CardTitle>
              <CardDescription>Detalhamento do uso por conta no dia atual</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-center">Msg Enviadas</TableHead>
                    <TableHead className="text-center">Msg Recebidas</TableHead>
                    <TableHead className="text-center">Usuários Ativos</TableHead>
                    <TableHead className="text-center">Novos Leads</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usoHoje.map((uso) => {
                    const conta = contasPerformance.find(c => c.conta_id === uso.conta_id);
                    return (
                      <TableRow key={uso.conta_id}>
                        <TableCell className="font-medium">{conta?.conta_nome || uso.conta_id}</TableCell>
                        <TableCell className="text-center">{uso.mensagens_enviadas}</TableCell>
                        <TableCell className="text-center">{uso.mensagens_recebidas}</TableCell>
                        <TableCell className="text-center">{uso.usuarios_ativos}</TableCell>
                        <TableCell className="text-center">{uso.leads_novos}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
