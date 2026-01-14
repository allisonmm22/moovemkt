import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  CreditCard, 
  Key, 
  Webhook, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  ExternalLink,
  CheckCheck
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';


const WEBHOOK_URL = `https://wjzqolnmdqmmcxejmunn.supabase.co/functions/v1/stripe-webhook`;

const EVENTOS_WEBHOOK = [
  'checkout.session.completed',
  'invoice.paid',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

export default function AdminPagamentos() {
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [status, setStatus] = useState({
    stripeConnected: false,
    stripeMode: 'test' as 'test' | 'live',
    webhookConfigured: false,
  });

  useEffect(() => {
    loadConfiguracoes();
  }, []);

  const loadConfiguracoes = async () => {
    try {
      const { data, error } = await supabase
        .from('configuracoes_plataforma')
        .select('*');

      if (error) throw error;

      const configs = data?.reduce((acc, item) => {
        acc[item.chave] = item.valor;
        return acc;
      }, {} as Record<string, string>) || {};

      setSecretKey(configs.stripe_secret_key || '');
      setWebhookSecret(configs.stripe_webhook_secret || '');
      
      const hasSecretKey = !!configs.stripe_secret_key;
      const isLive = configs.stripe_secret_key?.startsWith('sk_live_');
      
      setStatus({
        stripeConnected: hasSecretKey,
        stripeMode: isLive ? 'live' : 'test',
        webhookConfigured: !!configs.stripe_webhook_secret,
      });
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validações
    if (secretKey && !secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')) {
      toast.error('Secret Key inválida. Deve começar com sk_test_ ou sk_live_');
      return;
    }

    if (webhookSecret && !webhookSecret.startsWith('whsec_')) {
      toast.error('Webhook Secret inválido. Deve começar com whsec_');
      return;
    }

    setSaving(true);
    try {
      // Atualizar configurações
      const updates = [
        { chave: 'stripe_secret_key', valor: secretKey },
        { chave: 'stripe_webhook_secret', valor: webhookSecret },
        { chave: 'stripe_mode', valor: secretKey?.startsWith('sk_live_') ? 'live' : 'test' },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('configuracoes_plataforma')
          .update({ valor: update.valor })
          .eq('chave', update.chave);

        if (error) throw error;
      }

      toast.success('Configurações salvas com sucesso!');
      
      // Atualizar status
      setStatus({
        stripeConnected: !!secretKey,
        stripeMode: secretKey?.startsWith('sk_live_') ? 'live' : 'test',
        webhookConfigured: !!webhookSecret,
      });
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!secretKey) {
      toast.error('Configure a Secret Key primeiro');
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-test-connection', {
        body: { secret_key: secretKey }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Conexão OK! Conta: ${data.account_name || 'Stripe'}`);
        setStatus(prev => ({ ...prev, stripeConnected: true }));
      } else {
        toast.error(data?.message || 'Erro ao conectar com Stripe');
        setStatus(prev => ({ ...prev, stripeConnected: false }));
      }
    } catch (error: any) {
      console.error('Erro no teste:', error);
      toast.error('Erro ao testar conexão');
      setStatus(prev => ({ ...prev, stripeConnected: false }));
    } finally {
      setTesting(false);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    toast.success('URL copiada!');
    setTimeout(() => setCopied(false), 2000);
  };

  const maskValue = (value: string, showChars = 8) => {
    if (!value) return '';
    if (value.length <= showChars * 2) return value;
    return value.slice(0, showChars) + '****' + value.slice(-4);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <CreditCard className="h-8 w-8 text-primary" />
            Configuração de Pagamentos
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure a integração com Stripe para processar pagamentos
          </p>
        </div>

        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Status da Integração
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Stripe API:</span>
                {status.stripeConnected ? (
                  <Badge variant="default" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Conectado ({status.stripeMode === 'live' ? 'Produção' : 'Teste'})
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-muted text-muted-foreground">
                    <XCircle className="h-3 w-3 mr-1" />
                    Não configurado
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Webhook:</span>
                {status.webhookConfigured ? (
                  <Badge variant="default" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Configurado
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Pendente
                  </Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testing || !secretKey}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Testar Conexão
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Credenciais */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="h-5 w-5" />
              Credenciais do Stripe
            </CardTitle>
            <CardDescription>
              Obtenha suas chaves em{' '}
              <a 
                href="https://dashboard.stripe.com/apikeys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                dashboard.stripe.com/apikeys
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="secretKey">Stripe Secret Key</Label>
              <p className="text-xs text-muted-foreground">
                Começa com <code className="bg-muted px-1 rounded">sk_test_</code> (teste) ou{' '}
                <code className="bg-muted px-1 rounded">sk_live_</code> (produção)
              </p>
              <div className="relative">
                <Input
                  id="secretKey"
                  type={showSecretKey ? 'text' : 'password'}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="sk_test_..."
                  className="pr-10 font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                >
                  {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhookSecret">Stripe Webhook Secret</Label>
              <p className="text-xs text-muted-foreground">
                Começa com <code className="bg-muted px-1 rounded">whsec_</code> - obtido após criar o webhook (passo 3)
              </p>
              <div className="relative">
                <Input
                  id="webhookSecret"
                  type={showWebhookSecret ? 'text' : 'password'}
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="whsec_..."
                  className="pr-10 font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                >
                  {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCheck className="h-4 w-4 mr-2" />
              )}
              Salvar Configurações
            </Button>
          </CardContent>
        </Card>

        {/* Webhook Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Configuração do Webhook
            </CardTitle>
            <CardDescription>
              Configure o webhook no Stripe Dashboard para receber notificações de pagamento
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>URL do Webhook</Label>
              <p className="text-xs text-muted-foreground">
                Copie esta URL e cole no Stripe Dashboard ao criar o webhook
              </p>
              <div className="flex gap-2">
                <Input
                  value={WEBHOOK_URL}
                  readOnly
                  className="font-mono text-xs bg-muted"
                />
                <Button variant="outline" onClick={copyWebhookUrl}>
                  {copied ? (
                    <CheckCheck className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Eventos a selecionar no Stripe</Label>
              <p className="text-xs text-muted-foreground">
                Ao criar o webhook, selecione estes eventos:
              </p>
              <div className="flex flex-wrap gap-2">
                {EVENTOS_WEBHOOK.map((evento) => (
                  <Badge key={evento} variant="secondary" className="font-mono text-xs">
                    {evento}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">📖 Passo a Passo</CardTitle>
            <CardDescription>
              Siga estas instruções para configurar o Stripe corretamente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Obter Secret Key</h4>
                  <ul className="text-sm text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                    <li>Acesse <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">dashboard.stripe.com</a></li>
                    <li>Vá em <strong>Developers → API Keys</strong></li>
                    <li>Copie a <strong>"Secret key"</strong> (começa com sk_test_ ou sk_live_)</li>
                    <li>Cole no campo "Stripe Secret Key" acima</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Criar Webhook</h4>
                  <ul className="text-sm text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                    <li>No Stripe, vá em <strong>Developers → Webhooks</strong></li>
                    <li>Clique em <strong>"Add endpoint"</strong></li>
                    <li>Cole a URL do Webhook (copiada acima)</li>
                    <li>Em "Select events", marque os 4 eventos listados</li>
                    <li>Clique em <strong>"Add endpoint"</strong></li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                  3
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Copiar Signing Secret</h4>
                  <ul className="text-sm text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                    <li>Após criar o webhook, clique nele para abrir os detalhes</li>
                    <li>Localize <strong>"Signing secret"</strong> e clique em <strong>"Reveal"</strong></li>
                    <li>Copie o valor (começa com whsec_)</li>
                    <li>Cole no campo "Webhook Secret" acima</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                  4
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Salvar e Testar</h4>
                  <ul className="text-sm text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                    <li>Clique em <strong>"Salvar Configurações"</strong></li>
                    <li>Clique em <strong>"Testar Conexão"</strong> para verificar</li>
                    <li>O status deve mudar para ✅ Conectado</li>
                  </ul>
                </div>
              </div>

              <Separator />

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                <h4 className="font-semibold text-amber-500 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Modo Teste vs Produção
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Use chaves <code className="bg-muted px-1 rounded">sk_test_</code> para testar pagamentos sem cobranças reais.
                  Quando estiver pronto para aceitar pagamentos reais, substitua pelas chaves <code className="bg-muted px-1 rounded">sk_live_</code>.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}