import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, FolderOpen, FileText, GripVertical, X } from 'lucide-react';

interface Grupo {
  id: string;
  conta_id: string;
  nome: string;
  ordem: number;
  created_at: string;
}

interface Campo {
  id: string;
  conta_id: string;
  grupo_id: string | null;
  nome: string;
  tipo: string;
  opcoes: string[];
  obrigatorio: boolean;
  ordem: number;
  created_at: string;
}

const TIPOS_CAMPO = [
  { value: 'texto', label: 'Texto' },
  { value: 'numero', label: 'Número' },
  { value: 'data', label: 'Data' },
  { value: 'selecao', label: 'Seleção' },
  { value: 'checkbox', label: 'Checkbox' },
];

export function CamposPersonalizadosContent() {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const contaId = usuario?.conta_id;

  // Estados para modais
  const [grupoModalOpen, setGrupoModalOpen] = useState(false);
  const [campoModalOpen, setCampoModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Estados para edição
  const [editingGrupo, setEditingGrupo] = useState<Grupo | null>(null);
  const [editingCampo, setEditingCampo] = useState<Campo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'grupo' | 'campo'; id: string; nome: string } | null>(null);
  
  // Estados do formulário de grupo
  const [grupoNome, setGrupoNome] = useState('');
  
  // Estados do formulário de campo
  const [campoNome, setCampoNome] = useState('');
  const [campoTipo, setCampoTipo] = useState('texto');
  const [campoGrupoId, setCampoGrupoId] = useState<string | null>(null);
  const [campoObrigatorio, setCampoObrigatorio] = useState(false);
  const [campoOpcoes, setCampoOpcoes] = useState<string[]>([]);
  const [novaOpcao, setNovaOpcao] = useState('');

  // Estados para controle de grupos abertos
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set());

  // Queries
  const { data: grupos = [], isLoading: loadingGrupos } = useQuery({
    queryKey: ['campos-personalizados-grupos', contaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campos_personalizados_grupos')
        .select('*')
        .eq('conta_id', contaId!)
        .order('ordem', { ascending: true });
      if (error) throw error;
      return data as Grupo[];
    },
    enabled: !!contaId,
  });

  const { data: campos = [], isLoading: loadingCampos } = useQuery({
    queryKey: ['campos-personalizados', contaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campos_personalizados')
        .select('*')
        .eq('conta_id', contaId!)
        .order('ordem', { ascending: true });
      if (error) throw error;
      return data as Campo[];
    },
    enabled: !!contaId,
  });

  // Mutations para grupos
  const createGrupoMutation = useMutation({
    mutationFn: async (nome: string) => {
      const maxOrdem = grupos.length > 0 ? Math.max(...grupos.map(g => g.ordem)) + 1 : 0;
      const { data, error } = await supabase
        .from('campos_personalizados_grupos')
        .insert({ conta_id: contaId!, nome, ordem: maxOrdem })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campos-personalizados-grupos'] });
      toast.success('Grupo criado com sucesso!');
      closeGrupoModal();
    },
    onError: () => toast.error('Erro ao criar grupo'),
  });

  const updateGrupoMutation = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase
        .from('campos_personalizados_grupos')
        .update({ nome })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campos-personalizados-grupos'] });
      toast.success('Grupo atualizado!');
      closeGrupoModal();
    },
    onError: () => toast.error('Erro ao atualizar grupo'),
  });

  const deleteGrupoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('campos_personalizados_grupos')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campos-personalizados-grupos'] });
      queryClient.invalidateQueries({ queryKey: ['campos-personalizados'] });
      toast.success('Grupo excluído!');
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    },
    onError: () => toast.error('Erro ao excluir grupo'),
  });

  // Mutations para campos
  const createCampoMutation = useMutation({
    mutationFn: async (campo: Omit<Campo, 'id' | 'created_at' | 'conta_id'>) => {
      const camposDoGrupo = campos.filter(c => c.grupo_id === campo.grupo_id);
      const maxOrdem = camposDoGrupo.length > 0 ? Math.max(...camposDoGrupo.map(c => c.ordem)) + 1 : 0;
      const { data, error } = await supabase
        .from('campos_personalizados')
        .insert({ ...campo, conta_id: contaId!, ordem: maxOrdem })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campos-personalizados'] });
      toast.success('Campo criado com sucesso!');
      closeCampoModal();
    },
    onError: () => toast.error('Erro ao criar campo'),
  });

  const updateCampoMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Campo> & { id: string }) => {
      const { error } = await supabase
        .from('campos_personalizados')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campos-personalizados'] });
      toast.success('Campo atualizado!');
      closeCampoModal();
    },
    onError: () => toast.error('Erro ao atualizar campo'),
  });

  const deleteCampoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('campos_personalizados')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campos-personalizados'] });
      toast.success('Campo excluído!');
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    },
    onError: () => toast.error('Erro ao excluir campo'),
  });

  // Funções auxiliares
  const closeGrupoModal = () => {
    setGrupoModalOpen(false);
    setEditingGrupo(null);
    setGrupoNome('');
  };

  const closeCampoModal = () => {
    setCampoModalOpen(false);
    setEditingCampo(null);
    setCampoNome('');
    setCampoTipo('texto');
    setCampoGrupoId(null);
    setCampoObrigatorio(false);
    setCampoOpcoes([]);
    setNovaOpcao('');
  };

  const openEditGrupo = (grupo: Grupo) => {
    setEditingGrupo(grupo);
    setGrupoNome(grupo.nome);
    setGrupoModalOpen(true);
  };

  const openEditCampo = (campo: Campo) => {
    setEditingCampo(campo);
    setCampoNome(campo.nome);
    setCampoTipo(campo.tipo);
    setCampoGrupoId(campo.grupo_id);
    setCampoObrigatorio(campo.obrigatorio);
    setCampoOpcoes(campo.opcoes || []);
    setCampoModalOpen(true);
  };

  const openNewCampo = (grupoId: string | null = null) => {
    setCampoGrupoId(grupoId);
    setCampoModalOpen(true);
  };

  const handleSaveGrupo = () => {
    if (!grupoNome.trim()) {
      toast.error('Digite um nome para o grupo');
      return;
    }
    if (editingGrupo) {
      updateGrupoMutation.mutate({ id: editingGrupo.id, nome: grupoNome.trim() });
    } else {
      createGrupoMutation.mutate(grupoNome.trim());
    }
  };

  const handleSaveCampo = () => {
    if (!campoNome.trim()) {
      toast.error('Digite um nome para o campo');
      return;
    }
    if (campoTipo === 'selecao' && campoOpcoes.length === 0) {
      toast.error('Adicione pelo menos uma opção para o campo de seleção');
      return;
    }

    const campoData = {
      nome: campoNome.trim(),
      tipo: campoTipo,
      grupo_id: campoGrupoId,
      obrigatorio: campoObrigatorio,
      opcoes: campoTipo === 'selecao' ? campoOpcoes : [],
      ordem: 0,
    };

    if (editingCampo) {
      updateCampoMutation.mutate({ id: editingCampo.id, ...campoData });
    } else {
      createCampoMutation.mutate(campoData);
    }
  };

  const handleAddOpcao = () => {
    if (novaOpcao.trim() && !campoOpcoes.includes(novaOpcao.trim())) {
      setCampoOpcoes([...campoOpcoes, novaOpcao.trim()]);
      setNovaOpcao('');
    }
  };

  const handleRemoveOpcao = (opcao: string) => {
    setCampoOpcoes(campoOpcoes.filter(o => o !== opcao));
  };

  const toggleGrupo = (grupoId: string) => {
    const newSet = new Set(gruposAbertos);
    if (newSet.has(grupoId)) {
      newSet.delete(grupoId);
    } else {
      newSet.add(grupoId);
    }
    setGruposAbertos(newSet);
  };

  const confirmDelete = (type: 'grupo' | 'campo', id: string, nome: string) => {
    setDeleteTarget({ type, id, nome });
    setDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'grupo') {
      deleteGrupoMutation.mutate(deleteTarget.id);
    } else {
      deleteCampoMutation.mutate(deleteTarget.id);
    }
  };

  // Agrupar campos
  const camposPorGrupo = grupos.map(grupo => ({
    ...grupo,
    campos: campos.filter(c => c.grupo_id === grupo.id),
  }));
  const camposSemGrupo = campos.filter(c => !c.grupo_id);

  const getTipoLabel = (tipo: string) => TIPOS_CAMPO.find(t => t.value === tipo)?.label || tipo;

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'texto': return '📝';
      case 'numero': return '🔢';
      case 'data': return '📅';
      case 'selecao': return '🔽';
      case 'checkbox': return '✅';
      default: return '📄';
    }
  };

  const isLoading = loadingGrupos || loadingCampos;

  return (
    <>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Campos Personalizados</h1>
            <p className="text-muted-foreground text-sm">
              Crie campos personalizados para seus contatos
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setGrupoModalOpen(true)}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Novo Grupo
            </Button>
            <Button onClick={() => openNewCampo(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Campo
            </Button>
          </div>
        </div>

        {/* Lista de Grupos e Campos */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Grupos com campos */}
            {camposPorGrupo.map(grupo => (
              <Card key={grupo.id}>
                <Collapsible open={gruposAbertos.has(grupo.id)} onOpenChange={() => toggleGrupo(grupo.id)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {gruposAbertos.has(grupo.id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <FolderOpen className="h-4 w-4 text-primary" />
                          <CardTitle className="text-base">{grupo.nome}</CardTitle>
                          <Badge variant="secondary" className="ml-2">
                            {grupo.campos.length} {grupo.campos.length === 1 ? 'campo' : 'campos'}
                          </Badge>
                        </div>
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" onClick={() => openNewCampo(grupo.id)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditGrupo(grupo)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => confirmDelete('grupo', grupo.id, grupo.nome)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      {grupo.campos.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          Nenhum campo neste grupo
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {grupo.campos.map(campo => (
                            <div
                              key={campo.id}
                              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                <span>{getTipoIcon(campo.tipo)}</span>
                                <div>
                                  <span className="font-medium">{campo.nome}</span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="outline" className="text-xs">
                                      {getTipoLabel(campo.tipo)}
                                    </Badge>
                                    {campo.obrigatorio && (
                                      <Badge variant="destructive" className="text-xs">
                                        Obrigatório
                                      </Badge>
                                    )}
                                    {campo.tipo === 'selecao' && campo.opcoes?.length > 0 && (
                                      <span className="text-xs text-muted-foreground">
                                        {campo.opcoes.length} opções
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditCampo(campo)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => confirmDelete('campo', campo.id, campo.nome)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))}

            {/* Campos sem grupo */}
            {camposSemGrupo.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">Sem Grupo</CardTitle>
                    <Badge variant="secondary" className="ml-2">
                      {camposSemGrupo.length} {camposSemGrupo.length === 1 ? 'campo' : 'campos'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {camposSemGrupo.map(campo => (
                      <div
                        key={campo.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <span>{getTipoIcon(campo.tipo)}</span>
                          <div>
                            <span className="font-medium">{campo.nome}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-xs">
                                {getTipoLabel(campo.tipo)}
                              </Badge>
                              {campo.obrigatorio && (
                                <Badge variant="destructive" className="text-xs">
                                  Obrigatório
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditCampo(campo)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => confirmDelete('campo', campo.id, campo.nome)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Estado vazio */}
            {grupos.length === 0 && camposSemGrupo.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhum campo personalizado</h3>
                  <p className="text-muted-foreground text-sm text-center mb-4">
                    Crie campos personalizados para armazenar informações adicionais dos seus contatos
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setGrupoModalOpen(true)}>
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Criar Grupo
                    </Button>
                    <Button onClick={() => openNewCampo(null)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Criar Campo
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Modal de Grupo */}
      <Dialog open={grupoModalOpen} onOpenChange={closeGrupoModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGrupo ? 'Editar Grupo' : 'Novo Grupo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="grupo-nome">Nome do Grupo</Label>
              <Input
                id="grupo-nome"
                value={grupoNome}
                onChange={e => setGrupoNome(e.target.value)}
                placeholder="Ex: Dados Pessoais"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeGrupoModal}>Cancelar</Button>
            <Button onClick={handleSaveGrupo} disabled={createGrupoMutation.isPending || updateGrupoMutation.isPending}>
              {editingGrupo ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Campo */}
      <Dialog open={campoModalOpen} onOpenChange={closeCampoModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCampo ? 'Editar Campo' : 'Novo Campo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="campo-nome">Nome do Campo</Label>
              <Input
                id="campo-nome"
                value={campoNome}
                onChange={e => setCampoNome(e.target.value)}
                placeholder="Ex: CPF"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="campo-tipo">Tipo</Label>
              <Select value={campoTipo} onValueChange={setCampoTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_CAMPO.map(tipo => (
                    <SelectItem key={tipo.value} value={tipo.value}>
                      {tipo.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="campo-grupo">Grupo (opcional)</Label>
              <Select value={campoGrupoId || 'sem-grupo'} onValueChange={v => setCampoGrupoId(v === 'sem-grupo' ? null : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem-grupo">Sem Grupo</SelectItem>
                  {grupos.map(grupo => (
                    <SelectItem key={grupo.id} value={grupo.id}>
                      {grupo.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="campo-obrigatorio">Campo obrigatório</Label>
              <Switch
                id="campo-obrigatorio"
                checked={campoObrigatorio}
                onCheckedChange={setCampoObrigatorio}
              />
            </div>

            {/* Opções para campo de seleção */}
            {campoTipo === 'selecao' && (
              <div className="space-y-2">
                <Label>Opções</Label>
                <div className="flex gap-2">
                  <Input
                    value={novaOpcao}
                    onChange={e => setNovaOpcao(e.target.value)}
                    placeholder="Adicionar opção"
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddOpcao())}
                  />
                  <Button type="button" variant="outline" onClick={handleAddOpcao}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {campoOpcoes.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {campoOpcoes.map((opcao, idx) => (
                      <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                        {opcao}
                        <button onClick={() => handleRemoveOpcao(opcao)} className="ml-1 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCampoModal}>Cancelar</Button>
            <Button onClick={handleSaveCampo} disabled={createCampoMutation.isPending || updateCampoMutation.isPending}>
              {editingCampo ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {deleteTarget?.type === 'grupo' ? 'o grupo' : 'o campo'}{' '}
              <strong>{deleteTarget?.nome}</strong>?
              {deleteTarget?.type === 'grupo' && (
                <span className="block mt-2 text-destructive">
                  Os campos deste grupo serão movidos para "Sem Grupo".
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
