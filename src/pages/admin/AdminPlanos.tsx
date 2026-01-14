import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Users, Bot, GitBranch, Smartphone, Pencil, Building2, Instagram, Check, X, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import NovoPlanoModal from '@/components/admin/NovoPlanoModal';

interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  limite_usuarios: number;
  limite_agentes: number;
  limite_funis: number;
  limite_conexoes_whatsapp: number;
  limite_conexoes_evolution: number;
  limite_conexoes_meta: number;
  limite_mensagens_mes: number;
  permite_instagram: boolean;
  preco_mensal: number;
  ativo: boolean;
}

export default function AdminPlanos() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlano, setEditingPlano] = useState<Plano | null>(null);

  const fetchPlanos = async () => {
    try {
      const { data, error } = await supabase
        .from('planos')
        .select('*')
        .order('preco_mensal', { ascending: true });

      if (error) throw error;
      setPlanos(data || []);
    } catch (error) {
      console.error('Erro ao buscar planos:', error);
      toast.error('Erro ao carregar planos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlanos();
  }, []);

  const handleEdit = (plano: Plano) => {
    setEditingPlano(plano);
    setModalOpen(true);
  };

  const handleNewPlano = () => {
    setEditingPlano(null);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setEditingPlano(null);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatLimit = (value: number) => {
    return value >= 999 ? '∞' : value.toLocaleString('pt-BR');
  };

  const formatMessages = (value: number) => {
    if (value >= 999999) return '∞';
    if (value >= 1000) return `${(value / 1000).toLocaleString('pt-BR')}k`;
    return value.toLocaleString('pt-BR');
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Planos</h1>
            <p className="text-muted-foreground">Gerencie os planos disponíveis para as contas</p>
          </div>
          <Button onClick={handleNewPlano}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Plano
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {planos.map((plano) => (
              <Card key={plano.id} className={`relative ${!plano.ativo ? 'opacity-60' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plano.nome}</CardTitle>
                    {!plano.ativo && (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(plano.preco_mensal)}
                    <span className="text-sm font-normal text-muted-foreground">/mês</span>
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {plano.descricao && (
                    <p className="text-sm text-muted-foreground">{plano.descricao}</p>
                  )}
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{formatLimit(plano.limite_usuarios)} usuários</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <span>{formatLimit(plano.limite_agentes)} agentes IA</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <span>{formatLimit(plano.limite_funis)} funis CRM</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <span>{formatMessages(plano.limite_mensagens_mes)} msgs/mês</span>
                    </div>
                  </div>

                  {/* Conexões granulares */}
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Conexões</p>
                    <div className="flex items-center gap-2 text-sm">
                      <Smartphone className="h-4 w-4 text-emerald-500" />
                      <span>{formatLimit(plano.limite_conexoes_evolution ?? plano.limite_conexoes_whatsapp)} Evolution</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-blue-500" />
                      <span>{formatLimit(plano.limite_conexoes_meta ?? 0)} Meta API</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Instagram className="h-4 w-4 text-pink-500" />
                      <span className="flex items-center gap-1">
                        Instagram
                        {plano.permite_instagram ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <X className="h-3 w-3 text-destructive" />
                        )}
                      </span>
                    </div>
                  </div>

                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => handleEdit(plano)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <NovoPlanoModal
          open={modalOpen}
          onClose={handleModalClose}
          onSuccess={fetchPlanos}
          plano={editingPlano}
        />
      </div>
    </AdminLayout>
  );
}
