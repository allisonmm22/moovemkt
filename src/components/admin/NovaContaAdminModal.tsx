import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z.object({
  nomeEmpresa: z.string().min(2, 'Nome da empresa deve ter no mínimo 2 caracteres').max(100),
  nomeUsuario: z.string().min(2, 'Nome do administrador deve ter no mínimo 2 caracteres').max(100),
  email: z.string().email('Email inválido'),
  senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

interface NovaContaAdminModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NovaContaAdminModal({ open, onClose, onSuccess }: NovaContaAdminModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nomeEmpresa: '',
    nomeUsuario: '',
    email: '',
    senha: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar com Zod
    const validation = formSchema.safeParse(formData);
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('criar-conta-admin', {
        body: {
          nomeEmpresa: formData.nomeEmpresa.trim(),
          nomeUsuario: formData.nomeUsuario.trim(),
          email: formData.email.trim().toLowerCase(),
          senha: formData.senha,
        },
      });

      if (error) {
        throw new Error(error.message || 'Erro ao criar conta');
      }

      if (data?.error) {
        throw new Error(data.error);
      }
      
      toast.success('Conta criada com sucesso! O administrador pode fazer login agora.');
      setFormData({ nomeEmpresa: '', nomeUsuario: '', email: '', senha: '' });
      onSuccess();
    } catch (error: any) {
      console.error('Erro ao criar conta:', error);
      
      // Tratar erros específicos
      if (error.message?.includes('already registered') || error.message?.includes('já existe')) {
        toast.error('Este email já está cadastrado no sistema');
      } else if (error.message?.includes('Invalid email')) {
        toast.error('Email inválido');
      } else {
        toast.error(error.message || 'Erro ao criar conta');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Conta</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da Empresa</Label>
            <Input
              value={formData.nomeEmpresa}
              onChange={(e) => setFormData({ ...formData, nomeEmpresa: e.target.value })}
              placeholder="Ex: Empresa XYZ"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Nome do Administrador</Label>
            <Input
              value={formData.nomeUsuario}
              onChange={(e) => setFormData({ ...formData, nomeUsuario: e.target.value })}
              placeholder="Ex: João Silva"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="admin@empresa.com"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Senha Inicial</Label>
            <Input
              type="password"
              value={formData.senha}
              onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Criando...' : 'Criar Conta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
