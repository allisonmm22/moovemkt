import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extracts readable text from Tiptap JSON content, preserving actions and basic formatting
function extractTextFromTiptapJson(value: string): string {
  if (!value) return '';
  
  try {
    const json = JSON.parse(value);
    
    const extractFromNode = (node: any): string => {
      if (node.type === 'text') {
        let text = node.text || '';
        if (node.marks) {
          for (const mark of node.marks) {
            if (mark.type === 'bold') text = `**${text}**`;
            if (mark.type === 'italic') text = `*${text}*`;
          }
        }
        return text;
      }
      if (node.type === 'action') {
        return node.attrs?.action || '';
      }
      if (node.type === 'hardBreak') {
        return '\n';
      }
      if (node.content && Array.isArray(node.content)) {
        const text = node.content.map(extractFromNode).join('');
        if (node.type === 'paragraph') return text + '\n';
        if (node.type === 'heading') {
          const level = node.attrs?.level || 1;
          return '#'.repeat(level) + ' ' + text + '\n';
        }
        if (node.type === 'listItem') return '- ' + text;
        if (node.type === 'bulletList' || node.type === 'orderedList') return text + '\n';
        if (node.type === 'blockquote') return '> ' + text + '\n';
        return text;
      }
      return '';
    };
    
    return json.content?.map(extractFromNode).join('').trim() || '';
  } catch {
    return value; // Return as-is if not valid JSON
  }
}

interface AIResponse {
  resposta: string;
  provider: 'openai';
  acoes?: Acao[];
  tokens?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  mensagemJaSalva?: boolean;
}

interface Acao {
  tipo: 'etapa' | 'tag' | 'transferir' | 'notificar' | 'finalizar' | 'nome' | 'negociacao' | 'agenda' | 'campo' | 'obter' | 'followup' | 'verificar_cliente';
  valor?: string;
  calendario_id?: string;
}

// Função para calcular custo estimado de tokens
function calcularCustoEstimado(
  provider: string, 
  modelo: string, 
  tokens: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
): number {
  // Preços aproximados por 1K tokens (USD)
  const precos: Record<string, { input: number; output: number }> = {
    // OpenAI
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-5-2025-08-07': { input: 0.01, output: 0.03 },
    'gpt-5-mini-2025-08-07': { input: 0.003, output: 0.012 },
    'gpt-5-nano-2025-08-07': { input: 0.001, output: 0.004 },
    // Lovable/Gemini
    'google/gemini-2.5-flash': { input: 0.00015, output: 0.0006 },
    'google/gemini-2.5-pro': { input: 0.00125, output: 0.005 },
    'openai/gpt-5': { input: 0.01, output: 0.03 },
    'openai/gpt-5-mini': { input: 0.003, output: 0.012 },
    'openai/gpt-5-nano': { input: 0.001, output: 0.004 },
  };

  const preco = precos[modelo] || { input: 0.001, output: 0.002 };
  const custoInput = (tokens.prompt_tokens / 1000) * preco.input;
  const custoOutput = (tokens.completion_tokens / 1000) * preco.output;
  
  return custoInput + custoOutput;
}

// Detectar ações com placeholders que a IA deve substituir dinamicamente
function detectarAcoesComPlaceholders(texto: string): string[] {
  const instrucoes: string[] = [];
  
  // Regex para encontrar ações com placeholders como {valor-do-lead}, {resposta}, etc.
  const regex = /@(campo|tag|nome|etapa|negociacao):([^:\s@"]+):(\{[^}]+\})/gi;
  const matches = [...texto.matchAll(regex)];
  
  for (const match of matches) {
    const tipo = match[1];
    const campo = match[2];
    const placeholder = match[3];
    
    instrucoes.push(
      `- Quando a instrução mencionar "@${tipo}:${campo}:${placeholder}", você DEVE substituir "${placeholder}" pelo valor REAL que o lead informou. ` +
      `Exemplo: Se o lead disse "Bahia", use a ferramenta executar_acao com tipo="${tipo}" e valor="${campo}:Bahia". ` +
      `NUNCA use o texto literal "${placeholder}" como valor!`
    );
  }
  
  // Também detectar formato com texto entre colchetes (ex: [📑 campo: estado:{valor-do-lead}])
  const regexColchetes = /\[\s*[📑📝🏷️]*\s*(campo|tag|nome|etapa):?\s*([^:\s\]]+):?\s*(\{[^}]+\})\s*\]/gi;
  const matchesColchetes = [...texto.matchAll(regexColchetes)];
  
  for (const match of matchesColchetes) {
    const tipo = match[1];
    const campo = match[2];
    const placeholder = match[3];
    
    if (!instrucoes.some(i => i.includes(`@${tipo}:${campo}:${placeholder}`))) {
      instrucoes.push(
        `- Quando a instrução mencionar "${tipo}:${campo}:${placeholder}", você DEVE substituir "${placeholder}" pelo valor REAL que o lead informou. ` +
        `Exemplo: Se o lead disse "São Paulo", use a ferramenta executar_acao com tipo="${tipo}" e valor="${campo}:São Paulo". ` +
        `NUNCA use o texto literal "${placeholder}" como valor!`
      );
    }
  }
  
  return instrucoes;
}

