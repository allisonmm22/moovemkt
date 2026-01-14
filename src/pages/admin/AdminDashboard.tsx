import { useEffect, useState } from 'react';
import { Building2, Users, MessageSquare, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DashboardMetrics {
  totalContas: number;
  contasAtivas: number;
  totalUsuarios: number;
  totalConversas: number;
  totalNegociacoes: number;
  totalContatos: number;
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalContas: 0,
    contasAtivas: 0,
    totalUsuarios: 0,
    totalConversas: 0,
    totalNegociacoes: 0,
    totalContatos: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      // Buscar todas as contas para contar ativas manualmente
      const { data: contasData } = await supabase.from('contas').select('*');
      const totalContas = contasData?.length || 0;
      const contasAtivas = contasData?.filter((c: any) => c.ativo !== false).length || 0;

      const [
        { count: totalUsuarios },
        { count: totalConversas },
        { count: totalNegociacoes },
        { count: totalContatos },
      ] = await Promise.all([
        supabase.from('usuarios').select('*', { count: 'exact', head: true }),
        supabase.from('conversas').select('*', { count: 'exact', head: true }),
        supabase.from('negociacoes').select('*', { count: 'exact', head: true }),
        supabase.from('contatos').select('*', { count: 'exact', head: true }),
      ]);

      setMetrics({
        totalContas: totalContas || 0,
        contasAtivas: contasAtivas || 0,
        totalUsuarios: totalUsuarios || 0,
        totalConversas: totalConversas || 0,
        totalNegociacoes: totalNegociacoes || 0,
        totalContatos: totalContatos || 0,
      });
    } catch (error) {
      console.error('Erro ao buscar métricas:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total de Contas',
      value: metrics.totalContas,
      subtitle: `${metrics.contasAtivas} ativas`,
      icon: Building2,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Total de Usuários',
      value: metrics.totalUsuarios,
      icon: Users,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Total de Conversas',
      value: metrics.totalConversas,
      icon: MessageSquare,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Total de Negociações',
      value: metrics.totalNegociacoes,
      icon: TrendingUp,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
  ];

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard Administrativo</h1>
          <p className="text-muted-foreground">Visão geral de todas as contas do sistema</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
                {stat.subtitle && (
                  <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Métricas Adicionais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total de Contatos</span>
                <span className="font-semibold">{metrics.totalContatos.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Contas Inativas</span>
                <span className="font-semibold">{(metrics.totalContas - metrics.contasAtivas).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Média Usuários/Conta</span>
                <span className="font-semibold">
                  {metrics.totalContas > 0 
                    ? (metrics.totalUsuarios / metrics.totalContas).toFixed(1) 
                    : '0'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <a
                href="/admin/contas"
                className="block p-3 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <div className="font-medium">Gerenciar Contas</div>
                <div className="text-sm text-muted-foreground">
                  Ver, criar e editar contas de clientes
                </div>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
