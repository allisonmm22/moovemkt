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

    const { email, senha, nome } = await req.json();

    if (!email || !senha || !nome) {
      return new Response(
        JSON.stringify({ error: 'Email, senha e nome são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se já existe algum super_admin
    const { data: existingSuperAdmin } = await supabase
      .from('user_roles')
      .select('id')
      .eq('role', 'super_admin')
      .limit(1);

    if (existingSuperAdmin && existingSuperAdmin.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Já existe um super admin no sistema' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Criando primeiro super admin:', email);

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

    // 2. Criar conta para o super admin
    const { data: contaData, error: contaError } = await supabase
      .from('contas')
      .insert({ nome: 'Administrador Geral', ativo: true })
      .select()
      .single();

    if (contaError) {
      console.error('Erro ao criar conta:', contaError);
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
        nome,
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

    // 4. Criar role super_admin
    const { error: roleError } = await supabase.from('user_roles').insert({
      user_id: authData.user.id,
      role: 'super_admin',
    });

    if (roleError) {
      console.error('Erro ao criar role:', roleError);
      // Não falhar por isso, o usuário foi criado
    }

    console.log('Super admin criado com sucesso:', authData.user.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Super admin criado com sucesso',
        userId: authData.user.id,
        contaId: contaData.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro ao criar super admin:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