// Parser de ações do prompt
function parseAcoesDoPrompt(texto: string): { acoes: string[], acoesParseadas: Acao[] } {
  const acoes: string[] = [];
  const acoesParseadas: Acao[] = [];
  
  // Regex para ações com valor entre aspas (permite espaços)
  // Formato: @campo:nome-campo:"valor com espaços"
  const regexComAspas = /@(etapa|tag|transferir|notificar|finalizar|nome|negociacao|agenda|campo|obter|followup|verificar_cliente):([^\s@:]+):"([^"]+)"/gi;
  
  // Regex para ações sem aspas (formato original, sem espaços no valor)
  // Formato: @campo:nome-campo:valor-sem-espacos ou @etapa:nome-etapa ou @ir_etapa:numero ou @verificar_cliente
  const regexSemAspas = /@(etapa|tag|transferir|notificar|finalizar|nome|negociacao|agenda|campo|obter|followup|verificar_cliente)(?::([^\s@:]+)(?::([^\s@"]+))?)?/gi;
  
  // Primeiro, processar ações com aspas
  const matchesComAspas = [...texto.matchAll(regexComAspas)];
  const posicoesProcessadas = new Set<number>();
  
  for (const match of matchesComAspas) {
    acoes.push(match[0]);
    posicoesProcessadas.add(match.index!);
    
    const tipo = match[1].toLowerCase() as Acao['tipo'];
    const campo = match[2]?.replace(/[.,;!?]+$/, '') || undefined;
    const valor = match[3] || undefined; // Valor já vem limpo, sem aspas
    
    // IMPORTANTE: Ignorar ações com placeholders - a IA vai gerar dinamicamente
    if (valor && (valor.includes('{') || valor.includes('}'))) {
      console.log(`Ignorando ação com placeholder (aspas): ${match[0]} - IA vai substituir dinamicamente`);
      continue;
    }
    
    const acaoObj: Acao = {
      tipo,
      valor: valor ? `${campo}:${valor}` : campo,
    };
    
    acoesParseadas.push(acaoObj);
    console.log(`Ação parseada (com aspas): ${tipo} - campo: ${campo} - valor: "${valor}"`);
  }
  
  // Depois, processar ações sem aspas (evitando duplicatas)
  const matchesSemAspas = [...texto.matchAll(regexSemAspas)];
  
  for (const match of matchesSemAspas) {
    // Pular se já foi processado como ação com aspas
    if (posicoesProcessadas.has(match.index!)) continue;
    
    // Verificar se não está dentro de uma ação com aspas já processada
    let dentroDeAspas = false;
    for (const pos of posicoesProcessadas) {
      const matchComAspas = matchesComAspas.find(m => m.index === pos);
      if (matchComAspas && match.index! >= pos && match.index! < pos + matchComAspas[0].length) {
        dentroDeAspas = true;
        break;
      }
    }
    if (dentroDeAspas) continue;
    
    acoes.push(match[0]);
    
    // Remover pontuação final do valor (. , ; ! ?)
    const valorLimpo = match[2]?.replace(/[.,;!?]+$/, '') || undefined;
    const subValor = match[3]?.replace(/[.,;!?]+$/, '') || undefined;
    
    // IMPORTANTE: Ignorar ações com placeholders - a IA vai gerar dinamicamente
    if ((valorLimpo && (valorLimpo.includes('{') || valorLimpo.includes('}'))) ||
        (subValor && (subValor.includes('{') || subValor.includes('}')))) {
      console.log(`Ignorando ação com placeholder (sem aspas): ${match[0]} - IA vai substituir dinamicamente`);
      continue;
    }
    
    // Para ações de agenda, combinar tipo e subvalor
    const acaoObj: Acao = {
      tipo: match[1].toLowerCase() as Acao['tipo'],
      valor: subValor ? `${valorLimpo}:${subValor}` : valorLimpo,
    };
    
    acoesParseadas.push(acaoObj);
    console.log(`Ação parseada (sem aspas): ${match[1]} - valor: ${acaoObj.valor}`);
  }
  
  return { acoes, acoesParseadas };
}

// Função para substituir placeholders no prompt com dados do contato
function substituirPlaceholders(texto: string, dados: {
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, any> | null;
}, camposPersonalizados?: { id: string; nome: string; tipo: string }[]): string {
  let resultado = texto;
  
  // Placeholders suportados (case insensitive)
  resultado = resultado.replace(/\[Nome do cliente\]/gi, dados.nome || 'Cliente');
  resultado = resultado.replace(/\[Nome do lead\]/gi, dados.nome || 'Cliente');
  resultado = resultado.replace(/\[Nome\]/gi, dados.nome || 'Cliente');
  resultado = resultado.replace(/\[Telefone\]/gi, dados.telefone || '');
  resultado = resultado.replace(/\[Email\]/gi, dados.email || '');
  resultado = resultado.replace(/\[Tags\]/gi, dados.tags?.join(', ') || '');
  
  // Placeholders para campos personalizados
  if (camposPersonalizados && dados.metadata) {
    for (const campo of camposPersonalizados) {
      const valor = dados.metadata[`campo_${campo.id}`] || '';
      // Substituir [Nome do Campo] pelo valor
      const regex = new RegExp(`\\[${campo.nome}\\]`, 'gi');
      resultado = resultado.replace(regex, valor);
    }
  }
  
  return resultado;
}

// Mapear nome de etapa para ID
async function mapearEtapaNome(supabase: any, contaId: string, nomeEtapa: string): Promise<string | null> {
  // Normalizar nome (remover hífens, pontuação final, lowercase)
  const nomeNormalizado = nomeEtapa.toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[.,;!?]+$/, ''); // Remover pontuação final
  
  console.log('Mapeando etapa:', nomeEtapa, '-> normalizado:', nomeNormalizado);
  
  // Buscar estágios da conta
  const { data: funis } = await supabase
    .from('funis')
    .select('id')
    .eq('conta_id', contaId);
    
  if (!funis || funis.length === 0) {
    console.log('Nenhum funil encontrado para conta:', contaId);
    return null;
  }
  
  const { data: estagios } = await supabase
    .from('estagios')
    .select('id, nome')
    .in('funil_id', funis.map((f: any) => f.id));
    
  if (!estagios) {
    console.log('Nenhum estágio encontrado');
    return null;
  }
  
  console.log('Estágios disponíveis:', estagios.map((e: any) => e.nome));
  
  // Encontrar estágio por nome (case insensitive, com/sem hífen)
  const estagio = estagios.find((e: any) => 
    e.nome.toLowerCase() === nomeNormalizado ||
    e.nome.toLowerCase().replace(/\s+/g, '-') === nomeNormalizado
  );
  
  console.log('Estágio encontrado:', estagio?.id || 'nenhum');
  
  return estagio?.id || null;
}

// Função para executar ação de agenda e retornar resultado
async function executarAgendaLocal(
  supabase: any, 
  supabaseUrl: string, 
  supabaseKey: string, 
  contaId: string,
  conversaId: string,
  contatoId: string,
  valor: string,
  agenteId?: string
): Promise<{ sucesso: boolean; mensagem: string; dados?: any }> {
  console.log('Executando ação de agenda local:', valor);
  
  // Buscar configuração de agendamento do agente (se existir)
  let agendamentoConfig = null;
  let horariosConfig: any[] = [];
  
  if (agenteId) {
    const { data: configData } = await supabase
      .from('agent_ia_agendamento_config')
      .select('*')
      .eq('agent_ia_id', agenteId)
      .eq('ativo', true)
      .maybeSingle();
    
    agendamentoConfig = configData;
    
    if (configData) {
      const { data: horariosData } = await supabase
        .from('agent_ia_agendamento_horarios')
        .select('*')
        .eq('config_id', configData.id)
        .eq('ativo', true);
      
      horariosConfig = horariosData || [];
    }
  }
  
  const usarAgendaInterna = agendamentoConfig?.tipo_agenda === 'interno' && horariosConfig.length > 0;
  console.log('📅 [AGENDA] Usar agenda interna:', usarAgendaInterna);
  
  // Buscar calendário ativo da conta (para criar eventos)
  const { data: calendario } = await supabase
    .from('calendarios_google')
    .select('id, nome')
    .eq('conta_id', contaId)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle();
  
  // CONSULTAR disponibilidade
  if (valor === 'consultar' || valor.startsWith('consultar:')) {
    console.log('📅 [AGENDA] Executando consulta de disponibilidade...');
    
    // Se usa agenda interna, consultar tabelas locais
    if (usarAgendaInterna) {
      console.log('📅 [AGENDA] Consultando agenda INTERNA...');
      
      const agora = new Date();
      const diasMaximos = agendamentoConfig?.antecedencia_maxima_dias || 30;
      const antecedenciaMinima = agendamentoConfig?.antecedencia_minima_horas || 1;
      const duracaoPadrao = agendamentoConfig?.duracao_padrao || 60;
      const limitePorHorario = agendamentoConfig?.limite_por_horario || 1;
      
      // Buscar agendamentos existentes para verificar conflitos
      const dataFim = new Date(agora.getTime() + diasMaximos * 24 * 60 * 60 * 1000);
      const { data: agendamentosExistentes } = await supabase
        .from('agendamentos')
        .select('data_inicio, data_fim')
        .eq('conta_id', contaId)
        .gte('data_inicio', agora.toISOString())
        .lte('data_inicio', dataFim.toISOString())
        .eq('concluido', false);
      
      // Gerar lista de horários disponíveis baseado na config
      const horariosDisponiveis: string[] = [];
      const horariosComISO: { display: string; iso: string }[] = [];
      
      for (let dia = 0; dia < diasMaximos && horariosDisponiveis.length < 15; dia++) {
        const data = new Date(agora);
        data.setDate(data.getDate() + dia);
        data.setHours(0, 0, 0, 0);
        
        const diaSemana = data.getDay();
        
        // Buscar janelas de horário para este dia da semana
        const janelasNoDia = horariosConfig.filter(h => h.dia_semana === diaSemana);
        
        if (janelasNoDia.length === 0) continue;
        
        for (const janela of janelasNoDia) {
          const [horaInicio, minInicio] = janela.hora_inicio.split(':').map(Number);
          const [horaFim, minFim] = janela.hora_fim.split(':').map(Number);
          
          // Gerar slots a cada "duracaoPadrao" minutos
          for (let hora = horaInicio; hora < horaFim; hora++) {
            const horarioCheck = new Date(data);
            horarioCheck.setHours(hora, 0, 0, 0);
            
            // Pular horários passados ou muito próximos
            const minimoAceitavel = new Date(agora.getTime() + antecedenciaMinima * 60 * 60 * 1000);
            if (horarioCheck <= minimoAceitavel) continue;
            
            // Verificar conflitos com agendamentos existentes
            const conflitos = (agendamentosExistentes || []).filter((ag: any) => {
              const agInicio = new Date(ag.data_inicio);
              const agFim = new Date(ag.data_fim);
              return horarioCheck >= agInicio && horarioCheck < agFim;
            });
            
            if (conflitos.length >= limitePorHorario) continue;
            
            const diasSemana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
            const diaSemanaStr = diasSemana[horarioCheck.getDay()];
            const diaStr = horarioCheck.getDate().toString().padStart(2, '0');
            const mesStr = (horarioCheck.getMonth() + 1).toString().padStart(2, '0');
            const displayStr = `${diaSemanaStr} ${diaStr}/${mesStr} às ${hora}h`;
            const isoStr = horarioCheck.toISOString().replace('Z', '-03:00');
            
            horariosDisponiveis.push(displayStr);
            horariosComISO.push({ display: displayStr, iso: isoStr });
            
            if (horariosDisponiveis.length >= 15) break;
          }
        }
      }
      
      console.log(`✅ [AGENDA INTERNA] ${horariosDisponiveis.length} horários livres encontrados`);
      
      // Inserir mensagem de sistema
      await supabase.from('mensagens').insert({
        conversa_id: conversaId,
        contato_id: contatoId,
        tipo: 'sistema',
        direcao: 'saida',
        conteudo: `📅 Consulta de disponibilidade (agenda interna): ${horariosDisponiveis.length} horários livres encontrados`,
        enviada_por_ia: true,
      });
      
      return { 
        sucesso: true, 
        mensagem: `Disponibilidade consultada. Horários livres: ${horariosDisponiveis.slice(0, 5).join(', ')}`,
        dados: {
          eventos_ocupados: [],
          horarios_disponiveis: horariosDisponiveis.slice(0, 10),
          horarios_com_iso: horariosComISO.slice(0, 10),
          calendario_nome: 'Agenda Interna',
          tipo_agenda: 'interno',
        }
      };
    }
    
    // Fallback: consultar Google Calendar (comportamento original)
    if (!calendario) {
      return { sucesso: false, mensagem: 'Nenhum calendário Google conectado' };
    }
    
    // Consultar disponibilidade para os próximos 7 dias
    const dataInicio = new Date().toISOString();
    const dataFim = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    try {
      const calendarResponse = await fetch(`${supabaseUrl}/functions/v1/google-calendar-actions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operacao: 'consultar',
          calendario_id: calendario.id,
          dados: { data_inicio: dataInicio, data_fim: dataFim },
        }),
      });
      
      const calendarResult = await calendarResponse.json();
      
      if (calendarResult.error) {
        console.log('❌ [AGENDA] Erro na consulta:', calendarResult.error);
        return { sucesso: false, mensagem: calendarResult.error };
      }
      
      // Calcular horários livres baseado nos eventos
      const eventos = calendarResult.eventos || [];
      const horariosOcupados = eventos.map((e: any) => ({
        inicio: e.inicio,
        fim: e.fim,
        titulo: e.titulo,
      }));
      
      // Gerar lista de horários disponíveis (simplificado)
      const horariosDisponiveis: string[] = [];
      const horariosComISO: { display: string; iso: string }[] = [];
      const agora = new Date();
      
      // Usar horários configurados ou padrão 8h-18h
      const horaInicioDia = agendamentoConfig?.horario_inicio_dia 
        ? parseInt(agendamentoConfig.horario_inicio_dia.split(':')[0]) 
        : 8;
      const horaFimDia = agendamentoConfig?.horario_fim_dia 
        ? parseInt(agendamentoConfig.horario_fim_dia.split(':')[0]) 
        : 18;
      
      console.log(`📅 [AGENDA GOOGLE] Usando horários configurados: ${horaInicioDia}h às ${horaFimDia}h`);
      
      // Também buscar agendamentos internos para evitar conflitos
      const diasMaximos = agendamentoConfig?.antecedencia_maxima_dias || 7;
      const dataFimConsulta = new Date(agora.getTime() + diasMaximos * 24 * 60 * 60 * 1000);
      
      const { data: agendamentosInternos } = await supabase
        .from('agendamentos')
        .select('data_inicio, data_fim')
        .eq('conta_id', contaId)
        .eq('concluido', false)
        .is('google_event_id', null) // Só os que NÃO vieram do Google
        .gte('data_inicio', agora.toISOString())
        .lte('data_inicio', dataFimConsulta.toISOString());
      
      const todosHorariosOcupados = [
        ...horariosOcupados,
        ...(agendamentosInternos || []).map((ag: any) => ({
          inicio: ag.data_inicio,
          fim: ag.data_fim,
          titulo: 'Agendamento interno',
        }))
      ];
      
      console.log(`📅 [AGENDA GOOGLE] Total de horários ocupados: ${todosHorariosOcupados.length} (${horariosOcupados.length} do Google + ${(agendamentosInternos || []).length} internos)`);
      
      for (let dia = 0; dia < diasMaximos; dia++) {
        const data = new Date(agora);
        data.setDate(data.getDate() + dia);
        data.setHours(horaInicioDia, 0, 0, 0);
        
        // Pular finais de semana
        if (data.getDay() === 0 || data.getDay() === 6) continue;
        
        // Verificar cada horário comercial (usando horários configurados)
        for (let hora = horaInicioDia; hora < horaFimDia; hora++) {
          const horarioCheck = new Date(data);
          horarioCheck.setHours(hora, 0, 0, 0);
          
          // Pular horários passados
          if (horarioCheck <= agora) continue;
          
          // Verificar se está ocupado (incluindo agendamentos internos)
          const ocupado = todosHorariosOcupados.some((e: any) => {
            const eventoInicio = new Date(e.inicio);
            const eventoFim = new Date(e.fim);
            const estaOcupado = horarioCheck >= eventoInicio && horarioCheck < eventoFim;
            
            return estaOcupado;
          });
          
          if (!ocupado) {
            const diasSemana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
            const diaSemanaStr = diasSemana[horarioCheck.getDay()];
            const diaStr = horarioCheck.getDate().toString().padStart(2, '0');
            const mesStr = (horarioCheck.getMonth() + 1).toString().padStart(2, '0');
            const displayStr = `${diaSemanaStr} ${diaStr}/${mesStr} às ${hora}h`;
            const isoStr = horarioCheck.toISOString().replace('Z', '-03:00');
            horariosDisponiveis.push(displayStr);
            horariosComISO.push({ display: displayStr, iso: isoStr });
          }
        }
      }
      
      console.log(`✅ [AGENDA] Consulta OK - ${horariosDisponiveis.length} horários livres encontrados`);
      
      // Inserir mensagem de sistema para rastreabilidade
      await supabase.from('mensagens').insert({
        conversa_id: conversaId,
        contato_id: contatoId,
        tipo: 'sistema',
        direcao: 'saida',
        conteudo: `📅 Consulta de disponibilidade: ${horariosDisponiveis.length} horários livres encontrados no calendário "${calendario.nome}"`,
        enviada_por_ia: true,
      });
      
      return { 
        sucesso: true, 
        mensagem: `Disponibilidade consultada. Horários livres: ${horariosDisponiveis.slice(0, 5).join(', ')}`,
        dados: {
          eventos_ocupados: horariosOcupados,
          horarios_disponiveis: horariosDisponiveis.slice(0, 10),
          horarios_com_iso: horariosComISO.slice(0, 10),
          calendario_nome: calendario.nome,
        }
      };
    } catch (e) {
      console.error('❌ [AGENDA] Erro ao consultar calendário:', e);
      return { sucesso: false, mensagem: 'Erro ao consultar calendário' };
    }
  }
  
  // CRIAR evento
  if (valor.startsWith('criar:')) {
    console.log('📅 [AGENDA] Executando criação de evento:', valor);
    
    // Se usa agenda interna, validar disponibilidade antes
    if (usarAgendaInterna) {
      // Parse do valor para extrair data
      const dadosEvento = valor.replace('criar:', '');
      const partes = dadosEvento.split('|');
      let dataInicio = partes[partes.length - 1]; // Último elemento é a data
      
      if (dataInicio) {
        const dataHorario = new Date(dataInicio);
        const diaSemana = dataHorario.getDay();
        const hora = dataHorario.getHours();
        
        // Verificar se o dia/hora está nas janelas configuradas
        const janelaValida = horariosConfig.some(h => {
          if (h.dia_semana !== diaSemana) return false;
          const [horaInicio] = h.hora_inicio.split(':').map(Number);
          const [horaFim] = h.hora_fim.split(':').map(Number);
          return hora >= horaInicio && hora < horaFim;
        });
        
        if (!janelaValida) {
          console.log('❌ [AGENDA INTERNA] Horário fora da disponibilidade configurada');
          return { 
            sucesso: false, 
            mensagem: 'Este horário não está disponível. Por favor, escolha um dos horários oferecidos.' 
          };
        }
        
        // Verificar limite por horário
        const limitePorHorario = agendamentoConfig?.limite_por_horario || 1;
        const duracaoPadrao = agendamentoConfig?.duracao_padrao || 60;
        const dataFimCheck = new Date(dataHorario.getTime() + duracaoPadrao * 60 * 1000);
        
        const { data: conflitos } = await supabase
          .from('agendamentos')
          .select('id')
          .eq('conta_id', contaId)
          .gte('data_inicio', dataHorario.toISOString())
          .lt('data_inicio', dataFimCheck.toISOString())
          .eq('concluido', false);
        
        if (conflitos && conflitos.length >= limitePorHorario) {
          console.log('❌ [AGENDA INTERNA] Limite de agendamentos no horário atingido');
          return { 
            sucesso: false, 
            mensagem: 'Este horário já está ocupado. Por favor, escolha outro horário.' 
          };
        }
      }
    }
    
    // Criar evento via executar-acao
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/executar-acao`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          acao: { tipo: 'agenda', valor },
          conversa_id: conversaId,
          contato_id: contatoId,
          conta_id: contaId,
        }),
      });
      
      const resultado = await response.json();
      console.log('📅 [AGENDA] Resultado da criação:', JSON.stringify(resultado));
      
      if (resultado.sucesso) {
        const meetLink = resultado.dados?.meet_link || resultado.dados?.meetLink || '';
        const titulo = resultado.dados?.titulo || 'Reunião';
        const dataEvento = resultado.dados?.data_inicio || '';
        
        console.log(`✅ [AGENDA] Evento criado com sucesso! Meet: ${meetLink}`);
        
        // Inserir mensagem de sistema para rastreabilidade
        await supabase.from('mensagens').insert({
          conversa_id: conversaId,
          contato_id: contatoId,
          tipo: 'sistema',
          direcao: 'saida',
          conteudo: `✅ Evento criado: "${titulo}" | Data: ${dataEvento} | Meet: ${meetLink || 'Não gerado'}`,
          enviada_por_ia: true,
        });
        
        return {
          sucesso: true,
          mensagem: `Evento "${titulo}" criado com sucesso! Link do Google Meet: ${meetLink}`,
          dados: { ...resultado.dados, meet_link: meetLink },
        };
      } else {
        console.log('❌ [AGENDA] Falha ao criar evento:', resultado.mensagem);
        return {
          sucesso: false,
          mensagem: resultado.mensagem || 'Erro ao criar evento',
        };
      }
    } catch (e) {
      console.error('❌ [AGENDA] Erro ao executar criação de evento:', e);
      return { sucesso: false, mensagem: 'Erro ao criar evento no calendário' };
    }
  }
  
  return { sucesso: true, mensagem: 'Ação de agenda processada' };
}

// Função para executar verificação de cliente durante tool-calling (retorna resultado real para a IA)
async function executarVerificarCliente(
  supabase: any,
  contaId: string,
  conversaId: string,
  contatoId: string
): Promise<{ sucesso: boolean; mensagem: string; dados?: any }> {
  console.log('🔍 [VERIFICAR_CLIENTE] Executando durante tool-calling...');
  console.log('🔍 [VERIFICAR_CLIENTE] contato_id:', contatoId);
  
  try {
    // Buscar negociações do contato com seus estágios
    const { data: negociacoesContato, error: negError } = await supabase
      .from('negociacoes')
      .select(`
        id,
        status,
        estagio_id,
        estagios!negociacoes_estagio_id_fkey (
          id,
          nome,
          tipo
        )
      `)
      .eq('contato_id', contatoId);
    
    if (negError) {
      console.error('❌ [VERIFICAR_CLIENTE] Erro ao buscar negociações:', negError);
      return { sucesso: false, mensagem: 'Erro ao verificar status de cliente' };
    }
    
    console.log('🔍 [VERIFICAR_CLIENTE] Negociações encontradas:', negociacoesContato?.length || 0);
    
    // Verificar se alguma negociação está em estágio tipo 'cliente'
    const negociacaoCliente = negociacoesContato?.find((n: any) => {
      const tipo = n.estagios?.tipo;
      console.log(`   - Negociação ${n.id}: estágio=${n.estagios?.nome || 'N/A'}, tipo=${tipo || 'N/A'}`);
      return tipo === 'cliente';
    });
    
    // Registrar mensagem de sistema para rastreamento
    await supabase.from('mensagens').insert({
      conversa_id: conversaId,
      conta_id: contaId,
      contato_id: contatoId,
      tipo: 'sistema',
      direcao: 'saida',
      conteudo: `🔍 Status de cliente verificado no CRM: ${negociacaoCliente ? 'É CLIENTE' : 'NÃO é cliente'}`,
      enviada_por_ia: true,
      metadata: { 
        interno: true, 
        acao_tipo: 'verificar_cliente',
        resultado: negociacaoCliente ? 'cliente' : 'nao_cliente',
      }
    });
    
    if (negociacaoCliente) {
      console.log('✅ [VERIFICAR_CLIENTE] Lead É CLIENTE - Etapa:', negociacaoCliente.estagios?.nome);
      return {
        sucesso: true,
        mensagem: `SIM - Este lead É CLIENTE. Está na etapa "${negociacaoCliente.estagios?.nome}" marcada como cliente.`,
        dados: { is_cliente: true, estagio_nome: negociacaoCliente.estagios?.nome }
      };
    } else {
      console.log('❌ [VERIFICAR_CLIENTE] Lead NÃO é cliente');
      return {
        sucesso: true,
        mensagem: 'NÃO - Este lead NÃO É CLIENTE. Não possui negociação em etapa marcada como cliente.',
        dados: { is_cliente: false }
      };
    }
  } catch (e) {
    console.error('❌ [VERIFICAR_CLIENTE] Erro na verificação:', e);
    return { sucesso: false, mensagem: 'Erro ao verificar status de cliente' };
  }
}

