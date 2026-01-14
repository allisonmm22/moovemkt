import { useState, useEffect } from 'react';
import { Shield, MessageSquare, Eye, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

interface UsuarioComRole {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  avatar_url: string | null;
  role: 'admin' | 'atendente';
  ver_todas_conversas: boolean;
}

interface EditarUsuarioModalProps {
  user: UsuarioComRole | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditarUsuarioModal({ user, onClose, onSuccess }: EditarUsuarioModalProps) {
  const { usuario: currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState('');
  const [role, setRole] = useState<'admin' | 'atendente'>('atendente');
  const [verTodasConversas, setVerTodasConversas] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [loadingPassword, setLoadingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setNome(user.nome);
      setRole(user.role);
      setVerTodasConversas(user.ver_todas_conversas);
      setNovaSenha('');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !nome.trim()) {
      toast.error('Preencha o nome');
      return;
    }

    // Não permitir que o único admin se torne atendente
    if (user.role === 'admin' && role === 'atendente' && user.user_id === currentUser?.user_id) {
      toast.error('Você não pode remover sua própria permissão de admin');
      return;
    }

    setLoading(true);
    try {
      // Atualizar nome na tabela usuarios
      const { error: usuarioError } = await supabase
        .from('usuarios')
        .update({ nome, is_admin: role === 'admin' })
        .eq('id', user.id);

      if (usuarioError) throw usuarioError;

      // Atualizar role se mudou
      if (role !== user.role) {
        // Deletar role antigo
        await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', user.user_id);

        // Inserir novo role
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: user.user_id,
            role,
          });

        if (roleError) throw roleError;
      }

      // Gerenciar config de atendente
      if (role === 'atendente') {
        // Verificar se já existe config
        const { data: existingConfig } = await supabase
          .from('atendente_config')
          .select('id')
          .eq('usuario_id', user.id)
          .maybeSingle();

        if (existingConfig) {
          await supabase
            .from('atendente_config')
            .update({ ver_todas_conversas: verTodasConversas })
            .eq('usuario_id', user.id);
        } else {
          await supabase
            .from('atendente_config')
            .insert({
              usuario_id: user.id,
              ver_todas_conversas: verTodasConversas,
            });
        }
      } else {
        // Se mudou para admin, deletar config de atendente
        await supabase
          .from('atendente_config')
          .delete()
          .eq('usuario_id', user.id);
      }

      toast.success('Usuário atualizado');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erro ao atualizar:', error);
      toast.error(error.message || 'Erro ao atualizar usuário');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user || !novaSenha.trim()) {
      toast.error('Digite a nova senha');
      return;
    }

    if (novaSenha.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres');
      return;
    }

    setLoadingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: {
          user_id: user.user_id,
          new_password: novaSenha
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Senha redefinida com sucesso');
      setNovaSenha('');
    } catch (error: any) {
      console.error('Erro ao redefinir senha:', error);
      toast.error(error.message || 'Erro ao redefinir senha');
    } finally {
      setLoadingPassword(false);
    }
  };

  if (!user) return null;

  const isCurrentUser = user.user_id === currentUser?.user_id;

  return (
    <Dialog open={!!user} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do usuário"
            />
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user.email} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">O email não pode ser alterado</p>
          </div>

          <div className="space-y-3">
            <Label>Permissão</Label>
            <RadioGroup 
              value={role} 
              onValueChange={(v) => setRole(v as 'admin' | 'atendente')}
              disabled={isCurrentUser && user.role === 'admin'}
            >
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="admin" id="admin-edit" />
                <Label htmlFor="admin-edit" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Shield className="h-4 w-4 text-primary" />
                  <div>
                    <p className="font-medium">Admin</p>
                    <p className="text-xs text-muted-foreground">Acesso total ao sistema</p>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="atendente" id="atendente-edit" />
                <Label htmlFor="atendente-edit" className="flex items-center gap-2 cursor-pointer flex-1">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Atendente</p>
                    <p className="text-xs text-muted-foreground">Acesso limitado às conversas</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>
            {isCurrentUser && user.role === 'admin' && (
              <p className="text-xs text-amber-600">Você não pode alterar sua própria permissão de admin</p>
            )}
          </div>

          {role === 'atendente' && (
            <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="ver-todas-edit" className="cursor-pointer">
                    Ver todas as conversas
                  </Label>
                </div>
                <Switch
                  id="ver-todas-edit"
                  checked={verTodasConversas}
                  onCheckedChange={setVerTodasConversas}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {verTodasConversas
                  ? 'O atendente poderá ver todas as conversas da conta.'
                  : 'O atendente verá apenas conversas atribuídas a ele.'}
              </p>
            </div>
          )}

          <Separator className="my-4" />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium">Redefinir Senha</Label>
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Nova senha (mín. 6 caracteres)"
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleResetPassword}
                disabled={loadingPassword || !novaSenha.trim()}
              >
                {loadingPassword ? 'Redefinindo...' : 'Redefinir'}
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
