import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  Loader2, 
  Trash2, 
  Save, 
  User, 
  Phone, 
  MessageSquare,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Plus,
  Pencil,
  X,
  StickyNote,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Estagio {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  funil_id?: string;
}

interface Funil {
  id: string;
  nome: string;
  cor: string;
  estagios: Estagio[];
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
  resumo_ia?: string;
  resumo_gerado_em?: string;
  contatos: {
    nome: string;
    telefone: string;
  };
}

interface Mensagem {
  id: string;
  conteudo: string;
  direcao: 'entrada' | 'saida';
  created_at: string;
  enviada_por_ia: boolean;
}

interface Nota {
  id: string;
  conteudo: string;
  usuario_id: string | null;
  created_at: string;
  updated_at: string;
}

interface NegociacaoDetalheModalProps {
  negociacao: Negociacao | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (negociacao: Negociacao) => void;
  onDelete: (negociacaoId: string) => void;
  estagios: Estagio[];
  funis: Funil[];
}

export function NegociacaoDetalheModal({
  negociacao,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  estagios,
  funis,
}: NegociacaoDetalheModalProps) {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletando, setDeletando] = useState(false);
  
  // Form state
  const [titulo, setTitulo] = useState('');
  const [valor, setValor] = useState('');
  const [probabilidade, setProbabilidade] = useState(50);
  const [estagioId, setEstagioId] = useState('');
  const [salvandoEstagio, setSalvandoEstagio] = useState(false);
  
  // Notes state
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loadingNotas, setLoadingNotas] = useState(false);
  const [criandoNota, setCriandoNota] = useState(false);
  const [novaNota, setNovaNota] = useState('');
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [editandoNotaId, setEditandoNotaId] = useState<string | null>(null);
  const [editandoNotaConteudo, setEditandoNotaConteudo] = useState('');
  const [deletandoNotaId, setDeletandoNotaId] = useState<string | null>(null);
  
  // Conversa state
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [loadingMensagens, setLoadingMensagens] = useState(false);
  const [resumo, setResumo] = useState<string | null>(null);
  const [resumoGeradoEm, setResumoGeradoEm] = useState<string | null>(null);
  const [gerandoResumo, setGerandoResumo] = useState(false);
  const [mensagensExpandidas, setMensagensExpandidas] = useState(false);

  useEffect(() => {
    if (negociacao) {
      setTitulo(negociacao.titulo);
      setValor(String(negociacao.valor || 0));
      setProbabilidade(negociacao.probabilidade || 50);
      setEstagioId(negociacao.estagio_id || '');
      setResumo(negociacao.resumo_ia || null);
      setResumoGeradoEm(negociacao.resumo_gerado_em || null);
      setMensagensExpandidas(false);
      setCriandoNota(false);
      setEditandoNotaId(null);
      
      fetchConversa(negociacao.contato_id);
      fetchNotas(negociacao.id);
    }
  }, [negociacao]);

  const fetchNotas = async (negociacaoId: string) => {
    setLoadingNotas(true);
    try {
      const { data, error } = await supabase
        .from('negociacao_notas')
        .select('*')
        .eq('negociacao_id', negociacaoId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotas(data || []);
    } catch (error) {
      console.error('Erro ao buscar notas:', error);
    } finally {
      setLoadingNotas(false);
    }
  };

  const fetchConversa = async (contatoId: string) => {
    setLoadingMensagens(true);
    try {
      const { data: conversaData } = await supabase
        .from('conversas')
        .select('id')
        .eq('contato_id', contatoId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (conversaData) {
        setConversaId(conversaData.id);
        
        const { data: mensagensData } = await supabase
          .from('mensagens')
          .select('id, conteudo, direcao, created_at, enviada_por_ia')
          .eq('conversa_id', conversaData.id)
          .order('created_at', { ascending: false })
          .limit(50);

        setMensagens(mensagensData || []);
      } else {
        setConversaId(null);
        setMensagens([]);
      }
    } catch (error) {
      console.error('Erro ao buscar conversa:', error);
    } finally {
      setLoadingMensagens(false);
    }
  };

  const handleMudarEstagio = async (novoEstagioId: string) => {
    if (!negociacao || novoEstagioId === estagioId) return;
    
    setSalvandoEstagio(true);
    const estagioAnterior = estagioId;
    setEstagioId(novoEstagioId);
    
    try {
      const { error } = await supabase
        .from('negociacoes')
        .update({ estagio_id: novoEstagioId })
        .eq('id', negociacao.id);

      if (error) throw error;

      onUpdate({
        ...negociacao,
        estagio_id: novoEstagioId,
      });
      
      toast.success('Estágio atualizado!');
    } catch (error) {
      console.error('Erro ao atualizar estágio:', error);
      setEstagioId(estagioAnterior);
      toast.error('Erro ao atualizar estágio');
    } finally {
      setSalvandoEstagio(false);
    }
  };

  const handleSalvar = async () => {
    if (!negociacao) return;
    
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('negociacoes')
        .update({
          titulo: titulo.trim(),
          valor: parseFloat(valor) || 0,
          probabilidade,
        })
        .eq('id', negociacao.id);

      if (error) throw error;

      onUpdate({
        ...negociacao,
        titulo: titulo.trim(),
        valor: parseFloat(valor) || 0,
        probabilidade,
        estagio_id: estagioId,
      });

      setEditando(false);
      toast.success('Negociação atualizada!');
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar negociação');
    } finally {
      setSalvando(false);
    }
  };

  const handleCriarNota = async () => {
    if (!negociacao || !novaNota.trim()) return;
    
    setSalvandoNota(true);
    try {
      const { data, error } = await supabase
        .from('negociacao_notas')
        .insert({
          negociacao_id: negociacao.id,
          conteudo: novaNota.trim(),
          usuario_id: usuario?.id || null,
        })
        .select()
        .single();

      if (error) throw error;

      setNotas([data, ...notas]);
      setNovaNota('');
      setCriandoNota(false);
      toast.success('Nota criada!');
    } catch (error) {
      console.error('Erro ao criar nota:', error);
      toast.error('Erro ao criar nota');
    } finally {
      setSalvandoNota(false);
    }
  };

  const handleEditarNota = async (notaId: string) => {
    if (!editandoNotaConteudo.trim()) return;
    
    setSalvandoNota(true);
    try {
      const { error } = await supabase
        .from('negociacao_notas')
        .update({ conteudo: editandoNotaConteudo.trim() })
        .eq('id', notaId);

      if (error) throw error;

      setNotas(notas.map(n => 
        n.id === notaId 
          ? { ...n, conteudo: editandoNotaConteudo.trim(), updated_at: new Date().toISOString() }
          : n
      ));
      setEditandoNotaId(null);
      setEditandoNotaConteudo('');
      toast.success('Nota atualizada!');
    } catch (error) {
      console.error('Erro ao editar nota:', error);
      toast.error('Erro ao editar nota');
    } finally {
      setSalvandoNota(false);
    }
  };

  const handleDeletarNota = async (notaId: string) => {
    setDeletandoNotaId(notaId);
    try {
      const { error } = await supabase
        .from('negociacao_notas')
        .delete()
        .eq('id', notaId);

      if (error) throw error;

      setNotas(notas.filter(n => n.id !== notaId));
      toast.success('Nota excluída!');
    } catch (error) {
      console.error('Erro ao excluir nota:', error);
      toast.error('Erro ao excluir nota');
    } finally {
      setDeletandoNotaId(null);
    }
  };

  const handleExcluir = async () => {
    if (!negociacao) return;
    
    setDeletando(true);
    try {
      const { error } = await supabase
        .from('negociacoes')
        .delete()
        .eq('id', negociacao.id);

      if (error) throw error;

      onDelete(negociacao.id);
      setConfirmDelete(false);
      onClose();
      toast.success('Negociação excluída!');
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir negociação');
    } finally {
      setDeletando(false);
    }
  };

  const gerarResumo = async () => {
    if (!conversaId || !negociacao) {
      toast.error('Nenhuma conversa encontrada para este contato');
      return;
    }

    setGerandoResumo(true);
    try {
      const { data, error } = await supabase.functions.invoke('resumir-conversa', {
        body: { 
          conversa_id: conversaId,
          negociacao_id: negociacao.id
        }
      });

      if (error) throw error;
      
      const novaData = new Date().toISOString();
      setResumo(data.resumo);
      setResumoGeradoEm(novaData);
      
      onUpdate({
        ...negociacao,
        resumo_ia: data.resumo,
        resumo_gerado_em: novaData,
      });
      
      toast.success('Resumo gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar resumo:', error);
      toast.error('Erro ao gerar resumo da conversa');
    } finally {
      setGerandoResumo(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatNotaDate = (date: string) => {
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!negociacao) return null;

  const estagioAtual = estagios.find(e => e.id === estagioId);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl">Detalhes da Negociação</DialogTitle>
              <div className="flex items-center gap-2">
                {editando ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditando(false)}
                      disabled={salvando}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSalvar}
                      disabled={salvando}
                    >
                      {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                      Salvar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditando(true)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Informações Principais */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Título</Label>
                {editando ? (
                  <Input
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Título da negociação"
                  />
                ) : (
                  <p className="text-lg font-semibold text-foreground">{negociacao.titulo}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Valor</Label>
                {editando ? (
                  <Input
                    type="number"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="0,00"
                    min="0"
                    step="0.01"
                  />
                ) : (
                  <p className="text-lg font-bold text-success">{formatCurrency(negociacao.valor)}</p>
                )}
              </div>

              {/* Estágio - Sempre Editável */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Estágio
                  {salvandoEstagio && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </Label>
                <Select value={estagioId} onValueChange={handleMudarEstagio} disabled={salvandoEstagio}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um estágio">
                      {estagioAtual && (
                        <div className="flex items-center gap-2">
                          <div 
                            className="h-2.5 w-2.5 rounded-full" 
                            style={{ backgroundColor: estagioAtual.cor }}
                          />
                          {estagioAtual.nome}
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {funis.map((funil) => (
                      <div key={funil.id}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          {funil.nome}
                        </div>
                        {funil.estagios.map((estagio) => (
                          <SelectItem key={estagio.id} value={estagio.id}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="h-2.5 w-2.5 rounded-full" 
                                style={{ backgroundColor: estagio.cor }}
                              />
                              {estagio.nome}
                            </div>
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Probabilidade: {probabilidade}%</Label>
                {editando ? (
                  <Slider
                    value={[probabilidade]}
                    onValueChange={([val]) => setProbabilidade(val)}
                    min={0}
                    max={100}
                    step={5}
                  />
                ) : (
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all"
                      style={{ width: `${negociacao.probabilidade || 50}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Notas com Histórico */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-foreground flex items-center gap-2">
                  <StickyNote className="h-4 w-4" />
                  Notas
                </h4>
                {!criandoNota && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCriandoNota(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Nova Nota
                  </Button>
                )}
              </div>

              {/* Criar Nova Nota */}
              {criandoNota && (
                <div className="mb-4 p-3 rounded-lg border border-border bg-muted/30">
                  <Textarea
                    value={novaNota}
                    onChange={(e) => setNovaNota(e.target.value)}
                    placeholder="Escreva sua nota..."
                    rows={3}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCriandoNota(false);
                        setNovaNota('');
                      }}
                      disabled={salvandoNota}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCriarNota}
                      disabled={salvandoNota || !novaNota.trim()}
                    >
                      {salvandoNota ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                      Salvar
                    </Button>
                  </div>
                </div>
              )}

              {/* Lista de Notas */}
              {loadingNotas ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : notas.length > 0 ? (
                <div className="space-y-3 max-h-[250px] overflow-y-auto">
                  {notas.map((nota) => (
                    <div
                      key={nota.id}
                      className="p-3 rounded-lg border border-border bg-card"
                    >
                      {editandoNotaId === nota.id ? (
                        <>
                          <Textarea
                            value={editandoNotaConteudo}
                            onChange={(e) => setEditandoNotaConteudo(e.target.value)}
                            rows={3}
                            autoFocus
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditandoNotaId(null);
                                setEditandoNotaConteudo('');
                              }}
                              disabled={salvandoNota}
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleEditarNota(nota.id)}
                              disabled={salvandoNota || !editandoNotaConteudo.trim()}
                            >
                              {salvandoNota ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                              Salvar
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                            {nota.conteudo}
                          </p>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {formatNotaDate(nota.created_at)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => {
                                  setEditandoNotaId(nota.id);
                                  setEditandoNotaConteudo(nota.conteudo);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                onClick={() => handleDeletarNota(nota.id)}
                                disabled={deletandoNotaId === nota.id}
                              >
                                {deletandoNotaId === nota.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma nota adicionada
                </p>
              )}
            </div>

            {/* Contato */}
            <div className="border-t border-border pt-4">
              <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Contato
              </h4>
              <button
                onClick={() => {
                  onClose();
                  navigate(`/conversas?contato=${negociacao.contato_id}`);
                }}
                className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 w-full text-left hover:bg-muted transition-colors cursor-pointer group"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground group-hover:text-primary transition-colors">{negociacao.contatos?.nome}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {negociacao.contatos?.telefone}
                  </p>
                </div>
                <MessageSquare className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            </div>

            {/* Histórico da Conversa */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-foreground flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Histórico da Conversa
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={gerarResumo}
                  disabled={gerandoResumo || !conversaId}
                >
                  {gerandoResumo ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1" />
                  )}
                  {resumo ? '🔄 Atualizar Resumo' : 'Gerar Resumo IA'}
                </Button>
              </div>

              {/* Resumo IA */}
              {resumo && (
                <div className="mb-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="font-medium text-primary text-sm">Resumo da IA</span>
                    </div>
                    {resumoGeradoEm && (
                      <span className="text-xs text-muted-foreground">
                        Gerado em: {new Date(resumoGeradoEm).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap">{resumo}</div>
                </div>
              )}

              {loadingMensagens ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : mensagens.length > 0 ? (
                <div className="space-y-2">
                  <button
                    onClick={() => setMensagensExpandidas(!mensagensExpandidas)}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {mensagensExpandidas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {mensagensExpandidas ? 'Recolher mensagens' : `Ver ${mensagens.length} mensagens`}
                  </button>
                  
                  {mensagensExpandidas && (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto rounded-lg border border-border p-3">
                      {[...mensagens].reverse().map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            'p-2 rounded-lg text-sm',
                            msg.direcao === 'entrada' 
                              ? 'bg-muted text-foreground' 
                              : 'bg-primary/10 text-foreground'
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-xs">
                              {msg.direcao === 'entrada' ? 'Lead' : msg.enviada_por_ia ? 'Agente IA' : 'Atendente'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(msg.created_at)}
                            </span>
                          </div>
                          <p className="break-words">{msg.conteudo}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma conversa encontrada para este contato
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Exclusão */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Negociação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a negociação "{negociacao.titulo}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleExcluir}
              disabled={deletando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
