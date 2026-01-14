import { useState, useEffect } from 'react';
import { X, MessageSquare, Bot, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface FollowupRegra {
  id?: string;
  nome: string;
  tipo: 'texto_fixo' | 'contextual_ia';
  mensagem_fixa: string;
  prompt_followup: string;
  quantidade_mensagens_contexto: number;
  horas_sem_resposta: number;
  max_tentativas: number;
  intervalo_entre_tentativas: number;
  aplicar_ia_ativa: boolean;
  aplicar_ia_pausada: boolean;
  agent_ia_id: string | null;
}

interface Agent {
  id: string;
  nome: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regra?: FollowupRegra | null;
  onSave: () => void;
}

type UnidadeTempo = 'minutos' | 'horas';

export function FollowUpRegraModal({ open, onOpenChange, regra, onSave }: Props) {
  const { usuario } = useAuth();
  const [saving, setSaving] = useState(false);
  const [agentes, setAgentes] = useState<Agent[]>([]);
  const [unidadeTempoEspera, setUnidadeTempoEspera] = useState<UnidadeTempo>('minutos');
  const [unidadeIntervalo, setUnidadeIntervalo] = useState<UnidadeTempo>('minutos');
  
  const [form, setForm] = useState<FollowupRegra>({
    nome: '',
    tipo: 'texto_fixo',
    mensagem_fixa: '',
    prompt_followup: 'Você é um assistente fazendo follow-up de uma conversa.\nAnalise o contexto e gere uma mensagem breve e amigável para retomar o contato.\nPergunte algo relacionado ao último assunto discutido.\nSeja direto e profissional. Máximo 2 frases.',
    quantidade_mensagens_contexto: 10,
    horas_sem_resposta: 30, // 30 minutos default
    max_tentativas: 3,
    intervalo_entre_tentativas: 60, // 60 minutos default
    aplicar_ia_ativa: true,
    aplicar_ia_pausada: false,
    agent_ia_id: null,
  });

  // Detectar se valor parece ser em horas (>= 60) ou minutos
  const detectarUnidade = (valorMinutos: number): { valor: number; unidade: UnidadeTempo } => {
    if (valorMinutos >= 60 && valorMinutos % 60 === 0) {
      return { valor: valorMinutos / 60, unidade: 'horas' };
    }
    return { valor: valorMinutos, unidade: 'minutos' };
  };

  useEffect(() => {
    if (regra) {
      const tempoEspera = detectarUnidade(regra.horas_sem_resposta);
      const intervalo = detectarUnidade(regra.intervalo_entre_tentativas);
      
      setUnidadeTempoEspera(tempoEspera.unidade);
      setUnidadeIntervalo(intervalo.unidade);
      
      setForm({
        ...regra,
        mensagem_fixa: regra.mensagem_fixa || '',
        prompt_followup: regra.prompt_followup || 'Você é um assistente fazendo follow-up de uma conversa.\nAnalise o contexto e gere uma mensagem breve e amigável para retomar o contato.\nPergunte algo relacionado ao último assunto discutido.\nSeja direto e profissional. Máximo 2 frases.',
        horas_sem_resposta: tempoEspera.valor,
        intervalo_entre_tentativas: intervalo.valor,
      });
    } else {
      setUnidadeTempoEspera('minutos');
      setUnidadeIntervalo('minutos');
      setForm({
        nome: '',
        tipo: 'texto_fixo',
        mensagem_fixa: '',
        prompt_followup: 'Você é um assistente fazendo follow-up de uma conversa.\nAnalise o contexto e gere uma mensagem breve e amigável para retomar o contato.\nPergunte algo relacionado ao último assunto discutido.\nSeja direto e profissional. Máximo 2 frases.',
        quantidade_mensagens_contexto: 10,
        horas_sem_resposta: 30,
        max_tentativas: 3,
        intervalo_entre_tentativas: 60,
        aplicar_ia_ativa: true,
        aplicar_ia_pausada: false,
        agent_ia_id: null,
      });
    }
  }, [regra, open]);

  // Converter para minutos antes de salvar
  const converterParaMinutos = (valor: number, unidade: UnidadeTempo): number => {
    return unidade === 'horas' ? valor * 60 : valor;
  };

  useEffect(() => {
    if (usuario?.conta_id && open) {
      fetchAgentes();
    }
  }, [usuario?.conta_id, open]);

  const fetchAgentes = async () => {
    const { data } = await supabase
      .from('agent_ia')
      .select('id, nome')
      .eq('conta_id', usuario!.conta_id)
      .eq('ativo', true);
    
    setAgentes(data || []);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast.error('Digite um nome para a regra');
      return;
    }

    if (form.tipo === 'texto_fixo' && !form.mensagem_fixa.trim()) {
      toast.error('Digite a mensagem fixa');
      return;
    }

    if (form.tipo === 'contextual_ia' && !form.prompt_followup.trim()) {
      toast.error('Digite o prompt de follow-up');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        conta_id: usuario!.conta_id,
        nome: form.nome,
        tipo: form.tipo,
        mensagem_fixa: form.tipo === 'texto_fixo' ? form.mensagem_fixa : null,
        prompt_followup: form.tipo === 'contextual_ia' ? form.prompt_followup : null,
        quantidade_mensagens_contexto: form.quantidade_mensagens_contexto,
        horas_sem_resposta: converterParaMinutos(form.horas_sem_resposta, unidadeTempoEspera),
        max_tentativas: form.max_tentativas,
        intervalo_entre_tentativas: converterParaMinutos(form.intervalo_entre_tentativas, unidadeIntervalo),
        aplicar_ia_ativa: form.aplicar_ia_ativa,
        aplicar_ia_pausada: form.aplicar_ia_pausada,
        agent_ia_id: form.agent_ia_id,
      };

      if (regra?.id) {
        const { error } = await supabase
          .from('followup_regras')
          .update(payload)
          .eq('id', regra.id);
        
        if (error) throw error;
        toast.success('Regra atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('followup_regras')
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {regra?.id ? 'Editar Regra de Follow-up' : 'Nova Regra de Follow-up'}
          </h2>
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
              placeholder="Ex: Follow-up 24h"
              className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              Tipo de Follow-up
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
                  <p className="text-xs text-muted-foreground">Mensagem pré-definida</p>
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
                    Contextual (IA)
                  </p>
                  <p className="text-xs text-muted-foreground">IA gera baseado na conversa</p>
                </div>
              </button>
            </div>
          </div>

          {/* Mensagem Fixa */}
          {form.tipo === 'texto_fixo' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Mensagem de Follow-up
              </label>
              <textarea
                value={form.mensagem_fixa}
                onChange={(e) => setForm({ ...form, mensagem_fixa: e.target.value })}
                placeholder="Digite a mensagem que será enviada..."
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          )}

          {/* Prompt Contextual */}
          {form.tipo === 'contextual_ia' && (
            <>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Prompt para a IA
                </label>
                <textarea
                  value={form.prompt_followup}
                  onChange={(e) => setForm({ ...form, prompt_followup: e.target.value })}
                  placeholder="Instruções para a IA gerar o follow-up..."
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  A IA usará as últimas mensagens da conversa como contexto
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Quantidade de mensagens de contexto: {form.quantidade_mensagens_contexto}
                </label>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={form.quantidade_mensagens_contexto}
                  onChange={(e) => setForm({ ...form, quantidade_mensagens_contexto: parseInt(e.target.value) })}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>1 mensagem</span>
                  <span>30 mensagens</span>
                </div>
              </div>
            </>
          )}

          {/* Configurações de Tempo */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Tempo sem resposta
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={form.horas_sem_resposta}
                  onChange={(e) => setForm({ ...form, horas_sem_resposta: parseInt(e.target.value) || 1 })}
                  className="flex-1 h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <select
                  value={unidadeTempoEspera}
                  onChange={(e) => setUnidadeTempoEspera(e.target.value as UnidadeTempo)}
                  className="w-28 h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="minutos">minutos</option>
                  <option value="horas">horas</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Máx. tentativas
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={form.max_tentativas}
                  onChange={(e) => setForm({ ...form, max_tentativas: parseInt(e.target.value) || 1 })}
                  className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Intervalo entre tentativas
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    value={form.intervalo_entre_tentativas}
                    onChange={(e) => setForm({ ...form, intervalo_entre_tentativas: parseInt(e.target.value) || 1 })}
                    className="flex-1 h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <select
                    value={unidadeIntervalo}
                    onChange={(e) => setUnidadeIntervalo(e.target.value as UnidadeTempo)}
                    className="w-28 h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="minutos">minutos</option>
                    <option value="horas">horas</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              Aplicar em conversas com
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.aplicar_ia_ativa}
                  onChange={(e) => setForm({ ...form, aplicar_ia_ativa: e.target.checked })}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-foreground">IA Ativa</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.aplicar_ia_pausada}
                  onChange={(e) => setForm({ ...form, aplicar_ia_pausada: e.target.checked })}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-foreground">IA Pausada / Humano</span>
              </label>
            </div>
          </div>

          {/* Agente vinculado (opcional) */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Vincular a um agente (opcional)
            </label>
            <select
              value={form.agent_ia_id || ''}
              onChange={(e) => setForm({ ...form, agent_ia_id: e.target.value || null })}
              className="w-full h-10 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Nenhum (aplica a todas as conversas)</option>
              {agentes.map((agente) => (
                <option key={agente.id} value={agente.id}>
                  {agente.nome}
                </option>
              ))}
            </select>
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
            {regra?.id ? 'Salvar Alterações' : 'Criar Regra'}
          </button>
        </div>
      </div>
    </div>
  );
}
