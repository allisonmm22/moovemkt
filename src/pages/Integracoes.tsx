import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageSquare, Brain, Calendar, Mail, Webhook, Zap, Eye, EyeOff, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { toast } from "sonner";
import { OnboardingTooltip } from "@/components/onboarding/OnboardingTooltip";

interface IntegrationCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: 'connected' | 'configured' | 'disconnected' | 'coming_soon';
  statusLabel?: string;
  onConfigure?: () => void;
  comingSoon?: boolean;
}

const IntegrationCard = ({ 
  icon, 
  title, 
  description, 
  status, 
  statusLabel,
  onConfigure, 
  comingSoon 
}: IntegrationCardProps) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Conectado</Badge>;
      case 'configured':
        return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">Configurado</Badge>;
      case 'disconnected':
        return <Badge variant="outline" className="text-muted-foreground">Desconectado</Badge>;
      case 'coming_soon':
        return <Badge variant="outline" className="text-muted-foreground">Em breve</Badge>;
    }
  };

  return (
    <Card className={`relative overflow-hidden transition-all ${comingSoon ? 'opacity-60' : 'hover:shadow-lg hover:border-primary/30'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${comingSoon ? 'bg-muted' : 'bg-primary/10'}`}>
              {icon}
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription className="text-sm mt-1">{description}</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          {getStatusBadge()}
          <Button 
            variant={comingSoon ? "outline" : "default"} 
            size="sm"
            onClick={onConfigure}
            disabled={comingSoon}
          >
            {comingSoon ? 'Em breve' : 'Configurar'}
          </Button>
        </div>
        {statusLabel && (
          <p className="text-xs text-muted-foreground mt-2">{statusLabel}</p>
        )}
      </CardContent>
    </Card>
  );
};

