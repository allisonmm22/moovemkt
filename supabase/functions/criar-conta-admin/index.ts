import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { nomeEmpresa, nomeUsuario, email, senha } = await req.json();

    if (!nomeEmpresa || !nomeUsuario || !email || !senha) {
      return new Response(
        JSON.stringify({ error: 'Todos os campos são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se o chamador é super_admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller } } = await supabase.auth.getUser(token);
    
    if (!caller) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se é super_admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .single();

    if (roleData?.role !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: 'Apenas super admins podem criar contas' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Criando conta para:', email);

    // 1. Criar usuário no auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });

    if (authError) {
      console.error('Erro ao criar usuário auth:', authError);
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Criar conta
    const { data: contaData, error: contaError } = await supabase
      .from('contas')
      .insert({ nome: nomeEmpresa })
      .select()
      .single();

    if (contaError) {
      console.error('Erro ao criar conta:', contaError);
      // Limpar usuário auth criado
      await supabase.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: contaError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Criar usuário na tabela usuarios
    const { error: usuarioError } = await supabase
      .from('usuarios')
      .insert({
        user_id: authData.user.id,
        conta_id: contaData.id,
        nome: nomeUsuario,
        email,
        is_admin: true,
      });

    if (usuarioError) {
      console.error('Erro ao criar usuario:', usuarioError);
      await supabase.auth.admin.deleteUser(authData.user.id);
      await supabase.from('contas').delete().eq('id', contaData.id);
      return new Response(
        JSON.stringify({ error: usuarioError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Criar role admin
    await supabase.from('user_roles').insert({
      user_id: authData.user.id,
      role: 'admin',
    });

    // 5. Criar agente IA padrão
    await supabase.from('agent_ia').insert({ conta_id: contaData.id });

    // 6. Criar funil padrão
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

    console.log('Conta criada com sucesso:', contaData.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        contaId: contaData.id,
        userId: authData.user.id 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro ao criar conta:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
