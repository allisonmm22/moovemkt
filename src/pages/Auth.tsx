import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Mail, Lock, User, Phone, CreditCard, MessageSquare, 
  Bot, Users, Link2, BarChart3, Check, Zap, Crown, 
  Building, Rocket, ArrowRight, ArrowLeft, Sparkles,
  Eye, EyeOff
} from "lucide-react";

interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  preco_mensal: number | null;
  limite_usuarios: number;
  limite_agentes: number;
  limite_funis: number;
  limite_conexoes_whatsapp: number;
  limite_mensagens_mes: number;
}

const planIcons: Record<string, React.ReactNode> = {
  "Starter": <Rocket className="w-8 h-8" />,
  "Pro": <Zap className="w-8 h-8" />,
  "Business": <Crown className="w-8 h-8" />,
  "Enterprise": <Building className="w-8 h-8" />,
};

const planGradients: Record<string, string> = {
  "Starter": "from-slate-500/20 to-blue-500/20 border-slate-500/30",
  "Pro": "from-emerald-500/20 to-teal-500/20 border-emerald-500/50",
  "Business": "from-violet-500/20 to-purple-500/20 border-violet-500/30",
  "Enterprise": "from-amber-500/20 to-orange-500/20 border-amber-500/30",
};

const planAccentColors: Record<string, string> = {
  "Starter": "text-slate-400",
  "Pro": "text-emerald-400",
  "Business": "text-violet-400",
  "Enterprise": "text-amber-400",
};

