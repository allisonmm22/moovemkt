import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface Usuario {
  id: string;
  user_id: string;
  conta_id: string | null;
  nome: string;
  email: string;
  avatar_url: string | null;
  is_admin: boolean;
  role?: 'admin' | 'atendente' | 'super_admin';
  isSuperAdmin?: boolean;
  assinatura_ativa?: boolean;
  contaAtiva?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  usuario: Usuario | null;
  loading: boolean;
  signUp: (email: string, password: string, nome: string, whatsapp?: string, cpf?: string, planoId?: string) => Promise<{ error: Error | null; contaId?: string }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshUsuario: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchUsuario(session.user.id);
          }, 0);
        } else {
          setUsuario(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUsuario(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUsuario = async (userId: string) => {
    try {
      // Primeiro, verificar se é super_admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      const isSuperAdmin = (roleData?.role as string) === 'super_admin';

      // Se for super_admin, não precisa de registro na tabela usuarios
      if (isSuperAdmin) {
        // Buscar dados do auth.user para preencher dados básicos
        const { data: { user: authUser } } = await supabase.auth.getUser();
        
        setUsuario({
          id: userId,
          user_id: userId,
          conta_id: null,
          nome: authUser?.email?.split('@')[0] || 'Super Admin',
          email: authUser?.email || '',
          avatar_url: null,
          is_admin: true,
          role: 'super_admin',
          isSuperAdmin: true,
          assinatura_ativa: true,
        });
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        // Buscar status da conta
        let contaAtiva = true;
        if (data.conta_id) {
          const { data: contaData } = await supabase
            .from('contas')
            .select('ativo')
            .eq('id', data.conta_id)
            .single();
          contaAtiva = contaData?.ativo ?? true;
        }

        setUsuario({
          ...data,
          role: roleData?.role as 'admin' | 'atendente' | undefined,
          isSuperAdmin: false,
          assinatura_ativa: data.assinatura_ativa ?? true,
          contaAtiva,
        });
      } else {
        setUsuario(null);
      }
    } catch (error) {
      console.error('Erro ao buscar usuário:', error);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, nome: string, whatsapp?: string, cpf?: string, planoId?: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      });

      if (error) throw error;

      let contaId: string | undefined;

      if (data.user) {
        // Criar conta com whatsapp, cpf e plano
        const { data: contaData, error: contaError } = await supabase
          .from('contas')
          .insert({ 
            nome: `Conta de ${nome}`,
            whatsapp: whatsapp || null,
            cpf: cpf || null,
            plano_id: planoId || null,
          })
          .select()
          .single();

        if (contaError) throw contaError;
        contaId = contaData.id;

        // Criar usuário
        const { error: usuarioError } = await supabase
          .from('usuarios')
          .insert({
            user_id: data.user.id,
            conta_id: contaData.id,
            nome,
            email,
            is_admin: true
          });

        if (usuarioError) throw usuarioError;

        // Criar role de admin
        await supabase.from('user_roles').insert({
          user_id: data.user.id,
          role: 'admin'
        });

        // Criar configuração padrão do Agente IA
        await supabase.from('agent_ia').insert({ conta_id: contaData.id });

        // Criar funil padrão
        const { data: funilData } = await supabase
          .from('funis')
          .insert({ conta_id: contaData.id, nome: 'Vendas', ordem: 0 })
          .select()
          .single();

        if (funilData) {
          await supabase.from('estagios').insert([
            { funil_id: funilData.id, nome: 'Novo Lead', ordem: 0, cor: '#3b82f6' },
            { funil_id: funilData.id, nome: 'Em Contato', ordem: 1, cor: '#f59e0b' },
            { funil_id: funilData.id, nome: 'Proposta Enviada', ordem: 2, cor: '#8b5cf6' },
            { funil_id: funilData.id, nome: 'Negociação', ordem: 3, cor: '#ec4899' },
            { funil_id: funilData.id, nome: 'Fechado', ordem: 4, cor: '#10b981' },
          ]);
        }
      }

      return { error: null, contaId };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    } finally {
      // Sempre limpar o estado local, mesmo se o logout falhar no servidor
      setUser(null);
      setSession(null);
      setUsuario(null);
      // Redirecionar para a página de login
      window.location.href = '/auth';
    }
  };

  const refreshUsuario = async () => {
    if (user) {
      await fetchUsuario(user.id);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, usuario, loading, signUp, signIn, signOut, refreshUsuario }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
