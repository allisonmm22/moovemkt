import type { Context } from 'hono';
import type { Env, AIResponse, Acao } from '../types';
import { createSupabaseClient } from '../lib/supabase';
import { jsonResponse, errorResponse } from '../lib/cors';
import { extractTextFromTiptapJson } from '../lib/utils';

// Calcular custo estimado de tokens
function calcularCustoEstimado(
  modelo: string,
  tokens: { prompt_tokens: number; completion_tokens: number }
): number {
  const precos: Record<string, { input: number; output: number }> = {
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4o': { input: 0.005, output: 0.015 },
    'google/gemini-2.5-flash': { input: 0.00015, output: 0.0006 },
    'google/gemini-2.5-pro': { input: 0.00125, output: 0.005 },
    'openai/gpt-5': { input: 0.01, output: 0.03 },
    'openai/gpt-5-mini': { input: 0.003, output: 0.012 },
    'openai/gpt-5-nano': { input: 0.001, output: 0.004 },
  };

  const preco = precos[modelo] || { input: 0.001, output: 0.002 };
  return (tokens.prompt_tokens / 1000) * preco.input + (tokens.completion_tokens / 1000) * preco.output;
}

// Parser de ações do prompt
function parseAcoesDoPrompt(texto: string): { acoes: string[]; acoesParseadas: Acao[] } {
  const acoes: string[] = [];
  const acoesParseadas: Acao[] = [];

  const regexComAspas = /@(etapa|tag|transferir|notificar|finalizar|nome|negociacao|agenda|campo|obter|followup|verificar_cliente):([^\s@:]+):"([^"]+)"/gi;
  const regexSemAspas = /@(etapa|tag|transferir|notificar|finalizar|nome|negociacao|agenda|campo|obter|followup|verificar_cliente)(?::([^\s@:]+)(?::([^\s@"]+))?)?/gi;

  const matchesComAspas = [...texto.matchAll(regexComAspas)];
  const posicoesProcessadas = new Set<number>();

  for (const match of matchesComAspas) {
    acoes.push(match[0]);
    posicoesProcessadas.add(match.index!);

    const tipo = match[1].toLowerCase() as Acao['tipo'];
    const campo = match[2]?.replace(/[.,;!?]+$/, '') || undefined;
    const valor = match[3] || undefined;

    if (valor && (valor.includes('{') || valor.includes('}'))) continue;

    acoesParseadas.push({
      tipo,
      valor: valor ? `${campo}:${valor}` : campo,
    });
  }

  const matchesSemAspas = [...texto.matchAll(regexSemAspas)];

  for (const match of matchesSemAspas) {
    if (posicoesProcessadas.has(match.index!)) continue;

    acoes.push(match[0]);

    const valorLimpo = match[2]?.replace(/[.,;!?]+$/, '') || undefined;
    const subValor = match[3]?.replace(/[.,;!?]+$/, '') || undefined;

    if ((valorLimpo && (valorLimpo.includes('{') || valorLimpo.includes('}'))) ||
        (subValor && (subValor.includes('{') || subValor.includes('}')))) continue;

    acoesParseadas.push({
      tipo: match[1].toLowerCase() as Acao['tipo'],
      valor: subValor ? `${valorLimpo}:${subValor}` : valorLimpo,
    });
  }

  return { acoes, acoesParseadas };
}

// Substituir placeholders
function substituirPlaceholders(texto: string, dados: {
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  tags?: string[] | null;
}): string {
  let resultado = texto;

  resultado = resultado.replace(/\[Nome do cliente\]/gi, dados.nome || 'Cliente');
  resultado = resultado.replace(/\[Nome do lead\]/gi, dados.nome || 'Cliente');
  resultado = resultado.replace(/\[Nome\]/gi, dados.nome || 'Cliente');
  resultado = resultado.replace(/\[Telefone\]/gi, dados.telefone || '');
  resultado = resultado.replace(/\[Email\]/gi, dados.email || '');
  resultado = resultado.replace(/\[Tags\]/gi, dados.tags?.join(', ') || '');

  return resultado;
}

export async function handleAiResponder(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env;
  const supabase = createSupabaseClient(env);

  try {
    const body = await c.req.json();
    const { conversa_id, mensagem, conta_id, mensagem_tipo, transcricao, descricao_imagem, texto_documento } = body;

    console.log('=== AI RESPONDER ===');
    console.log('Conversa:', conversa_id);

    if (!conversa_id || !conta_id) {
      return errorResponse('conversa_id e conta_id obrigatórios', 400);
    }

    // Buscar conversa com dados relacionados
    const { data: conversa, error: conversaError } = await supabase
      .from('conversas')
      .select(`
        *,
        contato:contatos(*),
        agente:agent_ia(*)
      `)
      .eq('id', conversa_id)
      .single();

    if (conversaError || !conversa) {
      return errorResponse('Conversa não encontrada', 404);
    }

    const agente = conversa.agente as any;
    const contato = conversa.contato as any;

    if (!agente) {
      return jsonResponse({ should_respond: false, reason: 'Sem agente configurado' });
    }

    // Verificar horário de atendimento
    if (!agente.atender_24h) {
      const agora = new Date();
      const horaAtual = agora.getHours() * 100 + agora.getMinutes();
      const diaAtual = agora.getDay();

      const diasAtivos = agente.dias_ativos || [1, 2, 3, 4, 5];
      if (!diasAtivos.includes(diaAtual)) {
        if (agente.mensagem_fora_horario) {
          return jsonResponse({
            should_respond: true,
            resposta: agente.mensagem_fora_horario,
            provider: 'system',
          });
        }
        return jsonResponse({ should_respond: false, reason: 'Fora do dia de atendimento' });
      }

      const horaInicio = parseInt((agente.horario_inicio || '08:00').replace(':', ''));
      const horaFim = parseInt((agente.horario_fim || '18:00').replace(':', ''));

      if (horaAtual < horaInicio || horaAtual > horaFim) {
        if (agente.mensagem_fora_horario) {
          return jsonResponse({
            should_respond: true,
            resposta: agente.mensagem_fora_horario,
            provider: 'system',
          });
        }
        return jsonResponse({ should_respond: false, reason: 'Fora do horário' });
      }
    }

    // Buscar histórico de mensagens
    const qtdContexto = agente.quantidade_mensagens_contexto || 10;
    const { data: historico } = await supabase
      .from('mensagens')
      .select('conteudo, direcao, tipo, metadata')
      .eq('conversa_id', conversa_id)
      .order('created_at', { ascending: false })
      .limit(qtdContexto);

    // Montar contexto
    const mensagensContexto = (historico || []).reverse().map((m) => {
      const role = m.direcao === 'entrada' ? 'user' : 'assistant';
      let content = m.conteudo;

      const metadata = m.metadata as Record<string, any> || {};
      if (metadata.transcricao) content = `[Áudio transcrito]: ${metadata.transcricao}`;
      if (metadata.descricao_imagem) content = `[Descrição da imagem]: ${metadata.descricao_imagem}`;

      return { role, content };
    });

    // Preparar prompt do sistema
    let promptSistema = agente.prompt_sistema || 'Você é um assistente prestativo.';
    promptSistema = extractTextFromTiptapJson(promptSistema);
    promptSistema = substituirPlaceholders(promptSistema, {
      nome: contato?.nome,
      telefone: contato?.telefone,
      email: contato?.email,
      tags: contato?.tags,
    });

    // Adicionar instruções de ações
    const { acoesParseadas } = parseAcoesDoPrompt(promptSistema);

    // Buscar perguntas frequentes
    const { data: perguntas } = await supabase
      .from('agent_ia_perguntas')
      .select('pergunta, resposta')
      .eq('agent_ia_id', agente.id)
      .order('ordem');

    if (perguntas && perguntas.length > 0) {
      promptSistema += '\n\nPerguntas frequentes:\n';
      perguntas.forEach((p) => {
        promptSistema += `P: ${p.pergunta}\nR: ${p.resposta}\n\n`;
      });
    }

    // Preparar mensagem do usuário
    let mensagemFinal = transcricao || mensagem || '';
    if (descricao_imagem) {
      mensagemFinal = `[O lead enviou uma imagem: ${descricao_imagem}]\n${mensagemFinal}`;
    }
    if (texto_documento) {
      mensagemFinal = `[O lead enviou um documento com o seguinte conteúdo:\n${texto_documento.substring(0, 2000)}]\n${mensagemFinal}`;
    }

    // Usar Lovable AI ou OpenAI
    const modelo = agente.modelo || 'google/gemini-2.5-flash';
    const temperatura = agente.temperatura || 0.7;
    const maxTokens = agente.max_tokens || 1000;

    console.log('Modelo:', modelo);

    // Chamar API de IA
    const messages = [
      { role: 'system', content: promptSistema },
      ...mensagensContexto,
      { role: 'user', content: mensagemFinal },
    ];

    let resposta = '';
    let tokens = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // Tentar Lovable AI primeiro
    if (env.LOVABLE_API_KEY && modelo.includes('/')) {
      try {
        const lovableResponse = await fetch('https://api.lovable.dev/api/ai/inference', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: modelo,
            messages,
            temperature: temperatura,
            max_tokens: maxTokens,
          }),
        });

        if (lovableResponse.ok) {
          const result = await lovableResponse.json();
          resposta = result.choices?.[0]?.message?.content || '';
          tokens = result.usage || tokens;
          console.log('Resposta via Lovable AI');
        }
      } catch (err) {
        console.error('Erro Lovable AI:', err);
      }
    }

    // Fallback: OpenAI da conta
    if (!resposta) {
      const { data: contaData } = await supabase
        .from('contas')
        .select('openai_api_key')
        .eq('id', conta_id)
        .single();

      if (contaData?.openai_api_key) {
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${contaData.openai_api_key}`,
          },
          body: JSON.stringify({
            model: modelo.startsWith('openai/') ? modelo.replace('openai/', '') : 'gpt-4o-mini',
            messages,
            temperature: temperatura,
            max_tokens: maxTokens,
          }),
        });

        if (openaiResponse.ok) {
          const result = await openaiResponse.json();
          resposta = result.choices?.[0]?.message?.content || '';
          tokens = result.usage || tokens;
          console.log('Resposta via OpenAI');
        }
      }
    }

    if (!resposta) {
      return jsonResponse({ should_respond: false, reason: 'Sem resposta da IA' });
    }

    // Registrar uso
    const custo = calcularCustoEstimado(modelo, tokens);
    await supabase.from('logs_atividade').insert({
      conta_id,
      tipo: 'uso_ia',
      descricao: `IA respondeu (${tokens.total_tokens} tokens, $${custo.toFixed(4)})`,
      metadata: { modelo, tokens, custo, conversa_id },
    });

    return jsonResponse({
      should_respond: true,
      resposta,
      provider: modelo.includes('/') ? 'lovable' : 'openai',
      tokens,
      acoes: acoesParseadas,
    });
  } catch (error) {
    console.error('Erro ai-responder:', error);
    return errorResponse('Erro interno', 500, error);
  }
}
