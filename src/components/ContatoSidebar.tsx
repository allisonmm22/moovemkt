import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, Phone, Edit2, Save, Briefcase, Mail, Tag, Plus, 
  History, ChevronDown, ChevronUp, Check, MessageSquare,
  TrendingUp, Trophy, XCircle, Clock, ArrowRight, Eye, Megaphone,
  ExternalLink, Facebook, Instagram, Globe, Target, FileText, Calendar, Hash, ToggleLeft
} from 'lucide-react';
import { FollowupsAgendadosSection } from '@/components/FollowupsAgendadosSection';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { NegociacaoDetalheModal } from '@/components/NegociacaoDetalheModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

interface Contato {
  id: string;
  nome: string;
  telefone: string;
  email?: string | null;
  avatar_url: string | null;
  tags?: string[] | null;
  is_grupo?: boolean | null;
  grupo_jid?: string | null;
  metadata?: {
    origem_anuncio?: {
      ad_id?: string;
      ad_title?: string;
      ad_body?: string;
      ad_source?: string;
      ad_url?: string;
      ad_image?: string;
      media_type?: string;
      ctwa_clid?: string;
      captured_at?: string;
    };
  } | null;
}

interface Estagio {
  id: string;
  nome: string;
  cor: string | null;
  ordem: number | null;
}

interface Funil {
  id: string;
  nome: string;
  estagios: Estagio[];
}

interface Negociacao {
  id: string;
  titulo: string;
  valor: number | null;
  status: 'aberto' | 'ganho' | 'perdido' | null;
  created_at: string;
  estagio_id: string | null;
  funil_id: string | null;
  probabilidade?: number | null;
  notas?: string | null;
  data_fechamento?: string | null;
  resumo_ia?: string | null;
  resumo_gerado_em?: string | null;
  estagio?: {
    nome: string;
    cor: string | null;
  } | null;
}

interface HistoricoItem {
  id: string;
  tipo: string;
  descricao: string | null;
  created_at: string;
  estagio_anterior?: { nome: string; cor: string | null } | null;
  estagio_novo?: { nome: string; cor: string | null } | null;
  usuario?: { nome: string } | null;
}

interface TagItem {
  id: string;
  nome: string;
  cor: string;
}

interface CampoPersonalizado {
  id: string;
  nome: string;
  tipo: string;
  opcoes: string[];
  obrigatorio: boolean;
  grupo_id: string | null;
  grupo_nome?: string;
}

interface GrupoCampos {
  id: string;
  nome: string;
}

interface ContatoSidebarProps {
  contato: Contato;
  conversaId?: string;
  isOpen: boolean;
  onClose: () => void;
  onContatoUpdate?: (contato: Contato) => void;
}

