import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { User, Lock, Save, Eye, EyeOff, PenLine } from 'lucide-react';

export default function Perfil() {
  const { usuario, refreshUsuario } = useAuth();
  const { toast } = useToast();
  
  const [assinaturaAtiva, setAssinaturaAtiva] = useState(usuario?.assinatura_ativa ?? true);

  useEffect(() => {
    if (usuario) {
      setAssinaturaAtiva(usuario.assinatura_ativa ?? true);
    }
  }, [usuario]);
  
  const [nome, setNome] = useState(usuario?.nome || '');
  const [savingNome, setSavingNome] = useState(false);
  
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [savingSenha, setSavingSenha] = useState(false);
  const [showSenhaAtual, setShowSenhaAtual] = useState(false);
  const [showNovaSenha, setShowNovaSenha] = useState(false);
  const [showConfirmarSenha, setShowConfirmarSenha] = useState(false);

  const handleSaveNome = async () => {
    if (!nome.trim()) {
      toast({
        title: 'Erro',
        description: 'O nome não pode estar vazio.',
        variant: 'destructive',
      });
      return;
    }

    if (!usuario?.id) return;

    setSavingNome(true);
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({ nome: nome.trim() })
        .eq('id', usuario.id);

      if (error) throw error;

      await refreshUsuario();
      
      toast({
        title: 'Sucesso',
        description: 'Nome atualizado com sucesso!',
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao atualizar nome.',
        variant: 'destructive',
      });
    } finally {
      setSavingNome(false);
    }
  };

  const handleAssinaturaToggle = async (enabled: boolean) => {
    if (!usuario?.id) return;
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({ assinatura_ativa: enabled })
        .eq('id', usuario.id);

      if (error) throw error;
      
      setAssinaturaAtiva(enabled);
      await refreshUsuario();
      toast({
        title: 'Sucesso',
        description: enabled ? 'Assinatura ativada' : 'Assinatura desativada',
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Erro ao salvar preferência',
        variant: 'destructive',
      });
    }
  };

  const handleChangeSenha = async () => {
    if (!novaSenha || !confirmarSenha) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos de senha.',
        variant: 'destructive',
      });
      return;
    }

    if (novaSenha.length < 6) {
      toast({
        title: 'Erro',
        description: 'A nova senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    if (novaSenha !== confirmarSenha) {
      toast({
        title: 'Erro',
        description: 'As senhas não coincidem.',
        variant: 'destructive',
      });
      return;
    }

    setSavingSenha(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: novaSenha,
      });

      if (error) throw error;

      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarSenha('');
      
      toast({
        title: 'Sucesso',
        description: 'Senha alterada com sucesso!',
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao alterar senha.',
        variant: 'destructive',
      });
    } finally {
      setSavingSenha(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>
          <p className="text-muted-foreground">Gerencie suas informações pessoais</p>
        </div>

        {/* Informações Pessoais */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informações Pessoais
            </CardTitle>
            <CardDescription>Atualize seu nome e veja seu email cadastrado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={usuario?.avatar_url || ''} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                  {usuario?.nome?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-foreground">{usuario?.nome}</p>
                <p className="text-sm text-muted-foreground">{usuario?.is_admin ? 'Administrador' : 'Usuário'}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={usuario?.email || ''}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  O email não pode ser alterado por aqui.
                </p>
              </div>

              {/* Assinatura nas Mensagens */}
              <div className="flex items-center justify-between gap-3 p-3 md:p-4 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-3 min-w-0">
                  <PenLine className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm md:text-base">Assinatura nas Mensagens</p>
                    <p className="text-xs md:text-sm text-muted-foreground">Adicionar seu nome ao final das mensagens</p>
                  </div>
                </div>
                <button
                  onClick={() => handleAssinaturaToggle(!assinaturaAtiva)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    assinaturaAtiva ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      assinaturaAtiva ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <Button onClick={handleSaveNome} disabled={savingNome}>
                <Save className="h-4 w-4 mr-2" />
                {savingNome ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Alterar Senha */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Alterar Senha
            </CardTitle>
            <CardDescription>Atualize sua senha de acesso</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="novaSenha">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="novaSenha"
                  type={showNovaSenha ? 'text' : 'password'}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Digite a nova senha"
                />
                <button
                  type="button"
                  onClick={() => setShowNovaSenha(!showNovaSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNovaSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmarSenha">Confirmar Nova Senha</Label>
              <div className="relative">
                <Input
                  id="confirmarSenha"
                  type={showConfirmarSenha ? 'text' : 'password'}
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  placeholder="Confirme a nova senha"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmarSenha(!showConfirmarSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button onClick={handleChangeSenha} disabled={savingSenha}>
              <Lock className="h-4 w-4 mr-2" />
              {savingSenha ? 'Alterando...' : 'Alterar Senha'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