// Função para detectar se a mensagem parece ser uma confirmação de agendamento
function detectarConfirmacaoAgendamento(mensagem: string, historico: string[]): boolean {
  const msgLower = mensagem.toLowerCase().trim();
  
  // Padrões que indicam confirmação de horário
  const padroesConfirmacao = [
    /^(pode ser|confirmo|fechado|ok|beleza|perfeito|bora|vamos|combinado|certo|tá bom|tudo bem|sim|s)/i,
    /às?\s*\d{1,2}h?/i, // "às 15h", "as 8"
    /\d{1,2}[:h]\d{0,2}/i, // "14:00", "8h"
    /(segunda|terça|quarta|quinta|sexta|sábado|domingo).*\d/i, // "segunda às 10h"
    /esse (horário|dia)/i,
    /pode agendar/i,
    /por favor.*agend/i,
    /^s$/i, // "s" isolado (sim)
  ];
  
  // Verificar se há consulta de disponibilidade recente no histórico
  const temConsultaRecente = historico.some(msg => 
    msg.includes('📅 Consulta de disponibilidade') || 
    msg.includes('horários livres') ||
    msg.includes('disponibilidade') && msg.includes('horário')
  );
  
  // Se houver consulta recente E a mensagem bater com padrão de confirmação
  if (temConsultaRecente) {
    for (const padrao of padroesConfirmacao) {
      if (padrao.test(msgLower)) {
        console.log('🎯 [DETECÇÃO] Confirmação de agendamento detectada:', msgLower);
        return true;
      }
    }
  }
  
  return false;
}

// Função para detectar contexto de follow-up (retorno de contato, não agendamento de reunião)
function detectarContextoFollowUp(historico: string[]): boolean {
  // Padrões que indicam contexto de follow-up (retomar conversa, não agendar reunião)
  const padroesFollowUp = [
    /quando (posso|devo|prefere que eu) retom(ar|o|e)/i,
    /qual (o )?horário.*retom/i,
    /me avise o melhor horário/i,
    /quando prefere que eu (retorne|retome|fale|entre em contato)/i,
    /podemos nos falar/i,
    /me liga depois/i,
    /fala comigo (depois|amanhã|mais tarde)/i,
    /retorna (depois|amanhã|mais tarde)/i,
    /qual (melhor )?horário para (te |eu )?ligar/i,
    /quando.*melhor para (falar|conversar|retornar)/i,
    /posso te ligar/i,
    /entro em contato/i,
    /te retorno/i,
    /vou te contactar/i,
  ];
  
  const temContextoFollowUp = historico.some(msg => 
    padroesFollowUp.some(padrao => padrao.test(msg))
  );
  
  if (temContextoFollowUp) {
    console.log('📌 [DETECÇÃO] Contexto de follow-up detectado no histórico');
  }
  
  return temContextoFollowUp;
}

async function callOpenAI(
  apiKey: string,
  messages: { role: string; content: string }[],
  modelo: string,
  maxTokens: number,
  temperatura: number,
  tools?: any[],
  executarAgendaFn?: (valor: string) => Promise<{ sucesso: boolean; mensagem: string; dados?: any }>,
  forcarFerramentaAgenda?: boolean,
  executarVerificarClienteFn?: () => Promise<{ sucesso: boolean; mensagem: string; dados?: any }>
): Promise<AIResponse> {
  const isModeloNovo = modelo.includes('gpt-5') || modelo.includes('gpt-4.1') || 
                       modelo.includes('o3') || modelo.includes('o4');
  
  let currentMessages: any[] = [...messages];
  let acoes: Acao[] = [];
  let resposta = '';
  let tokens = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  
  const MAX_ITERATIONS = 4; // Máximo de rodadas de tool-calling
  
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`🔄 [LOOP ${iteration}/${MAX_ITERATIONS}] Chamando modelo...`);
    
    const requestBody: any = {
      model: modelo,
      messages: currentMessages,
    };

    // Na última iteração, forçar resposta textual (sem tools)
    const isLastIteration = iteration === MAX_ITERATIONS;
    const forceTextOnly = isLastIteration && acoes.length > 0;
    
    if (forceTextOnly) {
      console.log('🔧 [FORÇA TEXTO] Última iteração - forçando resposta textual sem tools');
      // Adicionar instrução para responder com texto
      currentMessages = [
        ...currentMessages,
        {
          role: 'user',
          content: '[SISTEMA] Ações executadas com sucesso. Agora responda ao cliente com a PRÓXIMA MENSAGEM DO FLUXO conforme o script configurado. NÃO chame nenhuma ferramenta. Responda APENAS com o texto que deve ser enviado ao cliente.',
        },
      ];
      // Não incluir tools para forçar texto
    } else if (tools && tools.length > 0) {
      requestBody.tools = tools;
      
      if (forcarFerramentaAgenda) {
        console.log('🔧 [TOOL CHOICE] Forçando uso de ferramenta para agendamento');
        requestBody.tool_choice = 'required';
      } else {
        requestBody.tool_choice = 'auto';
      }
    }

    if (!isModeloNovo) {
      requestBody.temperature = temperatura;
      if (iteration === 1) {
        console.log(`🤖 Chamando modelo legado: ${modelo}, Temperatura: ${temperatura}, MaxTokens: ${maxTokens}`);
      }
    } else {
      if (iteration === 1) {
        console.log(`🤖 Chamando modelo novo: ${modelo}, Temperatura: default (1), MaxTokens: ${maxTokens}`);
      }
    }

    if (isModeloNovo) {
      requestBody.max_completion_tokens = maxTokens;
    } else {
      requestBody.max_tokens = maxTokens;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const toolCalls = message?.tool_calls;
    const content = message?.content || '';
    
    // Acumular tokens
    const usage = data.usage || {};
    tokens.prompt_tokens += usage.prompt_tokens || 0;
    tokens.completion_tokens += usage.completion_tokens || 0;
    tokens.total_tokens += usage.total_tokens || 0;
    
    console.log(`🔄 [LOOP ${iteration}] Content length: ${content.length}, Tool calls: ${toolCalls?.length || 0}`);
    
    // Se tem conteúdo substancial (não é só confirmação genérica), usar
    const contentUsavel = content && content.length > 15 && 
      !content.match(/^(Entendido!?|Certo!?|Ok!?|Processando|Aguarde)[\s.!]*$/i);
    
    if (contentUsavel) {
      resposta = content;
      console.log(`✅ [LOOP ${iteration}] Resposta substancial obtida: ${resposta.substring(0, 80)}...`);
      
      // Se também tem tool calls, processar
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          if (toolCall.function?.name === 'executar_acao') {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              acoes.push(args);
              console.log(`🔧 [LOOP ${iteration}] Ação adicional: ${args.tipo}`);
            } catch (e) {
              console.error('Erro ao parsear ação:', e);
            }
          }
        }
      }
      
      // Temos resposta boa, sair do loop
      break;
    }
    
    // Se não tem tool calls e não tem conteúdo bom, problema
    if (!toolCalls || toolCalls.length === 0) {
      if (content) {
        resposta = content;
        console.log(`⚠️ [LOOP ${iteration}] Sem tools, usando content disponível: ${resposta.substring(0, 50)}`);
      }
      break;
    }
    
    // Processar tool calls
    console.log(`🔧 [LOOP ${iteration}] Processando ${toolCalls.length} tool calls...`);
    const toolResults: { tool_call_id: string; content: string }[] = [];
    
    for (const toolCall of toolCalls) {
      if (toolCall.function?.name === 'executar_acao') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          acoes.push(args);
          console.log(`🔧 [LOOP ${iteration}] Ação: ${args.tipo} ${args.valor || ''}`);
          
          if (args.tipo === 'agenda' && executarAgendaFn) {
            const resultado = await executarAgendaFn(args.valor);
            toolResults.push({
              tool_call_id: toolCall.id,
              content: JSON.stringify(resultado),
            });
          } else if (args.tipo === 'verificar_cliente' && executarVerificarClienteFn) {
            console.log('🔍 [TOOL-CALLING] Executando verificar_cliente...');
            const resultado = await executarVerificarClienteFn();
            console.log('🔍 [TOOL-CALLING] Resultado verificar_cliente:', resultado.mensagem);
            toolResults.push({
              tool_call_id: toolCall.id,
              content: JSON.stringify(resultado),
            });
          } else {
            toolResults.push({
              tool_call_id: toolCall.id,
              content: JSON.stringify({ 
                sucesso: true, 
                mensagem: 'Ação executada internamente.',
                instrucao: 'IMPORTANTE: Ação processada. NÃO mencione na resposta. Continue com a PRÓXIMA MENSAGEM DO SCRIPT conforme configurado.',
              }),
            });
          }
        } catch (e) {
          console.error('Erro ao parsear argumentos da ação:', e);
          toolResults.push({
            tool_call_id: toolCall.id,
            content: JSON.stringify({ sucesso: false, mensagem: 'Erro ao processar ação' }),
          });
        }
      }
    }
    
    // Atualizar mensagens para próxima iteração
    currentMessages = [
      ...currentMessages,
      message, // Mensagem com tool_calls
    ];
    
    for (const result of toolResults) {
      currentMessages.push({
        role: 'tool',
        tool_call_id: result.tool_call_id,
        content: result.content,
      });
    }
    
    // Se chegou na última iteração sem resposta, o loop forçará texto
    if (iteration === MAX_ITERATIONS - 1 && !resposta) {
      console.log('⚠️ [LOOP] Penúltima iteração sem resposta, próxima forçará texto');
    }
  }
  
  // Se após o loop ainda não temos resposta substancial, tentar chamada final texto-only
  if (!resposta || resposta.length < 15 || resposta.match(/^(Entendido!?|Certo!?|Ok!?|Processando|Aguarde)[\s.!]*$/i)) {
    console.log('⚠️ [FALLBACK] Resposta insuficiente, tentando chamada texto-only final...');
    
    try {
      const fallbackMessages = [
        ...currentMessages,
        {
          role: 'user',
          content: '[SISTEMA] Todas as ações foram executadas. Agora você DEVE responder ao cliente com a MENSAGEM EXATA do script/prompt configurado. Use o texto literal entre aspas. NÃO chame ferramentas. Responda APENAS com o texto para o cliente.',
        },
      ];
      
      const fallbackBody: any = {
        model: modelo,
        messages: fallbackMessages,
        // Sem tools para forçar resposta textual
      };
      
      if (isModeloNovo) {
        fallbackBody.max_completion_tokens = maxTokens;
      } else {
        fallbackBody.max_tokens = maxTokens;
        fallbackBody.temperature = temperatura;
      }
      
      const fallbackResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fallbackBody),
      });
      
      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        const fallbackContent = fallbackData.choices?.[0]?.message?.content || '';
        
        if (fallbackContent && fallbackContent.length > 15) {
          console.log(`✅ [FALLBACK] Resposta obtida: ${fallbackContent.substring(0, 80)}...`);
          resposta = fallbackContent;
          
          // Acumular tokens do fallback
          const fallbackUsage = fallbackData.usage || {};
          tokens.prompt_tokens += fallbackUsage.prompt_tokens || 0;
          tokens.completion_tokens += fallbackUsage.completion_tokens || 0;
          tokens.total_tokens += fallbackUsage.total_tokens || 0;
        }
      }
    } catch (e) {
      console.error('Erro no fallback texto-only:', e);
    }
  }

  if (!resposta && acoes.length === 0) {
    throw new Error('Resposta vazia da OpenAI');
  }

  return { resposta, provider: 'openai', acoes: acoes.length > 0 ? acoes : undefined, tokens };
}

