import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Plus, Trash2, RefreshCw, Check, X, Settings } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface CalendarioGoogle {
  id: string;
  nome: string;
  email_google: string;
  calendar_id: string;
  cor: string;
  ativo: boolean;
  token_expiry: string | null;
  created_at: string;
}

interface GoogleCalendarOption {
  id: string;
  nome: string;
  cor: string;
  primario: boolean;
}

export default function IntegracaoGoogleCalendar() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [calendarios, setCalendarios] = useState<CalendarioGoogle[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [editModal, setEditModal] = useState<CalendarioGoogle | null>(null);
  const [editNome, setEditNome] = useState("");
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarOption[]>([]);
  const [selectedGoogleCalendar, setSelectedGoogleCalendar] = useState("");
  const [loadingCalendars, setLoadingCalendars] = useState(false);

  useEffect(() => {
    loadCalendarios();

    // Listener para mensagens do popup OAuth
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'google-calendar-success') {
        toast.success("Calendário conectado com sucesso!");
        loadCalendarios();
      } else if (event.data?.type === 'google-calendar-error') {
        toast.error(`Erro: ${event.data.error}`);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  async function loadCalendarios() {
    try {
      const { data, error } = await supabase
        .from('calendarios_google')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCalendarios(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar calendários:", error);
      toast.error("Erro ao carregar calendários");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    if (!usuario?.conta_id) {
      toast.error("Erro: conta não encontrada");
      return;
    }

    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: {
          conta_id: usuario.conta_id,
          redirect_url: window.location.href,
        },
      });

      if (error) throw error;

      if (data?.auth_url) {
        // Abrir popup para OAuth
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        window.open(
          data.auth_url,
          'google-oauth',
          `width=${width},height=${height},left=${left},top=${top},popup=yes`
        );
      }
    } catch (error: any) {
      console.error("Erro ao conectar:", error);
      toast.error(error.message || "Erro ao iniciar conexão");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect(calendario: CalendarioGoogle) {
    if (!confirm(`Deseja desconectar o calendário "${calendario.nome}"?`)) return;

    try {
      const { error } = await supabase
        .from('calendarios_google')
        .delete()
        .eq('id', calendario.id);

      if (error) throw error;

      toast.success("Calendário desconectado");
      loadCalendarios();
    } catch (error: any) {
      console.error("Erro ao desconectar:", error);
      toast.error("Erro ao desconectar calendário");
    }
  }

  async function handleTestConnection(calendario: CalendarioGoogle) {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-actions', {
        body: {
          operacao: 'consultar',
          calendario_id: calendario.id,
          dados: {
            data_inicio: new Date().toISOString(),
            data_fim: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        },
      });

      if (error) throw error;

      toast.success(`Conexão OK! ${data.total} eventos encontrados hoje.`);
    } catch (error: any) {
      console.error("Erro ao testar:", error);
      toast.error(error.message || "Erro ao testar conexão");
    }
  }

  async function openEditModal(calendario: CalendarioGoogle) {
    setEditModal(calendario);
    setEditNome(calendario.nome);
    setSelectedGoogleCalendar(calendario.calendar_id);
    
    // Carregar lista de calendários do Google
    setLoadingCalendars(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-actions', {
        body: {
          operacao: 'listar_calendarios',
          calendario_id: calendario.id,
        },
      });

      if (error) throw error;
      setGoogleCalendars(data.calendarios || []);
    } catch (error: any) {
      console.error("Erro ao carregar calendários:", error);
      toast.error("Erro ao carregar lista de calendários");
    } finally {
      setLoadingCalendars(false);
    }
  }

  async function handleSaveEdit() {
    if (!editModal) return;

    try {
      const { error } = await supabase
        .from('calendarios_google')
        .update({
          nome: editNome,
          calendar_id: selectedGoogleCalendar,
        })
        .eq('id', editModal.id);

      if (error) throw error;

      toast.success("Calendário atualizado");
      setEditModal(null);
      loadCalendarios();
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar alterações");
    }
  }

  function isTokenExpired(tokenExpiry: string | null): boolean {
    if (!tokenExpiry) return true;
    return new Date(tokenExpiry) < new Date();
  }

  return (
    <MainLayout>
      <div className="max-w-4xl py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/integracoes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Google Calendar</h1>
              <p className="text-muted-foreground">
                Gerencie suas conexões com o Google Calendar
              </p>
            </div>
          </div>
        </div>

        {/* Botão Conectar */}
        <Card className="mb-6">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Conectar Nova Conta</h3>
                <p className="text-sm text-muted-foreground">
                  Adicione uma conta Google para sincronizar calendários
                </p>
              </div>
              <Button onClick={handleConnect} disabled={connecting}>
                {connecting ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Conectar Conta Google
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Calendários */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Calendários Conectados</h2>

          {loading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Carregando...
              </CardContent>
            </Card>
          ) : calendarios.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhum calendário conectado ainda.
              </CardContent>
            </Card>
          ) : (
            calendarios.map((calendario) => (
              <Card key={calendario.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: calendario.cor }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{calendario.nome}</span>
                          {calendario.ativo ? (
                            <Badge variant="default" className="text-xs">
                              <Check className="h-3 w-3 mr-1" />
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              <X className="h-3 w-3 mr-1" />
                              Inativo
                            </Badge>
                          )}
                          {isTokenExpired(calendario.token_expiry) && (
                            <Badge variant="outline" className="text-xs text-yellow-600">
                              Token expirado
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {calendario.email_google}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Calendário: {calendario.calendar_id === 'primary' ? 'Principal' : calendario.calendar_id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTestConnection(calendario)}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Testar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(calendario)}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        Configurar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDisconnect(calendario)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Info Box */}
        <Card className="mt-8 border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <h3 className="font-medium text-primary mb-2">Como funciona?</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• O agente IA pode consultar sua disponibilidade automaticamente</li>
              <li>• Agendamentos podem ser criados diretamente durante a conversa</li>
              <li>• Use as ações @ no agente para configurar quando consultar/criar eventos</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Edição */}
      <Dialog open={!!editModal} onOpenChange={() => setEditModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Calendário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Calendário</Label>
              <Input
                value={editNome}
                onChange={(e) => setEditNome(e.target.value)}
                placeholder="Ex: Agenda Comercial"
              />
            </div>
            <div className="space-y-2">
              <Label>Calendário do Google</Label>
              {loadingCalendars ? (
                <div className="text-sm text-muted-foreground">Carregando...</div>
              ) : (
                <Select value={selectedGoogleCalendar} onValueChange={setSelectedGoogleCalendar}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um calendário" />
                  </SelectTrigger>
                  <SelectContent>
                    {googleCalendars.map((cal) => (
                      <SelectItem key={cal.id} value={cal.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cal.cor }}
                          />
                          {cal.nome}
                          {cal.primario && (
                            <span className="text-xs text-muted-foreground">(Principal)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModal(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
