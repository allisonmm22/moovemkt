import { useState } from 'react';
import { Shield, MessageSquare, Eye } from 'lucide-react';
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
import { toast } from 'sonner';
import { validarEExibirErro } from '@/hooks/useValidarLimitePlano';

interface NovoUsuarioModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NovoUsuarioModal({ open, onClose, onSuccess }: NovoUsuarioModalProps) {
  const { usuario } = useAuth();
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [role, setRole] = useState<'admin' | 'atendente'>('atendente');
  const [verTodasConversas, setVerTodasConversas] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !email.trim() || !senha.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }

    if (senha.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      // Validar limite do plano
      const permitido = await validarEExibirErro(usuario!.conta_id, 'usuarios');
      if (!permitido) {
        setLoading(false);
        return;
      }

      // Criar usuário no auth usando função de signup
      // Nota: Em produção, seria melhor usar um Edge Function com service_role key
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            nome,
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Falha ao criar usuário');

      // Criar registro na tabela usuarios
      const { data: novoUsuario, error: usuarioError } = await supabase
        .from('usuarios')
        .insert({
          user_id: authData.user.id,
          conta_id: usuario?.conta_id,
          nome,
          email,
          is_admin: role === 'admin',
        })
        .select()
        .single();

      if (usuarioError) throw usuarioError;

      // Criar role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: authData.user.id,
          role,
        });

      if (roleError) throw roleError;

      // Se for atendente, criar config
      if (role === 'atendente') {
        await supabase
          .from('atendente_config')
          .insert({
            usuario_id: novoUsuario.id,
            ver_todas_conversas: verTodasConversas,
          });
      }

      toast.success('Usuário criado com sucesso!');
      resetForm();
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erro ao criar usuário:', error);
      if (error.message?.includes('already registered')) {
        toast.error('Este email já está cadastrado');
      } else {
        toast.error(error.message || 'Erro ao criar usuário');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNome('');
    setEmail('');
    setSenha('');
    setRole('atendente');
    setVerTodasConversas(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Usuário</DialogTitle>
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
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div className="space-y-3">
            <Label>Permissão</Label>
            <RadioGroup value={role} onValueChange={(v) => setRole(v as 'admin' | 'atendente')}>
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="admin" id="admin" />
                <Label htmlFor="admin" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Shield className="h-4 w-4 text-primary" />
                  <div>
                    <p className="font-medium">Admin</p>
                    <p className="text-xs text-muted-foreground">Acesso total ao sistema</p>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="atendente" id="atendente" />
                <Label htmlFor="atendente" className="flex items-center gap-2 cursor-pointer flex-1">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Atendente</p>
                    <p className="text-xs text-muted-foreground">Acesso limitado às conversas</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {role === 'atendente' && (
            <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="ver-todas" className="cursor-pointer">
                    Ver todas as conversas
                  </Label>
                </div>
                <Switch
                  id="ver-todas"
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

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Criando...' : 'Criar Usuário'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
