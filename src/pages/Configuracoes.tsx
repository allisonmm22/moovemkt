import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Building, Save, Loader2, Bell, Volume2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { requestNotificationPermission } from '@/lib/notificationSound';
import { useIsMobile } from '@/hooks/use-mobile';

export default function Configuracoes() {
  const { usuario } = useAuth();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [contaData, setContaData] = useState({
    nome: '',
  });

  const { 
    soundEnabled, 
    browserEnabled, 
    setSoundEnabled, 
    setBrowserEnabled 
  } = useNotificationPreferences();

  useEffect(() => {
    if (usuario) {
      fetchConta();
    }
  }, [usuario]);

  const fetchConta = async () => {
    const { data } = await supabase
      .from('contas')
      .select('nome')
      .eq('id', usuario!.conta_id)
      .single();

    if (data) {
      setContaData({ nome: data.nome });
    }
  };

  const handleSaveConta = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('contas')
        .update({ nome: contaData.nome })
        .eq('id', usuario!.conta_id);

      if (error) throw error;
      toast.success('Conta atualizada!');
    } catch (error) {
      toast.error('Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  const handleBrowserNotificationToggle = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        toast.error('Permissão de notificação negada pelo navegador');
        return;
      }
    }
    setBrowserEnabled(enabled);
    toast.success(enabled ? 'Notificações do navegador ativadas' : 'Notificações do navegador desativadas');
  };

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    toast.success(enabled ? 'Notificações sonoras ativadas' : 'Notificações sonoras desativadas');
  };

  return (
    <MainLayout>
      <div className={`max-w-2xl space-y-6 md:space-y-8 animate-fade-in ${isMobile ? 'px-4 py-4' : ''}`}>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Gerencie suas preferências e configurações da conta.
          </p>
        </div>

        {/* Notificações */}
        <div className="p-4 md:p-6 rounded-xl bg-card border border-border space-y-4 md:space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 flex-shrink-0">
              <Bell className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Notificações</h2>
              <p className="text-sm text-muted-foreground">Configure alertas de novas mensagens</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Som */}
            <div className="flex items-center justify-between gap-3 p-3 md:p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-3 min-w-0">
                <Volume2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm md:text-base">Notificação Sonora</p>
                  <p className="text-xs md:text-sm text-muted-foreground truncate">Tocar som quando nova mensagem chegar</p>
                </div>
              </div>
              <button
                onClick={() => handleSoundToggle(!soundEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                  soundEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    soundEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Browser */}
            <div className="flex items-center justify-between gap-3 p-3 md:p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-3 min-w-0">
                <Bell className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm md:text-base">Notificação do Navegador</p>
                  <p className="text-xs md:text-sm text-muted-foreground truncate">Mostrar notificação push</p>
                </div>
              </div>
              <button
                onClick={() => handleBrowserNotificationToggle(!browserEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                  browserEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    browserEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            As notificações são enviadas apenas para conversas atendidas por humanos.
          </p>
        </div>

        {/* Conta */}
        <div className="p-4 md:p-6 rounded-xl bg-card border border-border space-y-4 md:space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/20 flex-shrink-0">
              <Building className="h-5 w-5 text-warning" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Conta</h2>
              <p className="text-sm text-muted-foreground">Configurações da sua empresa</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Nome da Empresa
            </label>
            <input
              type="text"
              value={contaData.nome}
              onChange={(e) => setContaData({ ...contaData, nome: e.target.value })}
              className="w-full h-11 px-4 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            onClick={handleSaveConta}
            disabled={loading}
            className="w-full md:w-auto h-10 px-6 rounded-lg bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4" />
                Salvar Conta
              </>
            )}
          </button>
        </div>
      </div>
    </MainLayout>
  );
}
