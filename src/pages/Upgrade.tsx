import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, Star, Zap, Building2, Crown, Loader2, ArrowLeft } from "lucide-react";

interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  preco_mensal: number | null;
  limite_usuarios: number;
  limite_agentes: number;
  limite_funis: number;
  limite_conexoes_evolution: number;
  limite_conexoes_meta: number;
  limite_mensagens_mes: number;
  permite_instagram: boolean;
  ativo: boolean;
}

export default function Upgrade() {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoAtual, setPlanoAtual] = useState<Plano | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const success = searchParams.get('success');
  const canceled = searchParams.get('canceled');
  const planoNome = searchParams.get('plano');

  useEffect(() => {
    if (success && planoNome) {
      toast({
        title: "Pagamento realizado!",
        description: `Seu upgrade para o plano ${planoNome} foi processado. Em breve seu plano será atualizado.`,
      });
    }
    if (canceled) {
      toast({
        title: "Pagamento cancelado",
        description: "Você cancelou o processo de upgrade.",
        variant: "destructive",
      });
    }
  }, [success, canceled, planoNome, toast]);

  useEffect(() => {
    fetchPlanos();
  }, [usuario]);

  const fetchPlanos = async () => {
    try {
      // Buscar todos os planos ativos
      const { data: planosData, error: planosError } = await supabase
        .from('planos')
        .select('*')
        .eq('ativo', true)
        .order('preco_mensal', { ascending: true });

      if (planosError) throw planosError;
      setPlanos(planosData || []);

      // Buscar plano atual da conta
      if (usuario?.conta_id) {
        const { data: contaData, error: contaError } = await supabase
          .from('contas')
          .select('plano_id')
          .eq('id', usuario.conta_id)
          .single();

        if (!contaError && contaData?.plano_id) {
          const planoAtualData = planosData?.find(p => p.id === contaData.plano_id);
          setPlanoAtual(planoAtualData || null);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar planos:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os planos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (plano: Plano) => {
    if (!usuario?.conta_id) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para fazer upgrade.",
        variant: "destructive",
      });
      return;
    }

    setCheckoutLoading(plano.id);

    try {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: {
          plano_id: plano.id,
          conta_id: usuario.conta_id,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('URL de checkout não retornada');
      }
    } catch (error: any) {
      console.error('Erro ao criar checkout:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível iniciar o checkout.",
        variant: "destructive",
      });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return "Grátis";
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(value);
  };

  const formatLimit = (value: number) => {
    if (value >= 999999) return "Ilimitado";
    return value.toLocaleString('pt-BR');
  };

  const getPlanIcon = (index: number) => {
    const icons = [Zap, Star, Building2, Crown];
    const Icon = icons[index] || Star;
    return Icon;
  };

  const isPlanoCurrent = (plano: Plano) => planoAtual?.id === plano.id;
  
  const isPlanoBetter = (plano: Plano) => {
    if (!planoAtual) return true;
    return (plano.preco_mensal || 0) > (planoAtual.preco_mensal || 0);
  };

  const getButtonText = (plano: Plano) => {
    if (isPlanoCurrent(plano)) return "Plano Atual";
    if (isPlanoBetter(plano)) return "Fazer Upgrade";
    return "Downgrade";
  };

  const getButtonVariant = (plano: Plano): "default" | "outline" | "secondary" => {
    if (isPlanoCurrent(plano)) return "secondary";
    if (isPlanoBetter(plano)) return "default";
    return "outline";
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 px-4 py-6 md:px-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Escolha seu Plano
            </h1>
            <p className="text-muted-foreground mt-1">
              Selecione o plano ideal para o seu negócio
            </p>
          </div>
        </div>

        {/* Plano Atual Info */}
        {planoAtual && (
          <Card className="bg-primary/10 border-primary/30">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Star className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Seu plano atual</p>
                <p className="font-semibold text-foreground">{planoAtual.nome}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Planos Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {planos.map((plano, index) => {
            const Icon = getPlanIcon(index);
            const isRecommended = index === 1; // Pro é recomendado
            const isCurrent = isPlanoCurrent(plano);
            
            return (
              <Card 
                key={plano.id}
                className={`relative transition-all duration-300 hover:shadow-lg ${
                  isCurrent 
                    ? 'border-primary/50 bg-primary/5' 
                    : isRecommended 
                      ? 'border-primary shadow-lg scale-[1.02]' 
                      : 'border-border'
                }`}
              >
                {isRecommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-3 py-1">
                      <Star className="h-3 w-3 mr-1" />
                      Recomendado
                    </Badge>
                  </div>
                )}

                {isCurrent && (
                  <div className="absolute -top-3 right-4">
                    <Badge variant="secondary" className="px-3 py-1">
                      Atual
                    </Badge>
                  </div>
                )}

                <CardHeader className="text-center pt-8">
                  <div className={`h-14 w-14 rounded-full mx-auto mb-4 flex items-center justify-center ${
                    isRecommended ? 'bg-primary/20' : 'bg-muted'
                  }`}>
                    <Icon className={`h-7 w-7 ${
                      isRecommended ? 'text-primary' : 'text-muted-foreground'
                    }`} />
                  </div>
                  <CardTitle className="text-xl">{plano.nome}</CardTitle>
                  <CardDescription className="min-h-[40px]">
                    {plano.descricao || `Plano ${plano.nome}`}
                  </CardDescription>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-foreground">
                      {formatCurrency(plano.preco_mensal)}
                    </span>
                    {plano.preco_mensal && (
                      <span className="text-muted-foreground">/mês</span>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      <span>{formatLimit(plano.limite_usuarios)} usuários</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      <span>{formatLimit(plano.limite_agentes)} agentes IA</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      <span>{formatLimit(plano.limite_funis)} funis</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      <span>{formatLimit(plano.limite_conexoes_evolution)} conexões WhatsApp</span>
                    </div>
                    {plano.limite_conexoes_meta > 0 && (
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        <span>{formatLimit(plano.limite_conexoes_meta)} conexões Meta</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      <span>{formatLimit(plano.limite_mensagens_mes)} mensagens/mês</span>
                    </div>
                    {plano.permite_instagram && (
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        <span>Instagram Direct</span>
                      </div>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="pt-4">
                  <Button 
                    className="w-full"
                    variant={getButtonVariant(plano)}
                    disabled={isCurrent || checkoutLoading === plano.id}
                    onClick={() => handleUpgrade(plano)}
                  >
                    {checkoutLoading === plano.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      getButtonText(plano)
                    )}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* Info footer */}
        <div className="text-center text-sm text-muted-foreground mt-8">
          <p>
            Pagamento seguro via Stripe. Cancele a qualquer momento.
          </p>
          <p className="mt-1">
            Dúvidas? Entre em contato com nosso suporte.
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