export function ContatoSidebar({ contato, conversaId, isOpen, onClose, onContatoUpdate }: ContatoSidebarProps) {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [editando, setEditando] = useState(false);
  const [nomeEdit, setNomeEdit] = useState(contato.nome);
  const [telefoneEdit, setTelefoneEdit] = useState(contato.telefone);
  const [emailEdit, setEmailEdit] = useState(contato.email || '');
  const [salvando, setSalvando] = useState(false);
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [loadingNegociacoes, setLoadingNegociacoes] = useState(false);
  const [funis, setFunis] = useState<Funil[]>([]);
  const [modalNovaNegociacao, setModalNovaNegociacao] = useState(false);
  const [novaNegociacao, setNovaNegociacao] = useState({
    titulo: '',
    valor: '',
    funil_id: '',
    estagio_id: '',
  });
  const [negociacaoSelecionada, setNegociacaoSelecionada] = useState<Negociacao | null>(null);
  const [modalDetalheAberto, setModalDetalheAberto] = useState(false);
  const [historicos, setHistoricos] = useState<Record<string, HistoricoItem[]>>({});
  const [historicoExpandido, setHistoricoExpandido] = useState<string | null>(null);
  const [tagsDisponiveis, setTagsDisponiveis] = useState<TagItem[]>([]);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [salvandoTags, setSalvandoTags] = useState(false);
  
  // Campos personalizados
  const [camposPersonalizados, setCamposPersonalizados] = useState<CampoPersonalizado[]>([]);
  const [gruposCampos, setGruposCampos] = useState<GrupoCampos[]>([]);
  const [camposValores, setCamposValores] = useState<Record<string, string>>({});
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    setNomeEdit(contato.nome);
    setTelefoneEdit(contato.telefone);
    setEmailEdit(contato.email || '');
    setEditando(false);
    if (isOpen) {
      fetchNegociacoes();
      fetchFunis();
      fetchTagsDisponiveis();
      fetchCamposPersonalizados();
      fetchCamposValores();
    }
  }, [contato, isOpen]);

  // Realtime subscription para atualizar campos quando o agente salvar
  useEffect(() => {
    if (!isOpen || !contato.id) return;

    const channel = supabase
      .channel(`campos-contato-${contato.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contato_campos_valores',
          filter: `contato_id=eq.${contato.id}`
        },
        (payload) => {
          console.log('📝 Campo atualizado via realtime:', payload);
          fetchCamposValores();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, contato.id]);

  const fetchCamposPersonalizados = async () => {
    try {
      const [{ data: grupos }, { data: campos }] = await Promise.all([
        supabase.from('campos_personalizados_grupos').select('id, nome').order('ordem'),
        supabase.from('campos_personalizados').select('*').order('ordem')
      ]);
      
      setGruposCampos(grupos || []);
      
      const camposComGrupo: CampoPersonalizado[] = (campos || []).map(c => ({
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        opcoes: Array.isArray(c.opcoes) ? c.opcoes.map(o => String(o)) : [],
        obrigatorio: c.obrigatorio || false,
        grupo_id: c.grupo_id,
        grupo_nome: grupos?.find(g => g.id === c.grupo_id)?.nome
      }));
      
      setCamposPersonalizados(camposComGrupo);
    } catch (error) {
      console.error('Erro ao buscar campos personalizados:', error);
    }
  };

  const fetchCamposValores = async () => {
    try {
      const { data } = await supabase
        .from('contato_campos_valores')
        .select('campo_id, valor')
        .eq('contato_id', contato.id);
      
      const valores: Record<string, string> = {};
      data?.forEach(v => valores[v.campo_id] = v.valor || '');
      setCamposValores(valores);
    } catch (error) {
      console.error('Erro ao buscar valores dos campos:', error);
    }
  };

  const debouncedSaveCampo = useCallback((campoId: string, valor: string) => {
    if (saveTimeoutRef.current[campoId]) {
      clearTimeout(saveTimeoutRef.current[campoId]);
    }
    
    saveTimeoutRef.current[campoId] = setTimeout(async () => {
      try {
        await supabase
          .from('contato_campos_valores')
          .upsert({
            contato_id: contato.id,
            campo_id: campoId,
            valor: valor || null
          }, { onConflict: 'contato_id,campo_id' });
      } catch (error) {
        console.error('Erro ao salvar campo:', error);
      }
    }, 500);
  }, [contato.id]);

  const agruparCamposPorGrupo = () => {
    const grupos: Record<string, CampoPersonalizado[]> = {};
    
    camposPersonalizados.forEach(campo => {
      const grupoNome = campo.grupo_nome || 'Sem Grupo';
      if (!grupos[grupoNome]) {
        grupos[grupoNome] = [];
      }
      grupos[grupoNome].push(campo);
    });
    
    return grupos;
  };

  const renderCampoInput = (campo: CampoPersonalizado) => {
    const valor = camposValores[campo.id] || '';
    
    const handleChange = (novoValor: string) => {
      setCamposValores(prev => ({ ...prev, [campo.id]: novoValor }));
      debouncedSaveCampo(campo.id, novoValor);
    };
    
    switch (campo.tipo) {
      case 'numero':
        return (
          <div className="flex items-center gap-2 py-1.5">
            <span className="text-xs text-muted-foreground flex-1">{campo.nome}</span>
            <Input
              type="number"
              value={valor}
              onChange={(e) => handleChange(e.target.value)}
              className="h-7 w-28 text-xs"
              placeholder="0"
            />
          </div>
        );
      
      case 'data':
        return (
          <div className="flex items-center gap-2 py-1.5">
            <span className="text-xs text-muted-foreground flex-1">{campo.nome}</span>
            <Input
              type="date"
              value={valor}
              onChange={(e) => handleChange(e.target.value)}
              className="h-7 w-32 text-xs"
            />
          </div>
        );
      
      case 'selecao':
        return (
          <div className="flex items-center gap-2 py-1.5">
            <span className="text-xs text-muted-foreground flex-1">{campo.nome}</span>
            <Select value={valor} onValueChange={handleChange}>
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {campo.opcoes.map((opcao, i) => (
                  <SelectItem key={i} value={String(opcao)} className="text-xs">
                    {String(opcao)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      
      case 'checkbox':
        return (
          <div className="flex items-center gap-2 py-1.5">
            <span className="text-xs text-muted-foreground flex-1">{campo.nome}</span>
            <Switch
              checked={valor === 'true'}
              onCheckedChange={(checked) => handleChange(checked ? 'true' : 'false')}
            />
          </div>
        );
      
      default: // texto
        return (
          <div className="flex items-center gap-2 py-1.5">
            <span className="text-xs text-muted-foreground flex-1">{campo.nome}</span>
            <Input
              type="text"
              value={valor}
              onChange={(e) => handleChange(e.target.value)}
              className="h-7 w-32 text-xs"
              placeholder="..."
            />
          </div>
        );
    }
  };

  const fetchFunis = async () => {
    try {
      const { data, error } = await supabase
        .from('funis')
        .select(`
          id,
          nome,
          estagios:estagios(id, nome, cor, ordem)
        `)
        .order('ordem');

      if (error) throw error;
      
      const funisOrdenados = (data || []).map((f: any) => ({
        ...f,
        estagios: (f.estagios || []).sort((a: Estagio, b: Estagio) => (a.ordem || 0) - (b.ordem || 0))
      }));
      
      setFunis(funisOrdenados);
    } catch (error) {
      console.error('Erro ao buscar funis:', error);
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

  const handleToggleTag = async (tagNome: string) => {
    setSalvandoTags(true);
    try {
      const currentTags = contato.tags || [];
      const hasTag = currentTags.includes(tagNome);
      const newTags = hasTag 
        ? currentTags.filter(t => t !== tagNome)
        : [...currentTags, tagNome];
      
      const { error } = await supabase
        .from('contatos')
        .update({ tags: newTags })
        .eq('id', contato.id);

      if (error) throw error;

      if (onContatoUpdate) {
        onContatoUpdate({
          ...contato,
          tags: newTags,
        });
      }
      
      toast.success(hasTag ? 'Tag removida' : 'Tag adicionada');
    } catch (error) {
      console.error('Erro ao atualizar tags:', error);
      toast.error('Erro ao atualizar tags');
    } finally {
      setSalvandoTags(false);
    }
  };

  const getTagColor = (tagNome: string) => {
    const tag = tagsDisponiveis.find(t => t.nome === tagNome);
    return tag?.cor || '#3b82f6';
  };

  const fetchNegociacoes = async () => {
    setLoadingNegociacoes(true);
    try {
      const { data, error } = await supabase
        .from('negociacoes')
        .select(`
          id,
          titulo,
          valor,
          status,
          created_at,
          estagio_id,
          probabilidade,
          notas,
          data_fechamento,
          resumo_ia,
          resumo_gerado_em,
          estagios:estagio_id (
            nome,
            cor,
            funil_id
          )
        `)
        .eq('contato_id', contato.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const transformedData = (data || []).map((n: any) => ({
        ...n,
        estagio: n.estagios,
        funil_id: n.estagios?.funil_id || null
      }));
      
      setNegociacoes(transformedData);
    } catch (error) {
      console.error('Erro ao buscar negociações:', error);
    } finally {
      setLoadingNegociacoes(false);
    }
  };

  const handleSave = async () => {
    if (!nomeEdit.trim()) {
      toast.error('O nome é obrigatório');
      return;
    }
    
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('contatos')
        .update({
          nome: nomeEdit.trim(),
          telefone: telefoneEdit,
          email: emailEdit || null,
        })
        .eq('id', contato.id);

      if (error) throw error;

      toast.success('Contato atualizado');
      setEditando(false);
      
      if (onContatoUpdate) {
        onContatoUpdate({
          ...contato,
          nome: nomeEdit.trim(),
          telefone: telefoneEdit,
          email: emailEdit || null,
        });
      }
    } catch (error) {
      console.error('Erro ao atualizar contato:', error);
      toast.error('Erro ao atualizar contato');
    } finally {
      setSalvando(false);
    }
  };

  const handleUpdateNegociacao = async (negociacaoId: string, updates: { estagio_id?: string; status?: 'aberto' | 'ganho' | 'perdido' }, estagioAnteriorId?: string | null) => {
    try {
      const negociacao = negociacoes.find(n => n.id === negociacaoId);
      
      const { error } = await supabase
        .from('negociacoes')
        .update(updates)
        .eq('id', negociacaoId);

      if (error) throw error;

      if (updates.estagio_id && estagioAnteriorId !== updates.estagio_id) {
        await supabase.from('negociacao_historico').insert({
          negociacao_id: negociacaoId,
          estagio_anterior_id: estagioAnteriorId || null,
          estagio_novo_id: updates.estagio_id,
          usuario_id: usuario?.id,
          tipo: 'mudanca_estagio',
        });

        const estagioAnterior = funis.flatMap(f => f.estagios).find(e => e.id === estagioAnteriorId);
        const estagioNovo = funis.flatMap(f => f.estagios).find(e => e.id === updates.estagio_id);

        if (usuario?.conta_id && estagioNovo) {
          await supabase.from('notificacoes').insert({
            conta_id: usuario.conta_id,
            tipo: 'mudanca_estagio',
            titulo: `Negociação movida para ${estagioNovo.nome}`,
            mensagem: `${negociacao?.titulo || 'Negociação'} foi movida${estagioAnterior ? ` de "${estagioAnterior.nome}"` : ''} para "${estagioNovo.nome}"`,
            link: '/crm',
          });
        }

        if (conversaId) {
          const mensagemSistema = estagioAnterior 
            ? `📊 ${usuario?.nome || 'Usuário'} moveu negociação de "${estagioAnterior.nome}" para "${estagioNovo?.nome}"`
            : `📊 ${usuario?.nome || 'Usuário'} moveu negociação para "${estagioNovo?.nome}"`;
          
          await supabase.from('mensagens').insert({
            conversa_id: conversaId,
            conteudo: mensagemSistema,
            direcao: 'saida',
            tipo: 'sistema',
            usuario_id: usuario?.id,
          });
        }
      }
      
      toast.success('Negociação atualizada');
      fetchNegociacoes();
      if (historicoExpandido === negociacaoId) {
        fetchHistorico(negociacaoId);
      }
    } catch (error) {
      console.error('Erro ao atualizar negociação:', error);
      toast.error('Erro ao atualizar negociação');
    }
  };

  const fetchHistorico = async (negociacaoId: string) => {
    try {
      const { data, error } = await supabase
        .from('negociacao_historico')
        .select(`
          id,
          tipo,
          descricao,
          created_at,
          estagio_anterior:estagio_anterior_id(nome, cor),
          estagio_novo:estagio_novo_id(nome, cor),
          usuario:usuario_id(nome)
        `)
        .eq('negociacao_id', negociacaoId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      setHistoricos(prev => ({
        ...prev,
        [negociacaoId]: (data || []).map((h: any) => ({
          ...h,
          estagio_anterior: h.estagio_anterior,
          estagio_novo: h.estagio_novo,
          usuario: h.usuario,
        }))
      }));
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
    }
  };

  const toggleHistorico = (negociacaoId: string) => {
    if (historicoExpandido === negociacaoId) {
      setHistoricoExpandido(null);
    } else {
      setHistoricoExpandido(negociacaoId);
      if (!historicos[negociacaoId]) {
        fetchHistorico(negociacaoId);
      }
    }
  };

  const handleCriarNegociacao = async () => {
    if (!novaNegociacao.titulo.trim() || !novaNegociacao.estagio_id) {
      toast.error('Preencha o título e selecione o estágio');
      return;
    }

    try {
      const { error } = await supabase
        .from('negociacoes')
        .insert({
          titulo: novaNegociacao.titulo.trim(),
          valor: novaNegociacao.valor ? parseFloat(novaNegociacao.valor) : 0,
          estagio_id: novaNegociacao.estagio_id,
          contato_id: contato.id,
          conta_id: usuario?.conta_id,
          status: 'aberto',
          probabilidade: 50,
        });

      if (error) throw error;

      toast.success('Negociação criada');
      setModalNovaNegociacao(false);
      setNovaNegociacao({ titulo: '', valor: '', funil_id: '', estagio_id: '' });
      fetchNegociacoes();
    } catch (error) {
      console.error('Erro ao criar negociação:', error);
      toast.error('Erro ao criar negociação');
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getStatusConfig = (status: string | null) => {
    switch (status) {
      case 'ganho':
        return { 
          bg: 'bg-emerald-500/10', 
          text: 'text-emerald-500', 
          icon: Trophy,
          label: 'Ganho'
        };
      case 'perdido':
        return { 
          bg: 'bg-red-500/10', 
          text: 'text-red-500', 
          icon: XCircle,
          label: 'Perdido'
        };
      default:
        return { 
          bg: 'bg-blue-500/10', 
          text: 'text-blue-500', 
          icon: Clock,
          label: 'Aberto'
        };
    }
  };

  const getEstagiosByFunilId = (funilId: string) => {
    const funil = funis.find(f => f.id === funilId);
    return funil?.estagios || [];
  };

  const getFunilByEstagioId = (estagioId: string | null) => {
    if (!estagioId) return null;
    for (const funil of funis) {
      if (funil.estagios.some(e => e.id === estagioId)) {
        return funil;
      }
    }
    return null;
  };

  const handleOpenDetalhe = (negociacao: Negociacao) => {
    setNegociacaoSelecionada(negociacao);
    setModalDetalheAberto(true);
  };

  const getProgressoEstagio = (negociacao: Negociacao) => {
    const funil = getFunilByEstagioId(negociacao.estagio_id);
    if (!funil || !negociacao.estagio_id) return 0;
    
    const estagioIndex = funil.estagios.findIndex(e => e.id === negociacao.estagio_id);
    if (estagioIndex === -1) return 0;
    
    return ((estagioIndex + 1) / funil.estagios.length) * 100;
  };

  // Cálculos de resumo
  const resumoNegociacoes = {
    total: negociacoes.reduce((sum, n) => sum + (n.valor || 0), 0),
    abertas: negociacoes.filter(n => n.status === 'aberto').length,
    ganhas: negociacoes.filter(n => n.status === 'ganho').length,
    perdidas: negociacoes.filter(n => n.status === 'perdido').length,
    valorAberto: negociacoes.filter(n => n.status === 'aberto').reduce((sum, n) => sum + (n.valor || 0), 0),
  };

  const handleGoToConversation = async () => {
    navigate(`/conversas?contato=${contato.id}`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-[420px] max-w-[90vw] bg-card z-50 flex flex-col animate-slide-in-right shadow-2xl">
        {/* Header com Gradiente */}
        <div className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 pb-20">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-background/50 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>
          
          {/* Avatar centralizado */}
          <div className="flex flex-col items-center pt-4">
            {contato.avatar_url ? (
              <img
                src={contato.avatar_url}
                alt={contato.nome}
                className="h-24 w-24 rounded-full object-cover border-4 border-background shadow-xl"
              />
            ) : (
              <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground text-3xl font-bold border-4 border-background shadow-xl">
                {contato.nome.charAt(0).toUpperCase()}
              </div>
            )}
            {editando ? (
              <input
                type="text"
                value={nomeEdit}
                onChange={(e) => setNomeEdit(e.target.value)}
                className="text-xl font-bold text-foreground mt-4 text-center bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary w-full max-w-[280px]"
                placeholder="Nome do contato"
              />
            ) : (
              <h2 className="text-xl font-bold text-foreground mt-4">{contato.nome}</h2>
            )}
            
            {/* Ações rápidas */}
            <div className="flex items-center gap-2 mt-3">
              <button 
                onClick={handleGoToConversation}
                className="p-2 bg-primary/10 hover:bg-primary/20 rounded-full transition-colors"
                title="Ver conversa"
              >
                <MessageSquare className="h-4 w-4 text-primary" />
              </button>
              <a 
                href={`tel:${contato.telefone}`}
                className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-full transition-colors"
                title="Ligar"
              >
                <Phone className="h-4 w-4 text-emerald-500" />
              </a>
              {contato.email && (
                <a 
                  href={`mailto:${contato.email}`}
                  className="p-2 bg-blue-500/10 hover:bg-blue-500/20 rounded-full transition-colors"
                  title="Email"
                >
                  <Mail className="h-4 w-4 text-blue-500" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Content com scroll */}
        <div className="flex-1 overflow-y-auto -mt-8 px-4 pb-24">
          {/* Card de Informações */}
          <div className="bg-card rounded-2xl border border-border shadow-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Informações</span>
              {!editando ? (
                <button
                  onClick={() => setEditando(true)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Editar
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={salvando}
                  className="flex items-center gap-1.5 text-xs text-emerald-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              )}
            </div>

            {/* Pills de Info */}
            <div className="space-y-2">
              <div className={cn(
                "flex items-center gap-3 p-3 rounded-xl transition-colors",
                editando ? "bg-muted" : "bg-muted/50"
              )}>
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <Phone className="h-4 w-4 text-emerald-500" />
                </div>
                {editando ? (
                  <input
                    type="text"
                    value={telefoneEdit}
                    onChange={(e) => setTelefoneEdit(e.target.value)}
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                ) : (
                  <span className="text-sm font-medium text-foreground">{contato.telefone}</span>
                )}
              </div>

              <div className={cn(
                "flex items-center gap-3 p-3 rounded-xl transition-colors",
                editando ? "bg-muted" : "bg-muted/50"
              )}>
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Mail className="h-4 w-4 text-blue-500" />
                </div>
                {editando ? (
                  <input
                    type="email"
                    value={emailEdit}
                    onChange={(e) => setEmailEdit(e.target.value)}
                    placeholder="email@exemplo.com"
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                ) : (
                  <span className="text-sm font-medium text-foreground">
                    {contato.email || <span className="text-muted-foreground italic">Não informado</span>}
                  </span>
                )}
              </div>
            </div>

            {/* Tags */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Tags</span>
                </div>
                <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button 
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                      disabled={salvandoTags}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Gerenciar
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="end">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground px-2 py-1">Selecione as tags:</p>
                      {tagsDisponiveis.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          Nenhuma tag cadastrada.
                          <br />
                          <span className="text-primary">Configure em CRM → Configurações</span>
                        </p>
                      ) : (
                        tagsDisponiveis.map((tag) => {
                          const isSelected = contato.tags?.includes(tag.nome) || false;
                          return (
                            <button
                              key={tag.id}
                              onClick={() => handleToggleTag(tag.nome)}
                              disabled={salvandoTags}
                              className={cn(
                                "w-full flex items-center justify-between px-2 py-2 rounded-lg text-sm transition-colors",
                                isSelected ? "bg-muted" : "hover:bg-muted/50"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <div 
                                  className="h-3 w-3 rounded-full shrink-0"
                                  style={{ backgroundColor: tag.cor }}
                                />
                                <span className="text-foreground">{tag.nome}</span>
                              </div>
                              {isSelected && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              
              {contato.tags && contato.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {contato.tags.slice(0, 5).map((tagNome, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full text-white shadow-sm"
                      style={{ backgroundColor: getTagColor(tagNome) }}
                    >
                      {tagNome}
                      <button
                        onClick={() => handleToggleTag(tagNome)}
                        disabled={salvandoTags}
                        className="hover:opacity-70 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {contato.tags.length > 5 && (
                    <span className="px-3 py-1 text-xs font-medium rounded-full bg-muted text-muted-foreground">
                      +{contato.tags.length - 5}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Nenhuma tag atribuída</p>
              )}
            </div>
          </div>

          {/* Campos Personalizados */}
          {camposPersonalizados.length > 0 && (
            <div className="mt-4 bg-card rounded-2xl border border-border shadow-lg overflow-hidden">
              <div className="flex items-center gap-2 p-4 pb-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Campos Personalizados</span>
              </div>
              
              <Accordion type="multiple" className="px-4 pb-3">
                {Object.entries(agruparCamposPorGrupo()).map(([grupoNome, campos]) => (
                  <AccordionItem 
                    key={grupoNome} 
                    value={grupoNome}
                    className="border-b-0"
                  >
                    <AccordionTrigger className="py-2 hover:no-underline">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {grupoNome}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-2">
                      <div className="space-y-0.5">
                        {campos.map(campo => (
                          <div key={campo.id}>{renderCampoInput(campo)}</div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
            </Accordion>
            </div>
          )}

          {/* Follow-ups Agendados */}
          <FollowupsAgendadosSection contatoId={contato.id} />

          {/* Seção Origem do Lead - Sempre Visível */}
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">Origem do Lead</span>
            </div>

            {contato.metadata?.origem_anuncio ? (
              /* Card de Origem - Anúncio */
              <div className="bg-gradient-to-br from-purple-500/15 via-purple-500/10 to-pink-500/5 border border-purple-500/30 rounded-2xl p-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-purple-500/20 rounded-lg">
                    {contato.metadata.origem_anuncio.ad_source === 'instagram' ? (
                      <Instagram className="h-4 w-4 text-purple-400" />
                    ) : (
                      <Facebook className="h-4 w-4 text-purple-400" />
                    )}
                  </div>
                  <span className="text-sm font-semibold text-purple-300">
                    Lead de Anúncio
                  </span>
                  <span className="ml-auto px-2 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-300 rounded-full capitalize">
                    {contato.metadata.origem_anuncio.ad_source || 'Meta'}
                  </span>
                </div>

                {/* Imagem do Anúncio */}
                {contato.metadata.origem_anuncio.ad_image && (
                  <div className="mb-3 rounded-xl overflow-hidden border border-purple-500/20">
                    <img 
                      src={contato.metadata.origem_anuncio.ad_image} 
                      alt="Imagem do anúncio"
                      className="w-full h-32 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}

                {/* Título do Anúncio */}
                {contato.metadata.origem_anuncio.ad_title && (
                  <h4 className="text-sm font-semibold text-foreground mb-1 line-clamp-2">
                    {contato.metadata.origem_anuncio.ad_title}
                  </h4>
                )}

                {/* Descrição do Anúncio */}
                {contato.metadata.origem_anuncio.ad_body && (
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                    {contato.metadata.origem_anuncio.ad_body}
                  </p>
                )}

                {/* Info e Link */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-purple-500/20">
                  {contato.metadata.origem_anuncio.captured_at && (
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(contato.metadata.origem_anuncio.captured_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  )}
                  
                  {contato.metadata.origem_anuncio.ad_url && (
                    <a
                      href={contato.metadata.origem_anuncio.ad_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium bg-purple-500/20 text-purple-300 rounded-lg hover:bg-purple-500/30 transition-colors"
                    >
                      Ver anúncio
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ) : (
              /* Card de Origem - Orgânico */
              <div className="bg-muted/50 border border-border rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 rounded-xl">
                    <Globe className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-foreground block">
                      Orgânico
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Lead chegou de forma orgânica
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Seção de Negociações */}
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Negociações
                </span>
                <span className="px-2 py-0.5 text-xs font-medium bg-muted rounded-full text-muted-foreground">
                  {negociacoes.length}
                </span>
              </div>
              <button
                onClick={() => {
                  setModalNovaNegociacao(true);
                  setNovaNegociacao({ titulo: contato.nome, valor: '', funil_id: '', estagio_id: '' });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Nova
              </button>
            </div>

            {/* Lista de Negociações */}
            {loadingNegociacoes ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : negociacoes.length === 0 ? (
              <div className="text-center py-12 bg-muted/30 rounded-2xl border border-dashed border-border">
                <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Nenhuma negociação</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Clique em "Nova" para criar</p>
              </div>
            ) : (
              <div className="space-y-3">
                {negociacoes.map((negociacao) => {
                  const funilAtual = getFunilByEstagioId(negociacao.estagio_id);
                  const statusConfig = getStatusConfig(negociacao.status);
                  const StatusIcon = statusConfig.icon;
                  const progresso = getProgressoEstagio(negociacao);
                  
                  return (
                    <div
                      key={negociacao.id}
                      className="bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/30 hover:shadow-lg transition-all duration-200 group"
                    >
                      {/* Borda lateral colorida */}
                      <div 
                        className="h-1 w-full"
                        style={{ backgroundColor: negociacao.estagio?.cor || '#3b82f6' }}
                      />
                      
                      <div className="p-4 space-y-3">
                        {/* Header do card */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {negociacao.titulo}
                            </p>
                            <p className="text-lg font-bold text-foreground mt-0.5">
                              {formatCurrency(negociacao.valor)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleOpenDetalhe(negociacao)}
                            className="p-2 hover:bg-muted rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </div>

                        {/* Selects de Funil e Etapa */}
                        <div className="flex gap-2">
                          <Select
                            value={funilAtual?.id || ''}
                            onValueChange={(funilId) => {
                              const novoFunil = funis.find(f => f.id === funilId);
                              if (novoFunil && novoFunil.estagios.length > 0) {
                                handleUpdateNegociacao(negociacao.id, { 
                                  estagio_id: novoFunil.estagios[0].id 
                                }, negociacao.estagio_id);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs flex-1 bg-muted/50 border-0">
                              <SelectValue placeholder="Funil" />
                            </SelectTrigger>
                            <SelectContent>
                              {funis.map(funil => (
                                <SelectItem key={funil.id} value={funil.id} className="text-xs">
                                  {funil.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select
                            value={negociacao.estagio_id || ''}
                            onValueChange={(estagioId) => {
                              handleUpdateNegociacao(negociacao.id, { estagio_id: estagioId }, negociacao.estagio_id);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs flex-1 bg-muted/50 border-0">
                              <SelectValue placeholder="Etapa" />
                            </SelectTrigger>
                            <SelectContent>
                              {funilAtual?.estagios.map(estagio => (
                                <SelectItem key={estagio.id} value={estagio.id} className="text-xs">
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: estagio.cor || '#3b82f6' }}
                                    />
                                    {estagio.nome}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Barra de progresso */}
                        <div className="space-y-1">
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-500"
                              style={{ 
                                width: `${progresso}%`,
                                backgroundColor: negociacao.estagio?.cor || '#3b82f6'
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {Math.round(progresso)}% do funil
                          </p>
                        </div>

                        {/* Footer com status e histórico */}
                        <div className="flex items-center justify-between pt-2 border-t border-border">
                          <Select
                            value={negociacao.status || 'aberto'}
                            onValueChange={(status: 'aberto' | 'ganho' | 'perdido') => {
                              handleUpdateNegociacao(negociacao.id, { status });
                            }}
                          >
                            <SelectTrigger className={cn(
                              "h-7 w-auto gap-1.5 text-xs border-0 px-2",
                              statusConfig.bg,
                              statusConfig.text
                            )}>
                              <StatusIcon className="h-3.5 w-3.5" />
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="aberto" className="text-xs">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-3.5 w-3.5 text-blue-500" />
                                  Aberto
                                </div>
                              </SelectItem>
                              <SelectItem value="ganho" className="text-xs">
                                <div className="flex items-center gap-2">
                                  <Trophy className="h-3.5 w-3.5 text-emerald-500" />
                                  Ganho
                                </div>
                              </SelectItem>
                              <SelectItem value="perdido" className="text-xs">
                                <div className="flex items-center gap-2">
                                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                                  Perdido
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>

                          <button
                            onClick={() => toggleHistorico(negociacao.id)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <History className="h-3.5 w-3.5" />
                            <span>Histórico</span>
                            {historicoExpandido === negociacao.id ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>

                        {/* Timeline de Histórico */}
                        {historicoExpandido === negociacao.id && (
                          <div className="pt-3 border-t border-border animate-fade-in">
                            {!historicos[negociacao.id] ? (
                              <div className="flex items-center justify-center py-3">
                                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              </div>
                            ) : historicos[negociacao.id].length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-3">
                                Nenhuma movimentação
                              </p>
                            ) : (
                              <div className="relative space-y-3 max-h-48 overflow-y-auto pl-4">
                                {/* Linha vertical da timeline */}
                                <div className="absolute left-1.5 top-2 bottom-2 w-0.5 bg-border" />
                                
                                {historicos[negociacao.id].map((item, index) => (
                                  <div key={item.id} className="relative flex items-start gap-3">
                                    {/* Dot da timeline */}
                                    <div 
                                      className="absolute -left-2.5 top-1 h-3 w-3 rounded-full border-2 border-background"
                                      style={{ backgroundColor: item.estagio_novo?.cor || '#3b82f6' }}
                                    />
                                    
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {item.estagio_anterior && (
                                          <>
                                            <span 
                                              className="px-2 py-0.5 text-[10px] font-medium rounded-full"
                                              style={{ 
                                                backgroundColor: `${item.estagio_anterior.cor}20`,
                                                color: item.estagio_anterior.cor || '#666'
                                              }}
                                            >
                                              {item.estagio_anterior.nome}
                                            </span>
                                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                          </>
                                        )}
                                        {item.estagio_novo && (
                                          <span 
                                            className="px-2 py-0.5 text-[10px] font-medium rounded-full"
                                            style={{ 
                                              backgroundColor: `${item.estagio_novo.cor}20`,
                                              color: item.estagio_novo.cor || '#666'
                                            }}
                                          >
                                            {item.estagio_novo.nome}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                                        <span>{format(new Date(item.created_at), "dd MMM, HH:mm", { locale: ptBR })}</span>
                                        {item.usuario && (
                                          <>
                                            <span>•</span>
                                            <span>{item.usuario.nome}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Fixo */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-card via-card to-transparent pt-8">
          <Button 
            onClick={handleGoToConversation}
            className="w-full h-12 text-sm font-semibold rounded-xl"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Ver Conversa
          </Button>
        </div>
      </div>

      {/* Modal Nova Negociação */}
      <Dialog open={modalNovaNegociacao} onOpenChange={setModalNovaNegociacao}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Negociação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Título</label>
              <input
                type="text"
                placeholder="Título da negociação"
                value={novaNegociacao.titulo}
                onChange={(e) => setNovaNegociacao(prev => ({ ...prev, titulo: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Valor</label>
              <input
                type="number"
                placeholder="0,00"
                value={novaNegociacao.valor}
                onChange={(e) => setNovaNegociacao(prev => ({ ...prev, valor: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Funil</label>
              <Select
                value={novaNegociacao.funil_id}
                onValueChange={(value) => setNovaNegociacao(prev => ({ ...prev, funil_id: value, estagio_id: '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o funil" />
                </SelectTrigger>
                <SelectContent>
                  {funis.map(funil => (
                    <SelectItem key={funil.id} value={funil.id}>{funil.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {novaNegociacao.funil_id && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Etapa Inicial</label>
                <div className="grid grid-cols-2 gap-2">
                  {getEstagiosByFunilId(novaNegociacao.funil_id).map(estagio => (
                    <button
                      key={estagio.id}
                      onClick={() => setNovaNegociacao(prev => ({ ...prev, estagio_id: estagio.id }))}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-left",
                        novaNegociacao.estagio_id === estagio.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div 
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: estagio.cor || '#3b82f6' }}
                      />
                      <span className="text-sm font-medium text-foreground truncate">
                        {estagio.nome}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleCriarNegociacao}
                className="flex-1"
                disabled={!novaNegociacao.titulo.trim() || !novaNegociacao.estagio_id}
              >
                Criar Negociação
              </Button>
              <Button
                variant="outline"
                onClick={() => setModalNovaNegociacao(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Detalhes da Negociação */}
      {negociacaoSelecionada && (
        <NegociacaoDetalheModal
          isOpen={modalDetalheAberto}
          onClose={() => setModalDetalheAberto(false)}
          negociacao={{
            ...negociacaoSelecionada,
            valor: negociacaoSelecionada.valor || 0,
            estagio_id: negociacaoSelecionada.estagio_id || '',
            contato_id: contato.id,
            contatos: {
              nome: contato.nome,
              telefone: contato.telefone,
            }
          }}
          onUpdate={() => fetchNegociacoes()}
          onDelete={() => {
            setModalDetalheAberto(false);
            fetchNegociacoes();
          }}
          estagios={funis.flatMap(f => f.estagios.map(e => ({
            ...e,
            cor: e.cor || '#3b82f6',
            ordem: e.ordem || 0,
            funil_id: f.id
          })))}
          funis={funis.map(f => ({
            ...f,
            cor: '#3b82f6',
            estagios: f.estagios.map(e => ({
              ...e,
              cor: e.cor || '#3b82f6',
              ordem: e.ordem || 0
            }))
          }))}
        />
      )}
    </>
  );
}
