import { useState, useEffect } from 'react';
import { Plus, Shield, MessageSquare, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { NovoUsuarioModal } from '@/components/NovoUsuarioModal';
import { EditarUsuarioModal } from '@/components/EditarUsuarioModal';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface UsuarioComRole {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  avatar_url: string | null;
  role: 'admin' | 'atendente';
  ver_todas_conversas: boolean;
}

export default function Usuarios() {
  const { usuario: currentUser } = useAuth();
  const isMobile = useIsMobile();
  const [usuarios, setUsuarios] = useState<UsuarioComRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNovoModal, setShowNovoModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UsuarioComRole | null>(null);
  const [deletingUser, setDeletingUser] = useState<UsuarioComRole | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
    fetchUsuarios();
  }, []);

  const checkAdminStatus = async () => {
    const { data } = await supabase.rpc('has_role', {
      _user_id: currentUser?.user_id,
      _role: 'admin'
    });
    setIsAdmin(!!data);
  };

  const fetchUsuarios = async () => {
    try {
      // Buscar usuários da conta
      const { data: usuariosData, error: usuariosError } = await supabase
        .from('usuarios')
        .select('*')
        .order('nome');

      if (usuariosError) throw usuariosError;

      // Buscar roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // Buscar configs de atendente
      const { data: configsData } = await supabase
        .from('atendente_config')
        .select('*');

      // Combinar dados
      const combined: UsuarioComRole[] = (usuariosData || []).map(u => {
        const role = rolesData?.find(r => r.user_id === u.user_id);
        const config = configsData?.find(c => c.usuario_id === u.id);
        return {
          ...u,
          role: (role?.role as 'admin' | 'atendente') || 'atendente',
          ver_todas_conversas: config?.ver_todas_conversas || false,
        };
      });

      setUsuarios(combined);
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;

    try {
      // Não pode deletar a si mesmo
      if (deletingUser.user_id === currentUser?.user_id) {
        toast.error('Você não pode deletar sua própria conta');
        return;
      }

      // Deletar role
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', deletingUser.user_id);

      // Deletar config de atendente se existir
      await supabase
        .from('atendente_config')
        .delete()
        .eq('usuario_id', deletingUser.id);

      // Deletar usuário (não deleta auth.users, apenas registro na tabela usuarios)
      const { error } = await supabase
        .from('usuarios')
        .delete()
        .eq('id', deletingUser.id);

      if (error) throw error;

      toast.success('Usuário removido');
      fetchUsuarios();
    } catch (error) {
      console.error('Erro ao deletar:', error);
      toast.error('Erro ao remover usuário');
    } finally {
      setDeletingUser(null);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <Shield className="h-16 w-16 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">Acesso Restrito</h2>
          <p className="text-muted-foreground">Apenas administradores podem acessar esta página.</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className={`max-w-4xl mx-auto ${isMobile ? 'px-4 py-4' : 'p-6'}`}>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Usuários</h1>
          <p className="text-muted-foreground text-sm hidden sm:block">Gerencie os usuários e permissões da sua conta</p>
        </div>
        <Button onClick={() => setShowNovoModal(true)} size={isMobile ? 'sm' : 'default'}>
          <Plus className="h-4 w-4 mr-1 md:mr-2" />
          {isMobile ? 'Novo' : 'Novo Usuário'}
        </Button>
      </div>

      <div className="space-y-3">
        {usuarios.map((user) => (
          <Card key={user.id} className="hover:bg-muted/50 transition-colors">
            <CardContent className="p-3 md:p-4">
              <div className={`flex ${isMobile ? 'flex-col gap-3' : 'items-center justify-between'}`}>
                <div className="flex items-center gap-3 md:gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-semibold">
                      {user.nome.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground truncate">{user.nome}</p>
                      {user.user_id === currentUser?.user_id && (
                        <Badge variant="outline" className="text-xs">Você</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>

                <div className={`flex items-center ${isMobile ? 'justify-between pl-13' : 'gap-3'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {user.role === 'admin' ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20">
                        <Shield className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <MessageSquare className="h-3 w-3 mr-1" />
                        Atendente
                      </Badge>
                    )}
                    {user.role === 'atendente' && !isMobile && (
                      <Badge variant="outline" className="text-xs">
                        {user.ver_todas_conversas ? (
                          <>
                            <Eye className="h-3 w-3 mr-1" />
                            Todas conversas
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3 w-3 mr-1" />
                            Só próprias
                          </>
                        )}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingUser(user)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {user.user_id !== currentUser?.user_id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeletingUser(user)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {usuarios.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Nenhum usuário encontrado
          </div>
        )}
      </div>

      <NovoUsuarioModal
        open={showNovoModal}
        onClose={() => setShowNovoModal(false)}
        onSuccess={fetchUsuarios}
      />

      <EditarUsuarioModal
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSuccess={fetchUsuarios}
      />

      <AlertDialog open={!!deletingUser} onOpenChange={() => setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover {deletingUser?.nome}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </MainLayout>
  );
}
