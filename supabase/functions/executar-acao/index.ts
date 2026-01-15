import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Acao {
  tipo: 'etapa' | 'tag' | 'transferir' | 'notificar' | 'finalizar' | 'nome' | 'negociacao' | 'agenda' | 'campo' | 'obter' | 'followup';
  valor?: string;
}

// Gerar mensagem de sistema para rastreamento interno
function gerarMensagemSistema(tipo: string, valor: string | undefined, resultado: string): string {
  switch (tipo) {
    case 'etapa':
      return `📊 Lead movido para etapa "${valor}"`;
    case 'tag':
      return `🏷️ Tag "${valor}" adicionada ao contato`;
    case 'transferir':
      if (valor === 'humano' || valor === 'usuario') {
        return `👤 Conversa transferida para atendente humano`;
      } else if (valor === 'ia') {
        return `🤖 Conversa retornada para agente IA principal`;
      } else if (valor?.startsWith('agente:')) {
        const agenteName = valor.replace('agente:', '').replace(/-/g, ' ').trim();
        return `🤖 Conversa transferida para agente "${agenteName}"`;
      }
      return `↔️ Transferência realizada`;
    case 'notificar':
      return `🔔 Notificação: ${valor || 'Nova ação'}`;
    case 'finalizar':
      return `🔒 Conversa encerrada pelo agente IA`;
    case 'nome':
      return `✏️ Nome do contato alterado para "${valor}"`;
    case 'negociacao':
      return `💼 Nova negociação criada: ${valor || 'Lead'}`;
    case 'agenda':
      if (valor === 'consultar') {
        return `📅 Agenda consultada para verificar disponibilidade`;
      } else if (valor?.startsWith('criar:')) {
        return `📅 Evento criado na agenda: ${valor.replace('criar:', '')}`;
      }
      return `📅 Ação de agenda executada`;
    case 'campo':
      const partesCampo = valor?.split(':') || [];
      const nomeCampo = partesCampo[0]?.replace(/-/g, ' ');
      const valorCampo = partesCampo.slice(1).join(':');
      return `📝 Campo "${nomeCampo}" atualizado para "${valorCampo}"`;
    case 'obter':
      return `🔍 Campo "${valor?.replace(/-/g, ' ')}" consultado`;
    case 'followup': {
      // Extrair data e motivo do valor
      const partes = valor?.split(':') || [];
      // Formato: data_iso:motivo (motivo pode conter ":")
      if (partes.length >= 2) {
        try {
          // Reconstruir a data ISO (que pode ter ":" dentro)
          const dataStr = partes.slice(0, 3).join(':'); // 2025-01-10T14:00:00
          const motivo = partes.slice(3).join(':') || 'retorno agendado';
          const data = new Date(dataStr);
          const dataFormatada = data.toLocaleString('pt-BR', { 
            day: '2-digit', 
            month: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          return `📅 Follow-up agendado para ${dataFormatada} - ${motivo}`;
        } catch {
          return `📅 Follow-up agendado: ${valor}`;
        }
      }
      return `📅 Follow-up agendado`;
    }
    default:
      return `⚙️ Ação executada: ${tipo}`;
  }
}

// Função para mapear nome de etapa para UUID
// Suporta formato: "nome-estagio" ou "nome-funil/nome-estagio"
async function mapearEtapaPorNome(
  supabase: any,
  contaId: string,
  nomeEtapa: string
): Promise<string | null> {
  // Verificar se tem formato funil/etapa
  const partes = nomeEtapa.split('/');
  let nomeFunil: string | null = null;
  let nomeEtapaReal: string;
  
  if (partes.length === 2) {
    // Formato: funil/etapa
    nomeFunil = partes[0].toLowerCase().replace(/[.,;!?]+$/, '').replace(/-/g, ' ').trim();
    nomeEtapaReal = partes[1].toLowerCase().replace(/[.,;!?]+$/, '').replace(/-/g, ' ').trim();
    console.log(`Formato funil/etapa detectado: funil="${nomeFunil}", etapa="${nomeEtapaReal}"`);
  } else {
    // Formato antigo: apenas etapa
    nomeEtapaReal = nomeEtapa.toLowerCase().replace(/[.,;!?]+$/, '').replace(/-/g, ' ').trim();
    console.log(`Formato simples: etapa="${nomeEtapaReal}"`);
  }
  
  console.log(`Buscando etapa para conta ${contaId}`);

  // Buscar todos os funis da conta (com nome para filtrar se necessário)
  const { data: funis, error: funisError } = await supabase
    .from('funis')
    .select('id, nome')
    .eq('conta_id', contaId);

  if (funisError || !funis?.length) {
    console.log('Nenhum funil encontrado para a conta');
    return null;
  }

  console.log(`Funis encontrados: ${funis.map((f: any) => f.nome).join(', ')}`);

  // Se especificou funil, filtrar apenas IDs desse funil
  let funilIds = funis.map((f: any) => f.id);
  
  if (nomeFunil) {
    const funilEncontrado = funis.find((f: any) => {
      const nomeNormalizado = f.nome.toLowerCase().replace(/-/g, ' ').trim();
      return nomeNormalizado === nomeFunil || 
             nomeNormalizado.includes(nomeFunil) ||
             nomeFunil.includes(nomeNormalizado);
    });
    
    if (funilEncontrado) {
      funilIds = [funilEncontrado.id];
      console.log(`Funil filtrado: ${funilEncontrado.nome} (${funilEncontrado.id})`);
    } else {
      console.log(`Funil "${nomeFunil}" não encontrado, buscando em todos os funis`);
    }
  }

  // Buscar estágios dos funis filtrados
  const { data: estagios, error: estagiosError } = await supabase
    .from('estagios')
    .select('id, nome, funil_id')
    .in('funil_id', funilIds);

  if (estagiosError || !estagios?.length) {
    console.log('Nenhum estágio encontrado');
    return null;
  }

  console.log(`Estágios disponíveis: ${estagios.map((e: any) => e.nome).join(', ')}`);

  // Procurar correspondência exata (case-insensitive)
  const estagioExato = estagios.find((e: any) => {
    const nomeNormalizado = e.nome.toLowerCase().replace(/-/g, ' ').trim();
    return nomeNormalizado === nomeEtapaReal;
  });

  if (estagioExato) {
    console.log(`Etapa encontrada: ${estagioExato.nome} (${estagioExato.id})`);
    return estagioExato.id;
  }

  // Procurar correspondência parcial
  const estagioParcial = estagios.find((e: any) => {
    const nomeNormalizado = e.nome.toLowerCase().replace(/-/g, ' ').trim();
    return nomeNormalizado.includes(nomeEtapaReal) ||
           nomeEtapaReal.includes(nomeNormalizado);
  });

  if (estagioParcial) {
    console.log(`Etapa encontrada (parcial): ${estagioParcial.nome} (${estagioParcial.id})`);
    return estagioParcial.id;
  }

  console.log(`Etapa "${nomeEtapa}" não encontrada`);
  return null;
}

// Verificar se é um UUID válido
function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { acao, conversa_id, contato_id, conta_id } = await req.json();

    console.log('=== EXECUTAR AÇÃO ===');
    console.log('Ação:', acao);
    console.log('Conversa ID:', conversa_id);
    console.log('Contato ID:', contato_id);
    console.log('Conta ID:', conta_id);

    const acaoObj = acao as Acao;
    let resultado: { sucesso: boolean; mensagem: string; dados?: any } = { sucesso: false, mensagem: '' };

    switch (acaoObj.tipo) {
      case 'etapa': {
        // Mover contato para etapa do CRM
        let estagioId = acaoObj.valor;
        
        if (!estagioId) {
          resultado = { sucesso: false, mensagem: 'ID do estágio não fornecido' };
          break;
        }

        // Se não é um UUID válido, tentar mapear pelo nome
        if (!isValidUUID(estagioId)) {
          console.log(`Valor "${estagioId}" não é UUID, tentando mapear por nome...`);
          const estagioIdMapeado = await mapearEtapaPorNome(supabase, conta_id, estagioId);
          
          if (!estagioIdMapeado) {
            resultado = { sucesso: false, mensagem: `Etapa "${estagioId}" não encontrada no CRM` };
            break;
          }
          
          estagioId = estagioIdMapeado;
        }

        console.log(`Usando estágio ID: ${estagioId}`);

        // Verificar se já existe uma negociação para este contato
        const { data: negociacaoExistente } = await supabase
          .from('negociacoes')
          .select('id')
          .eq('contato_id', contato_id)
          .eq('status', 'aberto')
          .maybeSingle();

        if (negociacaoExistente) {
          // Atualizar negociação existente
          const { error } = await supabase
            .from('negociacoes')
            .update({ estagio_id: estagioId })
            .eq('id', negociacaoExistente.id);

          if (error) throw error;
          resultado = { sucesso: true, mensagem: 'Lead movido para nova etapa do CRM' };
        } else {
          // Criar nova negociação
          const { data: contato } = await supabase
            .from('contatos')
            .select('nome')
            .eq('id', contato_id)
            .single();

          const { error } = await supabase
            .from('negociacoes')
            .insert({
              conta_id,
              contato_id,
              estagio_id: estagioId,
              titulo: `Negociação - ${contato?.nome || 'Novo Lead'}`,
              status: 'aberto',
            });

          if (error) throw error;
          resultado = { sucesso: true, mensagem: 'Nova negociação criada no CRM' };
        }
        break;
      }

      case 'tag': {
        // Adicionar tag ao contato
        const tagNome = acaoObj.valor?.replace(/[.,;!?]+$/, '').trim();
        
        if (!tagNome) {
          resultado = { sucesso: false, mensagem: 'Tag não fornecida' };
          break;
        }

        // Buscar tag existente na tabela tags (case insensitive)
        const { data: tagExistente } = await supabase
          .from('tags')
          .select('id, nome')
          .eq('conta_id', conta_id)
          .ilike('nome', tagNome)
          .maybeSingle();

        // Se a tag não existir, retornar erro
        if (!tagExistente) {
          console.log(`Tag "${tagNome}" não encontrada na conta ${conta_id}`);
          resultado = { 
            sucesso: false, 
            mensagem: `Tag "${tagNome}" não encontrada. Crie a tag primeiro nas configurações do CRM.` 
          };
          break;
        }

        // Usar o nome exato como cadastrado (preservar case e cor)
        const tagNomeExato = tagExistente.nome;
        console.log(`Tag encontrada: "${tagNomeExato}" (ID: ${tagExistente.id})`);

        // Buscar tags atuais do contato
        const { data: contato } = await supabase
          .from('contatos')
          .select('tags')
          .eq('id', contato_id)
          .single();

        const tagsAtuais = contato?.tags || [];
        
        // Verificar se já tem a tag (case insensitive)
        const jaTemTag = tagsAtuais.some(
          (t: string) => t.toLowerCase() === tagNomeExato.toLowerCase()
        );
        
        if (!jaTemTag) {
          const { error } = await supabase
            .from('contatos')
            .update({ tags: [...tagsAtuais, tagNomeExato] })
            .eq('id', contato_id);

          if (error) throw error;
          resultado = { sucesso: true, mensagem: `Tag "${tagNomeExato}" adicionada ao contato` };
        } else {
          resultado = { sucesso: true, mensagem: 'Tag já existe no contato' };
        }
        break;
      }

      case 'transferir': {
        const para = acaoObj.valor;
        
        if (para === 'humano' || para === 'usuario') {
          // Desativar agente IA na conversa
          const { error } = await supabase
            .from('conversas')
            .update({ agente_ia_ativo: false, agente_ia_id: null })
            .eq('id', conversa_id);

          if (error) throw error;

          // Registrar transferência
          await supabase
            .from('transferencias_atendimento')
            .insert({
              conversa_id,
              para_agente_ia: false,
              motivo: 'Transferência automática por ação do agente IA',
            });

          resultado = { sucesso: true, mensagem: 'Conversa transferida para atendente humano' };
        } else if (para === 'ia') {
          // Ativar agente IA principal na conversa
          const { error } = await supabase
            .from('conversas')
            .update({ agente_ia_ativo: true, agente_ia_id: null })
            .eq('id', conversa_id);

          if (error) throw error;

          // Registrar transferência
          await supabase
            .from('transferencias_atendimento')
            .insert({
              conversa_id,
              para_agente_ia: true,
              motivo: 'Transferência automática de volta para agente IA principal',
            });

          resultado = { sucesso: true, mensagem: 'Conversa retornada para agente IA principal' };
        } else if (para?.startsWith('agente:')) {
          // Transferir para agente específico pelo nome ou ID
          const agenteRefOriginal = para.replace('agente:', '').trim();
          
          // Verificar se é UUID ANTES de remover hífens
          let agenteId: string | null = null;
          
          if (isValidUUID(agenteRefOriginal)) {
            // É um UUID válido, usar diretamente
            agenteId = agenteRefOriginal;
            console.log(`Transferindo para agente por UUID: ${agenteId}`);
          } else {
            // Não é UUID, buscar por nome (convertendo hífens para espaços)
            const agenteRefNome = agenteRefOriginal.replace(/-/g, ' ').trim();
            console.log(`Buscando agente por nome: ${agenteRefNome}`);
            
            const { data: agentes } = await supabase
              .from('agent_ia')
              .select('id, nome')
              .eq('conta_id', conta_id)
              .eq('ativo', true);
            
            const agenteEncontrado = agentes?.find((a: any) =>
              a.nome.toLowerCase().replace(/\s+/g, '-') === agenteRefNome.toLowerCase().replace(/\s+/g, '-') ||
              a.nome.toLowerCase() === agenteRefNome.toLowerCase()
            );
            
            if (agenteEncontrado) {
              agenteId = agenteEncontrado.id;
              console.log(`Agente encontrado por nome: ${agenteEncontrado.nome} -> ${agenteId}`);
            }
          }

          if (agenteId) {
            const { error } = await supabase
              .from('conversas')
              .update({ agente_ia_ativo: true, agente_ia_id: agenteId })
              .eq('id', conversa_id);

            if (error) throw error;

            // Registrar transferência
            await supabase
              .from('transferencias_atendimento')
              .insert({
                conversa_id,
                para_agente_ia: true,
                motivo: `Transferência automática para outro agente IA: ${agenteRefOriginal}`,
              });

            resultado = { sucesso: true, mensagem: `Conversa transferida para agente IA: ${agenteRefOriginal}` };
            
            // Disparar resposta automática do novo agente
            console.log('Disparando resposta do novo agente:', agenteId);
            
            // Buscar última mensagem do lead para contexto
            const { data: ultimaMensagemLead } = await supabase
              .from('mensagens')
              .select('conteudo')
              .eq('conversa_id', conversa_id)
              .eq('direcao', 'entrada')
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            
            // Chamar ai-responder para gerar resposta do novo agente
            const aiResponderUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-responder`;
            try {
              console.log('📤 Chamando ai-responder para novo agente...');
              
              const aiResponse = await fetch(aiResponderUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  conversa_id,
                  mensagem: ultimaMensagemLead?.conteudo || 'Olá',
                  conta_id,
                  transferencia_agente: true, // Flag para indicar transferência - força resposta
                }),
              });
              
              // Verificar se a chamada foi bem-sucedida
              if (!aiResponse.ok) {
                const errorText = await aiResponse.text();
                console.error('❌ Erro na chamada ao ai-responder:', aiResponse.status, errorText);
                throw new Error(`ai-responder retornou status ${aiResponse.status}`);
              }
              
              const aiResult = await aiResponse.json();
              console.log('📥 Resposta do ai-responder:', JSON.stringify(aiResult));
              
              // Verificar should_respond
              if (!aiResult.should_respond) {
                console.warn('⚠️ ai-responder retornou should_respond=false:', aiResult.error || 'sem motivo');
              }
              
              if (aiResult.resposta && aiResult.should_respond) {
                // Buscar conexão e contato para enviar via WhatsApp
                const { data: conversaData } = await supabase
                  .from('conversas')
                  .select('conexao_id, contato_id')
                  .eq('id', conversa_id)
                  .single();
                
                if (conversaData) {
                  // Salvar mensagem no banco
                  await supabase
                    .from('mensagens')
                    .insert({
                      conversa_id,
                      conteudo: aiResult.resposta,
                      direcao: 'saida',
                      tipo: 'texto',
                      enviada_por_ia: true,
                    });
                  
                  // Atualizar última mensagem da conversa
                  await supabase
                    .from('conversas')
                    .update({ 
                      ultima_mensagem: aiResult.resposta.substring(0, 100),
                      ultima_mensagem_at: new Date().toISOString(),
                    })
                    .eq('id', conversa_id);
                  
                  // Usar enviar-mensagem para garantir compatibilidade com todos os provedores
                  const enviarMensagemUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-mensagem`;
                  const enviarResponse = await fetch(enviarMensagemUrl, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      conexao_id: conversaData.conexao_id,
                      conversa_id,
                      contato_id: conversaData.contato_id,
                      mensagem: aiResult.resposta,
                      tipo: 'texto',
                    }),
                  });
                  
                  if (enviarResponse.ok) {
                    console.log('✅ Resposta do novo agente enviada com sucesso!');
                  } else {
                    const enviarError = await enviarResponse.text();
                    console.error('❌ Erro ao enviar resposta:', enviarError);
                  }
                }
              }
            } catch (aiError) {
              console.error('❌ Erro ao gerar resposta do novo agente:', aiError);
            }
          } else {
            resultado = { sucesso: false, mensagem: `Agente "${agenteRefOriginal}" não encontrado` };
          }
        }
        break;
      }

      case 'notificar': {
        // Por enquanto, apenas logar a notificação
        // Pode ser expandido para enviar email, webhook, etc.
        console.log('📢 Notificação:', acaoObj.valor || 'Nova ação do agente IA');
        resultado = { sucesso: true, mensagem: 'Notificação enviada' };
        break;
      }

      case 'finalizar': {
        // Encerrar a conversa e limpar memória do agente
        // Adiciona 5 segundos de margem para garantir que mensagens criadas durante o encerramento sejam filtradas
        const { error } = await supabase
          .from('conversas')
          .update({ 
            status: 'encerrado',
            agente_ia_ativo: false,
            etapa_ia_atual: null,
            memoria_limpa_em: new Date(Date.now() + 5000).toISOString(),
          })
          .eq('id', conversa_id);

        if (error) throw error;
        resultado = { sucesso: true, mensagem: 'Conversa encerrada e memória limpa' };
        break;
      }

      case 'nome': {
        // Alterar nome do contato
        const novoNome = acaoObj.valor?.trim();
        
        if (!novoNome) {
          resultado = { sucesso: false, mensagem: 'Nome não fornecido' };
          break;
        }

        const { error } = await supabase
          .from('contatos')
          .update({ nome: novoNome })
          .eq('id', contato_id);

        if (error) throw error;
        resultado = { sucesso: true, mensagem: `Nome do contato alterado para "${novoNome}"` };
        break;
      }

      case 'negociacao': {
        // Criar nova negociação no CRM
        // Formato: "funil/estagio" ou "funil/estagio:valor"
        const valorCompleto = acaoObj.valor || '';
        const [estagioRef, valorStr] = valorCompleto.split(':').length > 1 && !valorCompleto.includes('/') 
          ? [valorCompleto, undefined]
          : valorCompleto.includes(':') 
            ? [valorCompleto.substring(0, valorCompleto.lastIndexOf(':')), valorCompleto.substring(valorCompleto.lastIndexOf(':') + 1)]
            : [valorCompleto, undefined];
        
        const valorNumerico = valorStr ? parseFloat(valorStr) : 0;
        
        console.log(`Criando negociação: estagioRef="${estagioRef}", valor=${valorNumerico}`);
        
        // Buscar configuração da conta para verificar se permite múltiplas negociações
        const { data: contaConfig } = await supabase
          .from('contas')
          .select('permitir_multiplas_negociacoes')
          .eq('id', conta_id)
          .maybeSingle();
        
        const permitirMultiplas = contaConfig?.permitir_multiplas_negociacoes ?? true;
        
        console.log(`Permitir múltiplas negociações: ${permitirMultiplas}`);
        
        // Se não permite múltiplas, verificar qualquer negociação aberta (em qualquer estágio)
        if (!permitirMultiplas) {
          const { data: negociacaoAberta } = await supabase
            .from('negociacoes')
            .select('id, titulo')
            .eq('contato_id', contato_id)
            .eq('status', 'aberto')
            .maybeSingle();
          
          if (negociacaoAberta) {
            console.log(`Bloqueando criação: lead já possui negociação "${negociacaoAberta.titulo}"`);
            resultado = { 
              sucesso: false, 
              mensagem: `Este lead já possui uma negociação aberta: "${negociacaoAberta.titulo}"` 
            };
            break;
          }
        }
        
        // Mapear estágio
        const estagioId = await mapearEtapaPorNome(supabase, conta_id, estagioRef);
        
        if (!estagioId) {
          resultado = { sucesso: false, mensagem: `Estágio "${estagioRef}" não encontrado no CRM` };
          break;
        }
        
        // Buscar dados do contato
        const { data: contato } = await supabase
          .from('contatos')
          .select('nome, telefone, email')
          .eq('id', contato_id)
          .single();
        
        // Verificar se já existe negociação aberta para este contato no mesmo estágio
        const { data: negociacaoExistente } = await supabase
          .from('negociacoes')
          .select('id')
          .eq('contato_id', contato_id)
          .eq('estagio_id', estagioId)
          .eq('status', 'aberto')
          .maybeSingle();
        
        if (negociacaoExistente) {
          resultado = { sucesso: true, mensagem: 'Já existe uma negociação aberta para este contato neste estágio' };
          break;
        }
        
        // Criar negociação
        const { error } = await supabase
          .from('negociacoes')
          .insert({
            conta_id,
            contato_id,
            estagio_id: estagioId,
            titulo: `Negociação - ${contato?.nome || 'Lead'}`,
            valor: valorNumerico,
            status: 'aberto',
            probabilidade: 50,
          });

        if (error) throw error;
        resultado = { sucesso: true, mensagem: `Nova negociação criada: ${contato?.nome || 'Lead'}` };
        break;
      }

      case 'agenda': {
        // Ações do Google Calendar
        const subacao = acaoObj.valor || '';
        console.log('Executando ação de agenda:', subacao);
        
        // Buscar calendário ativo da conta com configurações padrão
        const { data: calendario } = await supabase
          .from('calendarios_google')
          .select('id, nome')
          .eq('conta_id', conta_id)
          .eq('ativo', true)
          .limit(1)
          .single();
        
        if (!calendario) {
          resultado = { sucesso: false, mensagem: 'Nenhum calendário Google conectado. Configure em Integrações.' };
          break;
        }
        
        if (subacao === 'consultar' || subacao.startsWith('consultar:')) {
          // Consultar disponibilidade
          const dataInicio = new Date().toISOString();
          const dataFim = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          
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
            resultado = { sucesso: false, mensagem: calendarResult.error };
          } else {
            resultado = { 
              sucesso: true, 
              mensagem: `Disponibilidade consultada: ${calendarResult.total || 0} eventos encontrados`,
            };
          }
        } else if (subacao.startsWith('criar:')) {
          // Criar evento
          // Formatos suportados:
          // 1. criar:calendario:duracao:meet|titulo|data_inicio (do modal)
          // 2. criar:titulo|data_inicio (formato simples da IA)
          // 3. criar:calendario:duracao:meet (sem detalhes - usar defaults)
          const dadosEvento = subacao.replace('criar:', '');
          const partes = dadosEvento.split('|');
          
          let titulo: string = '';
          let dataInicio: string = '';
          let duracaoMinutos = 60; // default 1 hora
          let gerarMeet = true; // default gerar meet
          
          const primeiroElemento = partes[0];
          const configParts = primeiroElemento.split(':');
          
          console.log('Parsing criar evento:', { dadosEvento, partes, configParts });
          
          // Detectar o formato baseado na estrutura
          if (configParts.length >= 3 && (configParts[2] === 'meet' || configParts[2] === 'no-meet')) {
            // Novo formato do modal: calendario:duracao:meet|titulo|data_inicio
            duracaoMinutos = parseInt(configParts[1]) || 60;
            gerarMeet = configParts[2] === 'meet';
            titulo = partes[1] || '';
            dataInicio = partes[2] || '';
            console.log('Formato modal detectado:', { duracaoMinutos, gerarMeet, titulo, dataInicio });
          } else if (configParts.length === 2 && !isNaN(parseInt(configParts[1]))) {
            // Formato parcial: calendario:duracao|titulo|data_inicio
            duracaoMinutos = parseInt(configParts[1]) || 60;
            titulo = partes[1] || '';
            dataInicio = partes[2] || '';
            console.log('Formato parcial detectado:', { duracaoMinutos, titulo, dataInicio });
          } else {
            // Formato simples da IA: titulo|data_inicio ou apenas titulo
            titulo = partes[0] || '';
            dataInicio = partes[1] || '';
            console.log('Formato simples detectado:', { titulo, dataInicio });
          }
          
          // Buscar nome do contato para incluir no evento
          const { data: contatoData } = await supabase
            .from('contatos')
            .select('nome, telefone')
            .eq('id', contato_id)
            .single();
          
          // Se não tem data de início, usar próximo horário comercial disponível
          if (!dataInicio) {
            const agora = new Date();
            agora.setHours(agora.getHours() + 1, 0, 0, 0);
            dataInicio = agora.toISOString();
          }
          
          const tituloFinal = titulo || `Reunião com ${contatoData?.nome || 'Lead'}`;
          
          // Calcular data_fim para validação de conflitos
          const dataInicioDate = new Date(dataInicio);
          const dataFimDate = new Date(dataInicioDate.getTime() + duracaoMinutos * 60 * 1000);
          
          console.log('Validando conflitos antes de criar evento:', { 
            titulo: tituloFinal, 
            dataInicio, 
            dataFim: dataFimDate.toISOString(),
            duracaoMinutos 
          });
          
          // === VALIDAÇÃO ANTI-CONFLITO NA AGENDA INTERNA ===
          // Verificar se há agendamentos internos (sem google_event_id) que conflitam
          const { data: conflitosInternos } = await supabase
            .from('agendamentos')
            .select('id, titulo, data_inicio, data_fim')
            .eq('conta_id', conta_id)
            .eq('concluido', false)
            .is('google_event_id', null) // Só os que NÃO vieram do Google
            .or(`and(data_inicio.lte.${dataFimDate.toISOString()},data_fim.gte.${dataInicio})`);

          const conflitosAgendaInterna = (conflitosInternos || []).filter((ag: any) => {
            const agInicio = new Date(ag.data_inicio);
            const agFim = new Date(ag.data_fim);
            // Sobreposição: novo começa antes do existente terminar E novo termina depois do existente começar
            return dataInicioDate < agFim && dataFimDate > agInicio;
          });

          if (conflitosAgendaInterna.length > 0) {
            console.log('Conflito com agenda interna detectado:', conflitosAgendaInterna);
            resultado = { 
              sucesso: false, 
              mensagem: 'Este horário já está ocupado na agenda interna. Por favor, consulte novamente os horários disponíveis.' 
            };
            break;
          }
          
          // === VALIDAÇÃO ANTI-CONFLITO NO GOOGLE CALENDAR ===
          // Consultar Google Calendar para verificar se o horário está livre
          const consultaConflito = await fetch(`${supabaseUrl}/functions/v1/google-calendar-actions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              operacao: 'consultar',
              calendario_id: calendario.id,
              dados: { 
                data_inicio: dataInicio, 
                data_fim: dataFimDate.toISOString() 
              },
            }),
          });
          
          const consultaResult = await consultaConflito.json();
          console.log('Resultado da consulta de conflitos Google:', consultaResult);
          
          // Verificar se há eventos que conflitam com o horário desejado
          const eventosConflitantes = consultaResult.eventos?.filter((evento: { inicio: string; fim: string }) => {
            const eventoInicio = new Date(evento.inicio);
            const eventoFim = new Date(evento.fim);
            
            // Verifica sobreposição: slot começa antes do evento terminar E slot termina depois do evento começar
            return dataInicioDate < eventoFim && dataFimDate > eventoInicio;
          }) || [];
          
          if (eventosConflitantes.length > 0) {
            console.log('Conflito detectado no Google! Eventos conflitantes:', eventosConflitantes);
            resultado = { 
              sucesso: false, 
              mensagem: 'Este horário já está ocupado na agenda. Por favor, consulte novamente os horários disponíveis.' 
            };
            break;
          }
          
          console.log('Nenhum conflito detectado, criando evento:', { 
            titulo: tituloFinal, 
            dataInicio, 
            duracaoMinutos, 
            gerarMeet 
          });
          
          const calendarResponse = await fetch(`${supabaseUrl}/functions/v1/google-calendar-actions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              operacao: 'criar',
              calendario_id: calendario.id,
              dados: {
                titulo: tituloFinal,
                descricao: `Agendamento realizado via WhatsApp\nContato: ${contatoData?.nome || 'Lead'}\nTelefone: ${contatoData?.telefone || 'N/A'}`,
                data_inicio: dataInicio,
                duracao_minutos: duracaoMinutos,
                gerar_meet: gerarMeet,
              },
            }),
          });
          
          const calendarResult = await calendarResponse.json();
          console.log('Resultado do Google Calendar:', calendarResult);
          
          if (calendarResult.error) {
            resultado = { sucesso: false, mensagem: calendarResult.error };
          } else {
            // Usar dataFimDate já calculada anteriormente
            
            // Criar agendamento interno no CRM
            const { error: agendamentoError } = await supabase
              .from('agendamentos')
              .insert({
                conta_id,
                contato_id,
                titulo: tituloFinal,
                descricao: `Agendamento via WhatsApp${calendarResult.meet_link ? '\nLink Meet: ' + calendarResult.meet_link : ''}`,
                data_inicio: dataInicio,
                data_fim: dataFimDate.toISOString(),
                google_event_id: calendarResult.id || null,
                google_meet_link: calendarResult.meet_link || null,
                concluido: false,
              });
            
            if (agendamentoError) {
              console.error('Erro ao criar agendamento interno:', agendamentoError);
            } else {
              console.log('Agendamento interno criado com sucesso');
            }
            
            let mensagemSucesso = `Evento criado: ${tituloFinal} (${duracaoMinutos}min)`;
            if (calendarResult.meet_link) {
              mensagemSucesso += ` | Link Meet: ${calendarResult.meet_link}`;
            }
            resultado = { 
              sucesso: true, 
              mensagem: mensagemSucesso,
              dados: {
                evento_id: calendarResult.id,
                meet_link: calendarResult.meet_link,
                titulo: tituloFinal,
                data_inicio: dataInicio,
                duracao: duracaoMinutos,
              }
            };
          }
        } else {
          resultado = { sucesso: false, mensagem: 'Subação de agenda não reconhecida' };
        }
        break;
      }

      case 'campo': {
        // Atualizar campo personalizado do contato
        // Formato: @campo:nome-do-campo:valor
        // Ex: @campo:data-nascimento:15/03/1990
        
        console.log('📝 [CAMPO] acao.valor recebido:', JSON.stringify(acaoObj.valor));
        
        // Validar formato obrigatório
        if (!acaoObj.valor || !acaoObj.valor.includes(':')) {
          console.log('❌ [CAMPO] Formato inválido - deve ser "nome-do-campo:valor"');
          resultado = { sucesso: false, mensagem: 'Formato inválido. Use: nome-do-campo:valor' };
          break;
        }
        
        const partes = acaoObj.valor.split(':');
        const nomeCampoRaw = partes[0] || '';
        const valorCampo = partes.slice(1).join(':').trim(); // Para permitir ":" no valor
        
        // Normalizar nome do campo: lowercase, trocar hífens por espaços, remover pontuação
        const nomeCampo = nomeCampoRaw
          .toLowerCase()
          .replace(/-/g, ' ')
          .replace(/[.,;!?]+$/, '')
          .trim();
        
        console.log('📝 [CAMPO] nomeCampoRaw:', nomeCampoRaw);
        console.log('📝 [CAMPO] nomeCampo normalizado:', nomeCampo);
        console.log('📝 [CAMPO] valorCampo:', valorCampo);
        console.log('📝 [CAMPO] valorCampo.length:', valorCampo.length);
        
        if (!nomeCampo) {
          console.log('❌ [CAMPO] Nome do campo vazio após normalização');
          resultado = { sucesso: false, mensagem: 'Nome do campo não fornecido' };
          break;
        }
        
        // Permitir salvar valor vazio (para limpar campo) - mas avisar nos logs
        if (!valorCampo) {
          console.log('⚠️ [CAMPO] Valor vazio - campo será limpo');
        }
        
        // Função SIMPLES para normalizar: remove acentos, espaços, hífens - tudo vira minúsculo junto
        const normalizarCampo = (nome: string): string => {
          return nome
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove acentos
            .replace(/[-_\s]+/g, '')          // Remove hífens, underscores, espaços
            .trim();
        };

        // Buscar TODOS os campos da conta
        const { data: todosCampos, error: campoQueryError } = await supabase
          .from('campos_personalizados')
          .select('id, nome, tipo')
          .eq('conta_id', conta_id);
        
        if (campoQueryError) {
          console.log('❌ [CAMPO] Erro ao buscar campos:', campoQueryError);
        }

        console.log(`📋 [CAMPO] Campos disponíveis:`, todosCampos?.map(c => `${c.nome} (${normalizarCampo(c.nome)})`).join(', '));

        // Encontrar campo comparando versões normalizadas
        const buscaNormalizada = normalizarCampo(nomeCampo);
        console.log(`🔍 [CAMPO] Buscando: "${nomeCampo}" → normalizado: "${buscaNormalizada}"`);

        const campoEncontrado = todosCampos?.find(c => {
          const nomeNormalizado = normalizarCampo(c.nome);
          
          // Match exato normalizado
          if (nomeNormalizado === buscaNormalizada) {
            console.log(`✅ [CAMPO] Match exato: "${c.nome}" (${nomeNormalizado}) = "${nomeCampo}" (${buscaNormalizada})`);
            return true;
          }
          
          // Match parcial (um contém o outro)
          if (nomeNormalizado.includes(buscaNormalizada) || buscaNormalizada.includes(nomeNormalizado)) {
            console.log(`✅ [CAMPO] Match parcial: "${c.nome}" (${nomeNormalizado}) ~ "${nomeCampo}" (${buscaNormalizada})`);
            return true;
          }
          
          return false;
        });
          
        if (!campoEncontrado) {
          console.log(`❌ [CAMPO] Campo "${nomeCampo}" não encontrado para conta ${conta_id}`);
          resultado = { sucesso: false, mensagem: `Campo "${nomeCampo}" não encontrado. Crie o campo primeiro em Campos Personalizados.` };
          break;
        }
        
        console.log(`✅ [CAMPO] Campo encontrado: "${campoEncontrado.nome}" (ID: ${campoEncontrado.id})`);
          
          // Verificar se já existe um registro para este contato/campo
          const { data: existente } = await supabase
            .from('contato_campos_valores')
            .select('id, valor')
            .eq('contato_id', contato_id)
            .eq('campo_id', campoEncontrado.id)
            .maybeSingle();

          console.log('📝 [CAMPO] Registro existente:', existente ? `ID: ${existente.id}, valor atual: "${existente.valor}"` : 'nenhum');

          let campoError;
          if (existente) {
            console.log(`🔄 [CAMPO] Atualizando registro existente (ID: ${existente.id})`);
            const result = await supabase
              .from('contato_campos_valores')
              .update({ 
                valor: valorCampo,
                updated_at: new Date().toISOString()
              })
              .eq('id', existente.id);
            campoError = result.error;
            console.log('📝 [CAMPO] Resultado UPDATE:', result.error ? `ERRO: ${result.error.message}` : 'OK');
          } else {
            console.log(`➕ [CAMPO] Inserindo novo registro para campo ${campoEncontrado.id}`);
            const result = await supabase
              .from('contato_campos_valores')
              .insert({
                contato_id: contato_id,
                campo_id: campoEncontrado.id,
                valor: valorCampo
              });
            campoError = result.error;
            console.log('📝 [CAMPO] Resultado INSERT:', result.error ? `ERRO: ${result.error.message}` : 'OK');
          }
          
          if (campoError) {
            console.log('❌ [CAMPO] Erro ao salvar:', campoError.code, campoError.message, campoError.details);
            throw campoError;
          }
          
          // Se for campo de email, espelhar para contatos.email
          if (campoEncontrado.nome.toLowerCase().includes('email') && valorCampo && valorCampo.includes('@')) {
            console.log('📧 [CAMPO] Espelhando email para contatos.email');
            await supabase
              .from('contatos')
              .update({ email: valorCampo })
              .eq('id', contato_id);
          }
          
          console.log(`✅ [CAMPO] Campo "${campoEncontrado.nome}" atualizado para "${valorCampo}"`);
        resultado = { sucesso: true, mensagem: `Campo "${campoEncontrado.nome}" atualizado para "${valorCampo}"` };
        break;
      }

      case 'obter': {
        // Obter valor de um campo personalizado do contato
        // Formato: @obter:nome-do-campo
        // Retorna o valor para uso no contexto da IA
        
        const nomeCampo = acaoObj.valor?.replace(/-/g, ' ').trim();
        
        console.log('🔍 Obtendo campo personalizado:', nomeCampo);
        
        if (!nomeCampo) {
          resultado = { sucesso: false, mensagem: 'Nome do campo não fornecido' };
          break;
        }
        
        // Buscar campo personalizado pelo nome
        const { data: campo } = await supabase
          .from('campos_personalizados')
          .select('id, nome, tipo')
          .eq('conta_id', conta_id)
          .ilike('nome', nomeCampo)
          .maybeSingle();
        
        if (!campo) {
          console.log(`Campo "${nomeCampo}" não encontrado`);
          resultado = { sucesso: false, mensagem: `Campo "${nomeCampo}" não encontrado` };
          break;
        }
        
        // Buscar valor do campo na nova tabela
        const { data: valorData } = await supabase
          .from('contato_campos_valores')
          .select('valor')
          .eq('contato_id', contato_id)
          .eq('campo_id', campo.id)
          .maybeSingle();
        
        const valorEncontrado = valorData?.valor || 'não informado';
        
        console.log(`✅ Valor do campo "${campo.nome}": ${valorEncontrado}`);
        resultado = { 
          sucesso: true, 
          mensagem: `Valor do campo "${campo.nome}": ${valorEncontrado}`,
          dados: { campo: campo.nome, valor: valorEncontrado }
        };
        break;
      }

      case 'followup': {
        // Criar follow-up agendado para retornar ao lead
        // Formato: data_iso8601:motivo ou apenas horário (HH:MM)
        // Ex: 2025-01-10T14:00:00-03:00:lead pediu para retornar sexta
        // Ex: 23:45:lead pediu retorno
        
        console.log('📅 [FOLLOWUP] Criando follow-up agendado:', acaoObj.valor);
        
        if (!acaoObj.valor) {
          resultado = { sucesso: false, mensagem: 'Data do follow-up não informada' };
          break;
        }
        
        const valorCompleto = acaoObj.valor;
        let dataAgendada: Date | null = null;
        let motivo: string = 'Retorno agendado pelo agente';
        
        // Tentar diferentes formatos de parsing
        // Formato 1: data ISO completa com timezone (2025-01-10T14:00:00-03:00:motivo)
        const matchComTz = valorCompleto.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}):?(.*)$/);
        // Formato 2: data ISO sem timezone (2025-01-10T14:00:00:motivo)
        const matchSemTz = valorCompleto.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}):?(.*)$/);
        // Formato 3: apenas data (2025-01-10:motivo)
        const matchDataSimples = valorCompleto.match(/^(\d{4}-\d{2}-\d{2}):?(.*)$/);
        // Formato 4: apenas horário (23:45:motivo ou 23h45:motivo)
        const matchHorario = valorCompleto.match(/^(\d{1,2})[h:](\d{2}):?(.*)$/i);
        // Formato 5: horário simples (23:45 ou 14h)
        const matchHorarioSimples = valorCompleto.match(/^(\d{1,2})[h:]?(\d{2})?/i);
        
        if (matchComTz) {
          dataAgendada = new Date(matchComTz[1]);
          motivo = matchComTz[2]?.trim() || motivo;
          console.log('📅 [FOLLOWUP] Formato ISO com TZ detectado');
        } else if (matchSemTz) {
          dataAgendada = new Date(matchSemTz[1]);
          motivo = matchSemTz[2]?.trim() || motivo;
          console.log('📅 [FOLLOWUP] Formato ISO sem TZ detectado');
        } else if (matchDataSimples) {
          // Apenas data, assumir 9h
          dataAgendada = new Date(matchDataSimples[1] + 'T09:00:00-03:00');
          motivo = matchDataSimples[2]?.trim() || motivo;
          console.log('📅 [FOLLOWUP] Formato data simples detectado');
        } else if (matchHorario) {
          // Apenas horário (HH:MM), construir data para hoje ou amanhã
          const hora = parseInt(matchHorario[1]);
          const minuto = parseInt(matchHorario[2] || '0');
          motivo = matchHorario[3]?.trim() || motivo;
          
          const agora = new Date();
          dataAgendada = new Date(agora);
          dataAgendada.setHours(hora, minuto, 0, 0);
          
          // Se o horário já passou hoje, agendar para amanhã
          if (dataAgendada <= agora) {
            dataAgendada.setDate(dataAgendada.getDate() + 1);
            console.log('📅 [FOLLOWUP] Horário passou, agendando para amanhã');
          }
          console.log('📅 [FOLLOWUP] Formato horário HH:MM detectado:', hora, ':', minuto);
        } else if (matchHorarioSimples) {
          // Formato ainda mais simples (14h ou 23)
          const hora = parseInt(matchHorarioSimples[1]);
          const minuto = parseInt(matchHorarioSimples[2] || '0');
          
          const agora = new Date();
          dataAgendada = new Date(agora);
          dataAgendada.setHours(hora, minuto, 0, 0);
          
          // Se o horário já passou hoje, agendar para amanhã
          if (dataAgendada <= agora) {
            dataAgendada.setDate(dataAgendada.getDate() + 1);
          }
          
          // Extrair motivo do resto do valor
          const restoValor = valorCompleto.replace(matchHorarioSimples[0], '').replace(/^:/, '').trim();
          if (restoValor) {
            motivo = restoValor;
          }
          console.log('📅 [FOLLOWUP] Formato horário simples detectado:', hora, ':', minuto);
        } else {
          // Tentar parsear como data direta
          dataAgendada = new Date(valorCompleto);
        }
        
        if (!dataAgendada || isNaN(dataAgendada.getTime())) {
          console.log('❌ [FOLLOWUP] Data inválida após todos os parsings:', valorCompleto);
          resultado = { sucesso: false, mensagem: 'Data do follow-up inválida. Use formato: 2025-01-10T14:00:00:motivo ou HH:MM:motivo' };
          break;
        }
        
        console.log('📅 [FOLLOWUP] Data parseada:', dataAgendada.toISOString());
        console.log('📅 [FOLLOWUP] Motivo:', motivo);
        
        // Buscar contexto breve da conversa (últimas 5 mensagens)
        const { data: mensagensRecentes } = await supabase
          .from('mensagens')
          .select('conteudo, direcao')
          .eq('conversa_id', conversa_id)
          .order('created_at', { ascending: false })
          .limit(5);
        
        const contexto = mensagensRecentes
          ?.reverse()
          .map(m => `${m.direcao === 'entrada' ? 'Lead' : 'Agente'}: ${m.conteudo}`)
          .join('\n')
          .substring(0, 500) || '';
        
        // Buscar agente_ia_id da conversa
        const { data: conversaData } = await supabase
          .from('conversas')
          .select('agente_ia_id')
          .eq('id', conversa_id)
          .single();
        
        // Inserir follow-up agendado
        const { error: followupError } = await supabase
          .from('followups_agendados')
          .insert({
            conta_id,
            conversa_id,
            contato_id,
            agente_ia_id: conversaData?.agente_ia_id || null,
            data_agendada: dataAgendada.toISOString(),
            motivo: motivo.trim(),
            contexto,
            status: 'pendente',
            criado_por: 'agente_ia'
          });
        
        if (followupError) {
          console.log('❌ [FOLLOWUP] Erro ao inserir:', followupError);
          throw followupError;
        }
        
        const dataFormatada = dataAgendada.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        console.log(`✅ [FOLLOWUP] Follow-up agendado para ${dataFormatada}`);
        resultado = { 
          sucesso: true, 
          mensagem: `Follow-up agendado para ${dataFormatada}. Motivo: ${motivo.trim()}`
        };
        break;
      }

      default:
        resultado = { sucesso: false, mensagem: 'Tipo de ação não reconhecido' };
    }

    // Registrar mensagem de sistema para rastreamento interno
    if (resultado.sucesso) {
      const mensagemSistema = gerarMensagemSistema(acaoObj.tipo, acaoObj.valor, resultado.mensagem);
      
      await supabase
        .from('mensagens')
        .insert({
          conversa_id,
          conteudo: mensagemSistema,
          direcao: 'saida',
          tipo: 'sistema',
          enviada_por_ia: true,
          metadata: { 
            interno: true, 
            acao_tipo: acaoObj.tipo,
            acao_valor: acaoObj.valor || null
          }
        });
      
      console.log('Mensagem de sistema registrada:', mensagemSistema);
    }

    console.log('Resultado:', resultado);

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('=== ERRO AO EXECUTAR AÇÃO ===');
    console.error('Mensagem:', errorMessage);
    console.error('Stack:', errorStack);
    return new Response(
      JSON.stringify({ sucesso: false, mensagem: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
