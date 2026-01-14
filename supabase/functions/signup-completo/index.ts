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

    const { email, senha, nome, whatsapp, cpf, planoId } = await req.json();

    if (!email || !senha || !nome) {
      return new Response(
        JSON.stringify({ error: 'Email, senha e nome são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Iniciando signup completo para:', email);

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

    const userId = authData.user.id;
    console.log('Usuário auth criado:', userId);

    // 2. Criar conta
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

    if (contaError) {
      console.error('Erro ao criar conta:', contaError);
      // Rollback: deletar usuário auth
      await supabase.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar conta: ' + contaError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Conta criada:', contaData.id);

    // 3. Criar usuário na tabela usuarios
    const { error: usuarioError } = await supabase
      .from('usuarios')
      .insert({
        user_id: userId,
        conta_id: contaData.id,
        nome,
        email,
        is_admin: true,
      });

    if (usuarioError) {
      console.error('Erro ao criar usuario:', usuarioError);
      // Rollback
      await supabase.auth.admin.deleteUser(userId);
      await supabase.from('contas').delete().eq('id', contaData.id);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar usuário: ' + usuarioError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Usuário criado na tabela usuarios');

    // 4. Criar role de admin
    const { error: roleError } = await supabase.from('user_roles').insert({
      user_id: userId,
      role: 'admin',
    });

    if (roleError) {
      console.error('Erro ao criar role:', roleError);
      // Não falhar por isso, continuar
    }

    // 5. Criar configuração padrão do Agente IA
    const { error: agentError } = await supabase
      .from('agent_ia')
      .insert({ conta_id: contaData.id });

    if (agentError) {
      console.error('Erro ao criar agent_ia:', agentError);
      // Não falhar por isso
    }

    // 6. Criar funil padrão
    const { data: funilData, error: funilError } = await supabase
      .from('funis')
      .insert({ conta_id: contaData.id, nome: 'Vendas', ordem: 0 })
      .select()
      .single();

    if (funilError) {
      console.error('Erro ao criar funil:', funilError);
      // Não falhar por isso
    }

    // 7. Criar estágios padrão
    if (funilData) {
      const { error: estagiosError } = await supabase.from('estagios').insert([
        { funil_id: funilData.id, nome: 'Novo Lead', ordem: 0, cor: '#3b82f6' },
        { funil_id: funilData.id, nome: 'Em Contato', ordem: 1, cor: '#f59e0b' },
        { funil_id: funilData.id, nome: 'Proposta Enviada', ordem: 2, cor: '#8b5cf6' },
        { funil_id: funilData.id, nome: 'Negociação', ordem: 3, cor: '#ec4899' },
        { funil_id: funilData.id, nome: 'Fechado', ordem: 4, cor: '#10b981' },
      ]);

      if (estagiosError) {
        console.error('Erro ao criar estagios:', estagiosError);
        // Não falhar por isso
      }
    }

    console.log('Signup completo finalizado com sucesso');

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        contaId: contaData.id,
        message: 'Conta criada com sucesso',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro no signup completo:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
