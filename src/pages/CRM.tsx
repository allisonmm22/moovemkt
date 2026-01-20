import { useState, useEffect, useMemo, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { 
  Plus, DollarSign, MoreVertical, Loader2, Settings, 
  Bell, BellOff, Edit2, TrendingUp, Briefcase, Target,
  Search, X, ChevronLeft, ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSwipe } from '@/hooks/useSwipe';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { NegociacaoDetalheModal } from '@/components/NegociacaoDetalheModal';

interface Estagio {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  funil_id?: string;
  followup_ativo?: boolean;
}

interface Negociacao {
  id: string;
  titulo: string;
  valor: number;
  estagio_id: string;
  contato_id: string;
  status?: string;
  probabilidade?: number;
  notas?: string;
  data_fechamento?: string;
  created_at?: string;
  resumo_ia?: string;
  resumo_gerado_em?: string;
  contatos: {
    nome: string;
    telefone: string;
  };
}

interface Funil {
  id: string;
  nome: string;
  cor: string;
  estagios: Estagio[];
}

interface Contato {
  id: string;
  nome: string;
  telefone: string;
}

export default function CRM() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [funis, setFunis] = useState<Funil[]>([]);
  const [selectedFunilId, setSelectedFunilId] = useState<string | null>(null);
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOverEstagio, setDragOverEstagio] = useState<string | null>(null);
  const [termoBusca, setTermoBusca] = useState('');
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [novoContatoId, setNovoContatoId] = useState('');
  const [novoTitulo, setNovoTitulo] = useState('');
  const [tituloEditado, setTituloEditado] = useState(false);
  const [novoValor, setNovoValor] = useState('');
  const [novoEstagioId, setNovoEstagioId] = useState('');
  const [criando, setCriando] = useState(false);

  // Detalhe modal state
  const [negociacaoSelecionada, setNegociacaoSelecionada] = useState<Negociacao | null>(null);
  const [detalheModalOpen, setDetalheModalOpen] = useState(false);

  const selectedFunil = funis.find(f => f.id === selectedFunilId) || null;

  // Swipe handlers for mobile stage navigation
  const handleSwipeLeft = useCallback(() => {
    if (selectedFunil && activeStageIndex < selectedFunil.estagios.length - 1) {
      setActiveStageIndex(prev => prev + 1);
    }
  }, [selectedFunil, activeStageIndex]);

  const handleSwipeRight = useCallback(() => {
    if (activeStageIndex > 0) {
      setActiveStageIndex(prev => prev - 1);
    }
  }, [activeStageIndex]);

  const [swipeHandlers, swipeState] = useSwipe({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    threshold: 60,
  });

  // Negociações filtradas por busca
  const negociacoesFiltradas = useMemo(() => {
    if (!termoBusca.trim()) return negociacoes;
    
    const termo = termoBusca.toLowerCase().trim();
    return negociacoes.filter(n => 
      n.contatos?.nome?.toLowerCase().includes(termo) ||
      n.contatos?.telefone?.includes(termo)
    );
  }, [negociacoes, termoBusca]);

  // Métricas calculadas (usando negociações filtradas)
  const metricas = useMemo(() => {
    const negociacoesDoFunil = selectedFunil 
      ? negociacoesFiltradas.filter(n => selectedFunil.estagios.some(e => e.id === n.estagio_id))
      : negociacoesFiltradas;
    
    const totalPipeline = negociacoesDoFunil.reduce((acc, n) => acc + Number(n.valor), 0);
    const totalNegociacoes = negociacoesDoFunil.length;
    const mediaProbabilidade = totalNegociacoes > 0 
      ? Math.round(negociacoesDoFunil.reduce((acc, n) => acc + (n.probabilidade || 0), 0) / totalNegociacoes)
      : 0;
    
    return { totalPipeline, totalNegociacoes, mediaProbabilidade };
  }, [negociacoesFiltradas, selectedFunil]);

  useEffect(() => {
    if (usuario?.conta_id) {
      fetchData();
    }
  }, [usuario]);

  useEffect(() => {
    const savedFunilId = localStorage.getItem('crm_selected_funil');
    if (savedFunilId && funis.some(f => f.id === savedFunilId)) {
      setSelectedFunilId(savedFunilId);
    } else if (funis.length > 0 && !selectedFunilId) {
      setSelectedFunilId(funis[0].id);
    }
  }, [funis]);

  const handleFunilChange = (funilId: string) => {
    setSelectedFunilId(funilId);
    localStorage.setItem('crm_selected_funil', funilId);
  };

  const fetchData = async () => {
    try {
      const [funisRes, negociacoesRes] = await Promise.all([
        supabase
          .from('funis')
          .select(`*, estagios(*)`)
          .eq('conta_id', usuario!.conta_id)
          .order('ordem'),
        supabase
          .from('negociacoes')
          .select(`*, contatos(nome, telefone)`)
          .eq('conta_id', usuario!.conta_id)
          .eq('status', 'aberto'),
      ]);

      if (funisRes.data) {
        const funisWithSortedEstagios = funisRes.data.map(funil => ({
          ...funil,
          estagios: (funil.estagios || []).sort(
            (a: Estagio, b: Estagio) => a.ordem - b.ordem
          )
        }));
        setFunis(funisWithSortedEstagios);
      }

      if (negociacoesRes.data) {
        setNegociacoes(negociacoesRes.data);
      }
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchContatos = async () => {
    const { data } = await supabase
      .from('contatos')
      .select('id, nome, telefone')
      .eq('conta_id', usuario!.conta_id)
      .order('nome');
    if (data) setContatos(data);
  };

  const openModal = async () => {
    await fetchContatos();
    setNovoContatoId('');
    setNovoTitulo('');
    setTituloEditado(false);
    setNovoValor('');
    setNovoEstagioId(selectedFunil?.estagios[0]?.id || '');
    setModalOpen(true);
  };

  const handleContatoChange = (contatoId: string) => {
    setNovoContatoId(contatoId);
    if (!tituloEditado) {
      const contato = contatos.find(c => c.id === contatoId);
      if (contato) setNovoTitulo(contato.nome);
    }
  };

  const handleTituloChange = (valor: string) => {
    setNovoTitulo(valor);
    setTituloEditado(true);
  };

  const handleCriarNegociacao = async () => {
    if (!novoContatoId || !novoTitulo.trim()) {
      toast.error('Selecione um contato e preencha o título');
      return;
    }

    setCriando(true);
    try {
      const { data, error } = await supabase
        .from('negociacoes')
        .insert({
          titulo: novoTitulo.trim(),
          contato_id: novoContatoId,
          valor: parseFloat(novoValor) || 0,
          estagio_id: novoEstagioId || null,
          conta_id: usuario!.conta_id,
          status: 'aberto',
          probabilidade: 50,
        })
        .select('*, contatos(nome, telefone)')
        .single();

      if (error) throw error;

      setNegociacoes(prev => [...prev, data]);
      setModalOpen(false);
      toast.success('Negociação criada!');
    } catch (error) {
      toast.error('Erro ao criar negociação');
    } finally {
      setCriando(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, negociacaoId: string) => {
    e.dataTransfer.setData('negociacaoId', negociacaoId);
    setDragging(negociacaoId);
  };

  const handleDragEnd = () => {
    setDragging(null);
    setDragOverEstagio(null);
  };

  const handleDragOver = (e: React.DragEvent, estagioId: string) => {
    e.preventDefault();
    setDragOverEstagio(estagioId);
  };

  const handleDragLeave = () => {
    setDragOverEstagio(null);
  };

  const handleDrop = async (e: React.DragEvent, estagioId: string) => {
    e.preventDefault();
    const negociacaoId = e.dataTransfer.getData('negociacaoId');
    setDragging(null);
    setDragOverEstagio(null);

    try {
      const { error } = await supabase
        .from('negociacoes')
        .update({ estagio_id: estagioId })
        .eq('id', negociacaoId);

      if (error) throw error;

      setNegociacoes((prev) =>
        prev.map((n) => (n.id === negociacaoId ? { ...n, estagio_id: estagioId } : n))
      );

      toast.success('Negociação movida!');
    } catch (error) {
      toast.error('Erro ao mover negociação');
    }
  };

  const handleAbrirDetalhes = (negociacao: Negociacao) => {
    setNegociacaoSelecionada(negociacao);
    setDetalheModalOpen(true);
  };

  const handleAtualizarNegociacao = (negociacaoAtualizada: Negociacao) => {
    setNegociacoes((prev) =>
      prev.map((n) => (n.id === negociacaoAtualizada.id ? negociacaoAtualizada : n))
    );
    setNegociacaoSelecionada(negociacaoAtualizada);
  };

  const handleExcluirNegociacao = (negociacaoId: string) => {
    setNegociacoes((prev) => prev.filter((n) => n.id !== negociacaoId));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getNegociacoesPorEstagio = (estagioId: string) => {
    return negociacoesFiltradas.filter((n) => n.estagio_id === estagioId);
  };

  const getTotalPorEstagio = (estagioId: string) => {
    return getNegociacoesPorEstagio(estagioId).reduce((acc, n) => acc + Number(n.valor), 0);
  };

  // getInitials removido - não mais usado no design simplificado

  // getProbabilityColor removido - não mais usado no design simplificado

  const handleToggleFollowup = async (estagio: Estagio) => {
    const novoValor = !(estagio.followup_ativo ?? true);
    try {
      const { error } = await supabase
        .from('estagios')
        .update({ followup_ativo: novoValor })
        .eq('id', estagio.id);

      if (error) throw error;

      setFunis(prev => prev.map(funil => ({
        ...funil,
        estagios: funil.estagios.map(e => 
          e.id === estagio.id ? { ...e, followup_ativo: novoValor } : e
        )
      })));

      toast.success(novoValor ? 'Follow-up ativado' : 'Follow-up desativado');
    } catch (error) {
      console.error('Erro ao atualizar follow-up:', error);
      toast.error('Erro ao atualizar follow-up');
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header com Métricas */}
        <div className="space-y-4 md:space-y-6 px-4 md:px-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">CRM</h1>
              <p className="text-sm md:text-base text-muted-foreground mt-1 hidden sm:block">
                Gerencie suas negociações e acompanhe o funil de vendas
              </p>
            </div>
            <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
              <Link
                to="/crm/configuracoes"
                className="p-2 md:p-2.5 rounded-xl border border-border hover:bg-muted transition-all"
                title="Configurações do CRM"
              >
                <Settings className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
              </Link>
              <button 
                onClick={openModal}
                className="h-9 md:h-11 px-3 md:px-5 rounded-xl bg-primary text-primary-foreground font-medium flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/25"
              >
                <Plus className="h-4 w-4 md:h-5 md:w-5" />
                <span className="hidden sm:inline">Nova Negociação</span>
              </button>
            </div>
          </div>

          {/* Cards de Métricas - Simplificados */}
          <div className={cn(
            "flex gap-3",
            isMobile ? "overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory" : "grid grid-cols-3"
          )}>
            <div className={cn(
              "p-4 rounded-xl bg-card border border-border",
              isMobile && "flex-shrink-0 w-[150px] snap-center"
            )}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Pipeline</p>
                  <p className="text-lg font-semibold text-foreground truncate">{formatCurrency(metricas.totalPipeline)}</p>
                </div>
              </div>
            </div>
            
            <div className={cn(
              "p-4 rounded-xl bg-card border border-border",
              isMobile && "flex-shrink-0 w-[130px] snap-center"
            )}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Negociações</p>
                  <p className="text-lg font-semibold text-foreground">{metricas.totalNegociacoes}</p>
                </div>
              </div>
            </div>
            
            <div className={cn(
              "p-4 rounded-xl bg-card border border-border",
              isMobile && "flex-shrink-0 w-[130px] snap-center"
            )}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Prob. Média</p>
                  <p className="text-lg font-semibold text-foreground">{metricas.mediaProbabilidade}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Campo de Busca */}
          <div className="relative">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="pl-10 pr-10 h-10 md:h-11 rounded-xl bg-card border-border"
              />
              {termoBusca && (
                <button
                  onClick={() => setTermoBusca('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
            {termoBusca && (
              <p className="text-xs text-muted-foreground mt-2">
                {metricas.totalNegociacoes} negociação(ões) encontrada(s)
              </p>
            )}
          </div>
        </div>

        {/* Modal Nova Negociação */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nova Negociação</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Contato *</Label>
                <Select value={novoContatoId} onValueChange={handleContatoChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um contato" />
                  </SelectTrigger>
                  <SelectContent>
                    {contatos.map((contato) => (
                      <SelectItem key={contato.id} value={contato.id}>
                        {contato.nome} - {contato.telefone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Título da Negociação *</Label>
                <Input
                  value={novoTitulo}
                  onChange={(e) => handleTituloChange(e.target.value)}
                  placeholder="Nome da negociação"
                />
                {novoContatoId && !tituloEditado && (
                  <p className="text-xs text-muted-foreground">
                    Auto-preenchido com nome do contato
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  value={novoValor}
                  onChange={(e) => setNovoValor(e.target.value)}
                  placeholder="0,00"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="space-y-2">
                <Label>Estágio Inicial</Label>
                <Select value={novoEstagioId} onValueChange={setNovoEstagioId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um estágio" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedFunil?.estagios.map((estagio) => (
                      <SelectItem key={estagio.id} value={estagio.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="h-3 w-3 rounded-full" 
                            style={{ backgroundColor: estagio.cor }}
                          />
                          {estagio.nome}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCriarNegociacao} disabled={criando}>
                  {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Negociação'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Seletor de Funil Aprimorado */}
        {funis.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 md:p-4 rounded-2xl bg-card border border-border mx-4 md:mx-0">
            <div className="flex items-center gap-2 md:gap-4 flex-1">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Target className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                <span className="text-xs md:text-sm font-medium text-muted-foreground hidden sm:inline">Funil:</span>
              </div>
              <Select value={selectedFunilId || ''} onValueChange={handleFunilChange}>
                <SelectTrigger className="flex-1 sm:w-[200px] md:w-[280px] bg-background h-9 md:h-10">
                  <SelectValue placeholder="Selecione um funil" />
                </SelectTrigger>
                <SelectContent>
                  {funis.map((funil) => (
                    <SelectItem key={funil.id} value={funil.id}>
                      <div className="flex items-center gap-3">
                        <div 
                          className="h-3 w-3 rounded-full ring-2 ring-offset-1 ring-offset-background" 
                          style={{ backgroundColor: funil.cor, boxShadow: `0 0 8px ${funil.cor}50` }}
                        />
                        <span className="font-medium">{funil.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          ({funil.estagios.length} etapas)
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {selectedFunil && !isMobile && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{selectedFunil.estagios.length} etapas</span>
                <span>•</span>
                <span>{formatCurrency(metricas.totalPipeline)} em pipeline</span>
              </div>
            )}
          </div>
        )}

        {/* Mobile Stage Navigator */}
        {isMobile && selectedFunil && selectedFunil.estagios.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-card/50 border-y border-border sticky top-0 z-10">
            <button
              onClick={() => setActiveStageIndex(Math.max(0, activeStageIndex - 1))}
              disabled={activeStageIndex === 0}
              className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            
            <div className="flex-1 flex items-center justify-center gap-2">
              <div 
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: selectedFunil.estagios[activeStageIndex]?.cor }}
              />
              <span className="font-semibold text-sm">
                {selectedFunil.estagios[activeStageIndex]?.nome}
              </span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {getNegociacoesPorEstagio(selectedFunil.estagios[activeStageIndex]?.id).length}
              </span>
            </div>
            
            <button
              onClick={() => setActiveStageIndex(Math.min(selectedFunil.estagios.length - 1, activeStageIndex + 1))}
              disabled={activeStageIndex === selectedFunil.estagios.length - 1}
              className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Stage Dots (Mobile) */}
        {isMobile && selectedFunil && selectedFunil.estagios.length > 0 && (
          <div className="flex justify-center gap-1.5 px-4 py-2">
            {selectedFunil.estagios.map((estagio, index) => (
              <button
                key={estagio.id}
                onClick={() => setActiveStageIndex(index)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  index === activeStageIndex ? "w-6" : "w-2"
                )}
                style={{ 
                  backgroundColor: estagio.cor,
                  opacity: index === activeStageIndex ? 1 : 0.4
                }}
              />
            ))}
          </div>
        )}

        {/* Pipeline Progress Bar removida para visual mais limpo */}

        {/* Kanban */}
        {selectedFunil ? (
          <div 
            className={cn(
              "pb-4 pt-2 relative",
              !isMobile && "flex gap-5 overflow-x-auto crm-kanban-scroll",
              !isMobile && "px-0",
              isMobile && swipeState.swiping && "select-none"
            )}
            style={!isMobile ? { transform: 'rotateX(180deg)' } : {
              transform: swipeState.swiping ? `translateX(${swipeState.deltaX * 0.3}px)` : undefined,
              transition: swipeState.swiping ? 'none' : 'transform 0.3s ease-out',
            }}
            {...(isMobile ? swipeHandlers : {})}
          >
            {(isMobile 
              ? [selectedFunil.estagios[activeStageIndex]].filter(Boolean)
              : selectedFunil.estagios
            ).map((estagio, estagioIndex) => {
              const negociacoesEstagio = getNegociacoesPorEstagio(estagio.id);
              const isDropTarget = dragOverEstagio === estagio.id;
              
              return (
                <div
                  key={estagio.id}
                  className={cn(
                    "transition-all duration-300",
                    !isMobile && "flex-shrink-0 w-80",
                    isMobile && "px-4",
                    isDropTarget && "scale-[1.02]"
                  )}
                  style={!isMobile ? { 
                    transform: 'rotateX(180deg)',
                    animationDelay: `${estagioIndex * 50}ms`
                  } : undefined}
                  onDragOver={(e) => handleDragOver(e, estagio.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, estagio.id)}
                >
                  {/* Header do Estágio - Simplificado */}
                  {!isMobile && (
                    <div 
                      className={cn(
                        "mb-3 pb-3 border-b transition-all duration-300",
                        isDropTarget ? "border-primary" : "border-border"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: estagio.cor }}
                          />
                          <h3 className="font-medium text-sm text-foreground">{estagio.nome}</h3>
                          <span className="text-xs text-muted-foreground">
                            {negociacoesEstagio.length}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {formatCurrency(getTotalPorEstagio(estagio.id))}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1 rounded-md hover:bg-muted transition-colors">
                                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate('/crm/configuracoes')}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                Editar etapa
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleFollowup(estagio)}>
                                {estagio.followup_ativo === false ? (
                                  <>
                                    <Bell className="h-4 w-4 mr-2" />
                                    Ativar follow-up
                                  </>
                                ) : (
                                  <>
                                    <BellOff className="h-4 w-4 mr-2" />
                                    Desativar follow-up
                                  </>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Mobile Header - Total da Etapa */}
                  {isMobile && (
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <DollarSign className="h-4 w-4" />
                        <span className="font-medium">{formatCurrency(getTotalPorEstagio(estagio.id))}</span>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate('/crm/configuracoes')}>
                            <Edit2 className="h-4 w-4 mr-2" />
                            Editar etapa
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleFollowup(estagio)}>
                            {estagio.followup_ativo === false ? (
                              <>
                                <Bell className="h-4 w-4 mr-2" />
                                Ativar follow-up
                              </>
                            ) : (
                              <>
                                <BellOff className="h-4 w-4 mr-2" />
                                Desativar follow-up
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}

                  {/* Cards */}
                  <div className={cn(
                    "space-y-3 min-h-[200px]",
                    !isMobile && "max-h-[calc(100vh-380px)] overflow-y-auto crm-stage-scroll pr-1"
                  )}>
                    {negociacoesEstagio.map((negociacao) => {
                      return (
                        <div
                          key={negociacao.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, negociacao.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => handleAbrirDetalhes(negociacao)}
                          className={cn(
                            'group relative p-3 rounded-lg cursor-pointer transition-all',
                            dragging === negociacao.id && 'opacity-50 cursor-grabbing'
                          )}
                          style={{
                            backgroundColor: `${estagio.cor}08`,
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            borderColor: `${estagio.cor}25`,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = `${estagio.cor}15`;
                            e.currentTarget.style.borderColor = `${estagio.cor}40`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = `${estagio.cor}08`;
                            e.currentTarget.style.borderColor = `${estagio.cor}25`;
                          }}
                        >
                          {/* Título */}
                          <p className="font-medium text-sm text-foreground truncate mb-1">
                            {negociacao.titulo}
                          </p>
                          
                          {/* Contato */}
                          <p className="text-xs text-muted-foreground truncate mb-3">
                            {negociacao.contatos?.nome || 'Sem contato'}
                          </p>
                          
                          {/* Footer: Valor e Prob */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">
                              {formatCurrency(Number(negociacao.valor))}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {negociacao.probabilidade || 0}%
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Empty State */}
                    {negociacoesEstagio.length === 0 && (
                      <div 
                        className={cn(
                          "p-8 rounded-2xl border-2 border-dashed text-center transition-all duration-300",
                          isDropTarget 
                            ? "border-primary bg-primary/5 scale-[1.02]" 
                            : "border-border/50"
                        )}
                      >
                        <div 
                          className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                          style={{ backgroundColor: `${estagio.cor}15` }}
                        >
                          <Target className="h-6 w-6" style={{ color: estagio.cor }} />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {isDropTarget ? 'Solte aqui!' : 'Arraste negociações'}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          para esta etapa
                        </p>
                        <button
                          onClick={openModal}
                          className="mt-4 text-xs font-medium text-primary hover:underline"
                        >
                          + Criar negociação
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
              <Target className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum funil configurado</h3>
            <p className="text-muted-foreground mb-4">
              Configure seu primeiro funil para começar a gerenciar negociações
            </p>
            <Link
              to="/crm/configuracoes"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              <Settings className="h-4 w-4" />
              Configurar CRM
            </Link>
          </div>
        )}

        {/* Modal de Detalhes da Negociação */}
        <NegociacaoDetalheModal
          negociacao={negociacaoSelecionada}
          isOpen={detalheModalOpen}
          onClose={() => {
            setDetalheModalOpen(false);
            setNegociacaoSelecionada(null);
          }}
          onUpdate={handleAtualizarNegociacao}
          onDelete={handleExcluirNegociacao}
          estagios={selectedFunil?.estagios || []}
          funis={funis}
        />
      </div>
    </MainLayout>
  );
}