const planBadgeStyles: Record<string, string> = {
  "Starter": "bg-slate-500/20 text-slate-300",
  "Pro": "bg-emerald-500/20 text-emerald-300",
  "Business": "bg-violet-500/20 text-violet-300",
  "Enterprise": "bg-amber-500/20 text-amber-300",
};

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoSelecionado, setPlanoSelecionado] = useState<string | null>(null);
  const [loadingPlanos, setLoadingPlanos] = useState(false);
  const navigate = useNavigate();
  const { signIn, signUp, session } = useAuth();

  useEffect(() => {
    if (session) {
      navigate("/");
    }
  }, [session, navigate]);

  useEffect(() => {
    if (!isLogin) {
      fetchPlanos();
    }
  }, [isLogin]);

  const fetchPlanos = async () => {
    setLoadingPlanos(true);
    try {
      const { data, error } = await supabase
        .from("planos")
        .select("*")
        .eq("ativo", true)
        .order("preco_mensal", { ascending: true });
      
      if (error) throw error;
      setPlanos(data || []);
    } catch (error) {
      console.error("Erro ao buscar planos:", error);
    } finally {
      setLoadingPlanos(false);
    }
  };

  const formatWhatsapp = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const formatCpf = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9, 11)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error('Email ou senha incorretos');
          } else {
            toast.error(error.message);
          }
          return;
        }
        toast.success('Login realizado com sucesso!');
        navigate('/dashboard');
      } else {
        if (!planoSelecionado) {
          toast.error("É necessário escolher um plano para continuar.");
          setLoading(false);
          return;
        }

        const { error, contaId } = await signUp(email, password, nome, whatsapp.replace(/\D/g, ""), cpf.replace(/\D/g, ""), planoSelecionado);
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('Este email já está cadastrado');
          } else {
            toast.error(error.message);
          }
        } else {
          const plano = planos.find(p => p.id === planoSelecionado);
          if (plano && plano.preco_mensal && plano.preco_mensal > 0 && contaId) {
            toast.success('Conta criada! Redirecionando para pagamento...');
            
            const response = await supabase.functions.invoke('stripe-checkout', {
              body: { 
                plano_id: planoSelecionado,
                conta_id: contaId,
                success_url: `${window.location.origin}/dashboard?success=true`,
                cancel_url: `${window.location.origin}/minha-assinatura?canceled=true`,
              },
            });

            if (response.data?.url) {
              window.location.href = response.data.url;
              return;
            }
          } else {
            toast.success("Conta criada com sucesso!");
            setIsLogin(true);
            setStep(1);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const canProceedToStep2 = nome.trim() && email.trim() && password.trim() && whatsapp.length >= 14 && cpf.length >= 14;

  const formatLimit = (value: number, type: string) => {
    if (value >= 999999) return "Ilimitado";
    if (type === "mensagens" && value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  const getPopularBadge = (nome: string) => {
    if (nome === "Pro") return "Mais Popular";
    if (nome === "Business") return "Melhor Custo-Benefício";
    return null;
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/20 via-primary/10 to-background relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary/30 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-emerald-500/20 via-transparent to-transparent" />
        
        <div className="relative z-10 flex flex-col justify-center items-center w-full px-12">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-emerald-400 rounded-2xl flex items-center justify-center shadow-2xl shadow-primary/30">
              <MessageSquare className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-foreground">Moove CRM</h1>
              <p className="text-muted-foreground">CRM com WhatsApp</p>
            </div>
          </div>
          
          <div className="space-y-6 max-w-md">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Agente de IA Inteligente</h3>
                <p className="text-sm text-muted-foreground">Atendimento automático 24/7 com IA avançada</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">CRM Kanban Completo</h3>
                <p className="text-sm text-muted-foreground">Gerencie leads e negociações visualmente</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
              <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                <Link2 className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Integração WhatsApp</h3>
                <p className="text-sm text-muted-foreground">Conecte múltiplos números de WhatsApp</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-xl">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-primary to-emerald-400 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">Moove CRM</span>
          </div>

          {isLogin ? (
            /* Login Form */
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-foreground">Bem-vindo de volta!</h2>
                <p className="text-muted-foreground mt-2">Entre na sua conta para continuar</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-11 h-12 bg-card border-border"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-11 pr-11 h-12 bg-card border-border"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-emerald-500 hover:from-primary/90 hover:to-emerald-500/90 shadow-lg shadow-primary/25"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    "Entrar"
                  )}
                </Button>
              </form>

              <div className="text-center">
                <p className="text-muted-foreground">
                  Não tem uma conta?{" "}
                  <button
                    onClick={() => {
                      setIsLogin(false);
                      setStep(1);
                    }}
                    className="text-primary hover:text-primary/80 font-semibold transition-colors"
                  >
                    Criar conta
                  </button>
                </p>
              </div>
            </div>
          ) : (
            /* Signup Form */
            <div className="space-y-6">
              {/* Progress Steps */}
              <div className="flex items-center justify-center gap-3 mb-8">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                  step === 1 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-primary/20 text-primary"
                }`}>
                  <span className="w-6 h-6 rounded-full bg-current/20 flex items-center justify-center text-sm font-bold">1</span>
                  <span className="font-medium text-sm">Dados</span>
                </div>
                <div className="w-8 h-0.5 bg-border" />
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                  step === 2 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted text-muted-foreground"
                }`}>
                  <span className="w-6 h-6 rounded-full bg-current/20 flex items-center justify-center text-sm font-bold">2</span>
                  <span className="font-medium text-sm">Plano</span>
                </div>
              </div>

              {step === 1 ? (
                /* Step 1: Personal Data */
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-3xl font-bold text-foreground">Criar sua conta</h2>
                    <p className="text-muted-foreground mt-2">Preencha seus dados para começar</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="nome" className="text-foreground">Nome completo</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="nome"
                          type="text"
                          placeholder="Seu nome"
                          value={nome}
                          onChange={(e) => setNome(e.target.value)}
                          className="pl-11 h-12 bg-card border-border"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-foreground">E-mail</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="seu@email.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-11 h-12 bg-card border-border"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-foreground">Senha</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Mínimo 6 caracteres"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-11 pr-11 h-12 bg-card border-border"
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="whatsapp" className="text-foreground">WhatsApp</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input
                            id="whatsapp"
                            type="tel"
                            placeholder="(00) 00000-0000"
                            value={whatsapp}
                            onChange={(e) => setWhatsapp(formatWhatsapp(e.target.value))}
                            className="pl-11 h-12 bg-card border-border"
                            maxLength={15}
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="cpf" className="text-foreground">CPF</Label>
                        <div className="relative">
                          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input
                            id="cpf"
                            type="text"
                            placeholder="000.000.000-00"
                            value={cpf}
                            onChange={(e) => setCpf(formatCpf(e.target.value))}
                            className="pl-11 h-12 bg-card border-border"
                            maxLength={14}
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={!canProceedToStep2}
                    className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-emerald-500 hover:from-primary/90 hover:to-emerald-500/90 shadow-lg shadow-primary/25"
                  >
                    Continuar
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>

                  <div className="text-center">
                    <p className="text-muted-foreground">
                      Já tem uma conta?{" "}
                      <button
                        onClick={() => setIsLogin(true)}
                        className="text-primary hover:text-primary/80 font-semibold transition-colors"
                      >
                        Fazer login
                      </button>
                    </p>
                  </div>
                </div>
              ) : (
                /* Step 2: Plan Selection */
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setStep(1)}
                      className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5 text-foreground" />
                    </button>
                    <div>
                      <h2 className="text-2xl font-bold text-foreground">Escolha seu plano</h2>
                      <p className="text-muted-foreground text-sm">Selecione o plano ideal para o seu negócio</p>
                    </div>
                  </div>

                  {loadingPlanos ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {planos.map((plano) => {
                        const isSelected = planoSelecionado === plano.id;
                        const popularBadge = getPopularBadge(plano.nome);
                        const gradient = planGradients[plano.nome] || planGradients["Starter"];
                        const accentColor = planAccentColors[plano.nome] || planAccentColors["Starter"];
                        const badgeStyle = planBadgeStyles[plano.nome] || planBadgeStyles["Starter"];
                        const icon = planIcons[plano.nome] || <Rocket className="w-8 h-8" />;

                        return (
                          <div
                            key={plano.id}
                            onClick={() => setPlanoSelecionado(plano.id)}
                            className={`
                              relative p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300
                              bg-gradient-to-br ${gradient}
                              ${isSelected 
                                ? "border-primary ring-2 ring-primary/30 scale-[1.02] shadow-xl shadow-primary/20" 
                                : "hover:scale-[1.01] hover:shadow-lg"
                              }
                            `}
                          >
                            {/* Popular Badge */}
                            {popularBadge && (
                              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${badgeStyle}`}>
                                  <Sparkles className="w-3 h-3" />
                                  {popularBadge}
                                </div>
                              </div>
                            )}

                            {/* Selection Indicator */}
                            {isSelected && (
                              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                                <Check className="w-4 h-4 text-primary-foreground" />
                              </div>
                            )}

                            {/* Plan Header */}
                            <div className="flex items-center gap-3 mb-4">
                              <div className={`${accentColor}`}>
                                {icon}
                              </div>
                              <div>
                                <h3 className="text-xl font-bold text-foreground">{plano.nome}</h3>
                                {plano.descricao && (
                                  <p className="text-xs text-muted-foreground">{plano.descricao}</p>
                                )}
                              </div>
                            </div>

                            {/* Price */}
                            <div className="mb-4">
                              {plano.preco_mensal && plano.preco_mensal > 0 ? (
                                <div className="flex items-baseline gap-1">
                                  <span className="text-sm text-muted-foreground">R$</span>
                                  <span className="text-4xl font-bold text-foreground">
                                    {plano.preco_mensal.toFixed(0)}
                                  </span>
                                  <span className="text-sm text-muted-foreground">/mês</span>
                                </div>
                              ) : (
                                <div className="text-2xl font-bold text-foreground">Grátis</div>
                              )}
                            </div>

                            {/* Features */}
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm">
                                <Users className="w-4 h-4 text-emerald-400" />
                                <span className="text-muted-foreground">
                                  <span className="text-foreground font-medium">{formatLimit(plano.limite_usuarios, "usuarios")}</span> usuários
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <Bot className="w-4 h-4 text-violet-400" />
                                <span className="text-muted-foreground">
                                  <span className="text-foreground font-medium">{formatLimit(plano.limite_agentes, "agentes")}</span> agentes IA
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <Link2 className="w-4 h-4 text-blue-400" />
                                <span className="text-muted-foreground">
                                  <span className="text-foreground font-medium">{formatLimit(plano.limite_conexoes_whatsapp, "conexoes")}</span> conexões WhatsApp
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <MessageSquare className="w-4 h-4 text-amber-400" />
                                <span className="text-muted-foreground">
                                  <span className="text-foreground font-medium">{formatLimit(plano.limite_mensagens_mes, "mensagens")}</span> msgs/mês
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <BarChart3 className="w-4 h-4 text-pink-400" />
                                <span className="text-muted-foreground">
                                  <span className="text-foreground font-medium">{formatLimit(plano.limite_funis, "funis")}</span> funis CRM
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <form onSubmit={handleSubmit}>
                    <Button
                      type="submit"
                      disabled={!planoSelecionado || loading}
                      className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-emerald-500 hover:from-primary/90 hover:to-emerald-500/90 shadow-lg shadow-primary/25"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      ) : (
                        <>
                          Criar conta e continuar
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
