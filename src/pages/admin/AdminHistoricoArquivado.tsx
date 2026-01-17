import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Search, 
  RotateCcw, 
  MessageSquare, 
  Image, 
  FileAudio, 
  FileText, 
  Archive,
  ChevronLeft,
  ChevronRight,
  Eye
} from 'lucide-react';

interface MensagemArquivada {
  id: string;
  conversa_id: string;
  conta_id: string | null;
  contato_id: string | null;
  conteudo: string;
  direcao: string;
  tipo: string | null;
  media_url: string | null;
  created_at: string;
  arquivada_em: string | null;
  enviada_por_ia: boolean | null;
}

const ITEMS_PER_PAGE = 50;

export default function AdminHistoricoArquivado() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<string>('todos');
  const [direcaoFiltro, setDirecaoFiltro] = useState<string>('todos');
  const [selectedMessage, setSelectedMessage] = useState<MensagemArquivada | null>(null);
  const [messageToRestore, setMessageToRestore] = useState<MensagemArquivada | null>(null);

  // Buscar mensagens arquivadas
  const { data: mensagens, isLoading } = useQuery({
    queryKey: ['mensagens-arquivadas', page, searchTerm, tipoFiltro, direcaoFiltro],
    queryFn: async () => {
      let query = supabase
        .from('mensagens_arquivo')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (searchTerm) {
        query = query.ilike('conteudo', `%${searchTerm}%`);
      }

      if (tipoFiltro !== 'todos') {
        query = query.eq('tipo', tipoFiltro);
      }

      if (direcaoFiltro !== 'todos') {
        query = query.eq('direcao', direcaoFiltro);
      }

      const { data, error, count } = await query;

      if (error) throw error;
      return { data: data as MensagemArquivada[], count: count || 0 };
    }
  });

  // Estatísticas
  const { data: stats } = useQuery({
    queryKey: ['mensagens-arquivadas-stats'],
    queryFn: async () => {
      const { count: total } = await supabase
        .from('mensagens_arquivo')
        .select('*', { count: 'exact', head: true });

      const { count: texto } = await supabase
        .from('mensagens_arquivo')
        .select('*', { count: 'exact', head: true })
        .eq('tipo', 'texto');

      const { count: imagem } = await supabase
        .from('mensagens_arquivo')
        .select('*', { count: 'exact', head: true })
        .eq('tipo', 'imagem');

      const { count: audio } = await supabase
        .from('mensagens_arquivo')
        .select('*', { count: 'exact', head: true })
        .eq('tipo', 'audio');

      return {
        total: total || 0,
        texto: texto || 0,
        imagem: imagem || 0,
        audio: audio || 0
      };
    }
  });

  // Mutation para restaurar mensagem
  const restaurarMutation = useMutation({
    mutationFn: async (mensagem: MensagemArquivada) => {
      // Mapear direção para o enum correto do banco
      const direcaoMapeada = mensagem.direcao === 'enviada' ? 'saida' : 'entrada';
      
      // Inserir de volta na tabela mensagens
      const { error: insertError } = await supabase
        .from('mensagens')
        .insert([{
          conversa_id: mensagem.conversa_id,
          conta_id: mensagem.conta_id,
          contato_id: mensagem.contato_id,
          conteudo: mensagem.conteudo,
          direcao: direcaoMapeada as 'entrada' | 'saida',
          tipo: (mensagem.tipo || 'texto') as 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'sticker' | 'sistema',
          media_url: mensagem.media_url,
          enviada_por_ia: mensagem.enviada_por_ia
        }]);

      if (insertError) throw insertError;

      // Remover do arquivo
      const { error: deleteError } = await supabase
        .from('mensagens_arquivo')
        .delete()
        .eq('id', mensagem.id);

      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      toast.success('Mensagem restaurada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['mensagens-arquivadas'] });
      queryClient.invalidateQueries({ queryKey: ['mensagens-arquivadas-stats'] });
      setMessageToRestore(null);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao restaurar: ${error.message}`);
    }
  });

  const getTipoIcon = (tipo: string | null) => {
    switch (tipo) {
      case 'imagem':
        return <Image className="h-4 w-4" />;
      case 'audio':
        return <FileAudio className="h-4 w-4" />;
      case 'documento':
        return <FileText className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const totalPages = Math.ceil((mensagens?.count || 0) / ITEMS_PER_PAGE);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Archive className="h-6 w-6" />
              Histórico de Mensagens Arquivadas
            </h1>
            <p className="text-muted-foreground">
              Visualize e restaure mensagens que foram arquivadas automaticamente
            </p>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Archive className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Arquivadas</p>
                  <p className="text-2xl font-bold">{stats?.total.toLocaleString() || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <MessageSquare className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Textos</p>
                  <p className="text-2xl font-bold">{stats?.texto.toLocaleString() || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Image className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Imagens</p>
                  <p className="text-2xl font-bold">{stats?.imagem.toLocaleString() || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <FileAudio className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Áudios</p>
                  <p className="text-2xl font-bold">{stats?.audio.toLocaleString() || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar no conteúdo..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(0);
                    }}
                    className="pl-10"
                  />
                </div>
              </div>

              <Select value={tipoFiltro} onValueChange={(v) => { setTipoFiltro(v); setPage(0); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="texto">Texto</SelectItem>
                  <SelectItem value="imagem">Imagem</SelectItem>
                  <SelectItem value="audio">Áudio</SelectItem>
                  <SelectItem value="documento">Documento</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                </SelectContent>
              </Select>

              <Select value={direcaoFiltro} onValueChange={(v) => { setDirecaoFiltro(v); setPage(0); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Direção" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  <SelectItem value="enviada">Enviadas</SelectItem>
                  <SelectItem value="recebida">Recebidas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de mensagens */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                Carregando mensagens arquivadas...
              </div>
            ) : mensagens?.data?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Archive className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma mensagem arquivada encontrada</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Tipo</TableHead>
                      <TableHead className="w-[100px]">Direção</TableHead>
                      <TableHead>Conteúdo</TableHead>
                      <TableHead className="w-[150px]">Data Original</TableHead>
                      <TableHead className="w-[150px]">Arquivada em</TableHead>
                      <TableHead className="w-[120px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mensagens?.data?.map((msg) => (
                      <TableRow key={msg.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getTipoIcon(msg.tipo)}
                            <span className="text-xs capitalize">{msg.tipo || 'texto'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={msg.direcao === 'enviada' ? 'default' : 'secondary'}>
                            {msg.direcao}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <p className="truncate text-sm">
                            {msg.conteudo || (msg.media_url ? '[Mídia]' : '[Sem conteúdo]')}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(msg.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {msg.arquivada_em 
                            ? format(new Date(msg.arquivada_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedMessage(msg)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setMessageToRestore(msg)}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Paginação */}
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {page * ITEMS_PER_PAGE + 1} - {Math.min((page + 1) * ITEMS_PER_PAGE, mensagens?.count || 0)} de {mensagens?.count || 0}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Página {page + 1} de {totalPages || 1}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de visualização */}
      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da Mensagem</DialogTitle>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Tipo</p>
                  <p className="font-medium capitalize">{selectedMessage.tipo || 'texto'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Direção</p>
                  <Badge variant={selectedMessage.direcao === 'enviada' ? 'default' : 'secondary'}>
                    {selectedMessage.direcao}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Data Original</p>
                  <p className="font-medium">
                    {format(new Date(selectedMessage.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Arquivada em</p>
                  <p className="font-medium">
                    {selectedMessage.arquivada_em 
                      ? format(new Date(selectedMessage.arquivada_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : '-'
                    }
                  </p>
                </div>
                {selectedMessage.enviada_por_ia && (
                  <div className="col-span-2">
                    <Badge variant="outline">Enviada por IA</Badge>
                  </div>
                )}
              </div>

              <div>
                <p className="text-muted-foreground text-sm mb-2">Conteúdo</p>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="whitespace-pre-wrap break-words">
                    {selectedMessage.conteudo || '[Sem conteúdo textual]'}
                  </p>
                </div>
              </div>

              {selectedMessage.media_url && (
                <div>
                  <p className="text-muted-foreground text-sm mb-2">Mídia</p>
                  {selectedMessage.tipo === 'imagem' ? (
                    <img 
                      src={selectedMessage.media_url} 
                      alt="Mídia" 
                      className="max-w-full rounded-lg"
                    />
                  ) : (
                    <a 
                      href={selectedMessage.media_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Ver mídia
                    </a>
                  )}
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                <p>ID: {selectedMessage.id}</p>
                <p>Conversa: {selectedMessage.conversa_id}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de confirmação de restauração */}
      <Dialog open={!!messageToRestore} onOpenChange={() => setMessageToRestore(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restaurar Mensagem</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja restaurar esta mensagem? Ela será movida de volta para a conversa original.
            </DialogDescription>
          </DialogHeader>
          {messageToRestore && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="truncate">{messageToRestore.conteudo || '[Mídia]'}</p>
              <p className="text-muted-foreground mt-1">
                {format(new Date(messageToRestore.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageToRestore(null)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => messageToRestore && restaurarMutation.mutate(messageToRestore)}
              disabled={restaurarMutation.isPending}
            >
              {restaurarMutation.isPending ? 'Restaurando...' : 'Restaurar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
