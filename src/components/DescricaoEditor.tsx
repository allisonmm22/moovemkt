import { useRef, useCallback, useEffect, useState, useMemo, memo, forwardRef } from 'react';
import { Tag, Bot, UserRound, Globe, Layers, Bell, Package, StopCircle, UserPen, Handshake, X, CalendarSearch, CalendarPlus, FileEdit, FileSearch, ArrowRightCircle, UserCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DescricaoEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onAcaoClick?: (cursorPosition: number) => void;
  onCursorChange?: (position: number) => void;
}

interface ChipConfig {
  icon: React.ElementType;
  label: string;
  colorClass: string;
  bgClass: string;
}

// Parse ação para config visual - memoizado por ação
const acaoConfigCache = new Map<string, ChipConfig>();

function parseAcao(acao: string): ChipConfig {
  const cached = acaoConfigCache.get(acao);
  if (cached) return cached;
  
  const acaoLower = acao.toLowerCase();
  let config: ChipConfig;
  
  if (acaoLower.startsWith('@nome:')) {
    const valor = acao.replace(/^@nome:/i, '');
    config = {
      icon: UserPen,
      label: `Alterar Nome: ${valor}`,
      colorClass: 'text-amber-700 dark:text-amber-400',
      bgClass: 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700',
    };
  } else if (acaoLower === '@nome') {
    config = {
      icon: UserPen,
      label: 'Capturar Nome',
      colorClass: 'text-amber-700 dark:text-amber-400',
      bgClass: 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700',
    };
  } else if (acaoLower.startsWith('@tag:')) {
    const valor = acao.replace(/^@tag:/i, '');
    config = {
      icon: Tag,
      label: `Adicionar Tag: ${valor}`,
      colorClass: 'text-blue-700 dark:text-blue-400',
      bgClass: 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700',
    };
  } else if (acaoLower.startsWith('@negociacao:')) {
    const valor = acao.replace(/^@negociacao:/i, '');
    config = {
      icon: Handshake,
      label: `Criar Negociação: ${valor}`,
      colorClass: 'text-orange-700 dark:text-orange-400',
      bgClass: 'bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700',
    };
  } else if (acaoLower.startsWith('@etapa:')) {
    const valor = acao.replace(/^@etapa:/i, '');
    config = {
      icon: Layers,
      label: `Mover para Estágio: ${valor}`,
      colorClass: 'text-purple-700 dark:text-purple-400',
      bgClass: 'bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700',
    };
  } else if (acaoLower.startsWith('@transferir:humano') || acaoLower.startsWith('@transferir:usuario:')) {
    const valor = acaoLower === '@transferir:humano' 
      ? 'Atendente' 
      : acao.replace(/^@transferir:usuario:/i, '');
    config = {
      icon: UserRound,
      label: `Transferir para: ${valor}`,
      colorClass: 'text-green-700 dark:text-green-400',
      bgClass: 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700',
    };
  } else if (acaoLower.startsWith('@transferir:ia') || acaoLower.startsWith('@transferir:agente:')) {
    const valor = acaoLower === '@transferir:ia' 
      ? 'IA Principal' 
      : acao.replace(/^@transferir:agente:/i, '');
    config = {
      icon: Bot,
      label: `Transferir Agente: ${valor}`,
      colorClass: 'text-indigo-700 dark:text-indigo-400',
      bgClass: 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700',
    };
  } else if (acaoLower.startsWith('@fonte:')) {
    const valor = acao.replace(/^@fonte:/i, '');
    config = {
      icon: Globe,
      label: `Atribuir Fonte: ${valor}`,
      colorClass: 'text-teal-700 dark:text-teal-400',
      bgClass: 'bg-teal-100 dark:bg-teal-900/40 border-teal-300 dark:border-teal-700',
    };
  } else if (acaoLower.startsWith('@notificar:')) {
    const valor = acao.replace(/^@notificar:/i, '');
    config = {
      icon: Bell,
      label: `Notificar: ${valor.substring(0, 30)}${valor.length > 30 ? '...' : ''}`,
      colorClass: 'text-red-700 dark:text-red-400',
      bgClass: 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700',
    };
  } else if (acaoLower.startsWith('@produto:')) {
    const valor = acao.replace(/^@produto:/i, '');
    config = {
      icon: Package,
      label: `Atribuir Produto: ${valor}`,
      colorClass: 'text-emerald-700 dark:text-emerald-400',
      bgClass: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700',
    };
  } else if (acaoLower === '@finalizar') {
    config = {
      icon: StopCircle,
      label: 'Interromper Agente',
      colorClass: 'text-gray-700 dark:text-gray-400',
      bgClass: 'bg-gray-100 dark:bg-gray-800/50 border-gray-300 dark:border-gray-600',
    };
  } else if (acaoLower.startsWith('@agenda:consultar:')) {
    const valor = acao.replace(/^@agenda:consultar:/i, '');
    config = {
      icon: CalendarSearch,
      label: `Consultar Agenda: ${valor}`,
      colorClass: 'text-sky-700 dark:text-sky-400',
      bgClass: 'bg-sky-100 dark:bg-sky-900/40 border-sky-300 dark:border-sky-700',
    };
  } else if (acaoLower === '@agenda:consultar') {
    config = {
      icon: CalendarSearch,
      label: 'Consultar Agenda',
      colorClass: 'text-sky-700 dark:text-sky-400',
      bgClass: 'bg-sky-100 dark:bg-sky-900/40 border-sky-300 dark:border-sky-700',
    };
  } else if (acaoLower.startsWith('@agenda:criar:')) {
    const partes = acao.replace(/^@agenda:criar:/i, '').split(':');
    const calendario = partes[0] || '';
    const duracao = partes[1] ? `${partes[1]}min` : '';
    const hasMeet = partes[2] === 'meet';
    
    let label = `Criar Evento: ${calendario}`;
    if (duracao) {
      label += ` (${duracao}${hasMeet ? ' + Meet' : ''})`;
    }
    
    config = {
      icon: CalendarPlus,
      label,
      colorClass: 'text-emerald-700 dark:text-emerald-400',
      bgClass: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700',
    };
  } else if (acaoLower === '@agenda:criar') {
    config = {
      icon: CalendarPlus,
      label: 'Criar Evento',
      colorClass: 'text-emerald-700 dark:text-emerald-400',
      bgClass: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700',
    };
  } else if (acaoLower.startsWith('@campo:')) {
    const valor = acao.replace(/^@campo:/i, '');
    const partes = valor.split(':');
    const nomeCampo = partes[0]?.replace(/-/g, ' ') || valor;
    const valorCampo = partes.slice(1).join(':');
    
    const label = valorCampo 
      ? `Atualizar ${nomeCampo}: ${valorCampo}`
      : `Atualizar Campo: ${nomeCampo}`;
    
    config = {
      icon: FileEdit,
      label,
      colorClass: 'text-violet-700 dark:text-violet-400',
      bgClass: 'bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700',
    };
  } else if (acaoLower.startsWith('@obter:')) {
    const valor = acao.replace(/^@obter:/i, '').replace(/-/g, ' ');
    config = {
      icon: FileSearch,
      label: `Obter Campo: ${valor}`,
      colorClass: 'text-cyan-700 dark:text-cyan-400',
      bgClass: 'bg-cyan-100 dark:bg-cyan-900/40 border-cyan-300 dark:border-cyan-700',
    };
  } else if (acaoLower.startsWith('@ir_etapa:')) {
    const valor = acao.replace(/^@ir_etapa:/i, '');
    config = {
      icon: ArrowRightCircle,
      label: `Ir para Etapa: ${valor}`,
      colorClass: 'text-purple-700 dark:text-purple-400',
      bgClass: 'bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700',
    };
  } else if (acaoLower === '@verificar_cliente') {
    config = {
      icon: UserCheck,
      label: 'Verificar Cliente',
      colorClass: 'text-emerald-700 dark:text-emerald-400',
      bgClass: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700',
    };
  } else {
    config = {
      icon: Tag,
      label: acao,
      colorClass: 'text-muted-foreground',
      bgClass: 'bg-muted border-border',
    };
  }
  
  acaoConfigCache.set(acao, config);
  return config;
}

