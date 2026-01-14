import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import {
  Search,
  Send,
  Bot,
  MoreVertical,
  Phone,
  Paperclip,
  Smile,
  Check,
  CheckCheck,
  MessageSquare as MessageSquareIcon,
  X,
  Activity,
  Image,
  FileText,
  Mic,
  XCircle,
  ArrowRightLeft,
  UserCheck,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  RefreshCw,
  User,
  Users,
  ArrowLeft,
  ChevronRight,
  MessageCircle,
  Clock,
  CheckCircle2,
  Trash2,
  Ban,
  Tag,
  ChevronDown,
  Lock,
  Unlock,
  FileSpreadsheet,
  Archive,
  File as FileIcon,
  Download,
  ChevronLeft,
  Instagram,
  Megaphone,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AudioRecorder } from '@/components/AudioRecorder';
import { AudioPlayer } from '@/components/AudioPlayer';
import { ContatoSidebar } from '@/components/ContatoSidebar';
import { notifyNewMessage, requestNotificationPermission } from '@/lib/notificationSound';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useIsMobile } from '@/hooks/use-mobile';
import { validarEExibirErro } from '@/hooks/useValidarLimitePlano';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface OrigemAnuncio {
  ad_id?: string;
  ad_title?: string;
  ad_body?: string;
  ad_source?: string;
  ad_url?: string;
  ad_image?: string;
  ctwa_clid?: string;
  captured_at?: string;
}

interface Contato {
  id: string;
  nome: string;
  telefone: string;
  avatar_url: string | null;
  is_grupo?: boolean | null;
  grupo_jid?: string | null;
  tags?: string[] | null;
  metadata?: unknown;
}

interface TagItem {
  id: string;
  nome: string;
  cor: string;
}

interface Usuario {
  id: string;
  nome: string;
  email: string;
}

interface AgenteIA {
  id: string;
  nome: string | null;
  ativo: boolean | null;
  tipo: string | null;
}

interface EtapaIA {
  id: string;
  nome: string;
  numero: number;
}

interface NegociacaoEstagio {
  id: string;
  estagio: {
    nome: string;
    tipo: string | null;
  } | null;
}

interface Conversa {
  id: string;
  contato_id: string;
  conexao_id: string | null;
  agente_ia_ativo: boolean | null;
  agente_ia_id: string | null;
  atendente_id: string | null;
  ultima_mensagem: string | null;
  ultima_mensagem_at: string | null;
  nao_lidas: number | null;
  status?: string | null;
  etapa_ia_atual?: string | null;
  canal?: string | null;
  contatos: Contato;
  agent_ia?: AgenteIA | null;
  etapa_ia?: EtapaIA | null;
  negociacoes?: NegociacaoEstagio[];
}

interface MensagemReaction {
  emoji: string;
  from: string;
  timestamp: string;
}

interface MensagemMetadata {
  interno?: boolean;
  acao_tipo?: string;
  acao_valor?: string;
  participante_nome?: string;
  participante_telefone?: string;
  reactions?: MensagemReaction[];
  [key: string]: unknown;
}

interface Mensagem {
  id: string;
  conversa_id: string;
  conteudo: string;
  direcao: 'entrada' | 'saida';
  created_at: string;
  enviada_por_ia: boolean;
  enviada_por_dispositivo: boolean | null;
  lida: boolean;
  tipo: 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'sticker' | 'sistema' | null;
  media_url: string | null;
  metadata?: MensagemMetadata | null;
  deletada?: boolean;
  deletada_por?: string;
  deletada_em?: string;
  usuario_deletou?: { nome: string } | null;
}

interface Conexao {
  id: string;
  instance_name: string;
  status: 'conectado' | 'desconectado' | 'aguardando' | null;
  numero: string | null;
  tipo_provedor?: string | null;
  nome?: string;
}

interface MetaTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components: Array<{
    type: string;
    text?: string;
    format?: string;
    example?: { body_text?: string[][] };
  }>;
}

type StatusFilter = 'todos' | 'abertos' | 'em_atendimento' | 'aguardando_cliente' | 'encerrado';
type AtendenteFilter = 'todos' | 'agente_ia' | 'humano';
type TipoFilter = 'todos' | 'individual' | 'grupo' | 'cliente';
type CanalFilter = 'todos' | 'whatsapp' | 'instagram';

const FILTERS_STORAGE_KEY = 'conversas_filters';

const getInitialFilters = () => {
  try {
    const saved = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Erro ao ler filtros do localStorage:', e);
  }
  return { status: 'abertos', atendente: 'todos', tipo: 'todos', tags: [] as string[], canal: 'todos' };
};

