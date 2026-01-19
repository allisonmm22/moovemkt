import { useEffect, useCallback, useMemo, memo, forwardRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { 
  Bold, Italic, Code, Heading1, Heading2, Heading3, 
  Quote, List, ListOrdered
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ActionNode } from '@/components/editor/ActionNode';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onAcaoClick?: (cursorPosition: number) => void;
}

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
      ActionNode,
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
      // Get content as text but preserve action nodes
      const json = editor.getJSON();
      const text = extractTextWithActions(json);
      onChange(text);
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (editor) {
      const currentText = extractTextWithActions(editor.getJSON());
      if (value !== currentText) {
        // Parse value to find actions and convert to proper nodes
        const content = parseValueToContent(value);
        editor.commands.setContent(content);
      }
    }
  }, [value, editor]);

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-input">
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
        
        .ProseMirror .inline-action-wrapper {
          display: inline-flex !important;
          align-items: center;
          vertical-align: middle;
        }
        
        .ProseMirror span[data-node-view-wrapper] {
          display: inline-flex !important;
          align-items: center;
        }
      `}</style>
    </div>
  );
}

// Action Regex
const ACTION_REGEX = /@(nome|tag|etapa|transferir|fonte|notificar|produto|finalizar|negociacao|agenda|campo|obter|ir_etapa|followup|verificar_cliente)(:[^\s@<>.,;!?]+)?/gi;

// Extract text with actions from editor JSON
function extractTextWithActions(json: any): string {
  if (!json || !json.content) return '';
  
  const extractFromNode = (node: any): string => {
    if (node.type === 'text') {
      return node.text || '';
    }
    if (node.type === 'action') {
      return node.attrs?.action || '';
    }
    if (node.type === 'hardBreak') {
      return '\n';
    }
    if (node.content && Array.isArray(node.content)) {
      const text = node.content.map(extractFromNode).join('');
      // Add newlines for block elements
      if (['paragraph', 'heading', 'listItem'].includes(node.type)) {
        return text + '\n';
      }
      return text;
    }
    return '';
  };
  
  return json.content.map(extractFromNode).join('').trim();
}

// Parse value string to editor content with action nodes
function parseValueToContent(value: string): any {
  if (!value) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  
  const lines = value.split('\n');
  const content: any[] = [];
  
  for (const line of lines) {
    const paragraphContent: any[] = [];
    let lastIndex = 0;
    
    const matches = Array.from(line.matchAll(new RegExp(ACTION_REGEX.source, 'gi')));
    
    for (const match of matches) {
      const matchIndex = match.index!;
      const matchEnd = matchIndex + match[0].length;
      
      // Add text before match
      if (matchIndex > lastIndex) {
        const textBefore = line.slice(lastIndex, matchIndex);
        if (textBefore) {
          paragraphContent.push({ type: 'text', text: textBefore });
        }
      }
      
      // Add action node
      paragraphContent.push({
        type: 'action',
        attrs: { action: match[0] }
      });
      
      lastIndex = matchEnd;
    }
    
    // Add remaining text
    if (lastIndex < line.length) {
      const remaining = line.slice(lastIndex);
      if (remaining) {
        paragraphContent.push({ type: 'text', text: remaining });
      }
    }
    
    content.push({
      type: 'paragraph',
      content: paragraphContent.length > 0 ? paragraphContent : undefined
    });
  }
  
  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }]
  };
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
