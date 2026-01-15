import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Extrair API Key do header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'API Key não fornecida. Use o header: Authorization: Bearer <API_KEY>' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = authHeader.replace('Bearer ', '');

    // Validar API Key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('id, conta_id, ativo')
      .eq('key', apiKey)
      .single();

    if (keyError || !keyData) {
      console.error('API Key inválida:', apiKey);
      return new Response(
        JSON.stringify({ error: 'API Key inválida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!keyData.ativo) {
      return new Response(
        JSON.stringify({ error: 'API Key desativada' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const conta_id = keyData.conta_id;

    // Atualizar último uso
    await supabase
      .from('api_keys')
      .update({ ultimo_uso: new Date().toISOString() })
      .eq('id', keyData.id);

    // Parse da URL e método
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Remove 'api-externa' do path
    const path = '/' + pathParts.slice(1).join('/');
    const method = req.method;

    console.log(`[API Externa] ${method} ${path} - conta_id: ${conta_id}`);

    // ==================== ROTEAMENTO ====================

    // POST /enviar-mensagem
    if (path === '/enviar-mensagem' && method === 'POST') {
      const body = await req.json();
      const { telefone, mensagem, tipo = 'texto', conexao_id, media_url } = body;

      if (!telefone || !mensagem) {
        return new Response(
          JSON.stringify({ error: 'telefone e mensagem são obrigatórios' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Buscar conexão
      let conexao;
      if (conexao_id) {
        const { data } = await supabase
          .from('conexoes_whatsapp')
          .select('*')
          .eq('id', conexao_id)
          .eq('conta_id', conta_id)
          .single();
        conexao = data;
      } else {
        const { data } = await supabase
          .from('conexoes_whatsapp')
          .select('*')
          .eq('conta_id', conta_id)
          .eq('status', 'conectado')
          .limit(1)
          .single();
        conexao = data;
      }

      if (!conexao) {
        return new Response(
          JSON.stringify({ error: 'Nenhuma conexão WhatsApp ativa encontrada' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Chamar a função de envio existente
      const { data: envioResult, error: envioError } = await supabase.functions.invoke('enviar-mensagem', {
        body: {
          conexao_id: conexao.id,
          telefone,
          mensagem,
          tipo,
          media_url
        }
      });

      if (envioError) {
        console.error('Erro ao enviar mensagem:', envioError);
        return new Response(
          JSON.stringify({ error: 'Erro ao enviar mensagem', details: envioError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: envioResult }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /contatos ou POST /contatos
    if (path === '/contatos') {
      if (method === 'GET') {
        const telefone = url.searchParams.get('telefone');
        
        let query = supabase
          .from('contatos')
          .select('id, nome, telefone, email, tags, avatar_url, canal, created_at')
          .eq('conta_id', conta_id);

        if (telefone) {
          // Buscar por telefone (aceita com ou sem formatação)
          const telefoneLimpo = telefone.replace(/\D/g, '');
          query = query.or(`telefone.eq.${telefone},telefone.eq.${telefoneLimpo},telefone.ilike.%${telefoneLimpo}%`);
        }

        const { data, error } = await query.limit(100);

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Erro ao buscar contatos', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (method === 'POST') {
        const body = await req.json();
        const { nome, telefone, email, tags } = body;

        if (!nome || !telefone) {
          return new Response(
            JSON.stringify({ error: 'nome e telefone são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verificar se já existe
        const telefoneLimpo = telefone.replace(/\D/g, '');
        const { data: existente } = await supabase
          .from('contatos')
          .select('id')
          .eq('conta_id', conta_id)
          .or(`telefone.eq.${telefone},telefone.eq.${telefoneLimpo}`)
          .single();

        if (existente) {
          return new Response(
            JSON.stringify({ error: 'Contato com este telefone já existe', contato_id: existente.id }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('contatos')
          .insert({
            conta_id,
            nome,
            telefone: telefoneLimpo,
            email,
            tags
          })
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Erro ao criar contato', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data }),
          { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // GET /negociacoes ou POST /negociacoes
    if (path === '/negociacoes' || path.startsWith('/negociacoes/')) {
      const negociacaoId = path.split('/')[2]; // /negociacoes/:id

      // PATCH /negociacoes/:id
      if (method === 'PATCH' && negociacaoId) {
        const body = await req.json();
        const { estagio_id, funil_id, valor, status, titulo, notas } = body;

        // Verificar se a negociação pertence à conta
        const { data: negociacao, error: negError } = await supabase
          .from('negociacoes')
          .select('id, estagio_id')
          .eq('id', negociacaoId)
          .eq('conta_id', conta_id)
          .single();

        if (negError || !negociacao) {
          return new Response(
            JSON.stringify({ error: 'Negociação não encontrada' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const updateData: Record<string, unknown> = {};
        if (estagio_id) updateData.estagio_id = estagio_id;
        if (valor !== undefined) updateData.valor = valor;
        if (status) updateData.status = status;
        if (titulo) updateData.titulo = titulo;
        if (notas !== undefined) updateData.notas = notas;

        // Se mudou de funil, precisa pegar o primeiro estágio do novo funil
        if (funil_id && !estagio_id) {
          const { data: primeiroEstagio } = await supabase
            .from('estagios')
            .select('id')
            .eq('funil_id', funil_id)
            .order('ordem', { ascending: true })
            .limit(1)
            .single();

          if (primeiroEstagio) {
            updateData.estagio_id = primeiroEstagio.id;
          }
        }

        const { data, error } = await supabase
          .from('negociacoes')
          .update(updateData)
          .eq('id', negociacaoId)
          .select(`
            id, titulo, valor, status, notas, created_at,
            estagio:estagios(id, nome, cor, funil:funis(id, nome)),
            contato:contatos(id, nome, telefone)
          `)
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Erro ao atualizar negociação', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // GET /negociacoes
      if (method === 'GET' && path === '/negociacoes') {
        const telefone = url.searchParams.get('telefone');
        const contato_id = url.searchParams.get('contato_id');
        const status = url.searchParams.get('status');

        let query = supabase
          .from('negociacoes')
          .select(`
            id, titulo, valor, status, notas, created_at, updated_at,
            estagio:estagios(id, nome, cor, funil:funis(id, nome)),
            contato:contatos(id, nome, telefone, email)
          `)
          .eq('conta_id', conta_id);

        if (contato_id) {
          query = query.eq('contato_id', contato_id);
        }

        if (status) {
          query = query.eq('status', status);
        }

        // Se passou telefone, buscar contato primeiro
        if (telefone) {
          const telefoneLimpo = telefone.replace(/\D/g, '');
          const { data: contato } = await supabase
            .from('contatos')
            .select('id')
            .eq('conta_id', conta_id)
            .or(`telefone.eq.${telefone},telefone.eq.${telefoneLimpo},telefone.ilike.%${telefoneLimpo}%`)
            .single();

          if (!contato) {
            return new Response(
              JSON.stringify({ success: true, data: [] }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          query = query.eq('contato_id', contato.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false }).limit(100);

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Erro ao buscar negociações', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // POST /negociacoes
      if (method === 'POST' && path === '/negociacoes') {
        const body = await req.json();
        const { contato_id, telefone, titulo, valor, estagio_id, notas } = body;

        // Se não passou contato_id, buscar por telefone
        let finalContatoId = contato_id;
        if (!finalContatoId && telefone) {
          const telefoneLimpo = telefone.replace(/\D/g, '');
          const { data: contato } = await supabase
            .from('contatos')
            .select('id')
            .eq('conta_id', conta_id)
            .or(`telefone.eq.${telefone},telefone.eq.${telefoneLimpo},telefone.ilike.%${telefoneLimpo}%`)
            .single();

          if (contato) {
            finalContatoId = contato.id;
          }
        }

        if (!finalContatoId) {
          return new Response(
            JSON.stringify({ error: 'contato_id ou telefone válido é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!titulo) {
          return new Response(
            JSON.stringify({ error: 'titulo é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Se não passou estágio, pegar o primeiro estágio do primeiro funil
        let finalEstagioId = estagio_id;
        if (!finalEstagioId) {
          const { data: primeiroFunil } = await supabase
            .from('funis')
            .select('id')
            .eq('conta_id', conta_id)
            .order('ordem', { ascending: true })
            .limit(1)
            .single();

          if (primeiroFunil) {
            const { data: primeiroEstagio } = await supabase
              .from('estagios')
              .select('id')
              .eq('funil_id', primeiroFunil.id)
              .order('ordem', { ascending: true })
              .limit(1)
              .single();

            if (primeiroEstagio) {
              finalEstagioId = primeiroEstagio.id;
            }
          }
        }

        const { data, error } = await supabase
          .from('negociacoes')
          .insert({
            conta_id,
            contato_id: finalContatoId,
            titulo,
            valor: valor || 0,
            estagio_id: finalEstagioId,
            notas,
            status: 'aberto'
          })
          .select(`
            id, titulo, valor, status, notas, created_at,
            estagio:estagios(id, nome, cor, funil:funis(id, nome)),
            contato:contatos(id, nome, telefone)
          `)
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Erro ao criar negociação', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data }),
          { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // GET /funis
    if (path === '/funis' && method === 'GET') {
      const { data, error } = await supabase
        .from('funis')
        .select(`
          id, nome, descricao, cor, ordem,
          estagios(id, nome, cor, ordem, tipo)
        `)
        .eq('conta_id', conta_id)
        .order('ordem', { ascending: true });

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Erro ao buscar funis', details: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Ordenar estágios dentro de cada funil
      const funisOrdenados = data?.map(funil => ({
        ...funil,
        estagios: funil.estagios?.sort((a: { ordem: number }, b: { ordem: number }) => (a.ordem || 0) - (b.ordem || 0))
      }));

      return new Response(
        JSON.stringify({ success: true, data: funisOrdenados }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /estagios
    if (path === '/estagios' && method === 'GET') {
      const funil_id = url.searchParams.get('funil_id');

      let query = supabase
        .from('estagios')
        .select(`
          id, nome, cor, ordem, tipo,
          funil:funis!inner(id, nome, conta_id)
        `)
        .eq('funil.conta_id', conta_id);

      if (funil_id) {
        query = query.eq('funil_id', funil_id);
      }

      const { data, error } = await query.order('ordem', { ascending: true });

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Erro ao buscar estágios', details: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /conexoes
    if (path === '/conexoes' && method === 'GET') {
      const { data, error } = await supabase
        .from('conexoes_whatsapp')
        .select('id, nome, numero, status, tipo_canal, tipo_provedor')
        .eq('conta_id', conta_id);

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Erro ao buscar conexões', details: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rota não encontrada
    return new Response(
      JSON.stringify({ 
        error: 'Endpoint não encontrado',
        endpoints_disponiveis: [
          'POST /enviar-mensagem',
          'GET /contatos',
          'POST /contatos',
          'GET /negociacoes',
          'POST /negociacoes',
          'PATCH /negociacoes/:id',
          'GET /funis',
          'GET /estagios',
          'GET /conexoes'
        ]
      }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Erro na API Externa:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
