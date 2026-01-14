import { useState, useEffect } from 'react';
import { X, MessageSquare, Bot, Loader2, Bell, Calendar, Link as LinkIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface LembreteRegra {
  id?: string;
  nome: string;
  minutos_antes: number;
  tipo: 'texto_fixo' | 'contextual_ia';
  mensagem_fixa: string;
  prompt_lembrete: string;
  incluir_link_meet: boolean;
  incluir_detalhes: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regra?: LembreteRegra | null;
  onSave: () => void;
}

const TEMPO_OPTIONS = [
  { value: 5, label: '5 minutos antes' },
  { value: 15, label: '15 minutos antes' },
  { value: 30, label: '30 minutos antes' },
  { value: 60, label: '1 hora antes' },
  { value: 120, label: '2 horas antes' },
  { value: 180, label: '3 horas antes' },
  { value: 300, label: '5 horas antes' },
  { value: 1440, label: '1 dia antes' },
];

const VARIAVEIS_DISPONIVEIS = [
  { var: '{{nome_contato}}', desc: 'Nome do lead' },
  { var: '{{titulo}}', desc: 'Título do agendamento' },
  { var: '{{data}}', desc: 'Data da reunião' },
  { var: '{{hora}}', desc: 'Hora da reunião' },
  { var: '{{link_meet}}', desc: 'Link do Google Meet' },
  { var: '{{descricao}}', desc: 'Descrição do agendamento' },
];

export function LembreteRegraModal({ open, onOpenChange, regra, onSave }: Props) {
  const { usuario } = useAuth();
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState<LembreteRegra>({
    nome: '',
    minutos_antes: 30,
    tipo: 'texto_fixo',
    mensagem_fixa: 'Olá {{nome_contato}}! 👋\n\nEste é um lembrete sobre sua reunião agendada:\n\n📅 *{{titulo}}*\n🕐 {{data}} às {{hora}}\n\n{{link_meet}}\n\nNos vemos em breve! 😊',
    prompt_lembrete: 'Você é um assistente enviando um lembrete de reunião.\nGere uma mensagem breve e amigável lembrando o lead sobre o agendamento.\nInclua o título, data, hora e link do meet se disponível.\nSeja direto e profissional. Máximo 3 frases.',
    incluir_link_meet: true,
    incluir_detalhes: true,
  });

  useEffect(() => {
    if (regra) {
      setForm({
        ...regra,
        mensagem_fixa: regra.mensagem_fixa || '',
        prompt_lembrete: regra.prompt_lembrete || 'Você é um assistente enviando um lembrete de reunião.\nGere uma mensagem breve e amigável lembrando o lead sobre o agendamento.\nInclua o título, data, hora e link do meet se disponível.\nSeja direto e profissional. Máximo 3 frases.',
      });
    } else {
      setForm({
        nome: '',
        minutos_antes: 30,
        tipo: 'texto_fixo',
        mensagem_fixa: 'Olá {{nome_contato}}! 👋\n\nEste é um lembrete sobre sua reunião agendada:\n\n📅 *{{titulo}}*\n🕐 {{data}} às {{hora}}\n\n{{link_meet}}\n\nNos vemos em breve! 😊',
        prompt_lembrete: 'Você é um assistente enviando um lembrete de reunião.\nGere uma mensagem breve e amigável lembrando o lead sobre o agendamento.\nInclua o título, data, hora e link do meet se disponível.\nSeja direto e profissional. Máximo 3 frases.',
        incluir_link_meet: true,
        incluir_detalhes: true,
      });
    }
  }, [regra, open]);

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast.error('Digite um nome para a regra');
      return;
    }

    if (form.tipo === 'texto_fixo' && !form.mensagem_fixa.trim()) {
      toast.error('Digite a mensagem do lembrete');
      return;
    }

    if (form.tipo === 'contextual_ia' && !form.prompt_lembrete.trim()) {
      toast.error('Digite o prompt de lembrete');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        conta_id: usuario!.conta_id,
        nome: form.nome,
        minutos_antes: form.minutos_antes,
        tipo: form.tipo,
        mensagem_fixa: form.tipo === 'texto_fixo' ? form.mensagem_fixa : null,
        prompt_lembrete: form.tipo === 'contextual_ia' ? form.prompt_lembrete : null,
        incluir_link_meet: form.incluir_link_meet,
        incluir_detalhes: form.incluir_detalhes,
      };

      if (regra?.id) {
        const { error } = await supabase
          .from('lembrete_regras')
          .update(payload)
          .eq('id', regra.id);
        
        if (error) throw error;
        toast.success('Regra atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('lembrete_regras')
          .insert(payload);
        
        if (error) throw error;
        toast.success('Regra criada com sucesso!');
      }

      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao salvar regra:', error);
      toast.error('Erro ao salvar regra');
    } finally {
      setSaving(false);
    }
  };

  const inserirVariavel = (variavel: string) => {
    setForm(prev => ({
      ...prev,
      mensagem_fixa: prev.mensagem_fixa + variavel
    }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Bell className="h-5 w-5 text-amber-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {regra?.id ? 'Editar Lembrete' : 'Novo Lembrete de Agendamento'}
            </h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Nome da Regra
            </label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Lembrete 30 minutos antes"
              className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Tempo antes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Quando enviar o lembrete
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TEMPO_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, minutos_antes: opt.value })}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-colors text-sm ${
                    form.minutos_antes === opt.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-muted-foreground text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              Tipo de Mensagem
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, tipo: 'texto_fixo' })}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors ${
                  form.tipo === 'texto_fixo'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                <MessageSquare className={`h-5 w-5 ${form.tipo === 'texto_fixo' ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="text-left">
                  <p className={`font-medium ${form.tipo === 'texto_fixo' ? 'text-primary' : 'text-foreground'}`}>
                    Texto Fixo
                  </p>
                  <p className="text-xs text-muted-foreground">Template com variáveis</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setForm({ ...form, tipo: 'contextual_ia' })}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors ${
                  form.tipo === 'contextual_ia'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                <Bot className={`h-5 w-5 ${form.tipo === 'contextual_ia' ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="text-left">
                  <p className={`font-medium ${form.tipo === 'contextual_ia' ? 'text-primary' : 'text-foreground'}`}>
                    IA Contextual
                  </p>
                  <p className="text-xs text-muted-foreground">IA gera mensagem</p>
                </div>
              </button>
            </div>
          </div>

          {/* Mensagem Fixa */}
          {form.tipo === 'texto_fixo' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Mensagem do Lembrete
              </label>
              <textarea
                value={form.mensagem_fixa}
                onChange={(e) => setForm({ ...form, mensagem_fixa: e.target.value })}
                placeholder="Digite a mensagem que será enviada..."
                rows={6}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              
              {/* Variáveis disponíveis */}
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-2">Variáveis disponíveis (clique para inserir):</p>
                <div className="flex flex-wrap gap-2">
                  {VARIAVEIS_DISPONIVEIS.map((v) => (
                    <button
                      key={v.var}
                      type="button"
                      onClick={() => inserirVariavel(v.var)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs text-muted-foreground hover:bg-muted/80 transition-colors"
                      title={v.desc}
                    >
                      <code>{v.var}</code>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Prompt Contextual */}
          {form.tipo === 'contextual_ia' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Prompt para a IA
              </label>
              <textarea
                value={form.prompt_lembrete}
                onChange={(e) => setForm({ ...form, prompt_lembrete: e.target.value })}
                placeholder="Instruções para a IA gerar o lembrete..."
                rows={5}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                A IA receberá os detalhes do agendamento automaticamente
              </p>
            </div>
          )}

          {/* Opções adicionais */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">
              Opções adicionais
            </label>
            
            <label className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={form.incluir_link_meet}
                onChange={(e) => setForm({ ...form, incluir_link_meet: e.target.checked })}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <LinkIcon className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Incluir link do Google Meet</p>
                <p className="text-xs text-muted-foreground">Adiciona automaticamente o link da reunião quando disponível</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={form.incluir_detalhes}
                onChange={(e) => setForm({ ...form, incluir_detalhes: e.target.checked })}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Incluir detalhes do agendamento</p>
                <p className="text-xs text-muted-foreground">Adiciona título e descrição do agendamento</p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <button
            onClick={() => onOpenChange(false)}
            className="h-10 px-4 rounded-lg border border-border text-foreground font-medium hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {regra?.id ? 'Salvar' : 'Criar Regra'}
          </button>
        </div>
      </div>
    </div>
  );
}
