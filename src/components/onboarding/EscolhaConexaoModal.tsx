import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  Smartphone, 
  Building2, 
  QrCode, 
  Shield, 
  DollarSign, 
  Zap,
  Check,
  X
} from 'lucide-react';
import { useOnboarding } from '@/contexts/OnboardingContext';

interface EscolhaConexaoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EscolhaConexaoModal({ open, onOpenChange }: EscolhaConexaoModalProps) {
  const navigate = useNavigate();
  const { setTipoConexao, nextStep, completeStep } = useOnboarding();

  const handleEscolha = (tipo: 'evolution' | 'meta') => {
    setTipoConexao(tipo);
    completeStep('escolha_conexao');
    onOpenChange(false);
    nextStep();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center">
            🚀 Vamos começar!
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            Escolha como você quer conectar seu WhatsApp ao sistema
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {/* Evolution API */}
          <button
            onClick={() => handleEscolha('evolution')}
            className="group relative p-6 rounded-2xl border-2 border-border hover:border-primary bg-card hover:bg-accent/50 transition-all duration-300 text-left"
          >
            <div className="absolute top-3 right-3 px-2 py-1 bg-emerald-500/20 text-emerald-600 rounded-full text-xs font-medium">
              Gratuito
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-emerald-500/20">
                <QrCode className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-lg">Evolution API</h3>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Conexão não-oficial via QR Code. Rápido e sem custos mensais.
            </p>

            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>100% gratuito</span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Conexão via QR Code</span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Sem aprovação necessária</span>
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <X className="h-4 w-4 text-amber-500" />
                <span>Risco de ban (uso moderado)</span>
              </li>
            </ul>

            <div className="mt-4 pt-4 border-t border-border">
              <span className="text-sm font-medium text-primary group-hover:underline">
                Selecionar Evolution API →
              </span>
            </div>
          </button>

          {/* Meta API */}
          <button
            onClick={() => handleEscolha('meta')}
            className="group relative p-6 rounded-2xl border-2 border-border hover:border-primary bg-card hover:bg-accent/50 transition-all duration-300 text-left"
          >
            <div className="absolute top-3 right-3 px-2 py-1 bg-blue-500/20 text-blue-600 rounded-full text-xs font-medium">
              Oficial
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-blue-500/20">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-lg">Meta Business API</h3>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              API oficial da Meta. Maior estabilidade e sem risco de banimento.
            </p>

            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Zero risco de ban</span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>API oficial Meta</span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Alta disponibilidade</span>
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <X className="h-4 w-4 text-amber-500" />
                <span>Requer aprovação Meta</span>
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <X className="h-4 w-4 text-amber-500" />
                <span>Custo por mensagem</span>
              </li>
            </ul>

            <div className="mt-4 pt-4 border-t border-border">
              <span className="text-sm font-medium text-primary group-hover:underline">
                Selecionar Meta API →
              </span>
            </div>
          </button>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          Não se preocupe, você pode alterar isso depois nas configurações.
        </p>
      </DialogContent>
    </Dialog>
  );
}
