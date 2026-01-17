import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DIAS_PARA_ARQUIVAR = 90;
const BATCH_SIZE = 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[arquivar-mensagens] Iniciando arquivamento de mensagens com mais de ${DIAS_PARA_ARQUIVAR} dias`);

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - DIAS_PARA_ARQUIVAR);
    const dataLimiteStr = dataLimite.toISOString();

    console.log(`[arquivar-mensagens] Data limite: ${dataLimiteStr}`);

    // Contar mensagens a arquivar
    const { count: totalMensagens, error: countError } = await supabase
      .from('mensagens')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', dataLimiteStr);

    if (countError) {
      console.error('[arquivar-mensagens] Erro ao contar mensagens:', countError);
      throw countError;
    }

    console.log(`[arquivar-mensagens] Total de mensagens a arquivar: ${totalMensagens}`);

    if (!totalMensagens || totalMensagens === 0) {
      console.log('[arquivar-mensagens] Nenhuma mensagem para arquivar');
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhuma mensagem para arquivar', arquivadas: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalArquivadas = 0;
    let hasMore = true;

    while (hasMore) {
      // Buscar lote de mensagens antigas
      const { data: mensagens, error: fetchError } = await supabase
        .from('mensagens')
        .select('*')
        .lt('created_at', dataLimiteStr)
        .limit(BATCH_SIZE);

      if (fetchError) {
        console.error('[arquivar-mensagens] Erro ao buscar mensagens:', fetchError);
        throw fetchError;
      }

      if (!mensagens || mensagens.length === 0) {
        hasMore = false;
        continue;
      }

      console.log(`[arquivar-mensagens] Processando lote de ${mensagens.length} mensagens`);

      // Inserir na tabela de arquivo
      const mensagensArquivo = mensagens.map(m => ({
        id: m.id,
        conversa_id: m.conversa_id,
        contato_id: m.contato_id,
        usuario_id: m.usuario_id,
        conta_id: m.conta_id,
        conteudo: m.conteudo,
        direcao: m.direcao,
        tipo: m.tipo,
        media_url: m.media_url,
        metadata: m.metadata,
        lida: m.lida,
        enviada_por_ia: m.enviada_por_ia,
        enviada_por_dispositivo: m.enviada_por_dispositivo,
        deletada: m.deletada,
        deletada_em: m.deletada_em,
        deletada_por: m.deletada_por,
        created_at: m.created_at,
        arquivada_em: new Date().toISOString()
      }));

      const { error: insertError } = await supabase
        .from('mensagens_arquivo')
        .upsert(mensagensArquivo, { onConflict: 'id' });

      if (insertError) {
        console.error('[arquivar-mensagens] Erro ao inserir no arquivo:', insertError);
        throw insertError;
      }

      // Deletar mensagens originais
      const idsParaDeletar = mensagens.map(m => m.id);
      const { error: deleteError } = await supabase
        .from('mensagens')
        .delete()
        .in('id', idsParaDeletar);

      if (deleteError) {
        console.error('[arquivar-mensagens] Erro ao deletar mensagens:', deleteError);
        throw deleteError;
      }

      totalArquivadas += mensagens.length;
      console.log(`[arquivar-mensagens] Arquivadas: ${totalArquivadas}/${totalMensagens}`);

      // Verificar se há mais mensagens
      if (mensagens.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    console.log(`[arquivar-mensagens] Arquivamento concluído. Total: ${totalArquivadas} mensagens`);

    // Registrar log de atividade
    await supabase.from('logs_atividade').insert({
      conta_id: '00000000-0000-0000-0000-000000000000', // Log de sistema
      tipo: 'arquivamento_mensagens',
      descricao: `Arquivadas ${totalArquivadas} mensagens com mais de ${DIAS_PARA_ARQUIVAR} dias`,
      metadata: { 
        total_arquivadas: totalArquivadas,
        dias_limite: DIAS_PARA_ARQUIVAR,
        data_limite: dataLimiteStr
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Arquivamento concluído`,
        arquivadas: totalArquivadas,
        dias_limite: DIAS_PARA_ARQUIVAR
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[arquivar-mensagens] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