export default function Conversas() {
  const { usuario } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<'lista' | 'chat'>('lista');
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [conversaSelecionada, setConversaSelecionada] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  
  const initialFilters = getInitialFilters();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialFilters.status);
  const [atendenteFilter, setAtendenteFilter] = useState<AtendenteFilter>(initialFilters.atendente);
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>(initialFilters.tipo);
  const [canalFilter, setCanalFilter] = useState<CanalFilter>(initialFilters.canal || 'todos');
  const [tagsFilter, setTagsFilter] = useState<string[]>(initialFilters.tags || []);
  const [tagsDisponiveis, setTagsDisponiveis] = useState<TagItem[]>([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferType, setTransferType] = useState<'choice' | 'humano' | 'agente' | 'agente-etapa'>('choice');
  const [agenteParaTransferir, setAgenteParaTransferir] = useState<string | null>(null);
  const [etapasAgenteIA, setEtapasAgenteIA] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const [fileType, setFileType] = useState<'imagem' | 'documento' | 'audio'>('imagem');
  const [imagemExpandida, setImagemExpandida] = useState<string | null>(null);
  const [showContatoSidebar, setShowContatoSidebar] = useState(false);
  const [agentesDisponiveis, setAgentesDisponiveis] = useState<AgenteIA[]>([]);
  const [mensagemParaDeletar, setMensagemParaDeletar] = useState<string | null>(null);
  
  // Ref para manter a conversa selecionada atualizada no realtime
  const conversaSelecionadaRef = useRef<Conversa | null>(null);
  
  // Estado das conexões WhatsApp/Instagram (múltiplas)
  const [conexoes, setConexoes] = useState<Conexao[]>([]);
  const [pollingActive, setPollingActive] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper: buscar conexão específica de uma conversa (com fallback inteligente)
  const getConexaoDaConversa = useCallback((conversa: Conversa | null): Conexao | null => {
    if (!conversa) return null;
    
    // Se tem conexao_id definido, usar ela
    if (conversa.conexao_id) {
      const conexaoEspecifica = conexoes.find(c => c.id === conversa.conexao_id);
      if (conexaoEspecifica) return conexaoEspecifica;
    }
    
    // FALLBACK: Se não tem conexao_id ou não encontrou, tentar encontrar uma conexão conectada
    // Para grupos (contato com grupo_jid), preferir conexão Evolution
    if (conversa.contatos?.grupo_jid) {
      const conexaoEvolution = conexoes.find(c => 
        c.status === 'conectado' && c.tipo_provedor === 'evolution'
      );
      if (conexaoEvolution) return conexaoEvolution;
    }
    
    // Fallback geral: usar primeira conexão conectada
    return conexoes.find(c => c.status === 'conectado') || null;
  }, [conexoes]);

  // Helper: verificar se alguma conexão está conectada
  const algumConexaoConectada = conexoes.some(c => c.status === 'conectado');

  // Estados para templates Meta
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MetaTemplate | null>(null);
  const [templateParams, setTemplateParams] = useState<string[]>([]);

  // Calcular total de mensagens não lidas e atualizar título
  const totalNaoLidas = conversas.reduce((acc, c) => acc + (c.nao_lidas || 0), 0);
  useDocumentTitle(totalNaoLidas);

  // Salvar filtros no localStorage quando mudarem
  useEffect(() => {
    const filters = {
      status: statusFilter,
      atendente: atendenteFilter,
      tipo: tipoFilter,
      canal: canalFilter,
      tags: tagsFilter
    };
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  }, [statusFilter, atendenteFilter, tipoFilter, canalFilter, tagsFilter]);

  // Buscar TODAS as conexões WhatsApp/Instagram
  const fetchConexoes = useCallback(async () => {
    if (!usuario?.conta_id) return;
    
    try {
      const { data, error } = await supabase
        .from('conexoes_whatsapp')
        .select('id, instance_name, status, numero, tipo_provedor, nome')
        .eq('conta_id', usuario.conta_id);

      if (error) {
        console.error('Erro ao buscar conexões:', error);
        return;
      }

      setConexoes(data || []);
    } catch (error) {
      console.error('Erro ao buscar conexões:', error);
    }
  }, [usuario?.conta_id]);

  // Polling de mensagens para TODAS as conexões Evolution conectadas
  const pollMessages = useCallback(async () => {
    // Filtrar apenas conexões Evolution API conectadas
    const conexoesEvolutionConectadas = conexoes.filter(
      c => c.status === 'conectado' && c.tipo_provedor === 'evolution'
    );
    
    if (conexoesEvolutionConectadas.length === 0) return;
    
    try {
      console.log(`Polling mensagens para ${conexoesEvolutionConectadas.length} conexão(ões)...`);
      
      // Poll em paralelo para todas as conexões
      await Promise.all(
        conexoesEvolutionConectadas.map(async (con) => {
          const { data, error } = await supabase.functions.invoke('evolution-fetch-messages', {
            body: { conexao_id: con.id },
          });

          if (error) {
            console.error(`Erro no polling da conexão ${con.nome || con.instance_name}:`, error);
            return;
          }

          if (data?.processed > 0) {
            console.log(`Mensagens processadas via polling (${con.nome || con.instance_name}):`, data.processed);
          }
        })
      );
      
      fetchConversas();
    } catch (error) {
      console.error('Erro no polling:', error);
    }
  }, [conexoes]);

  // Iniciar/parar polling baseado em conexões Evolution disponíveis
  useEffect(() => {
    const temEvolutionConectada = conexoes.some(
      c => c.status === 'conectado' && c.tipo_provedor === 'evolution'
    );
    
    if (temEvolutionConectada && !pollingActive) {
      setPollingActive(true);
      // Polling a cada 10 segundos
      pollingIntervalRef.current = setInterval(pollMessages, 10000);
      // Executar imediatamente
      pollMessages();
    } else if (!temEvolutionConectada && pollingActive) {
      setPollingActive(false);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [conexoes, pollingActive, pollMessages]);

  useEffect(() => {
    if (usuario?.conta_id) {
      fetchConversas();
      fetchUsuarios();
      fetchAgentes();
      fetchConexoes();
      fetchTagsDisponiveis();
      const cleanup = setupRealtimeSubscription();
      
      // Solicitar permissão de notificação
      requestNotificationPermission();
      
      // Verificar status das conexões periodicamente
      const statusInterval = setInterval(fetchConexoes, 30000);
      
      return () => {
        cleanup();
        clearInterval(statusInterval);
      };
    }
  }, [usuario, fetchConexoes]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Só fecha se o clique foi FORA do menu de anexos
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setShowAttachMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Manter a ref sincronizada com o estado
  useEffect(() => {
    conversaSelecionadaRef.current = conversaSelecionada;
  }, [conversaSelecionada]);

  // Auto-selecionar conversa quando vier contato_id na URL
  useEffect(() => {
    const contatoIdFromUrl = searchParams.get('contato');
    if (contatoIdFromUrl && conversas.length > 0 && !loading) {
      const conversaDoContato = conversas.find(c => c.contato_id === contatoIdFromUrl);
      if (conversaDoContato) {
        setConversaSelecionada(conversaDoContato);
      } else {
        toast.info('Este contato ainda não possui conversa ativa');
      }
      // Limpar o parâmetro da URL após processar
      navigate('/conversas', { replace: true });
    }
  }, [searchParams, conversas, loading, navigate]);

  useEffect(() => {
    if (conversaSelecionada) {
      fetchMensagens(conversaSelecionada.id);
      marcarComoLida(conversaSelecionada.id);
    }
  }, [conversaSelecionada]);

  useEffect(() => {
    scrollToBottom();
  }, [mensagens]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('conversas-mensagens-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensagens' },
        (payload) => {
          console.log('Mensagem recebida via realtime:', payload.eventType, payload);
          const mensagemPayload = payload.new as Mensagem;
          
          // Usar a ref para verificar a conversa selecionada atual
          if (conversaSelecionadaRef.current && mensagemPayload.conversa_id === conversaSelecionadaRef.current.id) {
            if (payload.eventType === 'INSERT') {
              setMensagens((prev) => [...prev, mensagemPayload]);
            } else if (payload.eventType === 'UPDATE') {
              // Atualizar mensagem existente (para reações)
              setMensagens((prev) => prev.map(m => 
                m.id === mensagemPayload.id ? mensagemPayload : m
              ));
            }
          }
          
          // Notificação sonora + browser para mensagens de entrada em conversas atendidas por humano
          if (payload.eventType === 'INSERT' && mensagemPayload.direcao === 'entrada') {
            const conversaDaMensagem = conversas.find(c => c.id === mensagemPayload.conversa_id);
            if (conversaDaMensagem && conversaDaMensagem.agente_ia_ativo === false) {
              notifyNewMessage(
                conversaDaMensagem.contatos.nome,
                mensagemPayload.conteudo,
                () => setConversaSelecionada(conversaDaMensagem)
              );
            }
          }
          
          fetchConversas();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversas' },
        (payload) => {
          console.log('Nova conversa recebida via realtime:', payload);
          fetchConversas();
          // Notificação sonora para nova conversa
          try {
            const audio = new Audio('/notification.mp3');
            audio.volume = 0.3;
            audio.play().catch(() => {});
          } catch {}
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversas' },
        () => {
          fetchConversas();
        }
      )
      .subscribe((status) => {
        console.log('Status da subscription realtime:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const fetchConversas = async () => {
    try {
      const { data, error } = await supabase
        .from('conversas')
        .select(`
          *, 
          contatos(*), 
          agent_ia:agente_ia_id(id, nome, ativo, tipo), 
          etapa_ia:etapa_ia_atual(id, nome, numero)
        `)
        .eq('conta_id', usuario!.conta_id)
        .eq('arquivada', false)
        .order('ultima_mensagem_at', { ascending: false });

      if (error) throw error;
      
      // Buscar negociações para verificar se são clientes
      const contatoIds = data?.map(c => c.contato_id).filter(Boolean) || [];
      
      if (contatoIds.length > 0) {
        const { data: negociacoes } = await supabase
          .from('negociacoes')
          .select('id, contato_id, estagio:estagios(nome, tipo)')
          .in('contato_id', contatoIds)
          .eq('status', 'aberto');
        
        // Mapear negociações por contato_id
        const negociacoesPorContato = new Map<string, NegociacaoEstagio[]>();
        negociacoes?.forEach(neg => {
          const existing = negociacoesPorContato.get(neg.contato_id) || [];
          existing.push({ id: neg.id, estagio: neg.estagio });
          negociacoesPorContato.set(neg.contato_id, existing);
        });
        
        // Adicionar negociações às conversas
        const conversasComNegociacoes = data?.map(conversa => ({
          ...conversa,
          negociacoes: negociacoesPorContato.get(conversa.contato_id) || []
        })) || [];
        
        setConversas(conversasComNegociacoes);
      } else {
        setConversas(data || []);
      }
    } catch (error) {
      console.error('Erro ao buscar conversas:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsuarios = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, email')
        .eq('conta_id', usuario!.conta_id);

      if (error) throw error;
      setUsuarios(data || []);
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
    }
  };

  const fetchAgentes = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_ia')
        .select('id, nome, ativo, tipo')
        .eq('conta_id', usuario!.conta_id)
        .eq('ativo', true)
        .order('tipo', { ascending: false }); // principal primeiro

      if (error) throw error;
      setAgentesDisponiveis(data || []);
    } catch (error) {
      console.error('Erro ao buscar agentes:', error);
    }
  };

  const fetchTagsDisponiveis = async () => {
    try {
      const { data, error } = await supabase
        .from('tags')
        .select('id, nome, cor')
        .order('nome');
      
      if (error) throw error;
      setTagsDisponiveis(data || []);
    } catch (error) {
      console.error('Erro ao buscar tags:', error);
    }
  };

  // Buscar templates Meta
  const fetchTemplates = async () => {
    const conexaoDaConversa = getConexaoDaConversa(conversaSelecionada);
    
    if (!conexaoDaConversa?.id) {
      toast.error('Esta conversa não está vinculada a uma conexão');
      return;
    }
    
    if (conexaoDaConversa.tipo_provedor !== 'meta') {
      toast.error('Templates disponíveis apenas para WhatsApp Oficial (Meta API)');
      return;
    }
    
    setLoadingTemplates(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-get-templates', {
        body: { conexao_id: conexaoDaConversa.id },
      });
      
      if (error) {
        console.error('Erro ao buscar templates:', error);
        toast.error('Erro ao buscar templates');
        return;
      }
      
      if (data?.templates) {
        setTemplates(data.templates);
        if (data.templates.length === 0) {
          toast.info('Nenhum template aprovado encontrado');
        }
      }
    } catch (error) {
      console.error('Erro ao buscar templates:', error);
      toast.error('Erro ao buscar templates');
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Preview do template
  const getTemplatePreview = (template: MetaTemplate, params: string[]): string => {
    const bodyComponent = template.components.find(c => c.type === 'BODY');
    if (!bodyComponent?.text) return '';
    
    let preview = bodyComponent.text;
    params.forEach((param, index) => {
      preview = preview.replace(`{{${index + 1}}}`, param || `{{${index + 1}}}`);
    });
    return preview;
  };

  // Enviar template
  const enviarTemplate = async () => {
    if (!conversaSelecionada || !selectedTemplate) return;
    
    // Validar limite de mensagens do plano
    if (usuario?.conta_id) {
      const permitido = await validarEExibirErro(usuario.conta_id, 'mensagens', true);
      if (!permitido) return;
    }

    setEnviando(true);
    try {
      const { error } = await supabase.functions.invoke('meta-send-message', {
        body: {
          conexao_id: conversaSelecionada.conexao_id,
          telefone: conversaSelecionada.contatos.telefone,
          template_name: selectedTemplate.name,
          template_params: templateParams.filter(p => p.trim()),
          template_language: selectedTemplate.language || 'en_US',
        },
      });
      
      if (error) throw error;
      
      // Salvar mensagem localmente
      const templateText = getTemplatePreview(selectedTemplate, templateParams);
      await supabase.from('mensagens').insert({
        conversa_id: conversaSelecionada.id,
        conteudo: `📋 Template: ${selectedTemplate.name}\n${templateText}`,
        direcao: 'saida',
        tipo: 'texto',
        usuario_id: usuario?.id,
        contato_id: conversaSelecionada.contato_id,
      });
      
      // Fechar modal e limpar estado
      setShowTemplateModal(false);
      setSelectedTemplate(null);
      setTemplateParams([]);
      toast.success('Template enviado!');
    } catch (error) {
      console.error('Erro ao enviar template:', error);
      toast.error('Erro ao enviar template');
    } finally {
      setEnviando(false);
    }
  };

  const toggleTagFilter = (tagNome: string) => {
    setTagsFilter(prev => 
      prev.includes(tagNome)
        ? prev.filter(t => t !== tagNome)
        : [...prev, tagNome]
    );
  };

  const getTagColor = (tagNome: string) => {
    const tag = tagsDisponiveis.find(t => t.nome === tagNome);
    return tag?.cor || '#3b82f6';
  };

  const fetchMensagens = async (conversaId: string) => {
    try {
      const { data, error } = await supabase
        .from('mensagens')
        .select('*, usuario_deletou:deletada_por(nome)')
        .eq('conversa_id', conversaId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMensagens((data || []) as unknown as Mensagem[]);
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error);
    }
  };

  const marcarComoLida = async (conversaId: string) => {
    try {
      await supabase
        .from('conversas')
        .update({ nao_lidas: 0 })
        .eq('id', conversaId);
    } catch (error) {
      console.error('Erro ao marcar como lida:', error);
    }
  };

  const toggleAgenteIA = async () => {
    if (!conversaSelecionada) return;

    const novoStatus = !conversaSelecionada.agente_ia_ativo;
    try {
      await supabase
        .from('conversas')
        .update({ agente_ia_ativo: novoStatus })
        .eq('id', conversaSelecionada.id);

      setConversaSelecionada({ ...conversaSelecionada, agente_ia_ativo: novoStatus });
      toast.success(`Agente IA ${novoStatus ? 'ativado' : 'desativado'}`);
    } catch (error) {
      toast.error('Erro ao alterar status do Agente IA');
    }
  };

  const enviarMensagem = async () => {
    if (!novaMensagem.trim() || !conversaSelecionada || enviando) return;

    // Validar limite de mensagens do plano
    if (usuario?.conta_id) {
      const permitido = await validarEExibirErro(usuario.conta_id, 'mensagens', true);
      if (!permitido) return;
    }

    setEnviando(true);
    try {
      // Aplicar assinatura se ativada
      const mensagemFinal = usuario?.assinatura_ativa !== false
        ? `${usuario?.nome}:\n${novaMensagem}`
        : novaMensagem;

      // Salvar no banco e pegar o ID para passar ao enviar-mensagem
      const { data: novaMensagemData, error } = await supabase.from('mensagens').insert({
        conversa_id: conversaSelecionada.id,
        usuario_id: usuario!.id,
        conteudo: mensagemFinal,
        direcao: 'saida',
        tipo: 'texto',
        enviada_por_ia: false,
      }).select('id').single();

      if (error) throw error;

      // Atualizar conversa - desativar IA e atribuir atendente humano
      await supabase
        .from('conversas')
        .update({
          ultima_mensagem: mensagemFinal,
          ultima_mensagem_at: new Date().toISOString(),
          status: 'aguardando_cliente',
          agente_ia_ativo: false,
          atendente_id: usuario!.id,
        })
        .eq('id', conversaSelecionada.id);

      // Atualizar estado local
      setConversaSelecionada(prev => prev ? {
        ...prev,
        agente_ia_ativo: false,
        atendente_id: usuario!.id
      } : null);

      // Buscar conexão específica da conversa
      const conexaoDaConversa = getConexaoDaConversa(conversaSelecionada);
      const conexaoIdToUse = conversaSelecionada.conexao_id || conexaoDaConversa?.id;
      
      if (conexaoIdToUse && conexaoDaConversa?.status === 'conectado') {
        const { error: envioError } = await supabase.functions.invoke('enviar-mensagem', {
          body: {
            conexao_id: conexaoIdToUse,
            telefone: conversaSelecionada.contatos.telefone,
            mensagem: mensagemFinal,
            grupo_jid: conversaSelecionada.contatos.grupo_jid || undefined,
            mensagem_id: novaMensagemData?.id,
          },
        });

        if (envioError) {
          console.error('Erro ao enviar via WhatsApp:', envioError);
          toast.error('Mensagem salva, mas erro ao enviar via WhatsApp');
        }
        
        // Atualizar conexao_id na conversa se estava vazio
        if (!conversaSelecionada.conexao_id && conexaoIdToUse) {
          await supabase
            .from('conversas')
            .update({ conexao_id: conexaoIdToUse })
            .eq('id', conversaSelecionada.id);
        }
      } else if (!conexaoDaConversa || conexaoDaConversa.status !== 'conectado') {
        toast.warning('Conexão não disponível. Mensagem salva apenas no CRM.');
      }

      setNovaMensagem('');
      fetchMensagens(conversaSelecionada.id);
      fetchConversas();
    } catch (error) {
      toast.error('Erro ao enviar mensagem');
    } finally {
      setEnviando(false);
    }
  };

  const encerrarAtendimento = async () => {
    if (!conversaSelecionada) return;

    try {
      // Inserir mensagem de sistema registrando o encerramento
      const nomeUsuario = usuario?.nome || 'Sistema';
      await supabase
        .from('mensagens')
        .insert({
          conversa_id: conversaSelecionada.id,
          conteudo: `🔒 Atendimento encerrado por ${nomeUsuario}`,
          direcao: 'saida',
          tipo: 'sistema',
          usuario_id: usuario?.id || null,
        });

      await supabase
        .from('conversas')
        .update({ 
          status: 'encerrado', 
          arquivada: false,
          agente_ia_ativo: false,
          memoria_limpa_em: new Date(Date.now() + 5000).toISOString()
        })
        .eq('id', conversaSelecionada.id);

      toast.success('Atendimento encerrado');
      setConversaSelecionada(prev => prev ? { ...prev, status: 'encerrado' } : null);
      fetchConversas();
      fetchMensagens(conversaSelecionada.id);
    } catch (error) {
      toast.error('Erro ao encerrar atendimento');
    }
  };

  const reabrirAtendimento = async () => {
    if (!conversaSelecionada) return;

    try {
      // Inserir mensagem de sistema registrando a reabertura
      const nomeUsuario = usuario?.nome || 'Sistema';
      await supabase
        .from('mensagens')
        .insert({
          conversa_id: conversaSelecionada.id,
          conteudo: `🔓 Conversa reaberta por ${nomeUsuario}`,
          direcao: 'saida',
          tipo: 'sistema',
          usuario_id: usuario?.id || null,
        });

      await supabase
        .from('conversas')
        .update({ 
          status: 'em_atendimento', 
          arquivada: false 
        })
        .eq('id', conversaSelecionada.id);

      toast.success('Conversa reaberta');
      setConversaSelecionada(prev => prev ? { ...prev, status: 'em_atendimento' } : null);
      fetchConversas();
      fetchMensagens(conversaSelecionada.id);
    } catch (error) {
      toast.error('Erro ao reabrir conversa');
    }
  };

  const conversaEncerrada = conversaSelecionada?.status === 'encerrado';

  const transferirAtendimento = async (paraUsuarioId: string | null, paraIA: boolean, paraAgenteIAId?: string, etapaIAId?: string) => {
    if (!conversaSelecionada) return;

    try {
      // Chamar edge function que faz rastreamento e resposta automática
      const { data, error } = await supabase.functions.invoke('transferir-atendimento', {
        body: {
          conversa_id: conversaSelecionada.id,
          de_usuario_id: usuario?.id,
          para_usuario_id: paraUsuarioId,
          para_agente_ia_id: paraAgenteIAId,
          para_ia: paraIA,
          conta_id: usuario?.conta_id,
          etapa_ia_id: etapaIAId,
        },
      });

      if (error) throw error;

      toast.success(data?.mensagem || (paraIA ? 'Transferido para Agente IA' : 'Atendimento transferido'));
      setShowTransferModal(false);
      setTransferType('choice');
      setAgenteParaTransferir(null);
      setEtapasAgenteIA([]);
      setConversaSelecionada(null);
      fetchConversas();
    } catch (error) {
      console.error('Erro ao transferir:', error);
      toast.error('Erro ao transferir atendimento');
    }
  };

  // Carregar etapas do agente IA selecionado para transferência
  useEffect(() => {
    if (agenteParaTransferir && transferType === 'agente-etapa') {
      const fetchEtapasAgente = async () => {
        const { data } = await supabase
          .from('agent_ia_etapas')
          .select('*')
          .eq('agent_ia_id', agenteParaTransferir)
          .order('numero', { ascending: true });
        setEtapasAgenteIA(data || []);
      };
      fetchEtapasAgente();
    }
  }, [agenteParaTransferir, transferType]);

  const handleFileSelect = (type: 'imagem' | 'documento' | 'audio') => {
    setFileType(type);
    setShowAttachMenu(false);
    // Usar setTimeout para garantir que o estado foi atualizado antes de abrir o diálogo
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 0);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversaSelecionada) return;

    // Validar limite de mensagens do plano
    if (usuario?.conta_id) {
      const permitido = await validarEExibirErro(usuario.conta_id, 'mensagens', true);
      if (!permitido) {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
    }

    setUploading(true);
    try {
      // Converter arquivo para base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onloadend = async () => {
        const base64Full = reader.result as string;
        const base64Data = base64Full.split(',')[1];
        
        // Upload para o storage
        const fileName = `${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('whatsapp-media')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Obter URL pública
        const { data: urlData } = supabase.storage
          .from('whatsapp-media')
          .getPublicUrl(fileName);

        const mediaUrl = urlData.publicUrl;

        // Salvar mensagem no banco e pegar o ID
        const { data: novaMensagemData } = await supabase.from('mensagens').insert({
          conversa_id: conversaSelecionada.id,
          usuario_id: usuario!.id,
          conteudo: file.name,
          direcao: 'saida',
          tipo: fileType,
          media_url: mediaUrl,
          enviada_por_ia: false,
        }).select('id').single();

        // Atualizar conversa - desativar IA e atribuir atendente humano
        await supabase
          .from('conversas')
          .update({
            ultima_mensagem: `📎 ${file.name}`,
            ultima_mensagem_at: new Date().toISOString(),
            agente_ia_ativo: false,
            atendente_id: usuario!.id,
          })
          .eq('id', conversaSelecionada.id);

        // Atualizar estado local
        setConversaSelecionada(prev => prev ? {
          ...prev,
          agente_ia_ativo: false,
          atendente_id: usuario!.id
        } : null);

        // Enviar via WhatsApp usando a conexão específica da conversa
        const conexaoDaConversa = getConexaoDaConversa(conversaSelecionada);
        const conexaoIdToUse = conversaSelecionada.conexao_id || conexaoDaConversa?.id;
        if (conexaoIdToUse && conexaoDaConversa?.status === 'conectado') {
          const { error: envioError } = await supabase.functions.invoke('enviar-mensagem', {
            body: {
              conexao_id: conexaoIdToUse,
              telefone: conversaSelecionada.contatos.telefone,
              mensagem: '',
              tipo: fileType,
              media_url: mediaUrl,
              grupo_jid: conversaSelecionada.contatos.grupo_jid || undefined,
              mensagem_id: novaMensagemData?.id,
            },
          });

          if (envioError) {
            console.error('Erro ao enviar via WhatsApp:', envioError);
            toast.warning('Arquivo salvo, mas erro ao enviar via WhatsApp');
          }
        }

        fetchMensagens(conversaSelecionada.id);
        fetchConversas();
        toast.success('Arquivo enviado');
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      };
    } catch (error) {
      console.error('Erro ao enviar arquivo:', error);
      toast.error('Erro ao enviar arquivo');
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSendAudio = async (audioBase64: string, duration: number, mimeType: string = 'audio/mpeg') => {
    if (!conversaSelecionada) return;

    // Validar limite de mensagens do plano
    if (usuario?.conta_id) {
      const permitido = await validarEExibirErro(usuario.conta_id, 'mensagens', true);
      if (!permitido) return;
    }

    try {
      // Determinar extensão baseada no mimeType
      const extension = mimeType === 'audio/mpeg' ? 'mp3' : mimeType === 'audio/ogg' ? 'ogg' : 'webm';
      
      // Converter base64 para blob para salvar no storage
      const binaryString = atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      
      // Upload para o storage
      const fileName = `${Date.now()}-audio.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(fileName, blob, { contentType: mimeType });

      if (uploadError) throw uploadError;

      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from('whatsapp-media')
        .getPublicUrl(fileName);

      const mediaUrl = urlData.publicUrl;
      
      const durationFormatted = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;

      // Salvar mensagem no banco e pegar o ID
      const { data: novaMensagemData } = await supabase.from('mensagens').insert({
        conversa_id: conversaSelecionada.id,
        usuario_id: usuario!.id,
        conteudo: `🎤 Áudio (${durationFormatted})`,
        direcao: 'saida',
        tipo: 'audio',
        media_url: mediaUrl,
        enviada_por_ia: false,
      }).select('id').single();

      // Atualizar conversa - desativar IA e atribuir atendente humano
      await supabase
        .from('conversas')
        .update({
          ultima_mensagem: `🎤 Áudio (${durationFormatted})`,
          ultima_mensagem_at: new Date().toISOString(),
          agente_ia_ativo: false,
          atendente_id: usuario!.id,
        })
        .eq('id', conversaSelecionada.id);

      // Atualizar estado local
      setConversaSelecionada(prev => prev ? {
        ...prev,
        agente_ia_ativo: false,
        atendente_id: usuario!.id
      } : null);

      // Enviar via WhatsApp - usar media_url já que o áudio está em formato MP3 compatível
      const conexaoDaConversa = getConexaoDaConversa(conversaSelecionada);
      const conexaoIdToUse = conversaSelecionada.conexao_id || conexaoDaConversa?.id;
      if (conexaoIdToUse && conexaoDaConversa?.status === 'conectado') {
        const { error: envioError } = await supabase.functions.invoke('enviar-mensagem', {
          body: {
            conexao_id: conexaoIdToUse,
            telefone: conversaSelecionada.contatos.telefone,
            mensagem: '',
            tipo: 'audio',
            media_url: mediaUrl,
            grupo_jid: conversaSelecionada.contatos.grupo_jid || undefined,
            mensagem_id: novaMensagemData?.id,
          },
        });

        if (envioError) {
          console.error('Erro ao enviar áudio via WhatsApp:', envioError);
          toast.warning('Áudio salvo, mas erro ao enviar via WhatsApp');
        }
      }

      fetchMensagens(conversaSelecionada.id);
      fetchConversas();
      toast.success('Áudio enviado');
    } catch (error) {
      console.error('Erro ao enviar áudio:', error);
      toast.error('Erro ao enviar áudio');
    }
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (date: string) => {
    const now = new Date();
    const messageDate = new Date(date);
    const diffInMinutes = Math.floor((now.getTime() - messageDate.getTime()) / 60000);
    
    if (diffInMinutes < 1) return 'Agora';
    if (diffInMinutes < 60) return `${diffInMinutes}min`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    if (diffInMinutes < 2880) return 'Ontem';
    return messageDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const formatDateSeparator = (date: string) => {
    const messageDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (messageDate.toDateString() === today.toDateString()) return 'Hoje';
    if (messageDate.toDateString() === yesterday.toDateString()) return 'Ontem';
    return messageDate.toLocaleDateString('pt-BR', { 
      weekday: 'long', 
      day: '2-digit', 
      month: 'long' 
    });
  };

  const shouldShowDateSeparator = (currentMsg: Mensagem, prevMsg: Mensagem | null) => {
    if (!prevMsg) return true;
    const currentDate = new Date(currentMsg.created_at).toDateString();
    const prevDate = new Date(prevMsg.created_at).toDateString();
    return currentDate !== prevDate;
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'em_atendimento':
        return 'bg-green-500';
      case 'aguardando_cliente':
        return 'bg-yellow-500';
      case 'encerrado':
        return 'bg-muted-foreground';
      default:
        return 'bg-blue-500';
    }
  };

  const getStatusLabel = (status: string | null) => {
    switch (status) {
      case 'em_atendimento':
        return 'Em Atendimento';
      case 'aguardando_cliente':
        return 'Aguardando';
      case 'encerrado':
        return 'Encerrado';
      default:
        return 'Novo';
    }
  };

  const getMediaPreviewIcon = (ultimaMensagem: string | null) => {
    if (!ultimaMensagem) return null;
    if (ultimaMensagem.includes('📷') || ultimaMensagem.includes('🖼')) return '📷';
    if (ultimaMensagem.includes('🎤') || ultimaMensagem.includes('🎵')) return '🎵';
    if (ultimaMensagem.includes('📎') || ultimaMensagem.includes('📄')) return '📄';
    return null;
  };

  const handleDeletarMensagem = async () => {
    if (!mensagemParaDeletar || !usuario) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('deletar-mensagem', {
        body: { 
          mensagem_id: mensagemParaDeletar,
          usuario_id: usuario.id,
        },
      });

      if (error) {
        console.error('Erro ao deletar mensagem:', error);
        toast.error('Erro ao deletar mensagem');
      } else {
        // Marcar como deletada no estado local (não remover da lista)
        setMensagens(prev => prev.map(m => 
          m.id === mensagemParaDeletar 
            ? { 
                ...m, 
                deletada: true, 
                deletada_por: usuario.id, 
                deletada_em: new Date().toISOString(),
                usuario_deletou: { nome: usuario.nome }
              } 
            : m
        ));
        if (data?.whatsapp_deleted) {
          toast.success('Mensagem apagada do WhatsApp e CRM');
        } else {
          toast.success('Mensagem apagada do CRM');
        }
      }
    } catch (error) {
      console.error('Erro ao deletar mensagem:', error);
      toast.error('Erro ao deletar mensagem');
    }
    setMensagemParaDeletar(null);
  };

  const filteredConversas = conversas.filter((c) => {
    const matchesSearch = c.contatos.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = 
      statusFilter === 'todos' || 
      (statusFilter === 'abertos' && (c.status === 'em_atendimento' || c.status === 'aguardando_cliente')) ||
      c.status === statusFilter;
    const matchesAtendente = 
      atendenteFilter === 'todos' ||
      (atendenteFilter === 'agente_ia' && c.agente_ia_ativo === true) ||
      (atendenteFilter === 'humano' && c.agente_ia_ativo === false);
    const matchesTipo =
      tipoFilter === 'todos' ||
      (tipoFilter === 'grupo' && c.contatos.is_grupo === true) ||
      (tipoFilter === 'individual' && !c.contatos.is_grupo) ||
      (tipoFilter === 'cliente' && c.negociacoes?.some(n => n.estagio?.tipo === 'cliente'));
    const matchesTags = 
      tagsFilter.length === 0 ||
      tagsFilter.some(tag => c.contatos.tags?.includes(tag));
    return matchesSearch && matchesStatus && matchesAtendente && matchesTipo && matchesTags;
  });

  const renderMensagem = (msg: Mensagem, index: number) => {
    const prevMsg = index > 0 ? mensagens[index - 1] : null;
    const showDateSeparator = shouldShowDateSeparator(msg, prevMsg);

    // Mensagem deletada
    if (msg.deletada) {
      const nomeQuemApagou = msg.usuario_deletou?.nome || 'Desconhecido';
      return (
        <div key={msg.id} className="animate-message-in">
          {showDateSeparator && (
            <div className="date-separator">
              <span>{formatDateSeparator(msg.created_at)}</span>
            </div>
          )}
          <div className={cn(
            'flex mb-1',
            msg.direcao === 'saida' ? 'justify-end' : 'justify-start'
          )}>
            <div className={cn(
              'max-w-[70%] rounded-2xl px-4 py-2.5',
              msg.direcao === 'saida' 
                ? 'bg-primary/10 rounded-br-md' 
                : 'bg-muted/30 rounded-bl-md'
            )}>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Ban className="h-4 w-4 flex-shrink-0 opacity-60" />
                <span className="text-sm italic">Mensagem apagada</span>
              </div>
              <div className="flex items-center justify-between mt-1 gap-4">
                <span className="text-xs text-muted-foreground/60">
                  apagada por {nomeQuemApagou}
                </span>
                <span className="text-xs text-muted-foreground/60">
                  {msg.deletada_em ? formatTime(msg.deletada_em) : formatTime(msg.created_at)}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Mensagem de sistema (rastreamento interno)
    if (msg.tipo === 'sistema') {
      return (
        <div key={msg.id} className="animate-message-in">
          {showDateSeparator && (
            <div className="date-separator">
              <span>{formatDateSeparator(msg.created_at)}</span>
            </div>
          )}
          <div className="flex justify-center my-1">
            <div className="bg-muted/50 border border-border rounded-lg px-3 py-2 flex items-center gap-2">
              {msg.conteudo.includes('encerrado') ? (
                <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              ) : msg.conteudo.includes('reaberta') ? (
                <Unlock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              ) : (
                <Activity className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              )}
              <span className="text-xs text-muted-foreground">{msg.conteudo}</span>
              <span className="text-xs text-muted-foreground/60 flex-shrink-0">
                {formatTime(msg.created_at)}
              </span>
            </div>
          </div>
        </div>
      );
    }

    const isMedia = msg.tipo && msg.tipo !== 'texto' && msg.media_url;

    // Verificar se é grupo e se tem info do participante
    const isGrupo = conversaSelecionada?.contatos?.is_grupo;
    const participanteNome = msg.metadata?.participante_nome;
    const participanteTelefone = msg.metadata?.participante_telefone;
    
    // Gerar cor consistente baseada no telefone do participante
    const getParticipantColor = (telefone: string | undefined) => {
      if (!telefone) return 'text-primary';
      const colors = [
        'text-blue-500',
        'text-emerald-500', 
        'text-violet-500',
        'text-rose-500',
        'text-amber-500',
        'text-cyan-500',
        'text-pink-500',
        'text-lime-500',
      ];
      let hash = 0;
      for (let i = 0; i < telefone.length; i++) {
        hash = telefone.charCodeAt(i) + ((hash << 5) - hash);
      }
      return colors[Math.abs(hash) % colors.length];
    };

    return (
      <div key={msg.id} className="animate-message-in">
        {showDateSeparator && (
          <div className="date-separator">
            <span>{formatDateSeparator(msg.created_at)}</span>
          </div>
        )}
        <div
          className={cn(
            'flex mb-1 group',
            msg.direcao === 'saida' ? 'justify-end' : 'justify-start'
          )}
        >
          <div className="relative max-w-[70%]">
            {/* Menu de opções - aparece no hover apenas para mensagens de saída */}
            {msg.direcao === 'saida' && (
              <div className="absolute top-0 -left-8 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1 rounded-md bg-background/80 hover:bg-muted border border-border/50 shadow-sm">
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover">
                    <DropdownMenuItem 
                      onClick={() => setMensagemParaDeletar(msg.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Apagar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            <div
              className={cn(
                'min-w-[120px] rounded-2xl px-4 py-2.5 message-bubble',
                msg.direcao === 'saida'
                  ? 'message-bubble-sent text-primary-foreground rounded-br-md'
                  : 'message-bubble-received text-foreground rounded-bl-md'
              )}
            >
              {/* Nome do participante em grupos */}
              {isGrupo && msg.direcao === 'entrada' && participanteNome && (
                <div className={cn(
                  'text-xs font-semibold mb-1',
                  getParticipantColor(participanteTelefone)
                )}>
                  {participanteNome}
                </div>
              )}
              
              {/* Label do remetente - IA, dispositivo ou humano com assinatura */}
              {msg.direcao === 'saida' && (() => {
                // Detectar assinatura no formato "Nome:\n" no início do conteúdo
                const parseAssinatura = () => {
                  const content = msg.conteudo || '';
                  // Só tenta parsear se não for IA nem dispositivo
                  if (msg.enviada_por_ia || msg.enviada_por_dispositivo) return null;
                  const match = content.match(/^(.+?):\n/);
                  if (match && match[1].length <= 30) { // Nome até 30 chars
                    return match[1];
                  }
                  return null;
                };
                
                const assinaturaNome = parseAssinatura();
                
                if (msg.enviada_por_ia) {
                  return (
                    <div className="flex items-center gap-1.5 text-xs opacity-80 mb-1 font-medium">
                      <User className="h-3.5 w-3.5" />
                      <span>Agente IA</span>
                    </div>
                  );
                } else if (msg.enviada_por_dispositivo) {
                  return (
                    <div className="flex items-center gap-1.5 text-xs opacity-80 mb-1.5 font-medium">
                      <Phone className="h-3.5 w-3.5" />
                      <span>Via dispositivo</span>
                    </div>
                  );
                } else if (assinaturaNome) {
                  return (
                    <div className="flex items-center gap-1.5 text-xs opacity-80 mb-1 font-medium">
                      <User className="h-3.5 w-3.5" />
                      <span>{assinaturaNome}</span>
                    </div>
                  );
                }
                return null;
              })()}
              
              {isMedia ? (
                <div className="space-y-2">
                  {msg.tipo === 'imagem' && (
                    <img 
                      src={msg.media_url!} 
                      alt="Imagem"
                      className="max-w-[200px] max-h-[200px] object-cover rounded-xl cursor-pointer hover:opacity-90 hover:scale-[1.02] transition-all duration-200 shadow-md"
                      onClick={() => setImagemExpandida(msg.media_url)}
                    />
                  )}
                  {msg.tipo === 'audio' && (
                    <AudioPlayer 
                      src={msg.media_url!} 
                      variant={msg.direcao === 'saida' ? 'sent' : 'received'}
                    />
                  )}
                  {msg.tipo === 'documento' && (() => {
                    const fileName = msg.conteudo || 'Documento';
                    const extension = fileName.split('.').pop()?.toLowerCase() || '';
                    
                    const getFileIcon = () => {
                      switch (extension) {
                        case 'pdf':
                          return <FileText className="h-8 w-8 text-red-500" />;
                        case 'doc':
                        case 'docx':
                          return <FileText className="h-8 w-8 text-blue-500" />;
                        case 'xls':
                        case 'xlsx':
                          return <FileSpreadsheet className="h-8 w-8 text-green-500" />;
                        case 'zip':
                        case 'rar':
                        case '7z':
                          return <Archive className="h-8 w-8 text-amber-500" />;
                        default:
                          return <FileIcon className="h-8 w-8 text-muted-foreground" />;
                      }
                    };
                    
                    const getFileType = () => {
                      switch (extension) {
                        case 'pdf': return 'PDF';
                        case 'doc':
                        case 'docx': return 'Word';
                        case 'xls':
                        case 'xlsx': return 'Excel';
                        case 'zip':
                        case 'rar':
                        case '7z': return 'Arquivo';
                        case 'ppt':
                        case 'pptx': return 'PowerPoint';
                        default: return extension.toUpperCase() || 'Documento';
                      }
                    };
                    
                    const handleDownload = async () => {
                      try {
                        const response = await fetch(msg.media_url!);
                        const blob = await response.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        
                        const link = document.createElement('a');
                        link.href = blobUrl;
                        link.download = fileName;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        
                        URL.revokeObjectURL(blobUrl);
                        toast.success('Download iniciado!');
                      } catch (error) {
                        console.error('Erro ao baixar arquivo:', error);
                        toast.error('Erro ao baixar. Abrindo em nova aba...');
                        window.open(msg.media_url!, '_blank');
                      }
                    };
                    
                    return (
                      <button 
                        onClick={handleDownload}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-md cursor-pointer text-left w-full",
                          msg.direcao === 'saida' 
                            ? "bg-background/30 border-primary-foreground/20 hover:bg-background/50" 
                            : "bg-muted/50 border-border hover:bg-muted"
                        )}
                      >
                        <div className="flex-shrink-0">
                          {getFileIcon()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{fileName}</p>
                          <p className="text-xs opacity-70">{getFileType()} • Clique para baixar</p>
                        </div>
                        <div className="flex-shrink-0">
                          <Download className="h-5 w-5 opacity-60" />
                        </div>
                      </button>
                    );
                  })()}
                  {msg.tipo === 'video' && (
                    <video controls className="max-w-full rounded-xl shadow-md">
                      <source src={msg.media_url!} />
                    </video>
                  )}
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {/* Remover assinatura do conteúdo se presente */}
                  {msg.direcao === 'saida' && !msg.enviada_por_ia && !msg.enviada_por_dispositivo
                    ? (msg.conteudo || '').replace(/^.+?:\n/, '')
                    : msg.conteudo}
                </p>
              )}
              
              <div
                className={cn(
                  'flex items-center gap-1.5 mt-1.5',
                  msg.direcao === 'saida' ? 'justify-end' : 'justify-start'
                )}
              >
                <span className="text-[11px] opacity-70">{formatTime(msg.created_at)}</span>
                {msg.direcao === 'saida' && (
                  msg.lida ? (
                    <CheckCheck className="h-3.5 w-3.5 text-blue-300" />
                  ) : (
                    <Check className="h-3.5 w-3.5 opacity-70" />
                  )
                )}
              </div>
            </div>

            {/* Reações - badge no canto inferior da mensagem (igual WhatsApp) */}
            {msg.metadata?.reactions && msg.metadata.reactions.length > 0 && (
              <div className={cn(
                'absolute -bottom-2.5 px-1.5 py-0.5 rounded-full bg-card border border-border shadow-sm flex items-center gap-0.5',
                msg.direcao === 'saida' ? 'right-2' : 'left-2'
              )}>
                {/* Mostrar emojis únicos */}
                {[...new Set(msg.metadata.reactions.map(r => r.emoji))].slice(0, 3).map((emoji, idx) => (
                  <span key={idx} className="text-sm leading-none">{emoji}</span>
                ))}
                {/* Contador se mais de uma reação */}
                {msg.metadata.reactions.length > 1 && (
                  <span className="text-[10px] text-muted-foreground ml-0.5">
                    {msg.metadata.reactions.length}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <MainLayout>
      <div className={cn(
        "flex overflow-hidden bg-card animate-fade-in",
        isMobile 
          ? "h-[calc(100vh-7.5rem)]" 
          : "h-[calc(100vh-3rem)] rounded-xl border border-border"
      )}>
        {/* Lista de Conversas */}
        <div className={cn(
          "border-r border-border flex flex-col bg-card/50",
          isMobile 
            ? cn("w-full", mobileView === 'chat' && "hidden")
            : "w-96"
        )}>
          {/* Header */}
          <div className="p-4 border-b border-border bg-card/80 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">Conversas</h2>
              
              <div className="flex items-center gap-2">
                {/* Status das Conexões */}
                {(() => {
                  const conectadas = conexoes.filter(c => c.status === 'conectado').length;
                  const total = conexoes.length;
                  const temConectada = conectadas > 0;
                  const temAguardando = conexoes.some(c => c.status === 'aguardando');
                  
                  return (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={cn(
                            'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 cursor-help',
                            temConectada 
                              ? 'bg-green-500/20 text-green-400 shadow-[0_0_12px_hsl(142_70%_45%/0.3)]' 
                              : temAguardando
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-destructive/20 text-destructive'
                          )}>
                            {temConectada ? (
                              <>
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                {conectadas}/{total}
                              </>
                            ) : temAguardando ? (
                              <>
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                Conectando
                              </>
                            ) : (
                              <>
                                <WifiOff className="h-3 w-3" />
                                {total === 0 ? 'Sem conexão' : 'Offline'}
                              </>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <div className="space-y-1">
                            <p className="font-semibold">Conexões ({total})</p>
                            {conexoes.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nenhuma conexão configurada</p>
                            ) : (
                              conexoes.map(c => (
                                <div key={c.id} className="flex items-center gap-2 text-xs">
                                  <span className={cn(
                                    'h-2 w-2 rounded-full',
                                    c.status === 'conectado' ? 'bg-green-500' : 
                                    c.status === 'aguardando' ? 'bg-yellow-500' : 'bg-destructive'
                                  )} />
                                  <span>{c.nome || c.instance_name}</span>
                                  {c.tipo_provedor === 'instagram' && <Instagram className="h-3 w-3 text-pink-500" />}
                                  {c.tipo_provedor === 'meta' && <Phone className="h-3 w-3 text-green-500" />}
                                </div>
                              ))
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}

                {/* Botão Filtros com Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border',
                        (atendenteFilter !== 'todos' || tipoFilter !== 'todos' || tagsFilter.length > 0)
                          ? 'bg-primary/20 text-primary border-primary/30'
                          : 'bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Filtros
                      {(atendenteFilter !== 'todos' || tipoFilter !== 'todos' || tagsFilter.length > 0) && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                          {(atendenteFilter !== 'todos' ? 1 : 0) + (tipoFilter !== 'todos' ? 1 : 0) + (tagsFilter.length > 0 ? 1 : 0)}
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-2">
                    <div className="space-y-3">
                      {/* Atendente */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2">
                          Atendente
                        </span>
                        <div className="space-y-1">
                          <button
                            onClick={() => setAtendenteFilter('todos')}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                              atendenteFilter === 'todos'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-foreground hover:bg-muted'
                            )}
                          >
                            <Users className="h-4 w-4" />
                            Todos
                          </button>
                          <button
                            onClick={() => setAtendenteFilter('agente_ia')}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                              atendenteFilter === 'agente_ia'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-foreground hover:bg-muted'
                            )}
                          >
                            <Bot className="h-4 w-4" />
                            Agente IA
                          </button>
                          <button
                            onClick={() => setAtendenteFilter('humano')}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                              atendenteFilter === 'humano'
                                ? 'bg-orange-500 text-white'
                                : 'text-foreground hover:bg-muted'
                            )}
                          >
                            <User className="h-4 w-4" />
                            Humano
                          </button>
                        </div>
                      </div>

                      <div className="h-px bg-border/50" />

                      {/* Tipo de Conversa */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2">
                          Tipo
                        </span>
                        <div className="space-y-1">
                          <button
                            onClick={() => setTipoFilter('todos')}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                              tipoFilter === 'todos'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-foreground hover:bg-muted'
                            )}
                          >
                            <MessageCircle className="h-4 w-4" />
                            Todos
                          </button>
                          <button
                            onClick={() => setTipoFilter('individual')}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                              tipoFilter === 'individual'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-foreground hover:bg-muted'
                            )}
                          >
                            <User className="h-4 w-4" />
                            Individual
                          </button>
                          <button
                            onClick={() => setTipoFilter('grupo')}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                              tipoFilter === 'grupo'
                                ? 'bg-blue-500 text-white'
                                : 'text-foreground hover:bg-muted'
                            )}
                          >
                            <Users className="h-4 w-4" />
                            Grupos
                          </button>
                          <button
                            onClick={() => setTipoFilter('cliente')}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                              tipoFilter === 'cliente'
                                ? 'bg-cyan-500 text-white'
                                : 'text-foreground hover:bg-muted'
                            )}
                          >
                            <UserCheck className="h-4 w-4" />
                            Clientes
                          </button>
                        </div>
                      </div>

                      {/* Tags */}
                      {tagsDisponiveis.length > 0 && (
                        <>
                          <div className="h-px bg-border/50" />
                          <div className="space-y-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2">
                              Tags
                            </span>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border/50 bg-background hover:bg-muted text-sm transition-all">
                                  <div className="flex items-center gap-2">
                                    <Tag className="h-4 w-4 text-muted-foreground" />
                                    {tagsFilter.length > 0 ? (
                                      <div className="flex items-center gap-1.5">
                                        {tagsFilter.slice(0, 3).map((tagNome) => {
                                          const tag = tagsDisponiveis.find(t => t.nome === tagNome);
                                          return tag ? (
                                            <div
                                              key={tag.id}
                                              className="h-4 w-4 rounded-full shrink-0 ring-2 ring-background"
                                              style={{ backgroundColor: tag.cor }}
                                              title={tag.nome}
                                            />
                                          ) : null;
                                        })}
                                        {tagsFilter.length > 3 && (
                                          <span className="text-xs text-muted-foreground">+{tagsFilter.length - 3}</span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-foreground">Selecionar tags</span>
                                    )}
                                  </div>
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-2 bg-popover border border-border" align="start" side="bottom">
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {tagsDisponiveis.map((tag) => {
                                    const isSelected = tagsFilter.includes(tag.nome);
                                    return (
                                      <button
                                        key={tag.id}
                                        onClick={() => toggleTagFilter(tag.nome)}
                                        className={cn(
                                          'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all',
                                          isSelected 
                                            ? 'bg-primary/10 text-foreground' 
                                            : 'hover:bg-muted text-foreground'
                                        )}
                                      >
                                        <div 
                                          className="h-3 w-3 rounded-full shrink-0"
                                          style={{ backgroundColor: tag.cor }}
                                        />
                                        <span className="flex-1 text-left">{tag.nome}</span>
                                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                                      </button>
                                    );
                                  })}
                                </div>
                                {tagsFilter.length > 0 && (
                                  <>
                                    <div className="h-px bg-border my-2" />
                                    <button
                                      onClick={() => setTagsFilter([])}
                                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                                    >
                                      <X className="h-4 w-4" />
                                      Limpar
                                    </button>
                                  </>
                                )}
                              </PopoverContent>
                            </Popover>
                          </div>
                        </>
                      )}

                      <div className="h-px bg-border/50" />

                      {/* Limpar Filtros */}
                      <button
                        onClick={() => { setAtendenteFilter('todos'); setTipoFilter('todos'); setTagsFilter([]); }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
                      >
                        <X className="h-4 w-4" />
                        Limpar Filtros
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Campo de Busca */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar conversa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 input-glow transition-all duration-200"
              />
            </div>

            {/* Botões de Status */}
            <div className="flex items-center gap-1 mb-3">
              <button
                onClick={() => setStatusFilter('todos')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 border',
                  statusFilter === 'todos'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground'
                )}
              >
                Todos
              </button>
              <button
                onClick={() => setStatusFilter('abertos')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 border',
                  statusFilter === 'abertos'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground'
                )}
              >
                Abertos
              </button>
              <button
                onClick={() => setStatusFilter('encerrado')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 border',
                  statusFilter === 'encerrado'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground'
                )}
              >
                Encerrado
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-32 gap-3">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">Carregando...</span>
              </div>
            ) : filteredConversas.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <MessageSquareIcon className="h-16 w-16 mx-auto mb-4 opacity-30 empty-state-icon" />
                <p className="text-lg font-medium">Nenhuma conversa</p>
                <p className="text-sm mt-1 opacity-80">As conversas aparecerão aqui</p>
              </div>
            ) : (
              filteredConversas.map((conversa, index) => (
                <div
                  key={conversa.id}
                  onClick={() => {
                    setConversaSelecionada(conversa);
                    if (isMobile) setMobileView('chat');
                  }}
                  style={{ animationDelay: `${index * 30}ms` }}
                  className={cn(
                    'flex items-center gap-3 p-4 cursor-pointer border-b border-border/30 conversation-card animate-fade-in',
                    conversaSelecionada?.id === conversa.id && 'active',
                    (conversa.nao_lidas || 0) > 0 && 'unread'
                  )}
                >
                  <div className="relative">
                    {conversa.contatos.is_grupo ? (
                      <div className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-blue-500/10 text-blue-500 font-bold text-lg transition-all duration-200",
                        conversaSelecionada?.id === conversa.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                      )}>
                        <Users className="h-6 w-6" />
                      </div>
                    ) : conversa.contatos.avatar_url ? (
                      <img
                        src={conversa.contatos.avatar_url}
                        alt={conversa.contatos.nome}
                        className={cn(
                          "h-12 w-12 rounded-full object-cover transition-all duration-200",
                          conversaSelecionada?.id === conversa.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        )}
                      />
                    ) : (
                      <div className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-primary font-bold text-lg transition-all duration-200",
                        conversaSelecionada?.id === conversa.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                      )}>
                        {conversa.contatos.nome.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {/* Não mostrar badge de IA/Humano para grupos */}
                    {!conversa.contatos.is_grupo && conversa.agente_ia_ativo ? (
                      <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow-md">
                        <Bot className="h-3 w-3 text-primary-foreground" />
                      </div>
                    ) : !conversa.contatos.is_grupo && conversa.atendente_id ? (
                      <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-orange-500 flex items-center justify-center shadow-md">
                        <User className="h-3 w-3 text-white" />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="font-semibold text-foreground truncate">
                        {conversa.contatos.nome}
                      </p>
                      {conversa.ultima_mensagem_at && (
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(conversa.ultima_mensagem_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mb-1">
                      {getMediaPreviewIcon(conversa.ultima_mensagem) && (
                        <span className="text-xs">{getMediaPreviewIcon(conversa.ultima_mensagem)}</span>
                      )}
                      <p className="text-sm text-muted-foreground truncate">
                        {conversa.ultima_mensagem || 'Sem mensagens'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Badge de Conexão/Canal */}
                      {(() => {
                        const conexaoDaConversa = getConexaoDaConversa(conversa);
                        if (conexaoDaConversa) {
                          return (
                            <span className={cn(
                              'text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5',
                              conexaoDaConversa.tipo_provedor === 'instagram' && 'bg-pink-500/20 text-pink-600 dark:text-pink-400',
                              conexaoDaConversa.tipo_provedor === 'meta' && 'bg-green-500/20 text-green-600 dark:text-green-400',
                              conexaoDaConversa.tipo_provedor === 'evolution' && 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            )}>
                              {conexaoDaConversa.tipo_provedor === 'instagram' ? (
                                <Instagram className="h-2.5 w-2.5" />
                              ) : (
                                <Phone className="h-2.5 w-2.5" />
                              )}
                              <span className="max-w-[60px] truncate">{conexaoDaConversa.nome || 'WhatsApp'}</span>
                            </span>
                          );
                        }
                        return null;
                      })()}
                      {/* Badge de Status */}
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                        conversa.status === 'em_atendimento' && 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
                        conversa.status === 'aguardando_cliente' && 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
                        conversa.status === 'encerrado' && 'bg-muted text-muted-foreground'
                      )}>
                        {conversa.status === 'em_atendimento' ? 'Em Atend.' : 
                         conversa.status === 'aguardando_cliente' ? 'Aguardando' : 'Encerrado'}
                      </span>
                      {/* Badge de Grupo */}
                      {conversa.contatos.is_grupo && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-500 flex items-center gap-0.5">
                          <Users className="h-2.5 w-2.5" /> Grupo
                        </span>
                      )}
                      {/* Badge IA/Humano - não mostrar para grupos */}
                      {!conversa.contatos.is_grupo && conversa.agente_ia_ativo ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/20 text-primary flex items-center gap-0.5">
                          <Bot className="h-2.5 w-2.5" /> IA
                        </span>
                      ) : !conversa.contatos.is_grupo && conversa.atendente_id ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center gap-0.5">
                          <User className="h-2.5 w-2.5" /> Humano
                        </span>
                      ) : null}
                      {/* Badge de Anúncio */}
                      {(conversa.contatos.metadata as OrigemAnuncio | undefined)?.ad_id || 
                       (conversa.contatos.metadata as { origem_anuncio?: OrigemAnuncio } | undefined)?.origem_anuncio ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center gap-0.5">
                          <Megaphone className="h-2.5 w-2.5" /> Anúncio
                        </span>
                      ) : null}
                      {/* Badge de Cliente */}
                      {conversa.negociacoes?.some(n => n.estagio?.tipo === 'cliente') && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center gap-0.5">
                          <UserCheck className="h-2.5 w-2.5" /> Cliente
                        </span>
                      )}
                    </div>
                  </div>
                  {(conversa.nao_lidas || 0) > 0 && (
                    <div className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground px-1.5 shadow-md animate-bounce-subtle">
                      {conversa.nao_lidas}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Área da Conversa */}
        {conversaSelecionada ? (
          <div className={cn(
            "flex-1 flex flex-col animate-slide-in-left bg-gradient-to-b from-background to-card/30",
            isMobile && mobileView === 'lista' && "hidden"
          )}>
            {/* Header da Conversa */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-card/80 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                {/* Botão Voltar (Mobile) */}
                {isMobile && (
                  <button
                    onClick={() => setMobileView('lista')}
                    className="p-2 -ml-2 rounded-xl hover:bg-muted/50 transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                <button
                  onClick={() => setShowContatoSidebar(true)}
                  className="flex items-center gap-3 hover:bg-muted/50 rounded-xl p-2 transition-all duration-200 cursor-pointer text-left group"
                >
                  <div className="relative">
                    {conversaSelecionada.contatos.is_grupo ? (
                      <div className="flex h-10 w-10 md:h-11 md:w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/40 to-blue-500/20 text-blue-500 ring-2 ring-blue-500/30 ring-offset-2 ring-offset-background transition-all duration-200 group-hover:ring-blue-500">
                        <Users className="h-5 w-5" />
                      </div>
                    ) : conversaSelecionada.contatos.avatar_url ? (
                      <img
                        src={conversaSelecionada.contatos.avatar_url}
                        alt={conversaSelecionada.contatos.nome}
                        className="h-10 w-10 md:h-11 md:w-11 rounded-full object-cover ring-2 ring-primary/30 ring-offset-2 ring-offset-background transition-all duration-200 group-hover:ring-primary"
                      />
                    ) : (
                      <div className="flex h-10 w-10 md:h-11 md:w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/20 text-primary font-bold text-lg ring-2 ring-primary/30 ring-offset-2 ring-offset-background transition-all duration-200 group-hover:ring-primary">
                        {conversaSelecionada.contatos.nome.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className={cn(
                      'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
                      conversaSelecionada.status === 'em_atendimento' ? 'bg-green-500' :
                      conversaSelecionada.status === 'aguardando_cliente' ? 'bg-yellow-500' : 'bg-muted-foreground'
                    )} />
                  </div>
                  <div className="hidden sm:block">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {conversaSelecionada.contatos.nome}
                      </span>
                      {!isMobile && conversaSelecionada.contatos.is_grupo && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/20 text-blue-500 flex items-center gap-1">
                          <Users className="h-3 w-3" /> Grupo
                        </span>
                      )}
                      {!isMobile && (
                        <span className={cn(
                          'px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide',
                          conversaSelecionada.status === 'em_atendimento' ? 'bg-green-500/20 text-green-400' :
                          conversaSelecionada.status === 'aguardando_cliente' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-muted text-muted-foreground'
                        )}>
                          {getStatusLabel(conversaSelecionada.status)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {conversaSelecionada.contatos.telefone}
                    </p>
                  </div>
                </button>
              </div>
              {!conversaEncerrada ? (
                <div className="flex items-center gap-1 md:gap-2">
                  {/* Indicador da Conexão usada */}
                  {!isMobile && (() => {
                    const conexaoDaConversa = getConexaoDaConversa(conversaSelecionada);
                    if (!conexaoDaConversa) return null;
                    return (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={cn(
                              'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium mr-2',
                              conexaoDaConversa.status === 'conectado' 
                                ? 'bg-green-500/10 text-green-500' 
                                : 'bg-destructive/10 text-destructive'
                            )}>
                              {conexaoDaConversa.tipo_provedor === 'instagram' ? (
                                <Instagram className="h-3 w-3" />
                              ) : conexaoDaConversa.tipo_provedor === 'meta' ? (
                                <Phone className="h-3 w-3" />
                              ) : (
                                <Wifi className="h-3 w-3" />
                              )}
                              <span className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                conexaoDaConversa.status === 'conectado' ? 'bg-green-500' : 'bg-destructive'
                              )} />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>{conexaoDaConversa.nome || conexaoDaConversa.instance_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {conexaoDaConversa.tipo_provedor === 'instagram' ? 'Instagram' : 
                               conexaoDaConversa.tipo_provedor === 'meta' ? 'WhatsApp Meta API' : 'WhatsApp Evolution'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })()}

                  {/* Tags do Contato - Esconder em mobile */}
                  {!isMobile && conversaSelecionada.contatos.tags && 
                   conversaSelecionada.contatos.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 mr-2">
                      {conversaSelecionada.contatos.tags.slice(0, 3).map((tagNome) => {
                        const tag = tagsDisponiveis.find(t => t.nome === tagNome);
                        return tag ? (
                          <span
                            key={tag.id}
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                            style={{ backgroundColor: tag.cor }}
                          >
                            {tag.nome}
                          </span>
                        ) : (
                          <span key={tagNome} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                            {tagNome}
                          </span>
                        );
                      })}
                      {conversaSelecionada.contatos.tags.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{conversaSelecionada.contatos.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Botão Toggle Agente IA / Humano - não mostrar para grupos */}
                  {!conversaSelecionada.contatos.is_grupo && (
                    <button
                      onClick={toggleAgenteIA}
                      className={cn(
                        'flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                        conversaSelecionada.agente_ia_ativo
                          ? 'bg-primary/20 text-primary hover:bg-primary/30 shadow-[0_0_12px_hsl(var(--primary)/0.2)]'
                          : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                      )}
                    >
                      {conversaSelecionada.agente_ia_ativo ? (
                        <>
                          <Bot className="h-4 w-4" />
                          <span className="hidden md:flex items-center gap-1.5">
                            {conversaSelecionada.agent_ia?.nome || 'Agente IA'}
                            {conversaSelecionada.etapa_ia && (
                              <>
                                <span className="text-primary/60">•</span>
                                <span className="text-xs opacity-80">
                                  Etapa {conversaSelecionada.etapa_ia.numero}: {conversaSelecionada.etapa_ia.nome}
                                </span>
                              </>
                            )}
                          </span>
                        </>
                      ) : (
                        <>
                          <User className="h-4 w-4" />
                          <span className="hidden md:inline">Humano</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Transferir - não mostrar para grupos (não faz sentido transferir grupo para IA) */}
                  {!conversaSelecionada.contatos.is_grupo && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setShowTransferModal(true)}
                            className="p-2 rounded-xl bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200"
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Transferir</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* Encerrar */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={encerrarAtendimento}
                          className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all duration-200"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Encerrar</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground italic">Conversa encerrada</span>
                  <button
                    onClick={reabrirAtendimento}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reabrir
                  </button>
                </div>
              )}
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {mensagens.map((msg, index) => renderMensagem(msg, index))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border bg-card/80 backdrop-blur-sm">
              {conversaEncerrada ? (
                <div className="flex items-center justify-between glass rounded-xl p-4">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <XCircle className="h-5 w-5" />
                    <span>Esta conversa foi encerrada</span>
                  </div>
                  <button
                    onClick={reabrirAtendimento}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reabrir Conversa
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="relative" ref={attachMenuRef}>
                    <button 
                      onClick={() => setShowAttachMenu(!showAttachMenu)}
                      className="p-2.5 rounded-xl hover:bg-muted transition-all duration-200"
                      disabled={uploading}
                    >
                      <Paperclip className={cn("h-5 w-5 text-muted-foreground transition-colors hover:text-foreground", uploading && "animate-pulse text-primary")} />
                    </button>
                    
                    {showAttachMenu && (
                      <div className="absolute bottom-14 left-0 glass rounded-xl shadow-xl p-2 min-w-[160px] animate-slide-in-up z-10">
                        <button
                          onClick={() => handleFileSelect('imagem')}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted rounded-lg transition-all duration-200 text-sm group"
                        >
                          <div className="p-1.5 rounded-lg bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
                            <Image className="h-4 w-4 text-blue-400" />
                          </div>
                          Imagem
                        </button>
                        <button
                          onClick={() => handleFileSelect('documento')}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted rounded-lg transition-all duration-200 text-sm group"
                        >
                          <div className="p-1.5 rounded-lg bg-orange-500/20 group-hover:bg-orange-500/30 transition-colors">
                            <FileText className="h-4 w-4 text-orange-400" />
                          </div>
                          Documento
                        </button>
                        <button
                          onClick={() => handleFileSelect('audio')}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted rounded-lg transition-all duration-200 text-sm group"
                        >
                          <div className="p-1.5 rounded-lg bg-green-500/20 group-hover:bg-green-500/30 transition-colors">
                            <Mic className="h-4 w-4 text-green-400" />
                          </div>
                          Áudio
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* Botão Template separado - apenas para Meta API */}
                  {getConexaoDaConversa(conversaSelecionada)?.tipo_provedor === 'meta' && (
                    <button
                      onClick={() => {
                        fetchTemplates();
                        setShowTemplateModal(true);
                      }}
                      className="p-2.5 rounded-xl hover:bg-muted transition-all duration-200 flex items-center gap-2 border border-border hover:border-purple-500/50"
                      title="Enviar Template"
                    >
                      <FileSpreadsheet className="h-5 w-5 text-purple-400" />
                    </button>
                  )}
                  
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept={fileType === 'imagem' ? 'image/*' : fileType === 'audio' ? 'audio/*' : '*/*'}
                  />
                  
                  <input
                    type="text"
                    placeholder="Digite uma mensagem..."
                    value={novaMensagem}
                    onChange={(e) => setNovaMensagem(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && enviarMensagem()}
                    className="flex-1 h-11 px-4 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 input-glow transition-all duration-200"
                    disabled={enviando}
                  />
                  
                  {/* Gravador de Áudio */}
                  <AudioRecorder 
                    onSend={handleSendAudio}
                    disabled={enviando || uploading}
                  />
                  
                  <button
                    onClick={enviarMensagem}
                    disabled={!novaMensagem.trim() || enviando}
                    className={cn(
                      "h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center transition-all duration-200 disabled:opacity-50 send-button",
                      novaMensagem.trim() && !enviando && "shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_24px_hsl(var(--primary)/0.5)]"
                    )}
                  >
                    {enviando ? (
                      <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-background via-card/20 to-background">
            <div className="text-center p-8">
              <div className="relative inline-block mb-6">
                <MessageSquareIcon className="h-20 w-20 text-muted-foreground/30 empty-state-icon" />
                <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center animate-pulse-soft">
                  <Smile className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-xl font-semibold text-foreground mb-2">Selecione uma conversa</p>
              <p className="text-muted-foreground">Escolha uma conversa ao lado para começar a atender</p>
            </div>
          </div>
        )}

        {/* Modal de Transferência */}
        {showTransferModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                {transferType !== 'choice' ? (
                  <button 
                    onClick={() => {
                      if (transferType === 'agente-etapa') {
                        setTransferType('agente');
                        setAgenteParaTransferir(null);
                      } else {
                        setTransferType('choice');
                      }
                    }}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="text-sm">Voltar</span>
                  </button>
                ) : (
                  <div />
                )}
                
                <h3 className="text-lg font-semibold text-foreground">
                  {transferType === 'choice' && 'Transferir Atendimento'}
                  {transferType === 'humano' && 'Atendentes Humanos'}
                  {transferType === 'agente' && 'Agentes IA'}
                  {transferType === 'agente-etapa' && 'Selecione a Etapa'}
                </h3>
                
                <button onClick={() => {
                  setShowTransferModal(false);
                  setTransferType('choice');
                  setAgenteParaTransferir(null);
                }}>
                  <X className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
                </button>
              </div>

              {/* Conteúdo baseado no estado */}
              {transferType === 'choice' && (
                <div className="space-y-3">
                  <button
                    onClick={() => setTransferType('humano')}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted hover:border-primary/50 transition-all group"
                  >
                    <div className="h-12 w-12 rounded-full bg-orange-500/20 flex items-center justify-center">
                      <User className="h-6 w-6 text-orange-500" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-foreground">Transferir para Humano</p>
                      <p className="text-sm text-muted-foreground">Ver todos os atendentes</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </button>
                  
                  <button
                    onClick={() => setTransferType('agente')}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted hover:border-primary/50 transition-all group"
                  >
                    <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                      <Bot className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-foreground">Transferir para Agente IA</p>
                      <p className="text-sm text-muted-foreground">Ver todos os agentes</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </button>
                </div>
              )}

              {transferType === 'humano' && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {usuarios.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <User className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      <p>Nenhum atendente encontrado</p>
                    </div>
                  ) : (
                    usuarios.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          transferirAtendimento(u.id, false);
                          setShowTransferModal(false);
                          setTransferType('choice');
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted hover:border-orange-500/50 transition-all"
                      >
                        <div className="h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                          <UserCheck className="h-5 w-5 text-orange-500" />
                        </div>
                        <div className="text-left flex-1">
                          <p className="font-medium text-foreground">{u.nome}</p>
                          <p className="text-sm text-muted-foreground">{u.email}</p>
                        </div>
                        {u.id === usuario?.id && (
                          <span className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">Você</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}

              {transferType === 'agente' && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {agentesDisponiveis.filter((a) => a.ativo).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bot className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      <p>Nenhum agente IA ativo</p>
                    </div>
                  ) : (
                    agentesDisponiveis
                      .filter((a) => a.ativo)
                      .map((agente) => (
                        <button
                          key={agente.id}
                          onClick={() => {
                            setAgenteParaTransferir(agente.id);
                            setTransferType('agente-etapa');
                          }}
                          className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted hover:border-primary/50 transition-all"
                        >
                          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <Bot className="h-5 w-5 text-primary" />
                          </div>
                          <div className="text-left flex-1">
                            <p className="font-medium text-foreground">{agente.nome || 'Agente IA'}</p>
                            <p className="text-sm text-muted-foreground">
                              {agente.tipo === 'principal' ? 'Agente Principal' : 'Agente Secundário'}
                            </p>
                          </div>
                          {agente.tipo === 'principal' && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Principal</span>
                          )}
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </button>
                      ))
                  )}
                </div>
              )}

              {transferType === 'agente-etapa' && (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  <p className="text-sm text-muted-foreground">
                    Selecione a etapa de atendimento inicial:
                  </p>
                  
                  {etapasAgenteIA.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Nenhuma etapa configurada para este agente</p>
                    </div>
                  ) : (
                    etapasAgenteIA.map((etapa) => (
                      <button
                        key={etapa.id}
                        onClick={() => {
                          transferirAtendimento(null, true, agenteParaTransferir!, etapa.id);
                          setShowTransferModal(false);
                          setTransferType('choice');
                          setAgenteParaTransferir(null);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted hover:border-primary/50 transition-all"
                      >
                        <span className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                          {etapa.numero}
                        </span>
                        <div className="text-left flex-1">
                          <p className="font-medium text-foreground">{etapa.nome}</p>
                          {etapa.descricao && (
                            <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                              {etapa.descricao.replace(/@\w+:[^\s@]+/g, '').trim().substring(0, 60)}...
                            </p>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                  
                  <button
                    onClick={() => {
                      transferirAtendimento(null, true, agenteParaTransferir!);
                      setShowTransferModal(false);
                      setTransferType('choice');
                      setAgenteParaTransferir(null);
                    }}
                    className="w-full p-3 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg hover:bg-muted hover:border-primary/50 transition-all"
                  >
                    Começar do início (sem etapa específica)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal de Imagem Expandida */}
        {imagemExpandida && (
          <div 
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setImagemExpandida(null)}
          >
            <button 
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              onClick={() => setImagemExpandida(null)}
            >
              <X className="h-6 w-6 text-white" />
            </button>
            <img 
              src={imagemExpandida} 
              alt="Imagem ampliada" 
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Sidebar do Contato */}
        {conversaSelecionada && (
          <ContatoSidebar
            contato={conversaSelecionada.contatos}
            conversaId={conversaSelecionada.id}
            isOpen={showContatoSidebar}
            onClose={() => setShowContatoSidebar(false)}
            onContatoUpdate={(contatoAtualizado) => {
              setConversaSelecionada({
                ...conversaSelecionada,
                contatos: contatoAtualizado
              });
              fetchConversas();
            }}
          />
        )}

        {/* Modal de Confirmação de Exclusão */}
        <AlertDialog open={!!mensagemParaDeletar} onOpenChange={() => setMensagemParaDeletar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deletar mensagem?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. A mensagem será removida permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeletarMensagem}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Deletar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Modal de Templates Meta */}
        <Dialog open={showTemplateModal} onOpenChange={(open) => {
          setShowTemplateModal(open);
          if (!open) {
            setSelectedTemplate(null);
            setTemplateParams([]);
          }
        }}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-purple-500" />
                {selectedTemplate ? 'Preencher Template' : 'Selecionar Template'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto">
              {!selectedTemplate ? (
                // Lista de templates
                loadingTemplates ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileSpreadsheet className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>Nenhum template aprovado</p>
                    <p className="text-xs mt-2">Crie templates no Facebook Business Manager</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => {
                          setSelectedTemplate(template);
                          // Inicializar params vazios baseado no número de variáveis
                          const bodyComponent = template.components.find(c => c.type === 'BODY');
                          const varCount = (bodyComponent?.text?.match(/\{\{\d+\}\}/g) || []).length;
                          setTemplateParams(Array(varCount).fill(''));
                        }}
                        className="w-full text-left p-3 rounded-lg border border-border hover:border-purple-500/50 hover:bg-muted/50 transition-all"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{template.name}</span>
                          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">
                            {template.category}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {template.components.find(c => c.type === 'BODY')?.text || 'Sem preview'}
                        </p>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                // Formulário de preenchimento
                <div className="space-y-4">
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar à lista
                  </button>
                  
                  {/* Preview do template */}
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-sm font-medium mb-1">{selectedTemplate.name}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {getTemplatePreview(selectedTemplate, templateParams)}
                    </p>
                  </div>
                  
                  {/* Campos de variáveis */}
                  {templateParams.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Preencha as variáveis:</p>
                      {templateParams.map((param, index) => (
                        <div key={index}>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            Variável {`{{${index + 1}}}`}
                          </label>
                          <input
                            type="text"
                            value={param}
                            onChange={(e) => {
                              const newParams = [...templateParams];
                              newParams[index] = e.target.value;
                              setTemplateParams(newParams);
                            }}
                            placeholder={`Valor para {{${index + 1}}}`}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary/50 outline-none text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {selectedTemplate && (
              <DialogFooter className="mt-4">
                <button
                  onClick={() => {
                    setSelectedTemplate(null);
                    setTemplateParams([]);
                  }}
                  className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={enviarTemplate}
                  disabled={enviando}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {enviando ? (
                    <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Enviar Template
                </button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </MainLayout>
  );
}
