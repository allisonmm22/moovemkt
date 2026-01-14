import { AlertTriangle, LogOut, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ContaDesativadaOverlayProps {
  onSignOut: () => void;
}

export function ContaDesativadaOverlay({ onSignOut }: ContaDesativadaOverlayProps) {
  return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Conta Desativada
          </h1>
          <p className="text-muted-foreground">
            Sua conta foi desativada temporariamente. Entre em contato com o suporte para mais informações.
          </p>
        </div>
        
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Entre em contato:</p>
          <div className="space-y-2">
            <a 
              href="mailto:suporte@seudominio.com" 
              className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
            >
              <Mail className="w-4 h-4" />
              suporte@seudominio.com
            </a>
            <a 
              href="tel:+5511999999999" 
              className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
            >
              <Phone className="w-4 h-4" />
              (11) 99999-9999
            </a>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          onClick={onSignOut}
          className="w-full"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sair da Conta
        </Button>
      </div>
    </div>
  );
}
