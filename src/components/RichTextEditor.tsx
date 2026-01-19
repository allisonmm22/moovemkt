import { useEffect, useCallback, useMemo, memo, forwardRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { 
  Bold, Italic, Code, Heading1, Heading2, Heading3, 
  Quote, List, ListOrdered, 
  Tag, Bot, UserRound, Globe, Layers, Bell, Package, StopCircle, UserPen, 
  Handshake, X, CalendarSearch, CalendarPlus, FileEdit, FileSearch, 
  ArrowRightCircle, UserCheck
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onAcaoClick?: (cursorPosition: number) => void;
}

interface ChipConfig {
  icon: React.ElementType;
  label: string;
  colorClass: string;
  bgClass: string;
}

// Parse ação para config visual
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

// Componente ActionChip para preview
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

// Toolbar Button Component
interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  tooltip?: string;
}

function ToolbarButton({ onClick, active, disabled, children, tooltip }: ToolbarButtonProps) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-8 w-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors",
        "hover:bg-muted hover:text-foreground",
        active && "bg-primary/10 text-primary",
        disabled && "opacity-50 cursor-not-allowed",
        !active && !disabled && "text-muted-foreground"
      )}
    >
      {children}
    </button>
  );

  if (tooltip) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}

// Separator Component
function ToolbarSeparator() {
  return <div className="w-px h-5 bg-border mx-1" />;
}

// Editor Toolbar Component
interface EditorToolbarProps {
  editor: ReturnType<typeof useEditor>;
}

function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  return (
    <div className="flex items-center gap-0.5 p-2 border-b border-border bg-muted/30 rounded-t-xl flex-wrap">
      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        tooltip="Negrito"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        tooltip="Itálico"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        tooltip="Código"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>
      
      <ToolbarSeparator />
      
      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        tooltip="Título 1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        tooltip="Título 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        tooltip="Título 3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>
      
      <ToolbarSeparator />
      
      {/* Blockquote */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        tooltip="Citação"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      
      <ToolbarSeparator />
      
      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        tooltip="Lista"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        tooltip="Lista Numerada"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

// Action Regex
const ACTION_REGEX = /@(nome|tag|etapa|transferir|fonte|notificar|produto|finalizar|negociacao|agenda|campo|obter|ir_etapa|verificar_cliente)(:[^\s@<>.,;!?]+)?/gi;

// Preview Component - renders actions as chips
interface ContentPreviewProps {
  content: string;
  onClick: () => void;
  placeholder?: string;
}

function ContentPreview({ content, onClick, placeholder }: ContentPreviewProps) {
  const renderedContent = useMemo(() => {
    if (!content) return null;
    
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    
    const matches = Array.from(content.matchAll(new RegExp(ACTION_REGEX.source, 'gi')));
    
    for (const match of matches) {
      const matchIndex = match.index!;
      
      if (matchIndex > lastIndex) {
        const textBefore = content.slice(lastIndex, matchIndex);
        parts.push(
          <span key={`text-${lastIndex}`} className="text-foreground whitespace-pre-wrap">
            {textBefore}
          </span>
        );
      }
      
      parts.push(
        <ActionChip 
          key={`action-${matchIndex}`}
          action={match[0]} 
        />
      );
      
      lastIndex = matchIndex + match[0].length;
    }
    
    if (lastIndex < content.length) {
      parts.push(
        <span key={`text-${lastIndex}`} className="text-foreground whitespace-pre-wrap">
          {content.slice(lastIndex)}
        </span>
      );
    }
    
    return parts.length > 0 ? parts : null;
  }, [content]);

  return (
    <div
      onClick={onClick}
      className="min-h-[160px] p-4 cursor-text text-sm leading-7"
    >
      {renderedContent || (
        <span className="text-muted-foreground">{placeholder}</span>
      )}
    </div>
  );
}

// Main RichTextEditor Component
export function RichTextEditor({ value, onChange, placeholder, onAcaoClick }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Digite aqui...',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[160px] p-4 focus:outline-none',
      },
      handleKeyDown: (view, event) => {
        if (event.key === '@' && onAcaoClick) {
          event.preventDefault();
          const pos = view.state.selection.from;
          onAcaoClick(pos);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getText());
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== editor.getText()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-input focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
      
      {/* Styles for placeholder and prose */}
      <style>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: hsl(var(--muted-foreground));
          pointer-events: none;
          height: 0;
        }
        
        .ProseMirror {
          min-height: 160px;
        }
        
        .ProseMirror:focus {
          outline: none;
        }
        
        .ProseMirror h1 {
          font-size: 1.5rem;
          font-weight: 700;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        
        .ProseMirror h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 0.75rem;
          margin-bottom: 0.5rem;
        }
        
        .ProseMirror h3 {
          font-size: 1.125rem;
          font-weight: 600;
          margin-top: 0.5rem;
          margin-bottom: 0.25rem;
        }
        
        .ProseMirror blockquote {
          border-left: 3px solid hsl(var(--border));
          padding-left: 1rem;
          margin: 0.5rem 0;
          color: hsl(var(--muted-foreground));
        }
        
        .ProseMirror ul,
        .ProseMirror ol {
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        
        .ProseMirror li {
          margin: 0.25rem 0;
        }
        
        .ProseMirror code {
          background: hsl(var(--muted));
          border-radius: 0.25rem;
          padding: 0.125rem 0.25rem;
          font-size: 0.875rem;
        }
        
        .ProseMirror strong {
          font-weight: 600;
        }
        
        .ProseMirror em {
          font-style: italic;
        }
      `}</style>
    </div>
  );
}

// Helper function to insert action
export function inserirAcaoNoRichEditor(
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