const Integracoes = () => {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { isOnboardingActive, currentStep, completeStep, nextStep } = useOnboarding();
  const [openAIModalOpen, setOpenAIModalOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [whatsappCount, setWhatsappCount] = useState(0);
  const [googleCalendarCount, setGoogleCalendarCount] = useState(0);

  useEffect(() => {
    if (usuario?.conta_id) {
      loadIntegrationStatus();
    }
  }, [usuario?.conta_id]);

  // Auto abrir modal OpenAI durante onboarding
  useEffect(() => {
    if (isOnboardingActive && currentStep === 'configurar_openai' && !hasOpenAIKey) {
      setOpenAIModalOpen(true);
    }
  }, [isOnboardingActive, currentStep, hasOpenAIKey]);

  const loadIntegrationStatus = async () => {
    if (!usuario?.conta_id) return;

    // Check OpenAI API Key
    const { data: conta } = await supabase
      .from('contas')
      .select('openai_api_key')
      .eq('id', usuario.conta_id)
      .single();

    setHasOpenAIKey(!!conta?.openai_api_key);
    if (conta?.openai_api_key) {
      setApiKey(conta.openai_api_key);
    }

    // Check WhatsApp connections
    const { data: conexoes } = await supabase
      .from('conexoes_whatsapp')
      .select('id, status')
      .eq('conta_id', usuario.conta_id);

    if (conexoes && conexoes.length > 0) {
      const connected = conexoes.some(c => c.status === 'conectado');
      setWhatsappStatus(connected ? 'connected' : 'disconnected');
      setWhatsappCount(conexoes.length);
    }

    // Check Google Calendar connections
    const { data: calendarios } = await supabase
      .from('calendarios_google')
      .select('id, ativo')
      .eq('conta_id', usuario.conta_id);

    if (calendarios) {
      setGoogleCalendarCount(calendarios.filter(c => c.ativo).length);
    }
  };

  const handleSaveOpenAI = async () => {
    if (!usuario?.conta_id) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('contas')
        .update({ openai_api_key: apiKey || null })
        .eq('id', usuario.conta_id);

      if (error) throw error;

      setHasOpenAIKey(!!apiKey);
      toast.success(apiKey ? "API Key salva com sucesso!" : "API Key removida");
      setOpenAIModalOpen(false);
      
      // Avançar onboarding se estiver ativo
      if (apiKey && isOnboardingActive && currentStep === 'configurar_openai') {
        completeStep('configurar_openai');
        nextStep();
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      toast.error("Erro ao salvar API Key");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestOpenAI = async () => {
    if (!apiKey) {
      toast.error("Insira uma API Key para testar");
      return;
    }

    setIsTesting(true);
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (response.ok) {
        toast.success("Conexão com OpenAI funcionando!");
      } else if (response.status === 401) {
        toast.error("API Key inválida");
      } else {
        toast.error("Erro ao testar conexão");
      }
    } catch (error) {
      toast.error("Erro ao conectar com OpenAI");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Integrações</h1>
          <p className="text-muted-foreground">Conecte sua conta com serviços externos</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* WhatsApp */}
          <IntegrationCard
            icon={<MessageSquare className="h-5 w-5 text-green-500" />}
            title="WhatsApp"
            description="Evolution API para mensagens"
            status={whatsappStatus}
            statusLabel={whatsappCount > 0 ? `${whatsappCount} conexão(ões) configurada(s)` : undefined}
            onConfigure={() => navigate('/conexao')}
          />

          {/* OpenAI */}
          <OnboardingTooltip
            title="Configure sua chave OpenAI"
            description="Esta é uma configuração obrigatória. Adicione sua API Key da OpenAI para que o agente IA funcione corretamente."
            step={3}
            totalSteps={5}
            position="bottom"
            isVisible={isOnboardingActive && currentStep === 'configurar_openai'}
            showNextButton={false}
          >
            <IntegrationCard
              icon={<Brain className="h-5 w-5 text-primary" />}
              title="OpenAI"
              description="GPT-4, GPT-5, Whisper"
              status={hasOpenAIKey ? 'configured' : 'disconnected'}
              statusLabel={hasOpenAIKey ? "API Key configurada" : "Opcional - usa Lovable AI como fallback"}
              onConfigure={() => setOpenAIModalOpen(true)}
            />
          </OnboardingTooltip>

          {/* Google Calendar */}
          <IntegrationCard
            icon={<Calendar className="h-5 w-5 text-blue-500" />}
            title="Google Calendar"
            description="Sincronizar agendamentos"
            status={googleCalendarCount > 0 ? 'connected' : 'disconnected'}
            statusLabel={googleCalendarCount > 0 ? `${googleCalendarCount} calendário(s) conectado(s)` : undefined}
            onConfigure={() => navigate('/integracoes/google-calendar')}
          />

          {/* Email SMTP */}
          <IntegrationCard
            icon={<Mail className="h-5 w-5 text-muted-foreground" />}
            title="Email (SMTP)"
            description="Enviar notificações por email"
            status="coming_soon"
            comingSoon
          />

          {/* Webhooks */}
          <IntegrationCard
            icon={<Webhook className="h-5 w-5 text-muted-foreground" />}
            title="Webhooks"
            description="Integrar com sistemas externos"
            status="coming_soon"
            comingSoon
          />

          {/* API / N8N / Make */}
          <IntegrationCard
            icon={<Zap className="h-5 w-5 text-orange-500" />}
            title="API / N8N / Make"
            description="Integre via HTTP"
            status="disconnected"
            onConfigure={() => navigate('/api-docs')}
          />
        </div>
      </div>

      {/* OpenAI Configuration Modal */}
      <Dialog open={openAIModalOpen} onOpenChange={setOpenAIModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Configurar OpenAI
            </DialogTitle>
            <DialogDescription>
              Configure sua API Key para usar modelos OpenAI. Se não configurada, o sistema usará Lovable AI automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <div className={`relative ${isOnboardingActive && currentStep === 'configurar_openai' ? 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-md animate-pulse' : ''}`}>
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Obtenha sua API Key em{" "}
                <a 
                  href="https://platform.openai.com/api-keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  platform.openai.com
                </a>
              </p>
              {isOnboardingActive && currentStep === 'configurar_openai' && (
                <p className="text-xs text-primary font-medium">
                  ⬆️ Cole sua API Key aqui e clique em Salvar
                </p>
              )}
            </div>

            <Button 
              variant="outline" 
              onClick={handleTestOpenAI}
              disabled={!apiKey || isTesting}
              className="w-full"
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Testar Conexão
                </>
              )}
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAIModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveOpenAI} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Integracoes;
