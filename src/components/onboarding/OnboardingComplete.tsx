import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Dialog, 
  DialogContent 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  PartyPopper, 
  Rocket, 
  MessageSquare,
  LayoutDashboard
} from 'lucide-react';
import { useOnboarding } from '@/contexts/OnboardingContext';

export function OnboardingComplete() {
  const navigate = useNavigate();
  const { isOnboardingActive, currentStep, skipOnboarding } = useOnboarding();
  const [showConfetti, setShowConfetti] = useState(false);

  const isOpen = isOnboardingActive && currentStep === 'concluido';

  useEffect(() => {
    if (isOpen) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = () => {
    skipOnboarding();
  };

  const handleGoToDashboard = () => {
    skipOnboarding();
    navigate('/dashboard');
  };

  const handleGoToConversas = () => {
    skipOnboarding();
    navigate('/conversas');
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md text-center">
        {/* Confetti animation */}
        {showConfetti && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-bounce"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  animationDuration: `${0.5 + Math.random() * 0.5}s`
                }}
              >
                {['🎉', '🎊', '✨', '🌟', '💫'][Math.floor(Math.random() * 5)]}
              </div>
            ))}
          </div>
        )}

        <div className="py-6">
          {/* Icon */}
          <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mb-6 animate-pulse">
            <PartyPopper className="h-10 w-10 text-white" />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold mb-2">
            Parabéns! 🎉
          </h2>
          <p className="text-muted-foreground mb-6">
            Seu CRM está configurado e pronto para usar! 
            Agora você pode começar a atender seus clientes com a ajuda da IA.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="p-3 rounded-xl bg-muted/50">
              <div className="text-2xl font-bold text-primary">✓</div>
              <div className="text-xs text-muted-foreground">WhatsApp</div>
            </div>
            <div className="p-3 rounded-xl bg-muted/50">
              <div className="text-2xl font-bold text-primary">✓</div>
              <div className="text-xs text-muted-foreground">OpenAI</div>
            </div>
            <div className="p-3 rounded-xl bg-muted/50">
              <div className="text-2xl font-bold text-primary">✓</div>
              <div className="text-xs text-muted-foreground">Agente IA</div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button 
              onClick={handleGoToConversas}
              className="w-full"
              size="lg"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Ir para Conversas
            </Button>
            <Button 
              onClick={handleGoToDashboard}
              variant="outline"
              className="w-full"
            >
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Ver Dashboard
            </Button>
          </div>

          {/* Tips */}
          <div className="mt-6 p-4 rounded-xl bg-muted/50 text-left">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Rocket className="h-4 w-4" />
              Próximos passos sugeridos:
            </h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Configure as etapas de atendimento do seu agente</li>
              <li>• Adicione perguntas frequentes para treinar a IA</li>
              <li>• Crie seus funis de vendas no CRM</li>
              <li>• Importe seus contatos existentes</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
