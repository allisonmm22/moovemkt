import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Smartphone, Building2, Instagram } from 'lucide-react';

interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  limite_usuarios: number;
  limite_agentes: number;
  limite_funis: number;
  limite_conexoes_whatsapp: number;
  limite_conexoes_evolution: number;
  limite_conexoes_meta: number;
  limite_mensagens_mes: number;
  permite_instagram: boolean;
  preco_mensal: number;
  ativo: boolean;
}

interface NovoPlanoModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  plano: Plano | null;
}

export default function NovoPlanoModal({ open, onClose, onSuccess, plano }: NovoPlanoModalProps) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [limiteUsuarios, setLimiteUsuarios] = useState(1);
  const [limiteAgentes, setLimiteAgentes] = useState(1);
  const [limiteFunis, setLimiteFunis] = useState(1);
  const [limiteConexoesEvolution, setLimiteConexoesEvolution] = useState(1);
  const [limiteConexoesMeta, setLimiteConexoesMeta] = useState(0);
  const [limiteMensagensMes, setLimiteMensagensMes] = useState(10000);
  const [permiteInstagram, setPermiteInstagram] = useState(false);
  const [precoMensal, setPrecoMensal] = useState(0);
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (plano) {
      setNome(plano.nome);
      setDescricao(plano.descricao || '');
      setLimiteUsuarios(plano.limite_usuarios);
      setLimiteAgentes(plano.limite_agentes);
      setLimiteFunis(plano.limite_funis);
      setLimiteConexoesEvolution(plano.limite_conexoes_evolution ?? plano.limite_conexoes_whatsapp);
      setLimiteConexoesMeta(plano.limite_conexoes_meta ?? 0);
      setLimiteMensagensMes(plano.limite_mensagens_mes ?? 10000);
      setPermiteInstagram(plano.permite_instagram ?? false);
      setPrecoMensal(plano.preco_mensal);
      setAtivo(plano.ativo);
    } else {
      resetForm();
    }
  }, [plano, open]);

  const resetForm = () => {
    setNome('');
    setDescricao('');
    setLimiteUsuarios(1);
    setLimiteAgentes(1);
    setLimiteFunis(1);
    setLimiteConexoesEvolution(1);
    setLimiteConexoesMeta(0);
    setLimiteMensagensMes(10000);
    setPermiteInstagram(false);
    setPrecoMensal(0);
    setAtivo(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nome.trim()) {
      toast.error('Nome do plano é obrigatório');
      return;
    }

    setSaving(true);

    try {
      const totalConexoes = limiteConexoesEvolution + limiteConexoesMeta;
      
      const planoData = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        limite_usuarios: limiteUsuarios,
        limite_agentes: limiteAgentes,
        limite_funis: limiteFunis,
        limite_conexoes_whatsapp: totalConexoes, // Mantém compatibilidade
        limite_conexoes_evolution: limiteConexoesEvolution,
        limite_conexoes_meta: limiteConexoesMeta,
        limite_mensagens_mes: limiteMensagensMes,
        permite_instagram: permiteInstagram,
        preco_mensal: precoMensal,
        ativo
      };

      if (plano) {
        const { error } = await supabase
          .from('planos')
          .update(planoData)
          .eq('id', plano.id);

        if (error) throw error;
        toast.success('Plano atualizado com sucesso');
      } else {
        const { error } = await supabase
          .from('planos')
          .insert(planoData);

        if (error) throw error;
        toast.success('Plano criado com sucesso');
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao salvar plano:', error);
      toast.error('Erro ao salvar plano');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plano ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome do Plano</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Pro, Business..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição do plano..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preco">Preço Mensal (R$)</Label>
            <Input
              id="preco"
              type="number"
              min="0"
              step="0.01"
              value={precoMensal}
              onChange={(e) => setPrecoMensal(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="usuarios">Limite Usuários</Label>
              <Input
                id="usuarios"
                type="number"
                min="1"
                value={limiteUsuarios}
                onChange={(e) => setLimiteUsuarios(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agentes">Limite Agentes IA</Label>
              <Input
                id="agentes"
                type="number"
                min="1"
                value={limiteAgentes}
                onChange={(e) => setLimiteAgentes(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="funis">Limite Funis CRM</Label>
            <Input
              id="funis"
              type="number"
              min="1"
              value={limiteFunis}
              onChange={(e) => setLimiteFunis(parseInt(e.target.value) || 1)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mensagens">Limite Mensagens/Mês</Label>
            <Input
              id="mensagens"
              type="number"
              min="100"
              value={limiteMensagensMes}
              onChange={(e) => setLimiteMensagensMes(parseInt(e.target.value) || 10000)}
            />
            <p className="text-xs text-muted-foreground">Use 999999 para ilimitado</p>
          </div>

          {/* Seção de Conexões */}
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Conexões
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="evolution" className="text-sm flex items-center gap-2">
                <Smartphone className="h-3 w-3 text-emerald-500" />
                Evolution API (QR Code)
              </Label>
              <Input
                id="evolution"
                type="number"
                min="0"
                value={limiteConexoesEvolution}
                onChange={(e) => setLimiteConexoesEvolution(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">Conexões via QR Code (não oficial)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meta" className="text-sm flex items-center gap-2">
                <Building2 className="h-3 w-3 text-blue-500" />
                Meta API (Oficial)
              </Label>
              <Input
                id="meta"
                type="number"
                min="0"
                value={limiteConexoesMeta}
                onChange={(e) => setLimiteConexoesMeta(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">Conexões oficiais da Meta (requer aprovação)</p>
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Instagram className="h-4 w-4 text-pink-500" />
                <div>
                  <Label htmlFor="instagram" className="text-sm">Permite Instagram</Label>
                  <p className="text-xs text-muted-foreground">Conexões com Instagram Direct</p>
                </div>
              </div>
              <Switch
                id="instagram"
                checked={permiteInstagram}
                onCheckedChange={setPermiteInstagram}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Use 999 para limites "ilimitados"
          </p>

          <div className="flex items-center justify-between">
            <Label htmlFor="ativo">Plano Ativo</Label>
            <Switch
              id="ativo"
              checked={ativo}
              onCheckedChange={setAtivo}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? 'Salvando...' : plano ? 'Salvar' : 'Criar Plano'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