// Removido: callLovableAI - sistema agora EXIGE chave OpenAI do cliente

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { conversa_id, mensagem, conta_id: contaIdParam, mensagem_tipo, transcricao, descricao_imagem, texto_documento, transferencia_agente, nova_conversa_agente } = await req.json();

    console.log('=== AI RESPONDER ===');
    console.log('Conversa ID:', conversa_id);
    console.log('Conta ID (param):', contaIdParam);
    console.log('Mensagem recebida:', mensagem);
    console.log('Tipo de mensagem:', mensagem_tipo || 'texto');
    console.log('Transferência de agente:', transferencia_agente || false);
    console.log('Nova conversa agente (ignorar histórico):', nova_conversa_agente || false);
    if (transcricao) {
      console.log('Transcrição de áudio:', transcricao.substring(0, 100));
    }
    if (descricao_imagem) {
      console.log('Descrição de imagem:', descricao_imagem.substring(0, 100));
    }
    if (texto_documento) {
      console.log('Texto de documento:', texto_documento.substring(0, 100));
    }

    // Fallback: buscar conta_id da conversa se não foi passado
    let conta_id = contaIdParam;
    if (!conta_id && conversa_id) {
      console.log('conta_id não fornecido, buscando da conversa...');
      const { data: conversaInfo } = await supabase
        .from('conversas')
        .select('conta_id')
        .eq('id', conversa_id)
        .single();
      
      conta_id = conversaInfo?.conta_id;
      console.log('conta_id obtido da conversa:', conta_id);
    }

    if (!conta_id) {
      console.error('Erro: conta_id não encontrado');
      return new Response(
        JSON.stringify({ error: 'conta_id obrigatório', should_respond: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Buscar API Key da OpenAI da conta (opcional agora)
    const { data: conta } = await supabase
      .from('contas')
      .select('openai_api_key')
      .eq('id', conta_id)
      .single();

    const hasOpenAIKey = !!conta?.openai_api_key;
    console.log('OpenAI API Key configurada:', hasOpenAIKey);

    // 2. Buscar dados da conversa para determinar qual agente usar
    const { data: conversaData } = await supabase
      .from('conversas')
      .select('agente_ia_id')
      .eq('id', conversa_id)
      .single();

    let agente = null;

    // Se a conversa tem um agente específico atribuído, usar ele
    if (conversaData?.agente_ia_id) {
      console.log('Conversa tem agente específico:', conversaData.agente_ia_id);
      const { data: agenteEspecifico } = await supabase
        .from('agent_ia')
        .select('*')
        .eq('id', conversaData.agente_ia_id)
        .eq('ativo', true)
        .single();
      
      agente = agenteEspecifico;
    }

    // Se não tem agente específico ou ele não está ativo, buscar agente principal
    if (!agente) {
      console.log('Buscando agente principal da conta...');
      const { data: agentePrincipal } = await supabase
        .from('agent_ia')
        .select('*')
        .eq('conta_id', conta_id)
        .eq('tipo', 'principal')
        .eq('ativo', true)
        .single();
      
      agente = agentePrincipal;
    }

    // Se ainda não encontrou, buscar qualquer agente ativo
    if (!agente) {
      console.log('Buscando qualquer agente ativo da conta...');
      const { data: agenteQualquer } = await supabase
        .from('agent_ia')
        .select('*')
        .eq('conta_id', conta_id)
        .eq('ativo', true)
        .limit(1)
        .maybeSingle();
      
      agente = agenteQualquer;
    }

    if (!agente) {
      console.log('Nenhum agente IA ativo para esta conta');
      return new Response(
        JSON.stringify({ error: 'Nenhum agente IA ativo', should_respond: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Agente encontrado:', agente.nome, '(tipo:', agente.tipo + ')');

    // Verificar se o agente está configurado para atender 24h
    // Se for uma transferência de agente, ignorar horário e sempre responder
    if (!agente.atender_24h && !transferencia_agente) {
      const agora = new Date();
      const brasilOffset = -3 * 60;
      const localTime = new Date(agora.getTime() + (brasilOffset + agora.getTimezoneOffset()) * 60000);
      
      const diaSemana = localTime.getDay();
      const horaAtual = localTime.toTimeString().slice(0, 5);

      console.log('Verificando horário - Dia:', diaSemana, 'Hora (Brasil):', horaAtual);

      const dentroDoHorario = agente.dias_ativos?.includes(diaSemana) &&
        horaAtual >= agente.horario_inicio &&
        horaAtual <= agente.horario_fim;

      if (!dentroDoHorario && agente.mensagem_fora_horario) {
        console.log('Fora do horário de atendimento');
        return new Response(
          JSON.stringify({ 
            resposta: agente.mensagem_fora_horario, 
            should_respond: true,
            fora_horario: true 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Log se for transferência
    if (transferencia_agente) {
      console.log('🔄 Esta é uma resposta após TRANSFERÊNCIA - ignorando verificação de horário');
    }

    // 3. Buscar etapas de atendimento
    const { data: etapas } = await supabase
      .from('agent_ia_etapas')
      .select('*')
      .eq('agent_ia_id', agente.id)
      .order('numero', { ascending: true });

    // 4. Buscar perguntas frequentes
    const { data: perguntas } = await supabase
      .from('agent_ia_perguntas')
      .select('*')
      .eq('agent_ia_id', agente.id)
      .order('ordem', { ascending: true });

    // 5. Buscar dados da conversa para obter contato_id, memoria_limpa_em e etapa_ia_atual
    const { data: conversa } = await supabase
      .from('conversas')
      .select('contato_id, memoria_limpa_em, etapa_ia_atual')
      .eq('id', conversa_id)
      .single();

    const contatoId = conversa?.contato_id;
    const memoriaLimpaEm = conversa?.memoria_limpa_em;
    const etapaIAAtual = conversa?.etapa_ia_atual;

    // 5.1 Buscar dados do contato para placeholders
    interface DadosContato {
      nome?: string | null;
      telefone?: string | null;
      email?: string | null;
      tags?: string[] | null;
      metadata?: Record<string, any> | null;
    }
    let dadosContato: DadosContato | null = null;
    if (contatoId) {
      const { data: contatoData } = await supabase
        .from('contatos')
        .select('nome, telefone, email, tags, metadata')
        .eq('id', contatoId)
        .single();
      
      if (contatoData) {
        dadosContato = contatoData as DadosContato;
        console.log('📋 Dados do contato para placeholders:', dadosContato.nome);
      }
    }

    // 5.1.1 Buscar campos personalizados da conta
    let camposPersonalizados: { id: string; nome: string; tipo: string }[] = [];
    const { data: camposData } = await supabase
      .from('campos_personalizados')
      .select('id, nome, tipo')
      .eq('conta_id', conta_id)
      .order('ordem', { ascending: true });
    
    if (camposData) {
      camposPersonalizados = camposData;
      console.log('📝 Campos personalizados disponíveis:', camposPersonalizados.length);
    }


    // 5.2 Buscar contexto do CRM (negociação e etapa) para informar a IA
    let crmContexto = null;
    if (contatoId) {
      const { data: negociacaoData } = await supabase
        .from('negociacoes')
        .select(`
          id, 
          titulo, 
          status, 
          valor,
          estagio_id,
          estagios!negociacoes_estagio_id_fkey (
            id,
            nome,
            tipo,
            funil_id,
            funis!estagios_funil_id_fkey (
              id,
              nome
            )
          )
        `)
        .eq('contato_id', contatoId)
        .eq('status', 'aberto')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (negociacaoData?.estagios) {
        const estagio = negociacaoData.estagios as any;
        const funil = estagio?.funis as any;
        crmContexto = {
          negociacao_id: negociacaoData.id,
          negociacao_titulo: negociacaoData.titulo,
          negociacao_valor: negociacaoData.valor,
          estagio_nome: estagio?.nome,
          estagio_tipo: estagio?.tipo,
          funil_nome: funil?.nome,
          is_cliente: estagio?.tipo === 'cliente',
        };
        console.log('Contexto CRM encontrado:', crmContexto);
      }
    }

    // 6. Buscar histórico de mensagens da conversa (limite configurável por agente, filtrando por memoria_limpa_em)
    // Se for nova_conversa_agente, ignorar TODO o histórico para o novo agente começar do zero
    let historico: any[] = [];
    
    if (nova_conversa_agente) {
      console.log('🆕 Nova conversa para agente - IGNORANDO histórico, agente começará na Etapa 1');
      // Não carregar histórico - o novo agente deve começar do zero com sua Etapa 1
      historico = [];
    } else {
      const limiteContexto = agente.quantidade_mensagens_contexto || 20;
      console.log('Limite de mensagens no contexto:', limiteContexto);
      
      // 🔧 CORREÇÃO: Buscar as mensagens MAIS RECENTES (não as mais antigas)
      // Ordenar por DESC para pegar as últimas, depois reverter para ordem cronológica
      let historicoQuery = supabase
        .from('mensagens')
        .select('conteudo, direcao, created_at')
        .eq('conversa_id', conversa_id)
        .order('created_at', { ascending: false }) // DESC para pegar as ÚLTIMAS
        .limit(limiteContexto);

      // Se há data de limpeza de memória, ignorar mensagens anteriores
      if (memoriaLimpaEm) {
        console.log('Filtrando mensagens após:', memoriaLimpaEm);
        historicoQuery = historicoQuery.gt('created_at', memoriaLimpaEm);
      }

      const { data: historicoData } = await historicoQuery;
      // Reverter para ordem cronológica (mais antiga primeiro, mais recente por último)
      historico = (historicoData || []).reverse();
      console.log('📋 [HISTÓRICO] Carregadas', historico.length, 'mensagens mais recentes');
    }

    // 7. Parsear ações das etapas para construir ferramentas
    let todasAcoes: { etapaNum: number; acoes: string[] }[] = [];
    let acoesDisponiveis: Acao[] = [];

    if (etapas && etapas.length > 0) {
      for (const etapa of etapas) {
        if (etapa.descricao) {
          const { acoes, acoesParseadas } = parseAcoesDoPrompt(etapa.descricao);
          if (acoes.length > 0) {
            todasAcoes.push({ etapaNum: etapa.numero, acoes });
            
            // Processar ações para mapear nomes de etapas para IDs
            for (const acao of acoesParseadas) {
              if (acao.tipo === 'etapa' && acao.valor) {
                const estagioId = await mapearEtapaNome(supabase, conta_id, acao.valor);
                if (estagioId) {
                  acoesDisponiveis.push({ ...acao, valor: estagioId });
                }
              } else {
                acoesDisponiveis.push(acao);
              }
            }
          }
        }
      }
    }

    // 8. Montar o prompt completo
    let promptCompleto = agente.prompt_sistema || '';

    // Adicionar contexto temporal (Brasil - UTC-3)
    const agora = new Date();
    const brasilOffset = -3 * 60;
    const utcOffset = agora.getTimezoneOffset();
    const diferencaMinutos = brasilOffset + utcOffset;
    const agoraBrasil = new Date(agora.getTime() + diferencaMinutos * 60 * 1000);

    const diasSemana = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    const diaSemana = diasSemana[agoraBrasil.getDay()];
    const diaNum = agoraBrasil.getDate();
    const mes = meses[agoraBrasil.getMonth()];
    const ano = agoraBrasil.getFullYear();
    const hora = agoraBrasil.getHours().toString().padStart(2, '0');
    const minuto = agoraBrasil.getMinutes().toString().padStart(2, '0');

    let periodo = 'madrugada';
    const horaNum = agoraBrasil.getHours();
    if (horaNum >= 5 && horaNum < 12) periodo = 'manhã';
    else if (horaNum >= 12 && horaNum < 18) periodo = 'tarde';
    else if (horaNum >= 18 && horaNum < 24) periodo = 'noite';

    promptCompleto += `\n\n## CONTEXTO TEMPORAL\n`;
    promptCompleto += `- Data atual: ${diaNum} de ${mes} de ${ano}\n`;
    promptCompleto += `- Dia da semana: ${diaSemana}\n`;
    promptCompleto += `- Horário atual: ${hora}:${minuto} (horário de Brasília)\n`;
    promptCompleto += `- Período do dia: ${periodo}\n`;
    promptCompleto += `\nUse estas informações para cumprimentos apropriados (Bom dia/Boa tarde/Boa noite) e referências temporais.\n`;

    // Adicionar contexto do contato/lead
    if (dadosContato) {
      promptCompleto += `\n\n## DADOS DO CONTATO/LEAD\n`;
      promptCompleto += `- **Nome do contato:** ${dadosContato.nome || 'Não identificado'}\n`;
      if (dadosContato.telefone) {
        promptCompleto += `- Telefone: ${dadosContato.telefone}\n`;
      }
      if (dadosContato.email) {
        promptCompleto += `- Email: ${dadosContato.email}\n`;
      }
      if (dadosContato.tags && dadosContato.tags.length > 0) {
        promptCompleto += `- Tags: ${dadosContato.tags.join(', ')}\n`;
      }
      
      // Adicionar campos personalizados do contato
      if (camposPersonalizados.length > 0 && dadosContato.metadata) {
        promptCompleto += `\n**Campos Personalizados:**\n`;
        for (const campo of camposPersonalizados) {
          const valor = dadosContato.metadata[`campo_${campo.id}`];
          promptCompleto += `- ${campo.nome}: ${valor || 'não informado'}\n`;
        }
      }
      
      promptCompleto += `\n**IMPORTANTE:** Use o nome "${dadosContato.nome || 'Cliente'}" para se referir ao contato de forma personalizada quando apropriado.\n`;
    }

    // Adicionar contexto do CRM - SEMPRE informar status de cliente
    promptCompleto += `\n\n## CONTEXTO DO CRM\n`;
    if (crmContexto?.is_cliente) {
      promptCompleto += `**⭐ ESTE LEAD É CLIENTE - SIGA INSTRUÇÕES PARA CLIENTE**\n`;
      promptCompleto += `- Status: Cliente (já convertido)\n`;
      promptCompleto += `- Trate este contato como um cliente existente, não como um novo lead.\n`;
      promptCompleto += `- Seja mais familiar e personalizado no atendimento.\n`;
    } else if (crmContexto && !crmContexto.is_cliente) {
      promptCompleto += `**📋 ESTE LEAD NÃO É CLIENTE - SIGA INSTRUÇÕES PARA NÃO CLIENTE**\n`;
      promptCompleto += `- Status: Lead em negociação (ainda não é cliente)\n`;
      promptCompleto += `- Se houver instrução condicional para "não cliente", você DEVE seguir essa instrução.\n`;
    } else {
      promptCompleto += `**🆕 ESTE LEAD NÃO É CLIENTE - SIGA INSTRUÇÕES PARA NÃO CLIENTE**\n`;
      promptCompleto += `- Status: Contato novo ou sem negociação ativa\n`;
      promptCompleto += `- Este contato NÃO é cliente.\n`;
      promptCompleto += `- Se houver instrução condicional para "não cliente", você DEVE seguir essa instrução.\n`;
    }
    
    if (crmContexto) {
      promptCompleto += `- Etapa atual no CRM: ${crmContexto.estagio_nome || 'Não definida'}\n`;
      promptCompleto += `- Funil: ${crmContexto.funil_nome || 'Não definido'}\n`;
      if (crmContexto.negociacao_valor && crmContexto.negociacao_valor > 0) {
        promptCompleto += `- Valor da negociação: R$ ${crmContexto.negociacao_valor.toLocaleString('pt-BR')}\n`;
      }
    }
    promptCompleto += `\nUse estas informações para contextualizar melhor o atendimento.\n`;

    // Adicionar contexto de mídia se for áudio com transcrição
    if (mensagem_tipo === 'audio' && transcricao) {
      promptCompleto += `\n\n## CONTEXTO DE MÍDIA\n`;
      promptCompleto += `O lead enviou um áudio. Transcrição do áudio:\n"${transcricao}"\n\n`;
      promptCompleto += `Responda naturalmente como se tivesse ouvido e compreendido o áudio. Não mencione que recebeu uma transcrição.\n`;
    }

    // Adicionar contexto de mídia se for imagem com descrição
    if (mensagem_tipo === 'imagem' && descricao_imagem) {
      promptCompleto += `\n\n## CONTEXTO DE MÍDIA\n`;
      promptCompleto += `O lead enviou uma imagem. Análise da imagem:\n"${descricao_imagem}"\n\n`;
      promptCompleto += `Responda naturalmente baseado no conteúdo da imagem. Exemplos de comportamento:\n`;
      promptCompleto += `- Se for um comprovante de pagamento: confirme o recebimento e mencione o valor se visível.\n`;
      promptCompleto += `- Se for um produto: identifique e forneça informações relevantes.\n`;
      promptCompleto += `- Se tiver dados importantes (valores, datas, nomes): mencione-os naturalmente.\n`;
      promptCompleto += `- Se for um screenshot de erro: ajude a resolver o problema.\n`;
      promptCompleto += `Não mencione que recebeu uma análise ou descrição da imagem. Aja como se tivesse visto a imagem diretamente.\n`;
    }

    // Adicionar contexto de mídia se for documento PDF com texto extraído
    if (mensagem_tipo === 'documento' && texto_documento) {
      promptCompleto += `\n\n## CONTEXTO DE DOCUMENTO\n`;
      promptCompleto += `O lead enviou um documento PDF. Conteúdo extraído do documento:\n"${texto_documento}"\n\n`;
      promptCompleto += `Responda naturalmente baseado no conteúdo do documento. Exemplos de comportamento:\n`;
      promptCompleto += `- Se for um contrato: identifique cláusulas importantes, valores, prazos e partes envolvidas.\n`;
      promptCompleto += `- Se for um orçamento/proposta: identifique os itens, valores e condições.\n`;
      promptCompleto += `- Se for um documento técnico: resuma as informações relevantes.\n`;
      promptCompleto += `- Se for uma nota fiscal: confirme os dados como valores, datas e produtos/serviços.\n`;
      promptCompleto += `- Se for um comprovante: confirme as informações relevantes.\n`;
      promptCompleto += `Não mencione que recebeu o texto extraído do PDF. Aja como se tivesse lido o documento diretamente.\n`;
    }

    // OTIMIZAÇÃO: Carregar APENAS etapa atual + próxima (evita regressão de fluxo)
    // Definir etapaAtual no escopo superior para uso posterior
    let etapaAtualGlobal: { id: string; nome: string; numero: number; descricao: string | null } | null = null;
    
    if (etapas && etapas.length > 0) {
      // Identificar etapa atual (pela coluna etapa_ia_atual ou fallback para etapa 1)
      let etapaAtual = etapas.find((e: any) => e.id === etapaIAAtual);
      
      // Se não há etapa definida, usar a primeira etapa (número 1) E PERSISTIR NA CONVERSA
      if (!etapaAtual) {
        etapaAtual = etapas.find((e: any) => e.numero === 1) || etapas[0];
        
        // Persistir a etapa inicial na conversa para exibição no frontend
        if (etapaAtual) {
          await supabase
            .from('conversas')
            .update({ etapa_ia_atual: etapaAtual.id })
            .eq('id', conversa_id);
          console.log('📍 [INICIALIZAR] Definindo etapa inicial na conversa:', etapaAtual.nome);
        }
      }
      
      // Salvar referência para uso posterior (detecção de placeholders, auto-captura)
      if (etapaAtual) {
        etapaAtualGlobal = etapaAtual;
      }
      
      if (etapaAtual) {
        promptCompleto += '\n\n## ETAPA ATUAL DE ATENDIMENTO\n';
        promptCompleto += `**Você está na Etapa ${etapaAtual.numero}: ${etapaAtual.nome}**\n\n`;
        
        // Adicionar contexto EXPLÍCITO sobre status de cliente para instruções condicionais
        if (crmContexto?.is_cliente) {
          promptCompleto += '**⚠️ IMPORTANTE: O LEAD É CLIENTE - Execute instruções para CLIENTE**\n\n';
        } else {
          promptCompleto += '**⚠️ IMPORTANTE: O LEAD NÃO É CLIENTE - Execute instruções para NÃO CLIENTE**\n\n';
        }
        
        promptCompleto += 'Siga RIGOROSAMENTE as instruções desta etapa. NÃO volte para etapas anteriores:\n\n';
        if (etapaAtual.descricao) {
          const descricaoTexto = extractTextFromTiptapJson(etapaAtual.descricao);
          promptCompleto += `${descricaoTexto}\n\n`;
        }
        
        // Adicionar próxima etapa para progressão natural
        const proximaEtapa = etapas.find((e: any) => e.numero === etapaAtual.numero + 1);
        if (proximaEtapa) {
          promptCompleto += '\n### PRÓXIMA ETAPA (quando concluir a atual)\n';
          promptCompleto += `Quando completar os objetivos da etapa atual, use a ação @ir_etapa:${proximaEtapa.numero} para avançar para:\n`;
          promptCompleto += `**Etapa ${proximaEtapa.numero}: ${proximaEtapa.nome}**\n`;
          if (proximaEtapa.descricao) {
            // Mostrar apenas resumo da próxima etapa (primeiras 300 caracteres)
            const descricaoProxTexto = extractTextFromTiptapJson(proximaEtapa.descricao);
            const resumo = descricaoProxTexto.substring(0, 300);
            promptCompleto += `Resumo: ${resumo}${descricaoProxTexto.length > 300 ? '...' : ''}\n`;
          }
        } else {
          promptCompleto += '\n*Esta é a última etapa do fluxo de atendimento.*\n';
        }
        
        console.log('📍 Etapa atual no prompt:', etapaAtual.nome, '(número:', etapaAtual.numero, ')');
      }
    }

    if (perguntas && perguntas.length > 0) {
      promptCompleto += '\n\n## PERGUNTAS FREQUENTES\n';
      promptCompleto += 'Use estas respostas quando apropriado:\n\n';
      perguntas.forEach((faq: any) => {
        promptCompleto += `**P: ${faq.pergunta}**\nR: ${faq.resposta}\n\n`;
      });
    }

    // Adicionar instruções sobre ações se houver ações configuradas
    if (acoesDisponiveis.length > 0) {
      promptCompleto += '\n\n## AÇÕES DISPONÍVEIS\n';
      promptCompleto += 'Você pode executar as seguintes ações quando apropriado:\n';
      promptCompleto += '- @etapa:<nome> - Mover o lead para uma etapa específica do CRM\n';
      promptCompleto += '- @ir_etapa:<numero> - Avançar para uma etapa específica do fluxo de atendimento (ex: @ir_etapa:2 para ir para etapa 2)\n';
      promptCompleto += '- @tag:<nome> - Adicionar uma tag ao contato\n';
      promptCompleto += '- @negociacao:<funil/estagio> ou @negociacao:<funil/estagio>:<valor> - Criar uma nova negociação no CRM\n';
      promptCompleto += '- @transferir:humano - Transferir a conversa para um atendente humano\n';
      promptCompleto += '- @transferir:ia - Devolver a conversa para o agente IA principal\n';
      promptCompleto += '- @transferir:agente:<id_ou_nome> - Transferir a conversa para outro agente IA específico\n';
      promptCompleto += '- @notificar - Enviar notificação para a equipe\n';
      promptCompleto += '- @finalizar - Encerrar a conversa\n';
      promptCompleto += '- @nome:<novo nome> - Alterar o nome do contato/lead (use quando o cliente se identificar)\n';
      promptCompleto += '- @campo:<nome-do-campo>:<valor> - Atualizar um campo personalizado do contato (ex: @campo:data-nascimento:15/03/1990)\n';
      promptCompleto += '- @obter:<nome-do-campo> - Obter o valor de um campo personalizado do contato (ex: @obter:cidade)\n';
      promptCompleto += '- @verificar_cliente - Consultar no CRM se o lead é cliente (verifica se há negociação em etapa marcada como cliente). Retorna SIM ou NÃO.\n';
      promptCompleto += '- @agenda:consultar - Consultar disponibilidade do calendário (próximos 7 dias)\n';
      promptCompleto += '- @agenda:criar:<titulo>|<data_inicio> - Criar evento no calendário com Google Meet (datas em ISO8601)\n';
      
      // Adicionar lista de campos personalizados disponíveis
      // SOMENTE listar os campos que têm chips @campo:nome-do-campo explícitos no prompt
      const promptAgenteLocal = agente?.prompt_sistema || '';
      let descricaoEtapaLocal = '';
      if (etapaAtualGlobal?.descricao) {
        descricaoEtapaLocal = extractTextFromTiptapJson(etapaAtualGlobal.descricao);
      }
      const documentoParaDeteccao = promptAgenteLocal + '\n\n' + descricaoEtapaLocal;
      
      // 🆕 Extrair quais campos ESPECÍFICOS estão configurados no prompt (ex: @campo:estado, @campo:nome-completo)
      const camposConfiguradosLocal = new Set<string>();
      const regexCampos = /@campo:([a-zA-Z0-9\-_]+)/gi;
      let matchCampo;
      while ((matchCampo = regexCampos.exec(documentoParaDeteccao)) !== null) {
        camposConfiguradosLocal.add(matchCampo[1].toLowerCase());
      }
      console.log('📋 [CAMPOS] Campos específicos configurados no prompt:', Array.from(camposConfiguradosLocal));
      
      const temChipCampoExplicito = camposConfiguradosLocal.size > 0;
      
      if (camposPersonalizados.length > 0 && temChipCampoExplicito) {
        promptCompleto += '\n### CAMPOS PERSONALIZADOS PERMITIDOS\n';
        promptCompleto += 'Você pode SOMENTE capturar dados nos seguintes campos (configurados na etapa):\n';
        
        // 🆕 FILTRAR: Só listar campos que estão no prompt
        let camposListados = 0;
        for (const campo of camposPersonalizados) {
          const nomeCampoFormatado = campo.nome.toLowerCase().replace(/\s+/g, '-');
          // Só incluir se este campo específico está configurado
          if (camposConfiguradosLocal.has(nomeCampoFormatado)) {
            promptCompleto += `- ${campo.nome} (${campo.tipo}) → Use: @campo:${nomeCampoFormatado}:{valor-do-lead}\n`;
            camposListados++;
          }
        }
        
        // Se não encontrou correspondência exata, listar os configurados mesmo assim
        if (camposListados === 0) {
          console.log('⚠️ [CAMPOS] Nenhum campo do banco correspondeu aos configurados. Chips no prompt:', Array.from(camposConfiguradosLocal));
          for (const nomeCampo of camposConfiguradosLocal) {
            promptCompleto += `- ${nomeCampo} → Use: @campo:${nomeCampo}:{valor-do-lead}\n`;
          }
        }
        
        promptCompleto += '\n**COMO SALVAR CAMPOS:**\n';
        promptCompleto += '1. SÓ salve campos quando o SCRIPT/ETAPA pedir explicitamente (chip @campo no prompt)\n';
        promptCompleto += '2. Use o formato: @campo:nome-do-campo:valor do lead (COM ESPAÇOS!)\n';
        promptCompleto += '3. Substitua espaços por hífens APENAS no NOME do campo (antes do segundo ":")\n';
        promptCompleto += '4. O VALOR (depois do segundo ":") deve MANTER ESPAÇOS - NÃO troque espaços por hífens no valor!\n';
        promptCompleto += '5. NUNCA use hífens no valor, mantenha EXATAMENTE como o lead enviou\n\n';
        
        promptCompleto += '**EXEMPLOS PRÁTICOS:**\n';
        promptCompleto += '- Lead diz: "Thiago Mendes Penter" (nome)\n';
        promptCompleto += '  → CORRETO: @campo:nome-completo:Thiago Mendes Penter (espaços preservados no valor!)\n';
        promptCompleto += '  → ERRADO: @campo:nome-completo:Thiago-Mendes-Penter (NÃO use hífens no valor!)\n';
        promptCompleto += '- Lead diz: "meu email é teste@gmail.com"\n';
        promptCompleto += '  → Você usa: @campo:email:teste@gmail.com\n';
        promptCompleto += '- Lead diz: "22/02/1994"\n';
        promptCompleto += '  → Você usa: @campo:data-de-nascimento:22/02/1994\n';
        promptCompleto += '- Lead diz: "123.456.789-00"\n';
        promptCompleto += '  → Você usa: @campo:cpf:123.456.789-00\n\n';
        
        promptCompleto += '\n**⚠️ REGRAS CRÍTICAS:**\n';
        promptCompleto += '- Para salvar um campo, você DEVE usar a ferramenta executar_acao com tipo="campo"\n';
        promptCompleto += '- O valor deve ser: "nome-do-campo:valor-que-o-lead-enviou"\n';
        promptCompleto += '- NUNCA diga "informação salva" sem chamar a ferramenta primeiro!\n';
        promptCompleto += '- Os valores já salvos aparecem na seção DADOS DO CONTATO/LEAD acima\n';
        promptCompleto += '- Use @obter:<nome-do-campo> se precisar confirmar um valor antes de usar\n';
        promptCompleto += '\n**🚫 PROIBIDO:**\n';
        promptCompleto += '- NÃO salve campos que NÃO estão listados acima\n';
        promptCompleto += '- NÃO invente campos novos\n';
        promptCompleto += '- Se o lead informar algo que não tem campo configurado, apenas siga a conversa SEM salvar\n';
      } else if (camposPersonalizados.length > 0) {
        // Se há campos mas NÃO há chips @campo no prompt, adicionar regra anti-captura
        promptCompleto += '\n### ⚠️ REGRA ANTI-CAPTURA AUTOMÁTICA\n';
        promptCompleto += 'NÃO salve campos personalizados automaticamente!\n';
        promptCompleto += '- Só use @campo quando o script/etapa pedir EXPLICITAMENTE\n';
        promptCompleto += '- Não infira que deve salvar dados só porque o lead informou algo\n';
        promptCompleto += '- Siga apenas as instruções do prompt configurado\n';
      }
      
      promptCompleto += '\n### INSTRUÇÕES DE AGENDAMENTO (CRÍTICO - SIGA EXATAMENTE)\n';
      promptCompleto += 'O agendamento DEVE ser feito em 2 TURNOS SEPARADOS DE CONVERSA:\n\n';
      
      promptCompleto += '**TURNO 1 - CONSULTAR DISPONIBILIDADE:**\n';
      promptCompleto += '- SEMPRE que o cliente pedir para agendar, PRIMEIRO use @agenda:consultar\n';
      promptCompleto += '- NUNCA invente horários - só apresente os que vieram da consulta\n';
      promptCompleto += '- Apresente 3-5 opções de horários disponíveis\n';
      promptCompleto += '- PARE e espere a resposta do cliente\n';
      promptCompleto += '- NÃO diga "vou agendar", "só um momento", "estou agendando"\n';
      promptCompleto += '- Diga algo como: "Tenho disponibilidade nos seguintes horários: ..."\n\n';
      
      promptCompleto += '**TURNO 2 - CRIAR O EVENTO (só após confirmação):**\n';
      promptCompleto += '- Use @agenda:criar SOMENTE quando cliente confirmar um horário específico\n';
      promptCompleto += '- Formato: @agenda:criar:<titulo>|<data_inicio_iso8601>\n';
      promptCompleto += '- Exemplo: @agenda:criar:Reunião com Cliente|2025-01-20T14:00:00-03:00\n';
      promptCompleto += '- O resultado terá "meet_link" - INCLUA NA RESPOSTA!\n\n';
      
      promptCompleto += '**⚠️ REGRA OBRIGATÓRIA - CRIAÇÃO DE EVENTOS:**\n';
      promptCompleto += '- Para CRIAR um evento, você DEVE usar a ferramenta executar_acao com tipo="agenda" e valor="criar:..."\n';
      promptCompleto += '- NUNCA responda "Reunião agendada", "Pronto, agendei" ou inclua link de meet SEM ANTES chamar a ferramenta!\n';
      promptCompleto += '- Se você NÃO chamou a ferramenta, o evento NÃO foi criado - não minta para o cliente!\n';
      promptCompleto += '- NUNCA invente links do Google Meet! Eles vêm do resultado da ferramenta.\n';
      promptCompleto += '- O link do Meet tem formato: https://meet.google.com/xxx-xxxx-xxx (NUNCA invente isso!)\n\n';
      
      promptCompleto += '**EXEMPLOS DE CONFIRMAÇÃO (quando DEVE usar executar_acao com agenda:criar):**\n';
      promptCompleto += '- "as 15h" → CONFIRMOU! Chamar ferramenta para criar evento\n';
      promptCompleto += '- "pode ser segunda às 10h" → CONFIRMOU! Chamar ferramenta para criar evento\n';
      promptCompleto += '- "confirmo" → CONFIRMOU! Chamar ferramenta para criar evento\n';
      promptCompleto += '- "esse horário está bom" → CONFIRMOU! Chamar ferramenta para criar evento\n';
      promptCompleto += '- "pode agendar" → CONFIRMOU! Chamar ferramenta para criar evento\n';
      promptCompleto += '- "fechado" → CONFIRMOU! Chamar ferramenta para criar evento\n';
      promptCompleto += '- "beleza, pode ser 14h" → CONFIRMOU! Chamar ferramenta para criar evento\n\n';
      
      promptCompleto += '**EXEMPLOS DE NÃO-CONFIRMAÇÃO (NÃO usar @agenda:criar):**\n';
      promptCompleto += '- "quero agendar uma reunião" → Apenas consultar!\n';
      promptCompleto += '- "vocês tem horário disponível?" → Apenas consultar!\n';
      promptCompleto += '- "que horários tem?" → Apenas consultar!\n';
      promptCompleto += '- "talvez..." → Esperar confirmação!\n\n';
      
      promptCompleto += '**REGRA DE OURO:** Se o cliente mencionou um horário específico APÓS você mostrar opções, é uma CONFIRMAÇÃO e você DEVE chamar a ferramenta!\n';
      
      promptCompleto += '\n### INSTRUÇÕES DE FOLLOW-UP (LEMBRETE DE RETORNO) - CRÍTICO!\n';
      promptCompleto += 'O follow-up é um LEMBRETE para você retomar a conversa - DIFERENTE de agendamento que marca reunião.\n\n';
      
      promptCompleto += '**QUANDO USAR FOLLOW-UP (NÃO use @agenda):**\n';
      promptCompleto += '- Lead diz "me liga depois", "fala comigo amanhã", "retorna mais tarde"\n';
      promptCompleto += '- Lead diz "podemos conversar amanhã às 10h" (retomar conversa)\n';
      promptCompleto += '- Lead pede para ser contatado em outro horário\n';
      promptCompleto += '- Você perguntou "quando prefere que eu retome o contato?" e lead respondeu com horário\n';
      promptCompleto += '- Lead diz que agora não pode falar e pede para ligar depois\n\n';
      
      promptCompleto += '**QUANDO USAR AGENDA (NÃO use followup):**\n';
      promptCompleto += '- Lead quer MARCAR UMA REUNIÃO/CONSULTA/ATENDIMENTO presencial ou virtual\n';
      promptCompleto += '- Lead diz "quero agendar uma reunião"\n';
      promptCompleto += '- Lead pergunta "vocês tem horário disponível para consulta?"\n';
      promptCompleto += '- Lead quer um evento com link de Meet/Zoom\n\n';
      
      promptCompleto += '**COMO DIFERENCIAR:**\n';
      promptCompleto += '- Follow-up = "vou te contactar nesse horário" (lembrete SEU para retomar)\n';
      promptCompleto += '- Agenda = "vamos ter uma reunião/compromisso JUNTOS nesse horário" (evento compartilhado)\n\n';
      
      promptCompleto += '**FORMATO DO FOLLOW-UP:**\n';
      promptCompleto += '- Use: @followup:data_iso8601:motivo\n';
      promptCompleto += '- Exemplo: @followup:2025-01-09T23:40:00-03:00:lead pediu para retornar às 23:40\n';
      promptCompleto += '- O sistema criará um lembrete e enviará mensagem automática no horário\n\n';
      
      promptCompleto += '**⚠️ REGRA CRÍTICA FOLLOW-UP:**\n';
      promptCompleto += '- Se você perguntou "quando posso retomar o contato?" e o lead respondeu com horário → USE FOLLOW-UP!\n';
      promptCompleto += '- Se o lead quer marcar reunião/consulta com link de meet → USE AGENDA\n';
      promptCompleto += '- NUNCA consulte disponibilidade (@agenda:consultar) para follow-ups!\n';
      promptCompleto += '- Follow-up NÃO precisa consultar calendário - é apenas um lembrete!\n';
      
      promptCompleto += '\nQuando identificar que uma ação deve ser executada baseado no contexto da conversa, use a ferramenta executar_acao.\n';
      promptCompleto += '\n## REGRAS IMPORTANTES\n';
      promptCompleto += '- NUNCA mencione ao cliente que está executando ações internas como transferências, mudanças de etapa, tags, etc.\n';
      promptCompleto += '- NUNCA inclua comandos @ na sua resposta ao cliente (ex: @transferir, @etapa, @tag).\n';
      promptCompleto += '- As ações são executadas silenciosamente em background. Mantenha o fluxo natural da conversa.\n';
      promptCompleto += '- Quando transferir para outro agente, apenas se despeça naturalmente sem mencionar a transferência.\n';
      
      promptCompleto += '\n## ⚠️ REGRA CRÍTICA: AÇÕES SÃO SILENCIOSAS\n';
      promptCompleto += 'Quando você executa uma ação (como @campo, @tag, @etapa, @nome), a ação é processada INTERNAMENTE.\n';
      promptCompleto += '- **NUNCA** responda com mensagens como "📝 Campo X atualizado para Y"\n';
      promptCompleto += '- **NUNCA** diga "Informação salva", "Registrado", "Campo atualizado"\n';
      promptCompleto += '- **NUNCA** confirme a execução de ações internas ao cliente\n';
      promptCompleto += '- Sua resposta deve ser uma MENSAGEM DE CONVERSA NATURAL\n';
      promptCompleto += '- Após salvar um campo, faça a próxima pergunta ou agradeça e continue normalmente\n';
      promptCompleto += '- Exemplo correto: "Obrigado! E qual é a sua data de nascimento?" (não menciona que salvou email)\n';
      promptCompleto += '- Exemplo ERRADO: "📝 Campo email atualizado para x@y.com" (NUNCA faça isso!)\n';
      promptCompleto += '- Exemplo ERRADO: "📝 Estado registrado: SP" (NUNCA mencione que registrou!)\n';
      promptCompleto += '- Exemplo ERRADO: "Email registrado: x@y.com. Agora..." (NUNCA confirme registro!)\n';
      promptCompleto += '- Exemplo ERRADO: "Ótimo, telefone salvo! Qual seu email?" (NÃO confirme ações!)\n';
      promptCompleto += '- Exemplo ERRADO: Iniciar resposta com emoji 📝 ou qualquer confirmação de sistema\n';
      
      promptCompleto += '\n## ⚠️ REGRA CRÍTICA: UMA AÇÃO POR RESPOSTA\n';
      promptCompleto += 'Você deve executar NO MÁXIMO UMA ou DUAS ações por resposta!\n\n';
      promptCompleto += '**PROIBIDO:**\n';
      promptCompleto += '- Executar 5+ ações de uma vez (nome, campo, campo, campo, followup)\n';
      promptCompleto += '- Revisar todo o histórico para executar ações já processadas anteriormente\n';
      promptCompleto += '- Acumular ações que já deveriam ter sido executadas em turnos anteriores\n\n';
      promptCompleto += '**CORRETO:**\n';
      promptCompleto += '- Executar apenas a ação relevante ao contexto ATUAL da mensagem\n';
      promptCompleto += '- Se o lead responde a uma pergunta específica, execute apenas a ação daquela pergunta\n';
      promptCompleto += '- Informações como nome, email, CPF já foram salvas quando o lead as informou antes\n\n';
      promptCompleto += '**REGRA DE CONTEXTO:**\n';
      promptCompleto += '- Quando você pergunta "qual horário prefere para retorno?" e o lead responde "23:45"\n';
      promptCompleto += '  → Execute APENAS @followup - NÃO revise a conversa para salvar outros dados!\n';
      promptCompleto += '- A resposta do lead está relacionada à sua última pergunta, não a perguntas anteriores\n';
      
      promptCompleto += '\n## EXECUÇÃO OBRIGATÓRIA DE AÇÕES NAS ETAPAS (CRÍTICO)\n';
      promptCompleto += 'Quando a descrição de uma etapa contém ações como @etapa:xxx, @nome, @transferir:xxx, você DEVE chamá-las usando a ferramenta executar_acao.\n';
      promptCompleto += '- NÃO espere confirmação adicional - se a condição da etapa foi atendida, execute TODAS as ações listadas\n';
      promptCompleto += '- Execute as ações IMEDIATAMENTE quando as condições forem satisfeitas\n\n';
      
      promptCompleto += '### REGRA ESPECIAL PARA @nome\n';
      promptCompleto += '- Se a etapa contém @nome (sem valor específico após os dois pontos), significa: "capture o nome que o lead acabou de informar"\n';
      promptCompleto += '- Quando o lead disser seu nome, você DEVE chamar executar_acao com tipo="nome" e valor="<nome_informado>"\n';
      promptCompleto += '- Exemplo: Lead diz "Alison" ou "Me chamo Alison" → executar_acao(tipo="nome", valor="Alison")\n';
      promptCompleto += '- Se houver múltiplas ações na etapa (ex: @nome, @etapa:proposta, @transferir:agente:xxx), execute TODAS elas\n';
    }

    // ========= REGRA CRÍTICA: TEXTO LITERAL OBRIGATÓRIO =========
    promptCompleto += '\n## ⚠️ REGRA CRÍTICA: TEXTO LITERAL OBRIGATÓRIO\n';
    promptCompleto += 'Quando o prompt ou instrução contiver texto entre aspas duplas (ex: "Prazer, [NOME]!"), você DEVE:\n';
    promptCompleto += '1. Usar o texto EXATAMENTE como escrito - é um SCRIPT OBRIGATÓRIO\n';
    promptCompleto += '2. Substituir APENAS os placeholders como [NOME], [EMAIL], etc. pelos valores reais\n';
    promptCompleto += '3. NUNCA parafrasear, resumir, alterar ou ignorar o texto entre aspas\n';
    promptCompleto += '4. NUNCA substituir por mensagens genéricas como "Entendido!", "Processando...", "Olá!", "Certo!"\n\n';
    promptCompleto += '**EXEMPLOS:**\n';
    promptCompleto += '- Instrução: "Prazer, [NOME]! Vou te fazer algumas perguntas rápidas sobre seu plano de saúde..."\n';
    promptCompleto += '- Lead disse: "Allison"\n';
    promptCompleto += '- ✅ CORRETO: "Prazer, Allison! Vou te fazer algumas perguntas rápidas sobre seu plano de saúde..."\n';
    promptCompleto += '- ❌ ERRADO: "Entendido! Estou processando..." (mensagem genérica proibida)\n';
    promptCompleto += '- ❌ ERRADO: "Certo, Allison! Vamos lá..." (paráfrase proibida)\n';
    promptCompleto += '- ❌ ERRADO: "Olá Allison!" (resumo proibido)\n\n';
    promptCompleto += 'O texto entre aspas é a MENSAGEM EXATA que você deve enviar ao cliente. Qualquer desvio é PROIBIDO!\n';
    promptCompleto += '**IMPORTANTE:** NÃO inclua as aspas na sua resposta! As aspas servem apenas para delimitar o script no prompt. Envie o texto SEM as aspas.\n';
    promptCompleto += 'Se o lead responder com "pode seguir", "continua", "sim", "ok" ou algo similar - siga para a próxima pergunta/ação do fluxo usando o texto literal configurado.\n';

    // Detectar placeholders dinâmicos no prompt e adicionar instruções especiais
  // Combinar prompt_sistema + descrição da etapa como UM ÚNICO DOCUMENTO para detecção
  const promptAgente = agente?.prompt_sistema || '';
  let descricaoEtapaTexto = '';
  if (etapaAtualGlobal?.descricao) {
    descricaoEtapaTexto = extractTextFromTiptapJson(etapaAtualGlobal.descricao);
  }
  const documentoCompleto = promptAgente + '\n\n' + descricaoEtapaTexto;
  const instrucoesPlaceholders = detectarAcoesComPlaceholders(documentoCompleto);
    if (instrucoesPlaceholders.length > 0) {
      promptCompleto += '\n## 🔄 SUBSTITUIÇÃO DINÂMICA DE PLACEHOLDERS\n';
      promptCompleto += 'O prompt contém ações com placeholders (ex: {valor-do-lead}). Você DEVE substituí-los pelo valor real:\n';
      instrucoesPlaceholders.forEach(instrucao => {
        promptCompleto += instrucao + '\n';
      });
      promptCompleto += '\n**REGRA CRÍTICA:** NUNCA use o texto literal "{valor-do-lead}" ou similar como valor. ';
      promptCompleto += 'Sempre capture a resposta REAL do lead e use-a na ação!\n';
      promptCompleto += 'Exemplo: Lead diz "Bahia" → Use tipo="campo", valor="estado:Bahia" (NÃO valor="estado:{valor-do-lead}")\n';
    }

    // Adicionar restrições absolutas de escopo
    promptCompleto += '\n## RESTRIÇÕES ABSOLUTAS\n';
    promptCompleto += '- NUNCA invente informações sobre você, sua identidade, sua empresa ou seus serviços.\n';
    promptCompleto += '- Se o lead perguntar "quem é você?", "o que você faz?", "sobre a empresa" ou perguntas similares, responda APENAS com informações que estão explicitamente configuradas acima nas regras gerais, etapas ou perguntas frequentes.\n';
    promptCompleto += '- Se não houver informação suficiente no prompt configurado para responder uma pergunta sobre você ou a empresa, diga educadamente que pode ajudar com outras questões ou solicite que o lead entre em contato com a equipe.\n';
    promptCompleto += '- NUNCA adicione detalhes, funções, serviços ou características que não foram mencionados nas instruções acima.\n';
    promptCompleto += '- Mantenha-se estritamente dentro do escopo das informações fornecidas.\n';

    // Substituir placeholders no prompt com dados do contato
    if (dadosContato) {
      promptCompleto = substituirPlaceholders(promptCompleto, dadosContato, camposPersonalizados);
      console.log('✅ Placeholders substituídos no prompt');
    }

    console.log('Prompt montado com', promptCompleto.length, 'caracteres');
    console.log('Ações disponíveis:', acoesDisponiveis.length);

    // 9. Montar mensagens para a API
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: promptCompleto }
    ];

    if (historico && historico.length > 0) {
      historico.forEach((msg: any) => {
        messages.push({
          role: msg.direcao === 'entrada' ? 'user' : 'assistant',
          content: msg.conteudo
        });
      });
    }

    const ultimaMensagem = historico?.[historico.length - 1];
    if (!ultimaMensagem || ultimaMensagem.conteudo !== mensagem) {
      messages.push({ role: 'user', content: mensagem });
    }

    console.log('Total de mensagens para API:', messages.length);

    // 10. Definir ferramentas (tools) se houver ações configuradas
    const tools = acoesDisponiveis.length > 0 ? [
      {
        type: 'function',
        function: {
          name: 'executar_acao',
          description: 'OBRIGATÓRIO: Executa uma ação automatizada. NUNCA diga que salvou dados, atualizou campos ou criou eventos sem chamar esta função primeiro. Para campo personalizado, use tipo="campo" e valor="nome-do-campo:valor-exato". IMPORTANTE: "followup" é para LEMBRETE DE RETORNO (quando o lead pede para falar depois/amanhã/outro horário). "agenda" é para MARCAR REUNIÃO (com link de meet). Se você perguntou "quando retomo o contato?" e o lead deu horário, use FOLLOW-UP (não agenda)!',
          parameters: {
            type: 'object',
            properties: {
              tipo: {
                type: 'string',
                enum: ['etapa', 'tag', 'transferir', 'notificar', 'finalizar', 'nome', 'negociacao', 'agenda', 'campo', 'obter', 'followup', 'verificar_cliente', 'ir_etapa'],
                description: 'Tipo da ação. IMPORTANTE - DIFERENÇA ENTRE FOLLOWUP E AGENDA: Use "followup" para LEMBRETE de retorno (lead disse "me liga amanhã", "fala comigo mais tarde", etc - NÃO precisa consultar calendário!). Use "agenda" para REUNIÃO com horário marcado e link de meet (lead quer consulta/reunião - PRECISA consultar disponibilidade primeiro). Se você perguntou "quando retomo o contato" e lead deu horário, é FOLLOW-UP! Use "verificar_cliente" para verificar no CRM se o lead é um cliente existente (etapa marcada como tipo cliente). Use "ir_etapa" para avançar o lead para outra etapa do fluxo de atendimento.',
              },
              valor: {
                type: 'string',
                description: 'Valor da ação. Para "followup": "data_iso8601:motivo" (ex: "2025-01-10T14:00:00-03:00:lead pediu retorno às 14h") - NÃO consulte calendário! Para "agenda": "consultar" primeiro, depois "criar:titulo|data_iso8601". Para "campo": "nome-do-campo:valor com espaços" (hífens SÓ no nome do campo, NUNCA no valor! Ex: nome-completo:João da Silva). Para "nome": nome completo do lead. Para "verificar_cliente": não precisa de valor. Para "ir_etapa": número da etapa (ex: "2").',
              },
            },
            required: ['tipo'],
          },
        },
      },
    ] : undefined;

    // 11. Verificar se chave OpenAI está configurada (OBRIGATÓRIO)
    if (!hasOpenAIKey) {
      console.log('❌ Chave OpenAI não configurada - agente não pode responder');
      return new Response(
        JSON.stringify({ 
          error: 'Chave OpenAI não configurada. Configure a chave da API OpenAI em Integrações para o agente IA funcionar.', 
          should_respond: false 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const modelo = agente.modelo || 'gpt-4o-mini';
    const maxTokens = agente.max_tokens || 1000;
    const temperatura = agente.temperatura || 0.7;

    // Criar função de execução de agenda para passar para as chamadas de IA
    const executarAgendaFn = async (valor: string) => {
      return await executarAgendaLocal(supabase, supabaseUrl, supabaseKey, conta_id, conversa_id, contatoId, valor, agente.id);
    };

    // Detectar se é uma confirmação de agendamento para forçar uso de ferramenta
    const historicoTextos = historico?.map((m: any) => m.conteudo) || [];
    const forcarFerramentaAgenda = detectarConfirmacaoAgendamento(mensagem, historicoTextos);
    const contextoFollowUp = detectarContextoFollowUp(historicoTextos);
    
    if (forcarFerramentaAgenda) {
      console.log('🎯 [AGENDAMENTO] Forçando uso de ferramenta - confirmação detectada');
    }
    
    // Se estamos em contexto de follow-up, adicionar nota especial ao prompt
    if (contextoFollowUp) {
      console.log('📌 [FOLLOW-UP] Contexto de follow-up detectado - adicionando instrução ao prompt');
      const notaFollowUp = '\n\n## ⚠️ CONTEXTO DE FOLLOW-UP DETECTADO\n' +
        'O histórico indica que você está combinando um RETORNO DE CONTATO (follow-up), NÃO uma reunião.\n' +
        'Quando o lead informar o horário preferido:\n' +
        '1. Use @followup:data_iso8601:motivo (NÃO use @agenda:consultar!)\n' +
        '2. Exemplo: @followup:2025-01-10T14:00:00-03:00:lead pediu retorno às 14h\n' +
        '3. NÃO consulte disponibilidade - follow-up é apenas um lembrete!\n' +
        '4. Confirme que vai retomar o contato no horário indicado.\n';
      
      // Adicionar no início das mensagens do sistema
      messages[0].content += notaFollowUp;
    }

    let result: AIResponse;

    // Criar função de verificação de cliente para passar para as chamadas de IA
    const executarVerificarClienteFn = async () => {
      return await executarVerificarCliente(supabase, conta_id, conversa_id, contatoId);
    };

    // Forçar tool_choice se há placeholders E a mensagem parece conter uma resposta (não é saudação)
    const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello', 'hi'];
    const ehSaudacao = saudacoes.some(s => mensagem.toLowerCase().trim().startsWith(s));
    const temPlaceholdersDinamicos = instrucoesPlaceholders.length > 0;
    
    let forcarToolChoice = forcarFerramentaAgenda;
    if (temPlaceholdersDinamicos && !ehSaudacao && !forcarToolChoice) {
      console.log('🔧 [TOOL CHOICE] Forçando uso de ferramenta - placeholders dinâmicos detectados');
      forcarToolChoice = true;
    }

    // Usar OpenAI (único provedor suportado)
    try {
      console.log('Usando OpenAI com modelo:', modelo);
      result = await callOpenAI(conta.openai_api_key, messages, modelo, maxTokens, temperatura, tools, executarAgendaFn, forcarToolChoice, executarVerificarClienteFn);
      console.log('✅ Resposta via OpenAI');
    } catch (openaiError: any) {
      const errorMsg = openaiError.message || '';
      console.error('❌ Erro OpenAI:', errorMsg);
      return new Response(
        JSON.stringify({ error: `Erro OpenAI: ${errorMsg}`, should_respond: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Resposta gerada via', result.provider + ':', result.resposta.substring(0, 100) + '...');

    // 12. Salvar uso de tokens e log de atividade
    if (result.tokens && result.tokens.total_tokens > 0) {
      console.log('Salvando uso de tokens:', result.tokens);
      try {
        await supabase.from('uso_tokens').insert({
          conta_id,
          conversa_id,
          provider: result.provider,
          modelo,
          prompt_tokens: result.tokens.prompt_tokens,
          completion_tokens: result.tokens.completion_tokens,
          total_tokens: result.tokens.total_tokens,
          custo_estimado: calcularCustoEstimado(result.provider, modelo, result.tokens),
        });
      } catch (tokenError) {
        console.error('Erro ao salvar uso de tokens:', tokenError);
      }
    }

    // 🆕 Variável para rastrear se houve mudança de etapa (para gerar nova resposta depois)
    let novaEtapaExecutada: { id: string; nome: string; numero: number; descricao: string | null } | null = null;

    // 13. Executar ações se houver
    if (result.acoes && result.acoes.length > 0 && contatoId) {
      console.log('Executando', result.acoes.length, 'ações...');
      
      // 🆕 FILTRO DE AÇÕES CONFIGURADAS: Só executar ações que estão no prompt
      // Detectar quais ações estão explicitamente configuradas no prompt/etapa
      const promptAgenteFiltro = agente?.prompt_sistema || '';
      let descricaoEtapaFiltro = '';
      if (etapaAtualGlobal?.descricao) {
        descricaoEtapaFiltro = extractTextFromTiptapJson(etapaAtualGlobal.descricao);
      }
      const documentoFiltro = (promptAgenteFiltro + '\n' + descricaoEtapaFiltro).toLowerCase();
      
      // Mapear quais ações estão permitidas pelo prompt
      const acoesPermitidas = new Set<string>(['nome']); // Sempre permitir captura de nome
      
      // 🆕 Extrair quais campos ESPECÍFICOS estão configurados no prompt
      const camposConfiguradosFiltro = new Set<string>();
      const regexCamposFiltro = /@campo:([a-zA-Z0-9\-_]+)/gi;
      let matchCampoFiltro;
      while ((matchCampoFiltro = regexCamposFiltro.exec(documentoFiltro)) !== null) {
        camposConfiguradosFiltro.add(matchCampoFiltro[1].toLowerCase());
      }
      
      // Se há pelo menos um campo configurado, permitir ação 'campo' (será filtrada por nome específico abaixo)
      if (camposConfiguradosFiltro.size > 0) {
        acoesPermitidas.add('campo');
      }
      
      console.log('📋 [FILTRO] Campos específicos configurados:', Array.from(camposConfiguradosFiltro));
      
      if (documentoFiltro.includes('@negociacao') || documentoFiltro.includes('@negociaçao')) {
        acoesPermitidas.add('negociacao');
      }
      if (documentoFiltro.includes('@etapa') || documentoFiltro.includes('@ir_etapa')) {
        acoesPermitidas.add('etapa');
        acoesPermitidas.add('ir_etapa');
      }
      if (documentoFiltro.includes('@followup')) {
        acoesPermitidas.add('followup');
      }
      if (documentoFiltro.includes('@transferir')) {
        acoesPermitidas.add('transferir');
      }
      if (documentoFiltro.includes('@finalizar')) {
        acoesPermitidas.add('finalizar');
      }
      if (documentoFiltro.includes('@tag')) {
        acoesPermitidas.add('tag');
      }
      if (documentoFiltro.includes('@agenda')) {
        acoesPermitidas.add('agenda');
      }
      
      console.log('📋 [FILTRO] Ações permitidas pelo prompt:', Array.from(acoesPermitidas));
      
      // 🆕 FILTRO CONTEXTUAL MELHORADO: Detectar qual campo está sendo PEDIDO
      // Encontrar a última mensagem de ENTRADA (do lead) e a mensagem do agente ANTES dela
      const mensagensEntrada = historico.filter((m: { direcao: string }) => m.direcao === 'entrada');
      const ultimaEntrada = mensagensEntrada.slice(-1)[0];
      
      // Buscar a última mensagem do agente que veio ANTES da última entrada do lead
      let ultimaMensagemAgente = '';
      if (ultimaEntrada) {
        const mensagensAgente = historico.filter((m: { direcao: string; created_at: string }) => 
          m.direcao === 'saida' && new Date(m.created_at) < new Date(ultimaEntrada.created_at)
        );
        ultimaMensagemAgente = mensagensAgente.slice(-1)[0]?.conteudo?.toLowerCase() || '';
      } else {
        // Fallback: pegar última mensagem de saída
        ultimaMensagemAgente = historico
          .filter((m: { direcao: string }) => m.direcao === 'saida')
          .slice(-1)[0]?.conteudo?.toLowerCase() || '';
      }
      
      console.log('📋 [CONTEXTO] Última pergunta do agente:', ultimaMensagemAgente.substring(0, 150));
      
      // 🆕 DETECÇÃO POR SCORE: Evitar confusão com palavras genéricas como "plano"
      const stopwords = new Set(['do', 'da', 'de', 'seu', 'sua', 'qual', 'como', 'que', 'por', 'para', 'com', 'em', 'um', 'uma', 'nos', 'nos', 'voce', 'você', 'meu', 'minha', 'seu', 'sua', 'o', 'a', 'os', 'as', 'é', 'e', 'plano', 'saude', 'saúde']);
      
      const detectarCampoEsperado = (pergunta: string, camposDisponiveis: Set<string>): string | null => {
        if (!pergunta || camposDisponiveis.size === 0) return null;
        
        // Normalizar pergunta (remover acentos e pontuação)
        const perguntaNorm = pergunta
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[?!.,;:]/g, '')
          .toLowerCase();
        
        let melhorCampo: string | null = null;
        let melhorScore = 0;
        
        for (const campo of camposDisponiveis) {
          // Converter "tipo-do-seu-plano" para palavras separadas
          const palavrasCampo = campo.split('-').map(p => 
            p.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
          );
          
          let score = 0;
          
          // Verificar frase completa (ex: "operadora do plano")
          const fraseCompleta = palavrasCampo.join(' ');
          if (perguntaNorm.includes(fraseCompleta)) {
            score += 100;
          }
          
          // Contar palavras relevantes (não stopwords) que aparecem na pergunta
          for (const palavra of palavrasCampo) {
            if (palavra.length < 3 || stopwords.has(palavra)) continue;
            
            if (perguntaNorm.includes(palavra)) {
              // Palavra forte (tipo, operadora, estado, valor, cnpj, etc.)
              score += 30;
              
              // Bonus se a palavra aparece como palavra inteira (não substring)
              const regex = new RegExp(`\\b${palavra}\\b`, 'i');
              if (regex.test(perguntaNorm)) {
                score += 20;
              }
            }
          }
          
          if (score > melhorScore) {
            melhorScore = score;
            melhorCampo = campo;
          }
        }
        
        // Só retornar se tiver score mínimo aceitável (evita falsos positivos)
        const scoreMinimo = 30;
        console.log('📋 [CONTEXTO] Score do campo detectado:', melhorCampo, '=', melhorScore);
        
        return melhorScore >= scoreMinimo ? melhorCampo : null;
      };
      
      const campoEsperado = detectarCampoEsperado(ultimaMensagemAgente, camposConfiguradosFiltro);
      console.log('📋 [CONTEXTO] Campo esperado baseado na pergunta:', campoEsperado || 'nenhum detectado (fallback ativado)');
      
      // Filtrar ações que o modelo inventou (não estão no prompt)
      const acoesOriginais = [...result.acoes];
      const acoesFiltradas = result.acoes.filter(a => {
        // Ações de agenda/verificar são sempre permitidas (executadas no tool-calling)
        if (['agenda', 'verificar_cliente'].includes(a.tipo)) return true;
        
        // 🆕 FILTRO ESPECÍFICO PARA CAMPOS: verificar se o campo específico está configurado E é o esperado
        if (a.tipo === 'campo') {
          // Extrair nome do campo da ação (ex: "estado:Bahia" -> "estado")
          const nomeCampoAcao = a.valor?.split(':')[0]?.toLowerCase().trim();
          if (!nomeCampoAcao) {
            console.log('⚠️ [FILTRO] Campo sem nome válido, descartando:', a.valor);
            return false;
          }
          
          // Primeiro: verificar se o campo está configurado no prompt
          if (!camposConfiguradosFiltro.has(nomeCampoAcao)) {
            console.log('⚠️ [FILTRO] Campo não configurado no prompt, descartando:', nomeCampoAcao, '| Configurados:', Array.from(camposConfiguradosFiltro));
            return false;
          }
          
          // 🆕 Segundo: se detectamos um campo esperado pelo contexto, só permitir esse campo
          if (campoEsperado && nomeCampoAcao !== campoEsperado) {
            console.log('⛔ [CONTEXTO] Campo bloqueado (não é o esperado pelo contexto):', nomeCampoAcao, '| Esperado:', campoEsperado);
            return false;
          }
          
          // 🆕 Fallback: se não detectou contexto, ainda assim permitir (mas limitar a 1 campo por msg)
          console.log('✅ [FILTRO] Campo permitido:', nomeCampoAcao, campoEsperado ? '(contexto)' : '(fallback)');
          return true;
        }
        
        // Verificar se a ação está permitida
        return acoesPermitidas.has(a.tipo);
      });
      
      const acoesDescartadas = acoesOriginais.filter(a => !acoesFiltradas.includes(a));
      if (acoesDescartadas.length > 0) {
        console.log('⚠️ [FILTRO] Ações descartadas:', acoesDescartadas.map(a => `${a.tipo}:${a.valor?.substring(0, 30)}`));
      }
      
      // Usar ações filtradas a partir daqui
      result.acoes = acoesFiltradas;
      
      // 🆕 DEDUPLICAÇÃO: Remover ações estruturais duplicadas (ex: 3x finalizar -> 1x finalizar)
      const tiposEstruturaisDedup = ['etapa', 'ir_etapa', 'followup', 'transferir', 'finalizar', 'tag', 'negociacao', 'notificar'];
      const acoesVistasPorTipo = new Set<string>();
      const acoesDedupicadas: Acao[] = [];
      let duplicatasRemovidas = 0;
      
      for (const acao of result.acoes) {
        // Para ações estruturais, criar chave única por tipo+valor
        if (tiposEstruturaisDedup.includes(acao.tipo)) {
          const chave = `${acao.tipo}:${acao.valor || ''}`;
          if (acoesVistasPorTipo.has(chave)) {
            console.log(`🔄 [DEDUP] Ação duplicada ignorada: ${chave}`);
            duplicatasRemovidas++;
            continue;
          }
          acoesVistasPorTipo.add(chave);
        }
        acoesDedupicadas.push(acao);
      }
      
      if (duplicatasRemovidas > 0) {
        console.log(`⚠️ [DEDUP] Removidas ${duplicatasRemovidas} ações duplicadas`);
      }
      console.log(`🔄 [DEDUP] ${acoesDedupicadas.length} ações após deduplicação (de ${result.acoes.length})`);
      
      // Substituir result.acoes pela versão deduplicada
      result.acoes = acoesDedupicadas;
      
      // BLINDAGEM MELHORADA: Preservar ações de CAPTURA (campo, nome) enquanto limita ações estruturais
      // IMPORTANTE: Não contar ações já executadas no tool-calling (agenda, verificar_cliente)
      const acoesJaExecutadas = ['agenda', 'verificar_cliente'];
      const acoesExecutaveis = result.acoes.filter(a => !acoesJaExecutadas.includes(a.tipo));
      let acoesParaExecutar = result.acoes;
      
      console.log('📊 [AÇÕES] Total:', result.acoes.length, '| Executáveis:', acoesExecutaveis.length);
      console.log('📊 [AÇÕES] Tipos:', result.acoes.map(a => a.tipo).join(', '));
      
      // Separar ações em grupos:
      // Grupo A (SEMPRE manter - são críticas para captura de dados): campo, nome
      // Grupo B (estruturais - limitar a 1): etapa, ir_etapa, followup, transferir, finalizar, tag, negociacao
      const acoesCaptura = acoesExecutaveis.filter(a => ['campo', 'nome'].includes(a.tipo));
      const acoesEstruturais = acoesExecutaveis.filter(a => !['campo', 'nome'].includes(a.tipo));
      
      console.log('📊 [BLINDAGEM] Captura:', acoesCaptura.length, '| Estruturais:', acoesEstruturais.length);
      
      // Nova lógica: SEMPRE preservar ações de captura (até 5 por segurança)
      // Para ações estruturais, limitar a 1 (a mais prioritária)
      // 🆕 Ativar blindagem também se houver mais de 1 ação estrutural (mesmo com poucas ações totais)
      if (acoesEstruturais.length > 1 || acoesExecutaveis.length > 3) {
        console.log('⚠️ [BLINDAGEM] Agente tentou executar', acoesExecutaveis.length, 'ações executáveis de uma vez!');
        console.log('Ações detectadas:', result.acoes.map(a => `${a.tipo}:${a.valor?.substring(0, 30)}`));
        
        // Prioridade para ações estruturais: negociacao PRIMEIRO, depois ir_etapa > followup > etc
        const prioridade = ['negociacao', 'ir_etapa', 'etapa', 'followup', 'agenda', 'transferir', 'finalizar', 'tag'];
        let acaoEstrutural = null;
        for (const tipo of prioridade) {
          const encontrada = acoesEstruturais.find(a => a.tipo === tipo);
          if (encontrada) {
            acaoEstrutural = encontrada;
            break;
          }
        }
        
        // Construir lista final: já executadas + captura (até 5) + 1 estrutural
        const capturaLimitada = acoesCaptura.slice(0, 5);
        acoesParaExecutar = [
          ...result.acoes.filter(a => acoesJaExecutadas.includes(a.tipo)),
          ...capturaLimitada,
        ];
        
        if (acaoEstrutural) {
          acoesParaExecutar.push(acaoEstrutural);
          console.log('✅ [BLINDAGEM] Mantendo', capturaLimitada.length, 'ações de captura +', 'ação estrutural:', acaoEstrutural.tipo);
        } else {
          console.log('✅ [BLINDAGEM] Mantendo apenas', capturaLimitada.length, 'ações de captura (sem estrutural)');
        }
        
        // Logar esse comportamento
        try {
          await supabase.from('logs_atividade').insert({
            conta_id,
            tipo: 'info_ia_acoes_filtradas',
            descricao: `Blindagem aplicada: ${acoesCaptura.length} captura, ${acoesEstruturais.length} estruturais -> ${acoesParaExecutar.length} executadas`,
            metadata: {
              acoes_originais: acoesOriginais.map(a => ({ tipo: a.tipo, valor: a.valor?.substring(0, 100) })),
              acoes_filtradas: acoesFiltradas.map(a => ({ tipo: a.tipo, valor: a.valor?.substring(0, 100) })),
              acoes_executadas: acoesParaExecutar.map(a => ({ tipo: a.tipo, valor: a.valor?.substring(0, 100) })),
              acoes_descartadas: acoesDescartadas.map(a => ({ tipo: a.tipo, valor: a.valor?.substring(0, 100) })),
              mensagem_cliente: mensagem?.substring(0, 200),
            },
          });
        } catch (logError) {
          console.error('Erro ao logar blindagem:', logError);
        }
      }
      
      for (const acao of acoesParaExecutar) {
        // Pular TODAS as ações de agenda (consultar E criar) - já foram executadas durante o tool-calling
        if (acao.tipo === 'agenda') {
          console.log('Pulando ação de agenda (já executada durante tool-calling):', acao.valor);
          continue;
        }
        
        // Pular ação verificar_cliente - já foi executada durante tool-calling
        if (acao.tipo === 'verificar_cliente') {
          console.log('Pulando ação verificar_cliente (já executada durante tool-calling)');
          continue;
        }
        
        // 🔧 BLINDAGEM: Para ações de campo, substituir {valor-do-lead} ou valor vazio pela mensagem EXATA do lead
        let acaoCorrigida = { ...acao };
        if (acao.tipo === 'campo' && acao.valor) {
          const valorOriginal = acao.valor;
          const partes = valorOriginal.split(':');
          const nomeCampo = partes[0] || '';
          const valorCampo = partes.slice(1).join(':').trim();
          
          // Detectar se é placeholder ou valor vazio
          const ehPlaceholder = valorCampo === '{valor-do-lead}' || 
                                valorCampo === '{resposta-do-lead}' ||
                                valorCampo === '{resposta}' ||
                                valorCampo.startsWith('{') ||
                                valorCampo === '' ||
                                !valorCampo;
          
          if (ehPlaceholder) {
            console.log(`🔧 [BLINDAGEM CAMPO] Detectado placeholder/vazio em ação campo: "${valorOriginal}"`);
            console.log(`🔧 [BLINDAGEM CAMPO] Mensagem EXATA do lead: "${mensagem}"`);
            
            // IMPORTANTE: Usar a mensagem do lead EXATAMENTE como veio, sem extrações "inteligentes"
            // Apenas trim para remover espaços em branco nas pontas
            const valorReal = mensagem.trim();
            
            // Atualizar a ação com o valor real (sem filtrar NADA)
            acaoCorrigida.valor = `${nomeCampo}:${valorReal}`;
            console.log(`✅ [BLINDAGEM CAMPO] Valor salvo EXATAMENTE: "${acaoCorrigida.valor}"`);
          }
        }
        
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/executar-acao`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              acao: acaoCorrigida,
              conversa_id,
              contato_id: contatoId,
              conta_id,
            }),
          });
          
          const resultado = await response.json();
          console.log('Resultado da ação:', resultado);
          
          // Log extra para ações de campo
          if (acao.tipo === 'campo') {
            console.log(`📝 [AUDIT CAMPO] Ação original: ${JSON.stringify(acao)}`);
            console.log(`📝 [AUDIT CAMPO] Ação enviada: ${JSON.stringify(acaoCorrigida)}`);
            console.log(`📝 [AUDIT CAMPO] Resposta executar-acao: ${JSON.stringify(resultado)}`);
          }
        } catch (e) {
          console.error('Erro ao executar ação:', e);
        }
      }
    }

    // Limpar comandos @ que possam ter vazado para o texto da resposta
    let respostaFinal = result.resposta;
    respostaFinal = respostaFinal.replace(/@(etapa|tag|transferir|notificar|finalizar|nome|negociacao|agenda|campo|obter|ir_etapa)(?::[^\s@.,!?]+(?::[^\s@.,!?]+)?)?/gi, '').trim();
    respostaFinal = respostaFinal.replace(/\s{2,}/g, ' ').trim();
    
    // Remover aspas literais no início e fim da resposta
    // (modelo às vezes inclui aspas do prompt como parte da resposta)
    respostaFinal = respostaFinal.replace(/^[""]/, '').replace(/[""]$/, '').trim();
    respostaFinal = respostaFinal.replace(/^"/, '').replace(/"$/, '').trim();
    
    // Remover @ antes de nomes próprios na resposta (ex: @Allison -> Allison)
    respostaFinal = respostaFinal.replace(/@([A-ZÀ-Ú][a-zà-ú]+)/g, '$1');
    
    // Remover menções de transferência que possam ter escapado (reforçado)
    respostaFinal = respostaFinal.replace(/estou transferindo.*?(humano|agente|atendente).*?\./gi, '').trim();
    respostaFinal = respostaFinal.replace(/vou transferir.*?\./gi, '').trim();
    respostaFinal = respostaFinal.replace(/estou (te )?transferindo.*?\./gi, '').trim();
    respostaFinal = respostaFinal.replace(/já estou transferindo.*?\./gi, '').trim();
    respostaFinal = respostaFinal.replace(/^(Entendido!?\s*)?Estou processando sua (solicitação|transferência)[^.]*\.?\s*$/gi, '').trim();
    respostaFinal = respostaFinal.replace(/^(Certo!?\s*)?(Entendido!?\s*)?Processando.*$/gi, '').trim();
    respostaFinal = respostaFinal.replace(/sua solicitação.*?transferida.*?\./gi, '').trim();
    respostaFinal = respostaFinal.replace(/transferindo (você|sua conversa|seu atendimento).*?\./gi, '').trim();
    
    // Remover mensagens de sistema que a IA possa ter gerado (confirmações de ações)
    respostaFinal = respostaFinal.replace(/^(📝|📊|🏷️|✏️|💼|📅|🔍|⚙️|🔒|👤|🤖|↔️|🔔)\s*Campo\s*"[^"]+"\s*atualizado\s*(para\s*)?"[^"]+"\s*\.?\s*/gi, '').trim();
    respostaFinal = respostaFinal.replace(/^(📝|📊|🏷️|✏️|💼|📅|🔍|⚙️|🔒|👤|🤖|↔️|🔔)\s*Campo\s+\S+\s*atualizado\s*(para\s*)?\S+\s*\.?\s*/gi, '').trim();
    respostaFinal = respostaFinal.replace(/^Ação\s*(será\s*)?(executada|registrada)\s*(automaticamente|internamente)?\.?\s*/gi, '').trim();
    respostaFinal = respostaFinal.replace(/^Informação\s*(salva|registrada|atualizada)\.?\s*/gi, '').trim();
    respostaFinal = respostaFinal.replace(/^(Registro|Dados?)\s*(salvos?|atualizados?|registrados?)\.?\s*/gi, '').trim();
    
    // Novos filtros para padrões "registrado:", "salvo:", etc.
    // Padrão: "📝 Estado registrado: Bahia (BA)" ou "Email registrado: test@email.com"
    respostaFinal = respostaFinal.replace(/^(📝|📊|🏷️|✏️|💼|📅|🔍|⚙️|🔒|👤|🤖|↔️|🔔)?\s*\w+\s+(registrado|salvo|atualizado|gravado|armazenado):\s*[^\n]+\s*/gi, '').trim();
    
    // Padrão mais genérico: começa com emoji + qualquer "X registrado/salvo"
    respostaFinal = respostaFinal.replace(/^(📝|📊|🏷️|✏️|💼|📅|🔍|⚙️|🔒|👤|🤖|↔️|🔔)\s*[^.!?]+\s*(registrado|salvo|atualizado|gravado)[^.!?]*[.!?]?\s*/gi, '').trim();
    
    // Padrão: "Perfeito, estado registrado!" ou similar no início
    respostaFinal = respostaFinal.replace(/^(Perfeito|Ótimo|Certo|OK|Entendi|Anotado)[,!.]?\s*[^.!?]*\s*(registrado|salvo|atualizado|gravado)[^.!?]*[.!?]?\s*/gi, '').trim();
    
    // Padrão: 📝 Campo "operadora-do-plano" atualizado para "Amil" (formato com aspas)
    respostaFinal = respostaFinal.replace(/📝\s*Campo\s*"[^"]+"\s*(atualizado|registrado|salvo)\s*para\s*"[^"]+"\s*\.?\s*/gi, '').trim();
    
    // Padrão mais amplo: qualquer confirmação com "atualizado para" ou "registrado como"
    respostaFinal = respostaFinal.replace(/[^\n]*\s*(atualizado|registrado|salvo)\s*(para|como)\s*"[^"]+"\s*\.?\s*/gi, '').trim();
    
    // FALLBACK DESATIVADO: Não executar ações de campo automaticamente
    // Isso causava coleta automática mesmo quando o prompt não pedia
    // Agora só executa ações se forem explicitamente configuradas no prompt
    console.log('🔧 [FALLBACK] Fallback de campo DESATIVADO - somente ações explícitas do prompt são executadas');
    
    // Detectar se a resposta inteira é uma mensagem de sistema e gerar fallback
    const ehApenasMensagemSistema = /^(📝|📊|🏷️|✏️|💼|📅|🔍|⚙️|🔒|👤|🤖|↔️|🔔)/.test(result.resposta) &&
                                    (result.resposta.includes('atualizado para') ||
                                     result.resposta.includes('atualizado:') ||
                                     result.resposta.includes('registrado:') ||
                                     result.resposta.includes('salvo:') ||
                                     result.resposta.includes('Campo "') ||
                                     result.resposta.includes('executada'));
    
    if (ehApenasMensagemSistema || respostaFinal.length < 10) {
      console.log('⚠️ [VALIDAÇÃO] Resposta parece ser mensagem de sistema, gerando fallback...');
      console.log('Resposta original:', result.resposta);
      respostaFinal = 'Perfeito! Posso ajudar com mais alguma coisa?';
    }

    // VALIDAÇÃO FINAL: Detectar se a IA inventou um agendamento sem chamar a ferramenta
    const temAcaoAgendaCriar = result.acoes?.some(a => a.tipo === 'agenda' && a.valor?.startsWith('criar:'));
    const respostaLower = respostaFinal.toLowerCase();
    
    // Padrões que indicam que a IA disse que agendou
    const padroesFalsoAgendamento = [
      /reuni(ã|a)o.*agendad[ao]/i,
      /agendad[ao].*sucesso/i,
      /pronto.*agend(ei|ado|ada)/i,
      /meet\.google\.com/i,
      /link.*meet/i,
      /meet.*link/i,
      /confirmad[ao].*agenda/i,
      /sua reuni(ã|a)o.*marcad[ao]/i,
      /evento.*criad[ao]/i,
    ];
    
    const mencionouAgendamento = padroesFalsoAgendamento.some(p => p.test(respostaFinal));
    
    if (mencionouAgendamento && !temAcaoAgendaCriar) {
      console.log('⚠️ [VALIDAÇÃO] IA mencionou agendamento sem chamar ferramenta! Corrigindo resposta...');
      console.log('Resposta original:', respostaFinal.substring(0, 200));
      
      // Logar esse comportamento problemático
      try {
        await supabase.from('logs_atividade').insert({
          conta_id,
          tipo: 'erro_ia_agendamento_falso',
          descricao: 'IA inventou agendamento sem chamar ferramenta executar_acao',
          metadata: { 
            resposta_original: respostaFinal.substring(0, 500),
            mensagem_cliente: mensagem,
            acoes_executadas: result.acoes || [],
          },
        });
      } catch (logError) {
        console.error('Erro ao logar agendamento falso:', logError);
      }
      
      // Substituir resposta por uma genérica pedindo confirmação
      respostaFinal = 'Desculpe, houve um problema ao processar o agendamento. Poderia confirmar novamente o horário desejado para que eu possa criar a reunião?';
    }

    return new Response(
      JSON.stringify({ 
        resposta: respostaFinal, 
        should_respond: true, 
        provider: result.provider,
        acoes_executadas: result.acoes?.length || 0,
        mensagem_ja_salva: result.mensagemJaSalva || false,  // Flag para evitar duplicação
        mensagemJaSalva: result.mensagemJaSalva || false,    // Compat camelCase
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro no ai-responder:', errorMessage);
    
    // Logar erro no sistema
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Tentar obter conta_id do body se disponível
      await supabase.from('logs_atividade').insert({
        conta_id: '00000000-0000-0000-0000-000000000000', // fallback
        tipo: 'erro_ia',
        descricao: `Erro no ai-responder: ${errorMessage}`,
        metadata: { error: errorMessage },
      });
    } catch (logError) {
      console.error('Erro ao logar erro:', logError);
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage, should_respond: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
