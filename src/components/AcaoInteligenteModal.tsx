import { useState, useEffect } from 'react';
import { 
  Tag, UserRound, Bot, Globe, Layers, Bell, Package, StopCircle,
  Check, AlertCircle, Loader2, UserPen, Handshake, CalendarSearch, CalendarPlus,
  FileEdit, FileSearch, UserCheck
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface AcaoInteligenteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (action: string) => void;
  agentId?: string;
}

interface Funil {
  id: string;
  nome: string;
}

interface Estagio {
  id: string;
  nome: string;
  funil_id: string;
  cor: string;
}

interface Usuario {
  id: string;
  nome: string;
}

interface AcaoTipo {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const tiposAcao: AcaoTipo[] = [
  {
    id: 'tag',
    label: 'Adicionar Tag',
    description: 'Adiciona uma tag ao contato',
    icon: Tag,
    color: 'hsl(var(--chart-4))',
    bgColor: 'hsl(var(--chart-4) / 0.1)',
  },
  {
    id: 'negociacao',
    label: 'Criar Negociação',
    description: 'Cria uma negociação no CRM',
    icon: Handshake,
    color: 'hsl(var(--chart-1))',
    bgColor: 'hsl(var(--chart-1) / 0.1)',
  },
  {
    id: 'transferir-agente',
    label: 'Transferir para Agente',
    description: 'Transfere para outro agente IA',
    icon: Bot,
    color: 'hsl(var(--primary))',
    bgColor: 'hsl(var(--primary) / 0.1)',
  },
  {
    id: 'transferir-usuario',
    label: 'Transferir para Usuário',
    description: 'Transfere para um atendente humano',
    icon: UserRound,
    color: 'hsl(var(--chart-2))',
    bgColor: 'hsl(var(--chart-2) / 0.1)',
  },
  {
    id: 'fonte',
    label: 'Atribuir Fonte',
    description: 'Define a origem do lead',
    icon: Globe,
    color: 'hsl(var(--chart-3))',
    bgColor: 'hsl(var(--chart-3) / 0.1)',
  },
  {
    id: 'etapa',
    label: 'Transferir para Estágio',
    description: 'Move o lead no CRM',
    icon: Layers,
    color: 'hsl(var(--chart-5))',
    bgColor: 'hsl(var(--chart-5) / 0.1)',
  },
  {
    id: 'notificar',
    label: 'Fazer Notificação',
    description: 'Envia alerta para a equipe',
    icon: Bell,
    color: 'hsl(var(--destructive))',
    bgColor: 'hsl(var(--destructive) / 0.1)',
  },
  {
    id: 'produto',
    label: 'Atribuir Produto',
    description: 'Associa um produto ao lead',
    icon: Package,
    color: 'hsl(var(--chart-3))',
    bgColor: 'hsl(var(--chart-3) / 0.1)',
  },
  {
    id: 'finalizar',
    label: 'Interromper Agente',
    description: 'Encerra a conversa',
    icon: StopCircle,
    color: 'hsl(var(--destructive))',
    bgColor: 'hsl(var(--destructive) / 0.1)',
  },
  {
    id: 'nome',
    label: 'Alterar Nome',
    description: 'Altera o nome do contato',
    icon: UserPen,
    color: 'hsl(var(--chart-2))',
    bgColor: 'hsl(var(--chart-2) / 0.1)',
  },
  {
    id: 'agenda-consultar',
    label: 'Consultar Agenda',
    description: 'Verifica disponibilidade no Google Calendar',
    icon: CalendarSearch,
    color: 'hsl(200 80% 50%)',
    bgColor: 'hsl(200 80% 50% / 0.1)',
  },
  {
    id: 'agenda-criar',
    label: 'Criar Evento',
    description: 'Cria evento no Google Calendar',
    icon: CalendarPlus,
    color: 'hsl(150 80% 40%)',
    bgColor: 'hsl(150 80% 40% / 0.1)',
  },
  {
    id: 'campo',
    label: 'Atualizar Campo',
    description: 'Salva valor em campo personalizado',
    icon: FileEdit,
    color: 'hsl(280 80% 50%)',
    bgColor: 'hsl(280 80% 50% / 0.1)',
  },
  {
    id: 'obter',
    label: 'Obter Campo',
    description: 'Lê valor de campo personalizado',
    icon: FileSearch,
    color: 'hsl(45 80% 50%)',
    bgColor: 'hsl(45 80% 50% / 0.1)',
  },
  {
    id: 'verificar-cliente',
    label: 'Verificar Cliente',
    description: 'Consulta se o lead é cliente no CRM',
    icon: UserCheck,
    color: 'hsl(150 80% 40%)',
    bgColor: 'hsl(150 80% 40% / 0.1)',
  },
];

interface TagItem {
  id: string;
  nome: string;
  cor: string;
}

export function AcaoInteligenteModal({ isOpen, onClose, onInsert, agentId }: AcaoInteligenteModalProps) {
  const { usuario } = useAuth();
  const [tipoSelecionado, setTipoSelecionado] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [funis, setFunis] = useState<Funil[]>([]);
  const [estagios, setEstagios] = useState<Estagio[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [agentes, setAgentes] = useState<{ id: string; nome: string }[]>([]);
  const [calendarios, setCalendarios] = useState<{ id: string; nome: string }[]>([]);
  const [tagsDisponiveis, setTagsDisponiveis] = useState<TagItem[]>([]);
  const [camposPersonalizados, setCamposPersonalizados] = useState<{ id: string; nome: string }[]>([]);
  const [etapasAgente, setEtapasAgente] = useState<{ numero: number; nome: string }[]>([]);
  const [etapaAgenteSelecionada, setEtapaAgenteSelecionada] = useState('');
  
  const [tagValue, setTagValue] = useState('');
  const [funilSelecionado, setFunilSelecionado] = useState('');
  const [estagioSelecionado, setEstagioSelecionado] = useState('');
  const [usuarioSelecionado, setUsuarioSelecionado] = useState('');
  const [agenteSelecionado, setAgenteSelecionado] = useState('');
  const [fonteValue, setFonteValue] = useState('');
  const [notificacaoValue, setNotificacaoValue] = useState('');
  const [produtoValue, setProdutoValue] = useState('');
  const [negociacaoValor, setNegociacaoValor] = useState('');
  const [calendarioSelecionado, setCalendarioSelecionado] = useState('');
  const [duracaoEvento, setDuracaoEvento] = useState('60');
  const [gerarMeet, setGerarMeet] = useState(false);
  const [campoSelecionado, setCampoSelecionado] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setTipoSelecionado(null);
      setTagValue('');
      setFunilSelecionado('');
      setEstagioSelecionado('');
      setUsuarioSelecionado('');
      setAgenteSelecionado('');
      setFonteValue('');
      setNotificacaoValue('');
      setProdutoValue('');
      setNegociacaoValor('');
      setCalendarioSelecionado('');
      setDuracaoEvento('60');
      setGerarMeet(false);
      setCampoSelecionado('');
      setEtapaAgenteSelecionada('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && usuario?.conta_id) {
      fetchData();
    }
  }, [isOpen, usuario?.conta_id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [funisRes, usuariosRes, agentesRes, calendariosRes, tagsRes, camposRes] = await Promise.all([
        supabase
          .from('funis')
          .select('id, nome')
          .eq('conta_id', usuario!.conta_id)
          .order('ordem'),
        supabase
          .from('usuarios')
          .select('id, nome')
          .eq('conta_id', usuario!.conta_id),
        supabase
          .from('agent_ia')
          .select('id, nome')
          .eq('conta_id', usuario!.conta_id)
          .eq('tipo', 'secundario'),
        supabase
          .from('calendarios_google')
          .select('id, nome')
          .eq('conta_id', usuario!.conta_id)
          .eq('ativo', true),
        supabase
          .from('tags')
          .select('id, nome, cor')
          .eq('conta_id', usuario!.conta_id)
          .order('nome'),
        supabase
          .from('campos_personalizados')
          .select('id, nome')
          .eq('conta_id', usuario!.conta_id)
          .order('nome'),
      ]);

      if (funisRes.data) setFunis(funisRes.data);
      if (usuariosRes.data) setUsuarios(usuariosRes.data);
      if (agentesRes.data) setAgentes(agentesRes.data);
      if (calendariosRes.data) setCalendarios(calendariosRes.data);
      if (tagsRes.data) setTagsDisponiveis(tagsRes.data);
      if (camposRes.data) setCamposPersonalizados(camposRes.data);

      if (funisRes.data && funisRes.data.length > 0) {
        const { data: estagiosData } = await supabase
          .from('estagios')
          .select('id, nome, funil_id, cor')
          .in('funil_id', funisRes.data.map(f => f.id))
          .order('ordem');
        
        if (estagiosData) setEstagios(estagiosData);
      }

      // Buscar etapas do agente atual
      if (agentId) {
        const { data: etapasData } = await supabase
          .from('agent_ia_etapas')
          .select('numero, nome')
          .eq('agent_ia_id', agentId)
          .order('numero');
        
        if (etapasData) setEtapasAgente(etapasData);
      }
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const isProntoParaInserir = (): boolean => {
    if (!tipoSelecionado) return false;

    switch (tipoSelecionado) {
      case 'tag':
        return tagValue !== '';
      case 'etapa':
        return estagioSelecionado !== '';
      case 'negociacao':
        return funilSelecionado !== '' && estagioSelecionado !== '';
      case 'transferir-usuario':
        return usuarioSelecionado !== '';
      case 'transferir-agente':
        return agenteSelecionado !== '';
      case 'fonte':
        return fonteValue.trim().length > 0;
      case 'notificar':
        return notificacaoValue.trim().length > 0;
      case 'produto':
        return produtoValue.trim().length > 0;
      case 'finalizar':
      case 'nome':
      case 'verificar-cliente':
        return true;
      case 'agenda-consultar':
      case 'agenda-criar':
        return calendarioSelecionado !== '';
      case 'campo':
      case 'obter':
        return campoSelecionado !== '';
      default:
        return false;
    }
  };

  const gerarAcao = (): string => {
    switch (tipoSelecionado) {
      case 'tag':
        return `@tag:${tagValue.toLowerCase().replace(/\s+/g, '-')}`;
      case 'etapa': {
        const estagio = estagios.find(e => e.id === estagioSelecionado);
        const funil = funis.find(f => f.id === funilSelecionado);
        
        if (funil && estagio) {
          const funilSlug = funil.nome.toLowerCase().replace(/\s+/g, '-');
          const estagioSlug = estagio.nome.toLowerCase().replace(/\s+/g, '-');
          return `@etapa:${funilSlug}/${estagioSlug}`;
        }
        
        return `@etapa:${estagio?.nome.toLowerCase().replace(/\s+/g, '-') || estagioSelecionado}`;
      }
      case 'negociacao': {
        const funil = funis.find(f => f.id === funilSelecionado);
        const estagio = estagios.find(e => e.id === estagioSelecionado);
        
        if (funil && estagio) {
          const funilSlug = funil.nome.toLowerCase().replace(/\s+/g, '-');
          const estagioSlug = estagio.nome.toLowerCase().replace(/\s+/g, '-');
          const valorParte = negociacaoValor ? `:${negociacaoValor}` : '';
          return `@negociacao:${funilSlug}/${estagioSlug}${valorParte}`;
        }
        return '';
      }
      case 'transferir-usuario':
        if (usuarioSelecionado === 'humano') return '@transferir:humano';
        const user = usuarios.find(u => u.id === usuarioSelecionado);
        return `@transferir:usuario:${user?.nome.toLowerCase().replace(/\s+/g, '-') || usuarioSelecionado}`;
      case 'transferir-agente':
        if (agenteSelecionado === 'ia') return '@transferir:ia';
        return `@transferir:agente:${agenteSelecionado}`;
      case 'fonte':
        return `@fonte:${fonteValue.toLowerCase().replace(/\s+/g, '-')}`;
      case 'notificar':
        return `@notificar:${notificacaoValue}`;
      case 'produto':
        return `@produto:${produtoValue.toLowerCase().replace(/\s+/g, '-')}`;
      case 'finalizar':
        return '@finalizar';
      case 'nome':
        return '@nome';
      case 'agenda-consultar': {
        const cal = calendarios.find(c => c.id === calendarioSelecionado);
        const calSlug = cal?.nome.toLowerCase().replace(/\s+/g, '-') || calendarioSelecionado;
        return `@agenda:consultar:${calSlug}`;
      }
      case 'agenda-criar': {
        const cal = calendarios.find(c => c.id === calendarioSelecionado);
        const calSlug = cal?.nome.toLowerCase().replace(/\s+/g, '-') || calendarioSelecionado;
        const meetFlag = gerarMeet ? 'meet' : 'no-meet';
        return `@agenda:criar:${calSlug}:${duracaoEvento}:${meetFlag}`;
      }
      case 'campo': {
        const campo = camposPersonalizados.find(c => c.id === campoSelecionado);
        const campoSlug = campo?.nome.toLowerCase().replace(/\s+/g, '-') || campoSelecionado;
        return `@campo:${campoSlug}:{valor-do-lead}`;
      }
      case 'obter': {
        const campo = camposPersonalizados.find(c => c.id === campoSelecionado);
        const campoSlug = campo?.nome.toLowerCase().replace(/\s+/g, '-') || campoSelecionado;
        return `@obter:${campoSlug}`;
      }
      case 'verificar-cliente':
        return '@verificar_cliente';
      default:
        return '';
    }
  };

  const handleInserir = () => {
    const acao = gerarAcao();
    if (acao) {
      onInsert(acao);
      onClose();
    }
  };

  const estagiosFiltrados = funilSelecionado 
    ? estagios.filter(e => e.funil_id === funilSelecionado)
    : estagios;

  const selectedAction = tiposAcao.find(t => t.id === tipoSelecionado);

  const renderConfiguration = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    switch (tipoSelecionado) {
      case 'tag':
        return (
          <div className="space-y-3">
            {tagsDisponiveis.length > 0 ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Selecione a Tag</label>
                  <select
                    value={tagValue}
                    onChange={(e) => setTagValue(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Selecione uma tag...</option>
                    {tagsDisponiveis.map(tag => (
                      <option key={tag.id} value={tag.nome}>
                        {tag.nome}
                      </option>
                    ))}
                  </select>
                </div>
                
                {tagValue && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tagsDisponiveis.find(t => t.nome === tagValue)?.cor || '#888' }}
                    />
                    <span className="text-sm font-medium">{tagValue}</span>
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground">
                  💡 A tag será adicionada automaticamente ao contato
                </p>
              </>
            ) : (
              <div className="text-center py-6">
                <Tag className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma tag cadastrada
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cadastre tags na página de Contatos
                </p>
              </div>
            )}
          </div>
        );

      case 'negociacao':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Selecione o Funil</label>
              <select
                value={funilSelecionado}
                onChange={(e) => {
                  setFunilSelecionado(e.target.value);
                  setEstagioSelecionado('');
                }}
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Selecione um funil...</option>
                {funis.map(f => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Estágio Inicial</label>
              <select
                value={estagioSelecionado}
                onChange={(e) => setEstagioSelecionado(e.target.value)}
                disabled={!funilSelecionado}
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              >
                <option value="">Selecione um estágio...</option>
                {estagiosFiltrados.map(e => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Valor (opcional)</label>
              <input
                type="number"
                value={negociacaoValor}
                onChange={(e) => setNegociacaoValor(e.target.value)}
                placeholder="Ex: 1500"
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              💼 O agente criará automaticamente uma negociação com os dados do contato
            </p>
          </div>
        );

      case 'etapa':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Selecione o Funil</label>
              <select
                value={funilSelecionado}
                onChange={(e) => {
                  setFunilSelecionado(e.target.value);
                  setEstagioSelecionado('');
                }}
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Todos os funis</option>
                {funis.map(f => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Selecione o Estágio</label>
              <select
                value={estagioSelecionado}
                onChange={(e) => setEstagioSelecionado(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Selecione uma opção...</option>
                {estagiosFiltrados.map(e => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              💡 O lead será movido para este estágio no CRM automaticamente
            </p>
          </div>
        );

      case 'transferir-usuario':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Selecione o Atendente</label>
              <select
                value={usuarioSelecionado}
                onChange={(e) => setUsuarioSelecionado(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Selecione uma opção...</option>
                <option value="humano">Próximo atendente disponível</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              💡 A conversa será transferida para este atendente humano
            </p>
          </div>
        );

      case 'transferir-agente':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Selecione o Agente IA</label>
              <select
                value={agenteSelecionado}
                onChange={(e) => setAgenteSelecionado(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Selecione uma opção...</option>
                <option value="ia">Agente IA principal</option>
                {agentes.map(a => (
                  <option key={a.id} value={a.id}>{a.nome}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              💡 A conversa será transferida para outro agente de IA
            </p>
          </div>
        );

      case 'fonte':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Nome da Fonte</label>
              <input
                type="text"
                value={fonteValue}
                onChange={(e) => setFonteValue(e.target.value)}
                placeholder="Ex: facebook, instagram, site, etc."
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              💡 A fonte será atribuída ao contato para rastreamento
            </p>
          </div>
        );

      case 'notificar':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Mensagem da Notificação</label>
              <textarea
                value={notificacaoValue}
                onChange={(e) => setNotificacaoValue(e.target.value)}
                placeholder="Ex: Lead qualificado, precisa de atenção urgente!"
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              💡 Uma notificação será enviada para a equipe
            </p>
          </div>
        );

      case 'produto':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Nome do Produto</label>
              <input
                type="text"
                value={produtoValue}
                onChange={(e) => setProdutoValue(e.target.value)}
                placeholder="Ex: plano-premium, curso-online, etc."
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              💡 O produto será associado ao lead
            </p>
          </div>
        );

      case 'finalizar':
        return (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-center gap-3 mb-2">
              <StopCircle className="h-6 w-6 text-destructive" />
              <span className="font-medium text-foreground">Encerrar Conversa</span>
            </div>
            <p className="text-sm text-muted-foreground">
              O agente irá encerrar a conversa automaticamente quando esta condição for atendida.
            </p>
          </div>
        );

      case 'nome':
        return (
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <p className="text-sm text-foreground mb-2">
              📝 <strong>Captura Automática</strong>
            </p>
            <p className="text-xs text-muted-foreground">
              O agente IA irá extrair automaticamente o nome do lead quando ele 
              se identificar durante a conversa e salvará no cadastro do contato.
            </p>
          </div>
        );

      case 'agenda-consultar':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Selecione o Calendário</label>
              <select
                value={calendarioSelecionado}
                onChange={(e) => setCalendarioSelecionado(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Selecione um calendário...</option>
                {calendarios.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="p-4 rounded-lg bg-sky-100 dark:bg-sky-900/30 border border-sky-300 dark:border-sky-700">
              <p className="text-sm text-sky-700 dark:text-sky-300 mb-1">
                🔍 <strong>Consultar Disponibilidade</strong>
              </p>
              <p className="text-xs text-sky-600 dark:text-sky-400">
                O agente IA irá consultar o Google Calendar para verificar 
                horários disponíveis e informar ao lead as opções de agendamento.
              </p>
            </div>
            {calendarios.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠️ Nenhum calendário conectado. Conecte um Google Calendar nas configurações.
              </p>
            )}
          </div>
        );

      case 'agenda-criar':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Selecione o Calendário</label>
              <select
                value={calendarioSelecionado}
                onChange={(e) => setCalendarioSelecionado(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Selecione um calendário...</option>
                {calendarios.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Duração do Evento</label>
              <select
                value={duracaoEvento}
                onChange={(e) => setDuracaoEvento(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="30">30 minutos</option>
                <option value="60">1 hora</option>
                <option value="90">1 hora e 30 min</option>
                <option value="120">2 horas</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={gerarMeet}
                  onChange={(e) => setGerarMeet(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-background after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
              <span className="text-sm text-foreground">Gerar link do Google Meet</span>
            </div>
            <div className="p-4 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700">
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-1">
                📅 <strong>Criar Evento</strong>
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                O agente IA irá criar um evento no Google Calendar com os 
                detalhes do agendamento acordado com o lead durante a conversa.
                {gerarMeet && ' Um link do Google Meet será gerado automaticamente.'}
              </p>
            </div>
            {calendarios.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠️ Nenhum calendário conectado. Conecte um Google Calendar nas configurações.
              </p>
            )}
          </div>
        );

      case 'campo':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Selecione o Campo</label>
              <select
                value={campoSelecionado}
                onChange={(e) => setCampoSelecionado(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Selecione um campo...</option>
                {camposPersonalizados.map(campo => (
                  <option key={campo.id} value={campo.id}>{campo.nome}</option>
                ))}
              </select>
            </div>
            <div className="p-4 rounded-lg bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700">
              <p className="text-sm text-purple-700 dark:text-purple-300 mb-1">
                ✏️ <strong>Salvar Campo Personalizado</strong>
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
                O agente irá substituir <code className="bg-purple-200 dark:bg-purple-800 px-1 rounded">{"{valor-do-lead}"}</code> pelo que o lead enviar na conversa.
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-400">
                <strong>Exemplo:</strong> Se o lead enviar "João Silva", o agente executará: 
                <code className="bg-purple-200 dark:bg-purple-800 px-1 rounded ml-1">@campo:nome-completo:João Silva</code>
              </p>
            </div>
            {camposPersonalizados.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠️ Nenhum campo personalizado cadastrado. Crie campos na página de Campos Personalizados.
              </p>
            )}
          </div>
        );

      case 'obter':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Selecione o Campo</label>
              <select
                value={campoSelecionado}
                onChange={(e) => setCampoSelecionado(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Selecione um campo...</option>
                {camposPersonalizados.map(campo => (
                  <option key={campo.id} value={campo.id}>{campo.nome}</option>
                ))}
              </select>
            </div>
            <div className="p-4 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700">
              <p className="text-sm text-amber-700 dark:text-amber-300 mb-1">
                🔍 <strong>Obter Valor do Campo</strong>
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                O agente irá buscar o valor deste campo e poderá usar na conversa. 
                O resultado será informado ao agente para compor a resposta.
              </p>
            </div>
            {camposPersonalizados.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠️ Nenhum campo personalizado cadastrado. Crie campos na página de Campos Personalizados.
              </p>
            )}
          </div>
        );

      case 'verificar-cliente':
        return (
          <div className="p-4 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700">
            <div className="flex items-center gap-3 mb-2">
              <UserCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium text-foreground">Verificar Cliente no CRM</span>
            </div>
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              O agente irá verificar se o contato já possui uma negociação ativa ou fechada no CRM 
              e poderá usar essa informação para personalizar a conversa.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <DialogTitle className="text-lg font-semibold">
            Adicionar Ação Inteligente
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Escolha uma ação para configurar e inserir no prompt do agente
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Grid de Cards de Ações */}
          <div className="p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Escolha o tipo de ação
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tiposAcao.map((tipo) => {
                const Icon = tipo.icon;
                const isSelected = tipoSelecionado === tipo.id;
                
                return (
                  <button
                    key={tipo.id}
                    onClick={() => setTipoSelecionado(tipo.id)}
                    className={cn(
                      "relative flex flex-col items-start gap-3 p-4 rounded-xl",
                      "border-2 transition-all duration-200 text-left",
                      "min-h-[100px]",
                      !isSelected && "border-border/50 hover:border-primary/30 hover:shadow-md hover:bg-muted/50",
                      isSelected && "border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20"
                    )}
                  >
                    {/* Ícone com fundo colorido */}
                    <div 
                      className="h-12 w-12 rounded-xl flex items-center justify-center transition-transform duration-200"
                      style={{ 
                        backgroundColor: isSelected ? tipo.color : tipo.bgColor,
                      }}
                    >
                      <Icon 
                        className="h-6 w-6 transition-colors duration-200" 
                        style={{ color: isSelected ? 'white' : tipo.color }} 
                      />
                    </div>
                    
                    {/* Texto */}
                    <div className="space-y-1 flex-1">
                      <div className="font-semibold text-foreground text-sm">{tipo.label}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{tipo.description}</div>
                    </div>
                    
                    {/* Checkmark quando selecionado */}
                    {isSelected && (
                      <div className="absolute top-3 right-3 h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Painel de Configuração Colapsável */}
          {tipoSelecionado && selectedAction && (
            <div className="border-t border-border p-4 bg-muted/30 animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div 
                  className="h-10 w-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: selectedAction.bgColor }}
                >
                  <selectedAction.icon className="h-5 w-5" style={{ color: selectedAction.color }} />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">Configurar {selectedAction.label}</h3>
                  <p className="text-xs text-muted-foreground">{selectedAction.description}</p>
                </div>
              </div>
              
              {renderConfiguration()}

              {/* Preview da ação gerada */}
              {isProntoParaInserir() && (
                <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="text-xs text-muted-foreground mb-1">Ação que será inserida:</div>
                  <code className="text-sm font-mono text-primary">{gerarAcao()}</code>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-2">
            {isProntoParaInserir() ? (
              <>
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm text-primary font-medium">Pronto para inserir</span>
              </>
            ) : (
              <>
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">
                  {tipoSelecionado ? 'Configure as opções necessárias' : 'Selecione um tipo de ação'}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="h-10 px-4 rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleInserir}
              disabled={!isProntoParaInserir()}
              className="h-10 px-6 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Inserir Ação
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
