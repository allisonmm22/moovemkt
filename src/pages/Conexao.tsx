import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Plug, PlugZap, RefreshCw, Check, Loader2, QrCode, Power, Plus, Smartphone, Trash2, Globe, Zap, Info, ExternalLink, Copy, CheckCircle2, Instagram, Settings, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { toast } from 'sonner';
import { validarEExibirErro } from '@/hooks/useValidarLimitePlano';
import { useIsMobile } from '@/hooks/use-mobile';
import { OnboardingTooltip } from '@/components/onboarding/OnboardingTooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type TipoProvedor = 'evolution' | 'meta' | 'instagram';

interface Conexao {
  id: string;
  nome: string;
  instance_name: string;
  token: string;
  webhook_url: string | null;
  status: 'conectado' | 'desconectado' | 'aguardando';
  qrcode: string | null;
  numero: string | null;
  tipo_provedor: TipoProvedor;
  meta_phone_number_id: string | null;
  meta_business_account_id: string | null;
  meta_access_token: string | null;
  meta_webhook_verify_token: string | null;
  tipo_canal?: string | null;
}

export default function Conexao() {
  const { usuario } = useAuth();
  const isMobile = useIsMobile();
  const { isOnboardingActive, currentStep, completeStep, nextStep } = useOnboarding();
  
  // Múltiplas conexões
  const [conexoes, setConexoes] = useState<Conexao[]>([]);
  const [conexaoSelecionada, setConexaoSelecionada] = useState<Conexao | null>(null);
  const [showNovaConexao, setShowNovaConexao] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [instanceName, setInstanceName] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [reconfiguringWebhook, setReconfiguringWebhook] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [conexaoParaDeletar, setConexaoParaDeletar] = useState<Conexao | null>(null);
  
  // Estados para Meta API
  const [tipoProvedor, setTipoProvedor] = useState<TipoProvedor>('evolution');
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('');
  const [metaBusinessAccountId, setMetaBusinessAccountId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaWebhookVerifyToken, setMetaWebhookVerifyToken] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedVerifyToken, setCopiedVerifyToken] = useState(false);
  const [creatingInstagram, setCreatingInstagram] = useState(false);
  const [connectingInstagram, setConnectingInstagram] = useState(false);
  
  // Estados para Instagram
  const [instagramPageId, setInstagramPageId] = useState('');
  const [instagramAccessToken, setInstagramAccessToken] = useState('');
  const [savingInstagram, setSavingInstagram] = useState(false);

  const fetchConexoes = useCallback(async () => {
    if (!usuario?.conta_id) return;
    
    try {
      const { data, error } = await supabase
        .from('conexoes_whatsapp')
        .select('*')
        .eq('conta_id', usuario.conta_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setConexoes(data as Conexao[]);
        
        // Detectar conexão para onboarding
        const conectada = data.find(c => c.status === 'conectado');
        if (conectada && isOnboardingActive && 
            (currentStep === 'configurar_conexao' || currentStep === 'aguardar_conexao')) {
          completeStep('configurar_conexao');
          completeStep('aguardar_conexao');
          nextStep();
        }
      }
    } catch (error) {
      console.error('Erro ao buscar conexões:', error);
    } finally {
      setLoading(false);
    }
  }, [usuario?.conta_id, isOnboardingActive, currentStep, completeStep, nextStep]);

  useEffect(() => {
    fetchConexoes();
  }, [fetchConexoes]);

  // Auto-refresh status quando aguardando (apenas para Evolution)
  useEffect(() => {
    const aguardando = conexoes.find(c => c.status === 'aguardando' && c.tipo_provedor !== 'meta');
    if (aguardando && conexaoSelecionada?.id === aguardando.id) {
      const interval = setInterval(() => {
        handleCheckStatus(aguardando, true);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [conexoes, conexaoSelecionada]);

  const resetFormulario = () => {
    setInstanceName('');
    setTipoProvedor('evolution');
    setMetaPhoneNumberId('');
    setMetaBusinessAccountId('');
    setMetaAccessToken('');
    setInstagramPageId('');
    setInstagramAccessToken('');
  };

  const handleCreateInstance = async () => {
    if (!instanceName.trim()) {
      toast.error('Digite o nome da conexão');
      return;
    }

    setCreating(true);
    try {
      const permitido = await validarEExibirErro(usuario!.conta_id, 'conexoes_evolution');
      if (!permitido) {
        setCreating(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('evolution-create-instance', {
        body: {
          nome: instanceName.trim(),
          conta_id: usuario!.conta_id,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Conexão criada com sucesso!');
      resetFormulario();
      setShowNovaConexao(false);
      await fetchConexoes();
    } catch (error) {
      console.error('Erro ao criar conexão:', error);
      toast.error('Erro ao criar conexão');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateMetaConnection = async () => {
    if (!instanceName.trim()) {
      toast.error('Digite o nome da conexão');
      return;
    }

    if (!metaPhoneNumberId.trim() || !metaAccessToken.trim()) {
      toast.error('Preencha Phone Number ID e Access Token');
      return;
    }

    setCreating(true);
    try {
      const permitido = await validarEExibirErro(usuario!.conta_id, 'conexoes_meta');
      if (!permitido) {
        setCreating(false);
        return;
      }

      const instanceKey = `meta_${usuario!.conta_id.slice(0, 8)}_${Date.now().toString(36)}`;
      const verifyToken = `verify_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

      const { error } = await supabase
        .from('conexoes_whatsapp')
        .insert({
          nome: instanceName.trim(),
          instance_name: instanceKey,
          token: 'meta-api',
          conta_id: usuario!.conta_id,
          tipo_provedor: 'meta',
          status: 'conectado',
          meta_phone_number_id: metaPhoneNumberId.trim(),
          meta_business_account_id: metaBusinessAccountId.trim() || null,
          meta_access_token: metaAccessToken.trim(),
          meta_webhook_verify_token: verifyToken,
        });

      if (error) throw error;

      toast.success('Conexão Meta API criada com sucesso!');
      resetFormulario();
      setShowNovaConexao(false);
      await fetchConexoes();
    } catch (error) {
      console.error('Erro ao criar conexão Meta:', error);
      toast.error('Erro ao criar conexão Meta API');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateInstagramConnection = async () => {
    if (!instanceName.trim()) {
      toast.error('Digite o nome da conexão');
      return;
    }

    if (!instagramPageId.trim() || !instagramAccessToken.trim()) {
      toast.error('Preencha Instagram Page ID e Access Token');
      return;
    }

    setCreatingInstagram(true);
    try {
      const permitido = await validarEExibirErro(usuario!.conta_id, 'instagram');
      if (!permitido) {
        setCreatingInstagram(false);
        return;
      }

      const instanceKey = `ig_${usuario!.conta_id.slice(0, 8)}_${Date.now().toString(36)}`;
      const verifyToken = `verify_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

      const { error } = await supabase
        .from('conexoes_whatsapp')
        .insert({
          nome: instanceName.trim(),
          instance_name: instanceKey,
          token: 'instagram-api',
          conta_id: usuario!.conta_id,
          tipo_provedor: 'instagram',
          tipo_canal: 'instagram',
          status: 'conectado',
          meta_phone_number_id: instagramPageId.trim(),
          meta_access_token: instagramAccessToken.trim(),
          meta_webhook_verify_token: verifyToken,
        });

      if (error) throw error;

      toast.success('Conexão Instagram criada com sucesso!');
      resetFormulario();
      setShowNovaConexao(false);
      await fetchConexoes();
    } catch (error) {
      console.error('Erro ao criar conexão Instagram:', error);
      toast.error('Erro ao criar conexão Instagram');
    } finally {
      setCreatingInstagram(false);
    }
  };

  const handleConnectInstagram = async (conexao: Conexao) => {
    setConnectingInstagram(true);
    try {
      const { data, error } = await supabase.functions.invoke('instagram-connect', {
        body: { conexao_id: conexao.id },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (data.oauth_url) {
        window.open(data.oauth_url, '_blank');
        toast.success('Complete a autenticação na janela que abriu');
      }

      await fetchConexoes();
    } catch (error) {
      console.error('Erro ao conectar Instagram:', error);
      toast.error('Erro ao conectar Instagram');
    } finally {
      setConnectingInstagram(false);
    }
  };

  const handleSaveMetaCredentials = async (conexao: Conexao) => {
    if (!metaPhoneNumberId.trim() || !metaAccessToken.trim()) {
      toast.error('Preencha Phone Number ID e Access Token');
      return;
    }

    setSavingMeta(true);
    try {
      const { error } = await supabase
        .from('conexoes_whatsapp')
        .update({
          meta_phone_number_id: metaPhoneNumberId.trim(),
          meta_business_account_id: metaBusinessAccountId.trim() || null,
          meta_access_token: metaAccessToken.trim(),
          status: 'conectado',
        })
        .eq('id', conexao.id);

      if (error) throw error;

      toast.success('Credenciais atualizadas com sucesso!');
      await fetchConexoes();
    } catch (error) {
      console.error('Erro ao salvar credenciais:', error);
      toast.error('Erro ao salvar credenciais');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSaveInstagramCredentials = async (conexao: Conexao) => {
    if (!instagramPageId.trim() || !instagramAccessToken.trim()) {
      toast.error('Preencha Instagram Page ID e Access Token');
      return;
    }

    setSavingInstagram(true);
    try {
      const { error } = await supabase
        .from('conexoes_whatsapp')
        .update({
          meta_phone_number_id: instagramPageId.trim(),
          meta_access_token: instagramAccessToken.trim(),
          status: 'conectado',
        })
        .eq('id', conexao.id);

      if (error) throw error;

      toast.success('Credenciais Instagram atualizadas!');
      await fetchConexoes();
    } catch (error) {
      console.error('Erro ao salvar credenciais Instagram:', error);
      toast.error('Erro ao salvar credenciais');
    } finally {
      setSavingInstagram(false);
    }
  };

  const getMetaWebhookUrl = () => {
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-verify-webhook`;
  };

  const getInstagramWebhookUrl = () => {
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-webhook`;
  };

  const copyMetaWebhookUrl = () => {
    navigator.clipboard.writeText(getMetaWebhookUrl());
    setCopiedWebhook(true);
    toast.success('URL do Webhook copiada!');
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const copyInstagramWebhookUrl = () => {
    navigator.clipboard.writeText(getInstagramWebhookUrl());
    setCopiedWebhook(true);
    toast.success('URL do Webhook copiada!');
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const copyVerifyToken = (conexao: Conexao) => {
    if (conexao.meta_webhook_verify_token) {
      navigator.clipboard.writeText(conexao.meta_webhook_verify_token);
      setCopiedVerifyToken(true);
      toast.success('Token de verificação copiado!');
      setTimeout(() => setCopiedVerifyToken(false), 2000);
    }
  };

  const handleConnect = async (conexao: Conexao) => {
    setConnecting(true);
    setQrCode(null);
    setConexaoSelecionada(conexao);
    
    try {
      const { data, error } = await supabase.functions.invoke('evolution-connect', {
        body: { conexao_id: conexao.id },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (data.qrcode) {
        setQrCode(data.qrcode);
        toast.success('QR Code gerado! Escaneie com seu WhatsApp');
      }

      await fetchConexoes();
    } catch (error) {
      console.error('Erro ao conectar:', error);
      toast.error('Erro ao gerar QR Code');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (conexao: Conexao) => {
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-disconnect', {
        body: { conexao_id: conexao.id },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Desconectado com sucesso');
      setQrCode(null);
      setConexaoSelecionada(null);
      await fetchConexoes();
    } catch (error) {
      console.error('Erro ao desconectar:', error);
      toast.error('Erro ao desconectar');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleCheckStatus = async (conexao: Conexao, silent = false) => {
    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-connection-status', {
        body: { conexao_id: conexao.id },
      });

      if (error) throw error;

      if (data.status === 'conectado') {
        setQrCode(null);
        if (!silent) toast.success('WhatsApp conectado!');
      }

      await fetchConexoes();
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      if (!silent) toast.error('Erro ao verificar status');
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleReconfigureWebhook = async (conexao: Conexao) => {
    setReconfiguringWebhook(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-set-webhook', {
        body: { conexao_id: conexao.id },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Webhook reconfigurado com sucesso!');
    } catch (error) {
      console.error('Erro ao reconfigurar webhook:', error);
      toast.error('Erro ao reconfigurar webhook');
    } finally {
      setReconfiguringWebhook(false);
    }
  };

  const handleDeleteConnection = async (conexao: Conexao) => {
    setDeleting(true);
    try {
      if (conexao.tipo_provedor === 'meta') {
        const { error } = await supabase
          .from('conexoes_whatsapp')
          .delete()
          .eq('id', conexao.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase.functions.invoke('evolution-delete-instance', {
          body: { conexao_id: conexao.id }
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }

      toast.success('Conexão deletada com sucesso');
      setConexaoSelecionada(null);
      setQrCode(null);
      setShowDeleteConfirm(false);
      setConexaoParaDeletar(null);
      await fetchConexoes();
    } catch (error) {
      console.error('Erro ao deletar conexão:', error);
      toast.error('Erro ao deletar conexão');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusIcon = (conexao: Conexao) => {
    switch (conexao.status) {
      case 'conectado':
        return <PlugZap className="h-5 w-5 text-success" />;
      case 'aguardando':
        return <QrCode className="h-5 w-5 text-warning" />;
      default:
        return <Plug className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusText = (conexao: Conexao) => {
    switch (conexao.status) {
      case 'conectado':
        return 'Conectado';
      case 'aguardando':
        return 'Aguardando';
      default:
        return 'Desconectado';
    }
  };

  const getStatusColor = (conexao: Conexao) => {
    switch (conexao.status) {
      case 'conectado':
        return 'text-success';
      case 'aguardando':
        return 'text-warning';
      default:
        return 'text-muted-foreground';
    }
  };

  const getProviderBadge = (conexao: Conexao) => {
    if (conexao.tipo_provedor === 'meta') {
      return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Meta API</span>;
    }
    if (conexao.tipo_provedor === 'instagram' || conexao.tipo_canal === 'instagram') {
      return <span className="text-xs px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-pink-400">Instagram</span>;
    }
    return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Evolution</span>;
  };

  const getProviderIcon = (conexao: Conexao) => {
    if (conexao.tipo_provedor === 'meta') {
      return <Globe className="h-6 w-6 text-blue-500" />;
    }
    if (conexao.tipo_provedor === 'instagram' || conexao.tipo_canal === 'instagram') {
      return <Instagram className="h-6 w-6 text-pink-500" />;
    }
    return <Zap className="h-6 w-6 text-emerald-500" />;
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
      <div className={`max-w-4xl space-y-6 md:space-y-8 animate-fade-in ${isMobile ? 'px-4 py-4' : ''}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Conexões</h1>
            <p className="text-muted-foreground mt-1 text-sm md:text-base">
              Gerencie suas conexões WhatsApp e Instagram.
            </p>
          </div>
          <OnboardingTooltip
            title="Adicione sua primeira conexão"
            description="Clique aqui para conectar seu WhatsApp ou Instagram"
            step={2}
            totalSteps={5}
            position="left"
            isVisible={isOnboardingActive && currentStep === 'configurar_conexao' && conexoes.length === 0}
            showNextButton={false}
          >
            <button
              onClick={() => setShowNovaConexao(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span className="hidden sm:inline">Nova Conexão</span>
            </button>
          </OnboardingTooltip>
        </div>

        {/* Lista de Conexões */}
        {conexoes.length === 0 ? (
          <div className="p-8 md:p-12 rounded-xl bg-card border border-border text-center">
            <div className="h-16 w-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
              <Plug className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma conexão configurada</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Adicione uma conexão para começar a receber mensagens.
            </p>
            <button
              onClick={() => setShowNovaConexao(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-5 w-5" />
              Adicionar Conexão
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {conexoes.map((conexao) => (
              <div
                key={conexao.id}
                className="p-4 md:p-5 rounded-xl bg-card border border-border hover:border-primary/50 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    conexao.status === 'conectado' ? 'bg-success/20' : 
                    conexao.status === 'aguardando' ? 'bg-warning/20' : 'bg-muted'
                  }`}>
                    {getProviderIcon(conexao)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">{conexao.nome}</h3>
                      {getProviderBadge(conexao)}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-sm flex items-center gap-1 ${getStatusColor(conexao)}`}>
                        {getStatusIcon(conexao)}
                        {getStatusText(conexao)}
                      </span>
                      {conexao.numero && (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Smartphone className="h-3 w-3" />
                          {conexao.numero}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Botões de ação baseados no status e tipo */}
                    {conexao.tipo_provedor === 'evolution' && conexao.status !== 'conectado' && (
                      <button
                        onClick={() => handleConnect(conexao)}
                        disabled={connecting}
                        className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        title="Conectar"
                      >
                        {connecting && conexaoSelecionada?.id === conexao.id ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <QrCode className="h-5 w-5" />
                        )}
                      </button>
                    )}
                    
                    {conexao.tipo_provedor === 'instagram' && conexao.status !== 'conectado' && (
                      <button
                        onClick={() => handleConnectInstagram(conexao)}
                        disabled={connectingInstagram}
                        className="p-2 rounded-lg bg-pink-500/10 text-pink-500 hover:bg-pink-500/20 transition-colors"
                        title="Conectar Instagram"
                      >
                        {connectingInstagram ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <ExternalLink className="h-5 w-5" />
                        )}
                      </button>
                    )}

                    {conexao.status === 'conectado' && conexao.tipo_provedor !== 'meta' && (
                      <button
                        onClick={() => handleDisconnect(conexao)}
                        disabled={disconnecting}
                        className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                        title="Desconectar"
                      >
                        {disconnecting ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Power className="h-5 w-5" />
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setConexaoSelecionada(conexaoSelecionada?.id === conexao.id ? null : conexao);
                        if (conexao.tipo_provedor === 'meta') {
                          setMetaPhoneNumberId(conexao.meta_phone_number_id || '');
                          setMetaBusinessAccountId(conexao.meta_business_account_id || '');
                          setMetaAccessToken(conexao.meta_access_token || '');
                        }
                        if (conexao.tipo_provedor === 'instagram') {
                          setInstagramPageId(conexao.meta_phone_number_id || '');
                          setInstagramAccessToken(conexao.meta_access_token || '');
                        }
                      }}
                      className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                      title="Gerenciar"
                    >
                      <Settings className="h-5 w-5 text-muted-foreground" />
                    </button>

                    <button
                      onClick={() => {
                        setConexaoParaDeletar(conexao);
                        setShowDeleteConfirm(true);
                      }}
                      className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Deletar"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* QR Code expandido */}
                {conexaoSelecionada?.id === conexao.id && qrCode && conexao.status === 'aguardando' && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex flex-col items-center space-y-4">
                      <h4 className="text-sm font-medium text-foreground">Escaneie o QR Code</h4>
                      <div className="p-3 bg-background rounded-xl border border-border">
                        <img
                          src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                          alt="QR Code"
                          className="w-48 h-48"
                        />
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <RefreshCw className={`h-4 w-4 ${checkingStatus ? 'animate-spin' : ''}`} />
                        <span>Verificando conexão...</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Painel de configurações expandido */}
                {conexaoSelecionada?.id === conexao.id && !qrCode && (
                  <div className="mt-4 pt-4 border-t border-border space-y-4">
                    {/* Ações para Evolution */}
                    {conexao.tipo_provedor === 'evolution' && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleCheckStatus(conexao)}
                          disabled={checkingStatus}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
                        >
                          <RefreshCw className={`h-4 w-4 ${checkingStatus ? 'animate-spin' : ''}`} />
                          Verificar Status
                        </button>
                        <button
                          onClick={() => handleReconfigureWebhook(conexao)}
                          disabled={reconfiguringWebhook}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
                        >
                          {reconfiguringWebhook ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Settings className="h-4 w-4" />
                          )}
                          Reconfigurar Webhook
                        </button>
                      </div>
                    )}

                    {/* Configurações Meta API */}
                    {conexao.tipo_provedor === 'meta' && (
                      <div className="space-y-4">
                        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                          <h4 className="text-sm font-medium text-blue-400 mb-3">Configuração do Webhook</h4>
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs text-muted-foreground">URL do Webhook</label>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="flex-1 text-xs bg-background p-2 rounded truncate">
                                  {getMetaWebhookUrl()}
                                </code>
                                <button
                                  onClick={copyMetaWebhookUrl}
                                  className="p-2 rounded bg-background hover:bg-muted transition-colors"
                                >
                                  {copiedWebhook ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Token de Verificação</label>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="flex-1 text-xs bg-background p-2 rounded truncate">
                                  {conexao.meta_webhook_verify_token}
                                </code>
                                <button
                                  onClick={() => copyVerifyToken(conexao)}
                                  className="p-2 rounded bg-background hover:bg-muted transition-colors"
                                >
                                  {copiedVerifyToken ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3">
                          <div>
                            <label className="text-sm text-muted-foreground">Phone Number ID</label>
                            <input
                              type="text"
                              value={metaPhoneNumberId}
                              onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                              className="w-full mt-1 h-10 px-3 rounded-lg bg-input border border-border text-foreground text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-sm text-muted-foreground">Business Account ID</label>
                            <input
                              type="text"
                              value={metaBusinessAccountId}
                              onChange={(e) => setMetaBusinessAccountId(e.target.value)}
                              className="w-full mt-1 h-10 px-3 rounded-lg bg-input border border-border text-foreground text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-sm text-muted-foreground">Access Token</label>
                            <input
                              type="password"
                              value={metaAccessToken}
                              onChange={(e) => setMetaAccessToken(e.target.value)}
                              className="w-full mt-1 h-10 px-3 rounded-lg bg-input border border-border text-foreground text-sm"
                            />
                          </div>
                          <button
                            onClick={() => handleSaveMetaCredentials(conexao)}
                            disabled={savingMeta}
                            className="h-10 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                          >
                          {savingMeta ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Salvar Credenciais'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Configurações Instagram */}
                    {conexao.tipo_provedor === 'instagram' && (
                      <div className="space-y-4">
                        <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-pink-500/20">
                          <h4 className="text-sm font-medium text-pink-400 mb-3">Configuração do Webhook</h4>
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs text-muted-foreground">URL do Webhook</label>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="flex-1 text-xs bg-background p-2 rounded truncate">
                                  {getInstagramWebhookUrl()}
                                </code>
                                <button
                                  onClick={copyInstagramWebhookUrl}
                                  className="p-2 rounded bg-background hover:bg-muted transition-colors"
                                >
                                  {copiedWebhook ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Token de Verificação</label>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="flex-1 text-xs bg-background p-2 rounded truncate">
                                  {conexao.meta_webhook_verify_token}
                                </code>
                                <button
                                  onClick={() => copyVerifyToken(conexao)}
                                  className="p-2 rounded bg-background hover:bg-muted transition-colors"
                                >
                                  {copiedVerifyToken ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3">
                          <div>
                            <label className="text-sm text-muted-foreground">Instagram Page ID</label>
                            <input
                              type="text"
                              value={instagramPageId}
                              onChange={(e) => setInstagramPageId(e.target.value)}
                              placeholder="ID da página do Instagram"
                              className="w-full mt-1 h-10 px-3 rounded-lg bg-input border border-border text-foreground text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-sm text-muted-foreground">Access Token</label>
                            <input
                              type="password"
                              value={instagramAccessToken}
                              onChange={(e) => setInstagramAccessToken(e.target.value)}
                              placeholder="Token de acesso do Instagram"
                              className="w-full mt-1 h-10 px-3 rounded-lg bg-input border border-border text-foreground text-sm"
                            />
                          </div>
                          <button
                            onClick={() => handleSaveInstagramCredentials(conexao)}
                            disabled={savingInstagram}
                            className="h-10 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium hover:from-purple-700 hover:to-pink-700 transition-colors disabled:opacity-50"
                          >
                            {savingInstagram ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Salvar Credenciais'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
                </div>
              )}

        {/* Modal de Nova Conexão */}
        <Dialog open={showNovaConexao} onOpenChange={setShowNovaConexao}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Conexão</DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Seletor de Tipo */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setTipoProvedor('evolution')}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${
                    tipoProvedor === 'evolution'
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-border hover:border-muted-foreground/50'
                  }`}
                >
                  <Zap className="h-6 w-6 mx-auto text-emerald-500 mb-1" />
                  <span className="text-xs font-medium">Evolution</span>
                </button>

                <button
                  onClick={() => setTipoProvedor('meta')}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${
                    tipoProvedor === 'meta'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-border hover:border-muted-foreground/50'
                  }`}
                >
                  <Globe className="h-6 w-6 mx-auto text-blue-500 mb-1" />
                  <span className="text-xs font-medium">Meta API</span>
                </button>

                <button
                  onClick={() => setTipoProvedor('instagram')}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${
                    tipoProvedor === 'instagram'
                      ? 'border-pink-500 bg-pink-500/10'
                      : 'border-border hover:border-muted-foreground/50'
                  }`}
                >
                  <Instagram className="h-6 w-6 mx-auto text-pink-500 mb-1" />
                  <span className="text-xs font-medium">Instagram</span>
                </button>
              </div>

              {/* Nome da Conexão */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Nome da Conexão
                </label>
                <input
                  type="text"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Ex: WhatsApp Vendas"
                  className="w-full h-11 px-4 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Campos Meta API */}
              {tipoProvedor === 'meta' && (
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="flex items-center gap-2 text-sm text-blue-400">
                    <Info className="h-4 w-4" />
                    <span>Configure as credenciais do Meta Business</span>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Phone Number ID *
                    </label>
                    <input
                      type="text"
                      value={metaPhoneNumberId}
                      onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                      placeholder="Ex: 123456789012345"
                      className="w-full h-11 px-4 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Business Account ID
                    </label>
                    <input
                      type="text"
                      value={metaBusinessAccountId}
                      onChange={(e) => setMetaBusinessAccountId(e.target.value)}
                      placeholder="Ex: 123456789012345"
                      className="w-full h-11 px-4 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Access Token *
                    </label>
                    <input
                      type="password"
                      value={metaAccessToken}
                      onChange={(e) => setMetaAccessToken(e.target.value)}
                      placeholder="Token de acesso permanente"
                      className="w-full h-11 px-4 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <a 
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Guia de configuração Meta API
                  </a>
                </div>
              )}

              {/* Campos Instagram */}
              {tipoProvedor === 'instagram' && (
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="flex items-center gap-2 text-sm text-pink-400">
                    <Info className="h-4 w-4" />
                    <span>Configure as credenciais do Instagram Business</span>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Instagram Page ID *
                    </label>
                    <input
                      type="text"
                      value={instagramPageId}
                      onChange={(e) => setInstagramPageId(e.target.value)}
                      placeholder="Ex: 123456789012345"
                      className="w-full h-11 px-4 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Access Token *
                    </label>
                    <input
                      type="password"
                      value={instagramAccessToken}
                      onChange={(e) => setInstagramAccessToken(e.target.value)}
                      placeholder="Token de acesso do Instagram"
                      className="w-full h-11 px-4 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <a 
                    href="https://developers.facebook.com/docs/instagram-api/getting-started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-pink-400 hover:text-pink-300"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Guia de configuração Instagram API
                  </a>
                </div>
              )}

              {/* Botão de Criar */}
              {tipoProvedor === 'evolution' ? (
                <button
                  onClick={handleCreateInstance}
                  disabled={creating || !instanceName.trim()}
                  className="w-full h-11 rounded-lg bg-emerald-600 text-white font-medium flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {creating ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Zap className="h-5 w-5" />
                      Criar Conexão WhatsApp
                    </>
                  )}
                </button>
              ) : tipoProvedor === 'instagram' ? (
                <button
                  onClick={handleCreateInstagramConnection}
                  disabled={creatingInstagram || !instanceName.trim() || !instagramPageId.trim() || !instagramAccessToken.trim()}
                  className="w-full h-11 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium flex items-center justify-center gap-2 hover:from-purple-700 hover:to-pink-700 transition-colors disabled:opacity-50"
                >
                  {creatingInstagram ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Instagram className="h-5 w-5" />
                      Criar Conexão Instagram
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleCreateMetaConnection}
                  disabled={creating || !instanceName.trim() || !metaPhoneNumberId.trim() || !metaAccessToken.trim()}
                  className="w-full h-11 rounded-lg bg-blue-600 text-white font-medium flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {creating ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Globe className="h-5 w-5" />
                      Criar Conexão Meta API
                    </>
                  )}
                </button>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Confirmação de Delete */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Deletar Conexão</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                Tem certeza que deseja deletar a conexão <strong>{conexaoParaDeletar?.nome}</strong>?
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setConexaoParaDeletar(null);
                }}
                className="flex-1 h-10 rounded-lg bg-muted text-foreground font-medium hover:bg-muted/80 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => conexaoParaDeletar && handleDeleteConnection(conexaoParaDeletar)}
                disabled={deleting}
                className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Deletar'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
