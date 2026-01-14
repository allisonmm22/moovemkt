import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { 
  ArrowLeft, Plus, Trash2, Edit2, GripVertical, Loader2, 
  Settings, Tag, Bell, BellOff, ChevronUp, ChevronDown,
  Layers, ArrowRight, X, Copy, Trophy, XCircle, Zap, UserCheck
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { validarEExibirErro } from '@/hooks/useValidarLimitePlano';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Estagio {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  funil_id: string;
  followup_ativo: boolean;
  tipo: 'normal' | 'ganho' | 'perdido' | 'cliente';
}

interface Funil {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string;
  ordem: number;
  estagios: Estagio[];
}

interface TagItem {
  id: string;
  nome: string;
  cor: string;
  conta_id: string;
}

const CORES_PREDEFINIDAS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

export default function CRMConfiguracoes() {
  const { usuario } = useAuth();
  const [funis, setFunis] = useState<Funil[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFunil, setExpandedFunil] = useState<string | null>(null);
  const [permitirMultiplas, setPermitirMultiplas] = useState(true);
  const [activeTab, setActiveTab] = useState('funis');
  
  // Tags state
  const [tags, setTags] = useState<TagItem[]>([]);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const [tagForm, setTagForm] = useState({ nome: '', cor: '#3b82f6' });
  
  // Modal states
  const [funilModalOpen, setFunilModalOpen] = useState(false);
  const [estagioModalOpen, setEstagioModalOpen] = useState(false);
  const [editingFunil, setEditingFunil] = useState<Funil | null>(null);
  const [editingEstagio, setEditingEstagio] = useState<Estagio | null>(null);
  const [selectedFunilId, setSelectedFunilId] = useState<string | null>(null);
  
  // Form states
  const [funilForm, setFunilForm] = useState({ nome: '', descricao: '', cor: '#3b82f6' });
  const [estagioForm, setEstagioForm] = useState({ nome: '', cor: '#3b82f6', followup_ativo: true, tipo: 'normal' as 'normal' | 'ganho' | 'perdido' | 'cliente' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (usuario?.conta_id) {
      fetchFunis();
      fetchContaConfig();
      fetchTags();
    }
  }, [usuario]);

  const fetchContaConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('contas')
        .select('permitir_multiplas_negociacoes')
        .eq('id', usuario!.conta_id)
        .single();
      
      if (error) throw error;
      setPermitirMultiplas(data?.permitir_multiplas_negociacoes ?? true);
    } catch (error) {
      console.error('Erro ao buscar config da conta:', error);
    }
  };

  const handleToggleMultiplas = async (checked: boolean) => {
    try {
      const { error } = await supabase
        .from('contas')
        .update({ permitir_multiplas_negociacoes: checked })
        .eq('id', usuario!.conta_id);
      
      if (error) throw error;
      setPermitirMultiplas(checked);
      toast.success(checked ? 'Múltiplas negociações habilitadas' : 'Múltiplas negociações desabilitadas');
    } catch (error) {
      console.error('Erro ao atualizar config:', error);
      toast.error('Erro ao atualizar configuração');
    }
  };

  // Tags handlers
  const fetchTags = async () => {
    try {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('conta_id', usuario!.conta_id)
        .order('nome');
      
      if (error) throw error;
      setTags(data || []);
    } catch (error) {
      console.error('Erro ao buscar tags:', error);
    }
  };

  const openTagModal = (tag?: TagItem) => {
    if (tag) {
      setEditingTag(tag);
      setTagForm({ nome: tag.nome, cor: tag.cor });
    } else {
      setEditingTag(null);
      setTagForm({ nome: '', cor: '#3b82f6' });
    }
    setTagModalOpen(true);
  };

  const saveTag = async () => {
    if (!tagForm.nome.trim()) {
      toast.error('Nome da tag é obrigatório');
      return;
    }

    setSaving(true);
    try {
      if (editingTag) {
        const { error } = await supabase
          .from('tags')
          .update({
            nome: tagForm.nome,
            cor: tagForm.cor,
          })
          .eq('id', editingTag.id);

        if (error) throw error;
        toast.success('Tag atualizada!');
      } else {
        const { error } = await supabase
          .from('tags')
          .insert({
            conta_id: usuario!.conta_id,
            nome: tagForm.nome,
            cor: tagForm.cor,
          });

        if (error) {
          if (error.code === '23505') {
            toast.error('Já existe uma tag com este nome');
            setSaving(false);
            return;
          }
          throw error;
        }
        toast.success('Tag criada!');
      }

      setTagModalOpen(false);
      fetchTags();
    } catch (error) {
      console.error('Erro ao salvar tag:', error);
      toast.error('Erro ao salvar tag');
    } finally {
      setSaving(false);
    }
  };

  const deleteTag = async (tagId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta tag?')) {
      return;
    }

    try {
      const { error } = await supabase.from('tags').delete().eq('id', tagId);
      if (error) throw error;

      toast.success('Tag excluída!');
      fetchTags();
    } catch (error) {
      console.error('Erro ao excluir tag:', error);
      toast.error('Erro ao excluir tag');
    }
  };

  const fetchFunis = async () => {
    try {
      const { data, error } = await supabase
        .from('funis')
        .select(`*, estagios(*)`)
        .eq('conta_id', usuario!.conta_id)
        .order('ordem');

      if (error) throw error;

      const funisWithSortedEstagios = (data || []).map(funil => ({
        ...funil,
        estagios: (funil.estagios || []).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(e => ({
          ...e,
          tipo: (e.tipo || 'normal') as 'normal' | 'ganho' | 'perdido' | 'cliente'
        }))
      }));

      setFunis(funisWithSortedEstagios);
    } catch (error) {
      console.error('Erro ao buscar funis:', error);
      toast.error('Erro ao carregar funis');
    } finally {
      setLoading(false);
    }
  };

  // Funil handlers
  const openFunilModal = (funil?: Funil) => {
    if (funil) {
      setEditingFunil(funil);
      setFunilForm({ nome: funil.nome, descricao: funil.descricao || '', cor: funil.cor });
    } else {
      setEditingFunil(null);
      setFunilForm({ nome: '', descricao: '', cor: '#3b82f6' });
    }
    setFunilModalOpen(true);
  };

  const saveFunil = async () => {
    if (!funilForm.nome.trim()) {
      toast.error('Nome do funil é obrigatório');
      return;
    }

    setSaving(true);
    try {
      if (editingFunil) {
        const { error } = await supabase
          .from('funis')
          .update({
            nome: funilForm.nome,
            descricao: funilForm.descricao || null,
            cor: funilForm.cor,
          })
          .eq('id', editingFunil.id);

        if (error) throw error;
        toast.success('Funil atualizado!');
      } else {
        const permitido = await validarEExibirErro(usuario!.conta_id, 'funis');
        if (!permitido) {
          setSaving(false);
          return;
        }

        const maxOrdem = funis.length > 0 ? Math.max(...funis.map(f => f.ordem || 0)) + 1 : 0;
        
        const { error } = await supabase
          .from('funis')
          .insert({
            conta_id: usuario!.conta_id,
            nome: funilForm.nome,
            descricao: funilForm.descricao || null,
            cor: funilForm.cor,
            ordem: maxOrdem,
          });

        if (error) throw error;
        toast.success('Funil criado!');
      }

      setFunilModalOpen(false);
      fetchFunis();
    } catch (error) {
      console.error('Erro ao salvar funil:', error);
      toast.error('Erro ao salvar funil');
    } finally {
      setSaving(false);
    }
  };

  const deleteFunil = async (funilId: string) => {
    if (!confirm('Tem certeza que deseja excluir este funil? Todas as etapas serão removidas.')) {
      return;
    }

    try {
      await supabase.from('estagios').delete().eq('funil_id', funilId);
      const { error } = await supabase.from('funis').delete().eq('id', funilId);
      if (error) throw error;

      toast.success('Funil excluído!');
      setExpandedFunil(null);
      fetchFunis();
    } catch (error) {
      console.error('Erro ao excluir funil:', error);
      toast.error('Erro ao excluir funil');
    }
  };

  const duplicateFunil = async (funil: Funil) => {
    try {
      // Validar limite do plano
      const permitido = await validarEExibirErro(usuario!.conta_id, 'funis');
      if (!permitido) return;

      const maxOrdem = funis.length > 0 ? Math.max(...funis.map(f => f.ordem || 0)) + 1 : 0;
      
      // Criar novo funil
      const { data: novoFunil, error: funilError } = await supabase
        .from('funis')
        .insert({
          conta_id: usuario!.conta_id,
          nome: `${funil.nome} (cópia)`,
          descricao: funil.descricao,
          cor: funil.cor,
          ordem: maxOrdem,
        })
        .select()
        .single();

      if (funilError) throw funilError;

      // Duplicar todas as etapas
      if (funil.estagios.length > 0) {
        const novasEtapas = funil.estagios.map((estagio, index) => ({
          funil_id: novoFunil.id,
          nome: estagio.nome,
          cor: estagio.cor,
          ordem: index,
          followup_ativo: estagio.followup_ativo,
          tipo: estagio.tipo || 'normal',
        }));

        const { error: estagiosError } = await supabase
          .from('estagios')
          .insert(novasEtapas);

        if (estagiosError) throw estagiosError;
      }

      toast.success('Funil duplicado com sucesso!');
      fetchFunis();
    } catch (error) {
      console.error('Erro ao duplicar funil:', error);
      toast.error('Erro ao duplicar funil');
    }
  };

  // Estagio handlers
  const openEstagioModal = (funilId: string, estagio?: Estagio) => {
    setSelectedFunilId(funilId);
    if (estagio) {
      setEditingEstagio(estagio);
      setEstagioForm({ nome: estagio.nome, cor: estagio.cor, followup_ativo: estagio.followup_ativo ?? true, tipo: estagio.tipo || 'normal' });
    } else {
      setEditingEstagio(null);
      setEstagioForm({ nome: '', cor: '#3b82f6', followup_ativo: true, tipo: 'normal' });
    }
    setEstagioModalOpen(true);
  };

  const saveEstagio = async () => {
    if (!estagioForm.nome.trim()) {
      toast.error('Nome da etapa é obrigatório');
      return;
    }

    setSaving(true);
    try {
      if (editingEstagio) {
        const { error } = await supabase
          .from('estagios')
          .update({
            nome: estagioForm.nome,
            cor: estagioForm.cor,
            followup_ativo: estagioForm.followup_ativo,
            tipo: estagioForm.tipo,
          })
          .eq('id', editingEstagio.id);

        if (error) throw error;
        toast.success('Etapa atualizada!');
      } else {
        const funil = funis.find(f => f.id === selectedFunilId);
        const maxOrdem = funil && funil.estagios.length > 0 
          ? Math.max(...funil.estagios.map(e => e.ordem || 0)) + 1 
          : 0;
        
        const { error } = await supabase
          .from('estagios')
          .insert({
            funil_id: selectedFunilId!,
            nome: estagioForm.nome,
            cor: estagioForm.cor,
            ordem: maxOrdem,
            followup_ativo: estagioForm.followup_ativo,
            tipo: estagioForm.tipo,
          });

        if (error) throw error;
        toast.success('Etapa criada!');
      }

      setEstagioModalOpen(false);
      fetchFunis();
    } catch (error) {
      console.error('Erro ao salvar etapa:', error);
      toast.error('Erro ao salvar etapa');
    } finally {
      setSaving(false);
    }
  };

  const deleteEstagio = async (estagioId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta etapa?')) {
      return;
    }

    try {
      const { error } = await supabase.from('estagios').delete().eq('id', estagioId);
      if (error) throw error;

      toast.success('Etapa excluída!');
      fetchFunis();
    } catch (error) {
      console.error('Erro ao excluir etapa:', error);
      toast.error('Erro ao excluir etapa');
    }
  };

  const reorderEstagio = async (funilId: string, estagioId: string, direction: 'up' | 'down') => {
    const funil = funis.find(f => f.id === funilId);
    if (!funil) return;

    const estagios = [...funil.estagios];
    const index = estagios.findIndex(e => e.id === estagioId);
    
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === estagios.length - 1)) {
      return;
    }

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [estagios[index], estagios[newIndex]] = [estagios[newIndex], estagios[index]];

    try {
      await Promise.all(
        estagios.map((e, i) =>
          supabase.from('estagios').update({ ordem: i }).eq('id', e.id)
        )
      );
      fetchFunis();
    } catch (error) {
      console.error('Erro ao reordenar:', error);
      toast.error('Erro ao reordenar etapas');
    }
  };

  const toggleFollowup = async (estagio: Estagio) => {
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
      <TooltipProvider>
        <div className="space-y-6 animate-fade-in">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Link 
              to="/crm" 
              className="p-2 rounded-xl hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Configurações do CRM</h1>
              <p className="text-sm text-muted-foreground">
                Gerencie funis, etapas e tags do seu CRM
              </p>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-3 bg-muted/50">
              <TabsTrigger value="funis" className="gap-2 data-[state=active]:bg-background">
                <Layers className="h-4 w-4" />
                Funis
              </TabsTrigger>
              <TabsTrigger value="tags" className="gap-2 data-[state=active]:bg-background">
                <Tag className="h-4 w-4" />
                Tags
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-2 data-[state=active]:bg-background">
                <Settings className="h-4 w-4" />
                Geral
              </TabsTrigger>
            </TabsList>

            {/* Tab Funis */}
            <TabsContent value="funis" className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Funis de Vendas</h2>
                  <p className="text-sm text-muted-foreground">
                    Configure seus pipelines de vendas
                  </p>
                </div>
                <Button onClick={() => openFunilModal()} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Novo Funil
                </Button>
              </div>

              {funis.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl bg-muted/20">
                  <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Nenhum funil configurado</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    Crie seu primeiro funil para começar a organizar suas negociações
                  </p>
                  <Button onClick={() => openFunilModal()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar primeiro funil
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {funis.map((funil) => (
                    <div 
                      key={funil.id} 
                      className={cn(
                        "border rounded-2xl bg-card overflow-hidden transition-all duration-300",
                        expandedFunil === funil.id ? "border-primary/50 shadow-lg shadow-primary/5" : "border-border hover:border-muted-foreground/30"
                      )}
                    >
                      {/* Funil Card Header */}
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div 
                              className="h-10 w-10 rounded-xl flex items-center justify-center"
                              style={{ backgroundColor: `${funil.cor}20` }}
                            >
                              <div 
                                className="h-4 w-4 rounded-full" 
                                style={{ backgroundColor: funil.cor }}
                              />
                            </div>
                            <div>
                              <h3 className="font-semibold text-foreground text-lg">{funil.nome}</h3>
                              {funil.descricao && (
                                <p className="text-sm text-muted-foreground line-clamp-1">{funil.descricao}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => openFunilModal(funil)}
                                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                                >
                                  <Edit2 className="h-4 w-4 text-muted-foreground" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Editar funil</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => duplicateFunil(funil)}
                                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                                >
                                  <Copy className="h-4 w-4 text-muted-foreground" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Duplicar funil</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => deleteFunil(funil.id)}
                                  className="p-2 rounded-lg hover:bg-destructive/10 transition-colors"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Excluir funil</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>

                        {/* Pipeline Preview Horizontal */}
                        {funil.estagios.length > 0 ? (
                          <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-thin">
                            {funil.estagios.map((estagio, index) => (
                              <div key={estagio.id} className="flex items-center shrink-0">
                                <div 
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors"
                                  style={{ 
                                    backgroundColor: `${estagio.cor}15`,
                                    borderColor: `${estagio.cor}30`
                                  }}
                                >
                                  <div 
                                    className="h-2.5 w-2.5 rounded-full shrink-0" 
                                    style={{ backgroundColor: estagio.cor }}
                                  />
                                  <span className="text-sm font-medium text-foreground whitespace-nowrap">
                                    {estagio.nome}
                                  </span>
                                  {/* Tipo indicator */}
                                  {estagio.tipo === 'ganho' && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Trophy className="h-3.5 w-3.5 text-emerald-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>Etapa de Ganho</TooltipContent>
                                    </Tooltip>
                                  )}
                                  {estagio.tipo === 'perdido' && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>Etapa de Perda</TooltipContent>
                                    </Tooltip>
                                  )}
                                  {/* Follow-up indicator */}
                                  <Tooltip>
                                    <TooltipTrigger>
                                      {estagio.followup_ativo !== false ? (
                                        <Bell className="h-3.5 w-3.5 text-primary" />
                                      ) : (
                                        <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
                                      )}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {estagio.followup_ativo !== false ? 'Follow-up ativo' : 'Follow-up desativado'}
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                {index < funil.estagios.length - 1 && (
                                  <ArrowRight className="h-4 w-4 text-muted-foreground/50 mx-1 shrink-0" />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-3 px-4 rounded-lg bg-muted/50 text-center">
                            <p className="text-sm text-muted-foreground">Nenhuma etapa configurada</p>
                          </div>
                        )}

                        {/* Expand Button */}
                        <button
                          onClick={() => setExpandedFunil(expandedFunil === funil.id ? null : funil.id)}
                          className={cn(
                            "w-full mt-4 py-2.5 px-4 rounded-xl border border-dashed transition-all flex items-center justify-center gap-2 text-sm font-medium",
                            expandedFunil === funil.id 
                              ? "border-primary/50 bg-primary/5 text-primary" 
                              : "border-border hover:border-muted-foreground/50 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {expandedFunil === funil.id ? (
                            <>
                              <X className="h-4 w-4" />
                              Fechar editor de etapas
                            </>
                          ) : (
                            <>
                              <Edit2 className="h-4 w-4" />
                              Editar etapas ({funil.estagios.length})
                            </>
                          )}
                        </button>
                      </div>

                      {/* Expanded Stage Editor */}
                      {expandedFunil === funil.id && (
                        <div className="border-t border-border bg-muted/30 p-5 animate-fade-in">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="font-medium text-foreground">Etapas do Funil</h4>
                              <p className="text-xs text-muted-foreground">Arraste para reordenar</p>
                            </div>
                            <Button 
                              size="sm" 
                              onClick={() => openEstagioModal(funil.id)}
                              className="gap-2"
                            >
                              <Plus className="h-4 w-4" />
                              Nova Etapa
                            </Button>
                          </div>

                          {funil.estagios.length === 0 ? (
                            <div className="py-8 text-center border-2 border-dashed border-border rounded-xl">
                              <p className="text-sm text-muted-foreground mb-3">
                                Nenhuma etapa configurada
                              </p>
                              <Button variant="outline" size="sm" onClick={() => openEstagioModal(funil.id)}>
                                <Plus className="h-4 w-4 mr-1" />
                                Adicionar primeira etapa
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {funil.estagios.map((estagio, index) => (
                                <div key={estagio.id} className="relative">
                                  <div 
                                    className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border hover:border-muted-foreground/30 transition-all group"
                                  >
                                    {/* Drag Handle & Order */}
                                    <div className="flex flex-col gap-0.5">
                                      <button
                                        onClick={() => reorderEstagio(funil.id, estagio.id, 'up')}
                                        disabled={index === 0}
                                        className={cn(
                                          "p-1 rounded hover:bg-muted transition-colors",
                                          index === 0 && "opacity-30 cursor-not-allowed"
                                        )}
                                      >
                                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                      </button>
                                      <button
                                        onClick={() => reorderEstagio(funil.id, estagio.id, 'down')}
                                        disabled={index === funil.estagios.length - 1}
                                        className={cn(
                                          "p-1 rounded hover:bg-muted transition-colors",
                                          index === funil.estagios.length - 1 && "opacity-30 cursor-not-allowed"
                                        )}
                                      >
                                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                      </button>
                                    </div>

                                    {/* Order Number */}
                                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                      <span className="text-sm font-semibold text-muted-foreground">{index + 1}</span>
                                    </div>

                                    {/* Color & Name */}
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <div 
                                        className="h-4 w-4 rounded-full shrink-0" 
                                        style={{ backgroundColor: estagio.cor }}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <p className="font-medium text-foreground truncate">{estagio.nome}</p>
                                          {estagio.tipo === 'ganho' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600">
                                              <Trophy className="h-3 w-3" />
                                              Ganho
                                            </span>
                                          )}
                                          {estagio.tipo === 'perdido' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600">
                                              <XCircle className="h-3 w-3" />
                                              Perdido
                                            </span>
                                          )}
                                          {estagio.tipo === 'cliente' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-600">
                                              <UserCheck className="h-3 w-3" />
                                              Cliente
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          {estagio.followup_ativo !== false ? 'Follow-up ativo' : 'Follow-up desativado'}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 shrink-0">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            onClick={() => toggleFollowup(estagio)}
                                            className={cn(
                                              "p-2 rounded-lg transition-colors",
                                              estagio.followup_ativo !== false 
                                                ? "text-primary hover:bg-primary/10" 
                                                : "text-muted-foreground hover:bg-muted"
                                            )}
                                          >
                                            {estagio.followup_ativo !== false ? (
                                              <Bell className="h-4 w-4" />
                                            ) : (
                                              <BellOff className="h-4 w-4" />
                                            )}
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {estagio.followup_ativo !== false ? 'Desativar follow-up' : 'Ativar follow-up'}
                                        </TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            onClick={() => openEstagioModal(funil.id, estagio)}
                                            className="p-2 rounded-lg hover:bg-muted transition-colors"
                                          >
                                            <Edit2 className="h-4 w-4 text-muted-foreground" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent>Editar etapa</TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            onClick={() => deleteEstagio(estagio.id)}
                                            className="p-2 rounded-lg hover:bg-destructive/10 transition-colors"
                                          >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent>Excluir etapa</TooltipContent>
                                      </Tooltip>
                                    </div>
                                  </div>
                                  
                                  {/* Flow Arrow */}
                                  {index < funil.estagios.length - 1 && (
                                    <div className="flex justify-center py-1">
                                      <div className="w-0.5 h-3 bg-border rounded-full" />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Tab Tags */}
            <TabsContent value="tags" className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Gerenciamento de Tags</h2>
                  <p className="text-sm text-muted-foreground">
                    Organize e categorize seus contatos
                  </p>
                </div>
                <Button onClick={() => openTagModal()} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nova Tag
                </Button>
              </div>

              {tags.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl bg-muted/20">
                  <Tag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma tag cadastrada</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    Tags ajudam a organizar e filtrar seus contatos
                  </p>
                  <Button onClick={() => openTagModal()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar primeira tag
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {tags.map((tag) => (
                    <div 
                      key={tag.id} 
                      className="group relative p-5 rounded-2xl border border-border bg-card hover:border-muted-foreground/30 transition-all hover:shadow-lg"
                    >
                      {/* Tag Preview Badge */}
                      <div className="mb-4">
                        <span 
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-white"
                          style={{ backgroundColor: tag.cor }}
                        >
                          <Tag className="h-3.5 w-3.5" />
                          {tag.nome}
                        </span>
                      </div>

                      {/* Tag Name */}
                      <h4 className="font-medium text-foreground mb-1">{tag.nome}</h4>
                      <p className="text-xs text-muted-foreground">Clique para editar</p>

                      {/* Actions */}
                      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => openTagModal(tag)}
                              className="p-2 rounded-lg bg-background/80 hover:bg-muted transition-colors"
                            >
                              <Edit2 className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Editar tag</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => deleteTag(tag.id)}
                              className="p-2 rounded-lg bg-background/80 hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Excluir tag</TooltipContent>
                        </Tooltip>
                      </div>

                      {/* Click overlay */}
                      <button 
                        onClick={() => openTagModal(tag)}
                        className="absolute inset-0 rounded-2xl"
                        aria-label={`Editar tag ${tag.nome}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Tab Configurações */}
            <TabsContent value="config" className="mt-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Configurações Gerais</h2>
                <p className="text-sm text-muted-foreground">
                  Ajuste o comportamento do CRM
                </p>
              </div>

              <div className="space-y-4">
                {/* Múltiplas Negociações */}
                <div className="border border-border rounded-2xl bg-card overflow-hidden">
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <Layers className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground mb-1">
                            Múltiplas negociações por lead
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Quando desativado, impede criar uma nova negociação se o lead já possui uma em aberto. 
                            Isso ajuda a evitar duplicações acidentais.
                          </p>
                        </div>
                      </div>
                      <Switch 
                        checked={permitirMultiplas} 
                        onCheckedChange={handleToggleMultiplas} 
                      />
                    </div>
                  </div>
                  <div className={cn(
                    "px-6 py-3 border-t border-border text-sm",
                    permitirMultiplas ? "bg-primary/5 text-primary" : "bg-muted/50 text-muted-foreground"
                  )}>
                    {permitirMultiplas 
                      ? "✓ Múltiplas negociações permitidas" 
                      : "Apenas uma negociação por lead"
                    }
                  </div>
                </div>

                {/* Placeholder for future settings */}
                <div className="border border-dashed border-border rounded-2xl p-8 text-center bg-muted/10">
                  <Settings className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <h3 className="font-medium text-muted-foreground mb-1">Mais configurações em breve</h3>
                  <p className="text-sm text-muted-foreground/70">
                    Novas opções de personalização serão adicionadas aqui
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Modal Funil */}
        <Dialog open={funilModalOpen} onOpenChange={setFunilModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {editingFunil ? 'Editar Funil' : 'Novo Funil'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="funil-nome">Nome do funil</Label>
                <Input
                  id="funil-nome"
                  value={funilForm.nome}
                  onChange={(e) => setFunilForm({ ...funilForm, nome: e.target.value })}
                  placeholder="Ex: Vendas B2B"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="funil-descricao">Descrição (opcional)</Label>
                <Textarea
                  id="funil-descricao"
                  value={funilForm.descricao}
                  onChange={(e) => setFunilForm({ ...funilForm, descricao: e.target.value })}
                  placeholder="Descreva o objetivo deste funil..."
                  rows={3}
                />
              </div>
              <div className="space-y-3">
                <Label>Cor do funil</Label>
                <div className="flex flex-wrap gap-2">
                  {CORES_PREDEFINIDAS.map((cor) => (
                    <button
                      key={cor}
                      type="button"
                      onClick={() => setFunilForm({ ...funilForm, cor })}
                      className={cn(
                        "h-9 w-9 rounded-xl transition-all",
                        funilForm.cor === cor && "ring-2 ring-offset-2 ring-primary ring-offset-background"
                      )}
                      style={{ backgroundColor: cor }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFunilModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={saveFunil} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingFunil ? 'Salvar' : 'Criar Funil'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Etapa */}
        <Dialog open={estagioModalOpen} onOpenChange={setEstagioModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {editingEstagio ? 'Editar Etapa' : 'Nova Etapa'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="estagio-nome">Nome da etapa</Label>
                <Input
                  id="estagio-nome"
                  value={estagioForm.nome}
                  onChange={(e) => setEstagioForm({ ...estagioForm, nome: e.target.value })}
                  placeholder="Ex: Contato Inicial"
                  className="h-11"
                />
              </div>
              <div className="space-y-3">
                <Label>Cor da etapa</Label>
                <div className="flex flex-wrap gap-2">
                  {CORES_PREDEFINIDAS.map((cor) => (
                    <button
                      key={cor}
                      type="button"
                      onClick={() => setEstagioForm({ ...estagioForm, cor })}
                      className={cn(
                        "h-9 w-9 rounded-xl transition-all",
                        estagioForm.cor === cor && "ring-2 ring-offset-2 ring-primary ring-offset-background"
                      )}
                      style={{ backgroundColor: cor }}
                    />
                  ))}
                </div>
              </div>
              
              {/* Tipo de Etapa */}
              <div className="space-y-3">
                <Label>Tipo de etapa</Label>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setEstagioForm({ ...estagioForm, tipo: 'normal' })}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                      estagioForm.tipo === 'normal' 
                        ? "border-primary bg-primary/10" 
                        : "border-border hover:border-muted-foreground/50"
                    )}
                  >
                    <Zap className={cn("h-5 w-5", estagioForm.tipo === 'normal' ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-medium", estagioForm.tipo === 'normal' ? "text-primary" : "text-muted-foreground")}>Normal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEstagioForm({ ...estagioForm, tipo: 'cliente', cor: '#06b6d4' })}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                      estagioForm.tipo === 'cliente' 
                        ? "border-cyan-500 bg-cyan-500/10" 
                        : "border-border hover:border-muted-foreground/50"
                    )}
                  >
                    <UserCheck className={cn("h-5 w-5", estagioForm.tipo === 'cliente' ? "text-cyan-500" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-medium", estagioForm.tipo === 'cliente' ? "text-cyan-500" : "text-muted-foreground")}>Cliente</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEstagioForm({ ...estagioForm, tipo: 'ganho', cor: '#10b981' })}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                      estagioForm.tipo === 'ganho' 
                        ? "border-emerald-500 bg-emerald-500/10" 
                        : "border-border hover:border-muted-foreground/50"
                    )}
                  >
                    <Trophy className={cn("h-5 w-5", estagioForm.tipo === 'ganho' ? "text-emerald-500" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-medium", estagioForm.tipo === 'ganho' ? "text-emerald-500" : "text-muted-foreground")}>Ganho</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEstagioForm({ ...estagioForm, tipo: 'perdido', cor: '#ef4444' })}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                      estagioForm.tipo === 'perdido' 
                        ? "border-red-500 bg-red-500/10" 
                        : "border-border hover:border-muted-foreground/50"
                    )}
                  >
                    <XCircle className={cn("h-5 w-5", estagioForm.tipo === 'perdido' ? "text-red-500" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-medium", estagioForm.tipo === 'perdido' ? "text-red-500" : "text-muted-foreground")}>Perdido</span>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {estagioForm.tipo === 'ganho' && "Negociações nesta etapa serão marcadas como ganhas automaticamente."}
                  {estagioForm.tipo === 'perdido' && "Negociações nesta etapa serão marcadas como perdidas automaticamente."}
                  {estagioForm.tipo === 'cliente' && "Lead convertido para cliente ativo. A IA reconhecerá como cliente."}
                  {estagioForm.tipo === 'normal' && "Etapa regular no fluxo de vendas."}
                </p>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {estagioForm.followup_ativo ? (
                      <Bell className="h-4 w-4 text-primary" />
                    ) : (
                      <BellOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    <p className="font-medium text-foreground">Follow-up automático</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Leads nesta etapa receberão mensagens de follow-up
                  </p>
                </div>
                <Switch 
                  checked={estagioForm.followup_ativo} 
                  onCheckedChange={(checked) => setEstagioForm({...estagioForm, followup_ativo: checked})} 
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEstagioModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={saveEstagio} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingEstagio ? 'Salvar' : 'Criar Etapa'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Tag */}
        <Dialog open={tagModalOpen} onOpenChange={setTagModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {editingTag ? 'Editar Tag' : 'Nova Tag'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="tag-nome">Nome da tag</Label>
                <Input
                  id="tag-nome"
                  value={tagForm.nome}
                  onChange={(e) => setTagForm({ ...tagForm, nome: e.target.value })}
                  placeholder="Ex: Lead Quente"
                  className="h-11"
                />
              </div>
              <div className="space-y-3">
                <Label>Cor da tag</Label>
                <div className="flex flex-wrap gap-2">
                  {CORES_PREDEFINIDAS.map((cor) => (
                    <button
                      key={cor}
                      type="button"
                      onClick={() => setTagForm({ ...tagForm, cor })}
                      className={cn(
                        "h-9 w-9 rounded-xl transition-all",
                        tagForm.cor === cor && "ring-2 ring-offset-2 ring-primary ring-offset-background"
                      )}
                      style={{ backgroundColor: cor }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border">
                  <span 
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-white"
                    style={{ backgroundColor: tagForm.cor }}
                  >
                    <Tag className="h-3.5 w-3.5" />
                    {tagForm.nome || 'Nome da tag'}
                  </span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTagModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={saveTag} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingTag ? 'Salvar' : 'Criar Tag'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </MainLayout>
  );
}
