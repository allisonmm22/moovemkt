import { useState } from 'react';
import { Bot, X, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface NovoAgenteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (nome: string, tipo: 'principal' | 'secundario') => Promise<void>;
}

export function NovoAgenteModal({ open, onOpenChange, onConfirm }: NovoAgenteModalProps) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'principal' | 'secundario'>('secundario');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;

    setSaving(true);
    try {
      await onConfirm(nome.trim(), tipo);
      setNome('');
      setTipo('secundario');
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) {
      setNome('');
      setTipo('secundario');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Novo Agente
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Nome do Agente
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Assistente de Vendas"
              className="w-full h-10 px-4 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Tipo do Agente
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTipo('principal')}
                disabled={saving}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  tipo === 'principal'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/50'
                }`}
              >
                <span className="block font-medium text-sm">Principal</span>
                <span className="block text-xs mt-0.5 opacity-75">
                  Atende todas as conversas
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTipo('secundario')}
                disabled={saving}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  tipo === 'secundario'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/50'
                }`}
              >
                <span className="block font-medium text-sm">Secundário</span>
                <span className="block text-xs mt-0.5 opacity-75">
                  Recebe transferências
                </span>
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="h-10 px-4 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!nome.trim() || saving}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Agente
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