// Componente ActionChip memoizado com forwardRef
const ActionChip = memo(forwardRef<HTMLSpanElement, { 
  action: string; 
  onRemove?: () => void;
}>(function ActionChip({ action, onRemove }, ref) {
  const config = parseAcao(action);
  const Icon = config.icon;
  
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span 
            ref={ref}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium whitespace-nowrap cursor-default ${config.bgClass} ${config.colorClass}`}
            style={{ verticalAlign: 'middle' }}
          >
            <Icon className="h-3 w-3 flex-shrink-0" />
            <span>{config.label}</span>
            {onRemove && (
              <button 
                type="button" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemove();
                }}
                className="flex-shrink-0 hover:opacity-70 text-current"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p className="font-mono">{action}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}));

ActionChip.displayName = 'ActionChip';

// Shared styles constant
const SHARED_STYLES: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '0.875rem',
  lineHeight: '1.75rem',
  padding: '1rem',
  whiteSpace: 'pre-wrap',
  wordWrap: 'break-word',
  overflowWrap: 'break-word',
};

// Regex pattern for matching actions
const ACTION_REGEX = /@(nome|tag|etapa|transferir|fonte|notificar|produto|finalizar|negociacao|agenda|campo|obter|ir_etapa|verificar_cliente)(:[^\s@<>.,;!?]+)?/gi;

export function DescricaoEditor({ value, onChange, placeholder, onAcaoClick, onCursorChange }: DescricaoEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const lastCursorRef = useRef(0);
  
  // Estado para controle de modo
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  // Sincronizar quando value externo muda (ex: inserção de ação via modal)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Handler de mudança - atualiza local e propaga para pai
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(newValue);
  }, [onChange]);

  // Track cursor position
  const handleSelect = useCallback(() => {
    if (textareaRef.current) {
      lastCursorRef.current = textareaRef.current.selectionStart;
      onCursorChange?.(lastCursorRef.current);
    }
  }, [onCursorChange]);

  // Handler para tecla @
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === '@' && onAcaoClick) {
      e.preventDefault();
      const pos = textareaRef.current?.selectionStart ?? localValue.length;
      lastCursorRef.current = pos;
      onCursorChange?.(pos);
      onAcaoClick(pos);
    }
  }, [onAcaoClick, onCursorChange, localValue.length]);

  // Entrar em modo edição
  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  // Sair de modo edição
  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  // Clicar na view para entrar em edição
  const handleViewClick = useCallback(() => {
    setIsFocused(true);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, []);

  // Remover ação por posição no texto
  const handleRemoveAction = useCallback((startIndex: number, endIndex: number) => {
    const before = localValue.slice(0, startIndex);
    const after = localValue.slice(endIndex);
    
    const cleanBefore = before.endsWith(' ') ? before.slice(0, -1) : before;
    const cleanAfter = after.startsWith(' ') ? after.slice(1) : after;
    
    const newValue = cleanBefore + (cleanBefore.length > 0 && cleanAfter.length > 0 ? ' ' : '') + cleanAfter;
    const trimmed = newValue.trim();
    setLocalValue(trimmed);
    onChange(trimmed);
  }, [localValue, onChange]);

  // Renderizar conteúdo com chips para modo visualização
  const renderedContent = useMemo(() => {
    if (!localValue) return null;
    
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    
    const matches = Array.from(localValue.matchAll(new RegExp(ACTION_REGEX.source, 'gi')));
    
    for (const match of matches) {
      const matchIndex = match.index!;
      
      // Texto antes da ação
      if (matchIndex > lastIndex) {
        const textBefore = localValue.slice(lastIndex, matchIndex);
        parts.push(
          <span key={`text-${lastIndex}`} className="text-foreground whitespace-pre-wrap">
            {textBefore}
          </span>
        );
      }
      
      // Chip da ação
      const matchStart = matchIndex;
      const matchEnd = matchIndex + match[0].length;
      parts.push(
        <ActionChip 
          key={`action-${matchIndex}`}
          action={match[0]} 
          onRemove={() => handleRemoveAction(matchStart, matchEnd)}
        />
      );
      
      lastIndex = matchEnd;
    }
    
    // Texto restante
    if (lastIndex < localValue.length) {
      parts.push(
        <span key={`text-${lastIndex}`} className="text-foreground whitespace-pre-wrap">
          {localValue.slice(lastIndex)}
        </span>
      );
    }
    
    return parts.length > 0 ? parts : null;
  }, [localValue, handleRemoveAction]);

  // Auto-resize textarea quando focado
  useEffect(() => {
    if (isFocused && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = Math.max(160, textarea.scrollHeight) + 'px';
    }
  }, [localValue, isFocused]);

  return (
    <div className="relative w-full">
      {/* Modo Visualização - mostra chips visuais */}
      <div
        ref={viewRef}
        onClick={handleViewClick}
        className={`
          w-full min-h-[160px] rounded-xl bg-input border border-border
          text-sm leading-7 cursor-text
          transition-all duration-300 ease-out
          hover:border-primary/50
          ${isFocused 
            ? 'opacity-0 scale-[0.99] pointer-events-none absolute inset-0 z-0' 
            : 'opacity-100 scale-100 relative z-10'}
        `}
        style={SHARED_STYLES}
      >
        <div className={`transition-all duration-300 ease-out ${isFocused ? 'blur-sm' : 'blur-0'}`}>
          {renderedContent || (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </div>
      </div>

      {/* Modo Edição - textarea normal */}
      <textarea
        ref={textareaRef}
        value={localValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`
          w-full min-h-[160px] rounded-xl bg-input border text-sm leading-7
          focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
          transition-all duration-300 ease-out resize-none
          text-foreground placeholder:text-muted-foreground
          ${isFocused 
            ? 'opacity-100 scale-100 relative z-10 border-primary' 
            : 'opacity-0 scale-[1.01] pointer-events-none absolute inset-0 z-0'}
        `}
        style={{
          ...SHARED_STYLES,
          caretColor: 'hsl(var(--foreground))',
        }}
      />
    </div>
  );
}

// Função auxiliar para obter posição do cursor
export function getTextareaCursorPosition(textareaElement: HTMLTextAreaElement | null): number {
  return textareaElement?.selectionStart ?? 0;
}

// Inserir ação na posição do cursor
export function inserirAcaoNoEditor(
  currentValue: string,
  action: string,
  onChange: (value: string) => void,
  cursorPosition?: number
) {
  const insertPosition = cursorPosition ?? currentValue.length;
  
  const before = currentValue.substring(0, insertPosition);
  const after = currentValue.substring(insertPosition);
  const needsSpaceBefore = before.length > 0 && before[before.length - 1] !== ' ' && before[before.length - 1] !== '\n';
  const needsSpaceAfter = after.length > 0 && after[0] !== ' ' && after[0] !== '\n';
  
  const newValue = before + (needsSpaceBefore ? ' ' : '') + action + (needsSpaceAfter ? ' ' : '') + after;
  onChange(newValue);
}
