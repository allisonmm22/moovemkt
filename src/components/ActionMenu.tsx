import { useState, useEffect, useRef } from 'react';
import { 
  ArrowRight, Tag, UserRound, Bell, XCircle, Layers, Search, UserPen
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Estagio {
  id: string;
  nome: string;
  funil_nome: string;
  cor: string;
}

interface ActionOption {
  id: string;
  type: 'etapa' | 'tag' | 'transferir' | 'notificar' | 'finalizar' | 'nome';
  label: string;
  description: string;
  icon: React.ElementType;
  value?: string;
  color?: string;
}

interface ActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (action: string) => void;
  position: { top: number; left: number };
  searchTerm: string;
}

export function ActionMenu({ isOpen, onClose, onSelect, position, searchTerm }: ActionMenuProps) {
  const { usuario } = useAuth();
  const [estagios, setEstagios] = useState<Estagio[]>([]);
  const [filteredOptions, setFilteredOptions] = useState<ActionOption[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Ações padrão
  const defaultActions: ActionOption[] = [
    {
      id: 'nome',
      type: 'nome',
      label: '@nome:',
      description: 'Alterar nome do contato/lead',
      icon: UserPen,
    },
    {
      id: 'tag',
      type: 'tag',
      label: '@tag:',
      description: 'Adicionar tag ao contato',
      icon: Tag,
    },
    {
      id: 'transferir-humano',
      type: 'transferir',
      label: '@transferir:humano',
      description: 'Transferir para atendente humano',
      icon: UserRound,
    },
    {
      id: 'transferir-ia',
      type: 'transferir',
      label: '@transferir:ia',
      description: 'Devolver para agente IA',
      icon: UserRound,
    },
    {
      id: 'notificar',
      type: 'notificar',
      label: '@notificar',
      description: 'Enviar notificação para equipe',
      icon: Bell,
    },
    {
      id: 'finalizar',
      type: 'finalizar',
      label: '@finalizar',
      description: 'Encerrar a conversa',
      icon: XCircle,
    },
  ];

  // Buscar estágios do CRM
  useEffect(() => {
    if (usuario?.conta_id && isOpen) {
      fetchEstagios();
    }
  }, [usuario?.conta_id, isOpen]);

  const fetchEstagios = async () => {
    try {
      const { data: funis, error: funisError } = await supabase
        .from('funis')
        .select('id, nome')
        .eq('conta_id', usuario!.conta_id)
        .order('ordem', { ascending: true });

      if (funisError) throw funisError;

      if (funis && funis.length > 0) {
        const { data: estagiosData, error: estagiosError } = await supabase
          .from('estagios')
          .select('id, nome, cor, funil_id')
          .in('funil_id', funis.map(f => f.id))
          .order('ordem', { ascending: true });

        if (estagiosError) throw estagiosError;

        const estagiosMapeados = (estagiosData || []).map(e => {
          const funil = funis.find(f => f.id === e.funil_id);
          return {
            id: e.id,
            nome: e.nome,
            funil_nome: funil?.nome || 'Funil',
            cor: e.cor || '#3b82f6',
          };
        });

        setEstagios(estagiosMapeados);
      }
    } catch (error) {
      console.error('Erro ao buscar estágios:', error);
    }
  };

  // Filtrar opções baseado no termo de busca
  useEffect(() => {
    const term = searchTerm.toLowerCase().replace('@', '');
    
    // Criar opções de estágios do CRM
    const etapaOptions: ActionOption[] = estagios.map(e => ({
      id: `etapa-${e.id}`,
      type: 'etapa',
      label: `@etapa:${e.nome.toLowerCase().replace(/\s+/g, '-')}`,
      description: `Mover para ${e.nome} (${e.funil_nome})`,
      icon: Layers,
      value: e.id,
      color: e.cor,
    }));

    // Combinar todas as opções
    const allOptions = [...etapaOptions, ...defaultActions];

    // Filtrar
    const filtered = allOptions.filter(opt => 
      opt.label.toLowerCase().includes(term) || 
      opt.description.toLowerCase().includes(term)
    );

    setFilteredOptions(filtered);
    setSelectedIndex(0);
  }, [searchTerm, estagios]);

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Navegação por teclado
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex(prev => 
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : filteredOptions.length - 1
          );
          break;
        case 'Enter':
        case 'Tab':
          event.preventDefault();
          if (filteredOptions[selectedIndex]) {
            onSelect(filteredOptions[selectedIndex].label);
          }
          break;
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredOptions, selectedIndex, onSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-80 max-h-64 overflow-hidden rounded-lg bg-popover border border-border shadow-xl animate-fade-in"
      style={{ 
        top: position.top, 
        left: position.left,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50">
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Ações Inteligentes
        </span>
      </div>

      {/* Lista de opções */}
      <div className="overflow-auto max-h-52">
        {filteredOptions.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Nenhuma ação encontrada
          </div>
        ) : (
          <div className="p-1">
            {/* Agrupar por tipo */}
            {estagios.length > 0 && filteredOptions.some(o => o.type === 'etapa') && (
              <div className="px-2 py-1">
                <span className="text-[10px] uppercase text-muted-foreground tracking-wider font-medium">
                  Etapas do CRM
                </span>
              </div>
            )}
            
            {filteredOptions.filter(o => o.type === 'etapa').map((option, index) => {
              const actualIndex = filteredOptions.findIndex(o => o.id === option.id);
              return (
                <button
                  key={option.id}
                  onClick={() => onSelect(option.label)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                    actualIndex === selectedIndex 
                      ? 'bg-primary/10 text-foreground' 
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <div 
                    className="flex items-center justify-center h-6 w-6 rounded"
                    style={{ backgroundColor: option.color + '20' }}
                  >
                    <option.icon className="h-3.5 w-3.5" style={{ color: option.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono truncate">{option.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{option.description}</div>
                  </div>
                </button>
              );
            })}

            {filteredOptions.some(o => o.type !== 'etapa') && (
              <div className="px-2 py-1 mt-2">
                <span className="text-[10px] uppercase text-muted-foreground tracking-wider font-medium">
                  Outras Ações
                </span>
              </div>
            )}

            {filteredOptions.filter(o => o.type !== 'etapa').map((option) => {
              const actualIndex = filteredOptions.findIndex(o => o.id === option.id);
              return (
                <button
                  key={option.id}
                  onClick={() => onSelect(option.label)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                    actualIndex === selectedIndex 
                      ? 'bg-primary/10 text-foreground' 
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-center h-6 w-6 rounded bg-muted">
                    <option.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono truncate">{option.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{option.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer com dica */}
      <div className="px-3 py-2 border-t border-border bg-muted/30">
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border">↑↓</kbd>
            navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border">Enter</kbd>
            selecionar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border">Esc</kbd>
            fechar
          </span>
        </div>
      </div>
    </div>
  );
}
