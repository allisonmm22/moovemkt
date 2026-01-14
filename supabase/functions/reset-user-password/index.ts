import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Não autenticado");
    }

    // Cliente com token do usuário para verificar permissões
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller } } = await supabaseClient.auth.getUser();
    if (!caller) {
      throw new Error("Não autenticado");
    }

    // Verificar se é admin
    const { data: isAdmin } = await supabaseClient.rpc('has_role', {
      _user_id: caller.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      throw new Error("Apenas administradores podem redefinir senhas");
    }

    const { user_id, new_password } = await req.json();

    if (!user_id || !new_password) {
      throw new Error("user_id e new_password são obrigatórios");
    }

    if (new_password.length < 6) {
      throw new Error("A senha deve ter no mínimo 6 caracteres");
    }

    // Cliente admin para alterar a senha
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { password: new_password }
    );

    if (error) {
      console.error("Erro ao redefinir senha:", error);
      throw new Error(error.message);
    }

    console.log(`Senha redefinida com sucesso para user_id: ${user_id}`);

    return new Response(
      JSON.stringify({ success: true, message: "Senha redefinida com sucesso" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
