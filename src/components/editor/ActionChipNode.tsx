import React from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { X, Edit3, Tag, ArrowRight, Bell, CheckSquare, Calendar, FileText, UserCheck, User, DollarSign } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ChipConfig {
  icon: React.ElementType;
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

function parseAcao(acao: string): ChipConfig {
  const lower = acao.toLowerCase();
  
  if (lower.startsWith('@nome')) {
    return {
      icon: Edit3,
      label: 'Capturar Nome',
      bgColor: 'bg-blue-500/20',
      textColor: 'text-blue-400',
      borderColor: 'border-blue-500/30'
    };
  }
  
  if (lower.startsWith('@tag:')) {
    const valor = acao.split(':')[1] || '';
    return {
      icon: Tag,
      label: `Adicionar Tag: ${valor}`,
      bgColor: 'bg-purple-500/20',
      textColor: 'text-purple-400',
      borderColor: 'border-purple-500/30'
    };
  }
  
  if (lower.startsWith('@etapa:')) {
    const valor = acao.split(':')[1] || '';
    return {
      icon: ArrowRight,
      label: `Ir para Etapa: ${valor}`,
      bgColor: 'bg-amber-500/20',
      textColor: 'text-amber-400',
      borderColor: 'border-amber-500/30'
    };
  }
  
  if (lower.startsWith('@transferir')) {
    const valor = acao.includes(':') ? acao.split(':')[1] : '';
    return {
      icon: ArrowRight,
      label: valor ? `Transferir para: ${valor}` : 'Transferir para Humano',
      bgColor: 'bg-orange-500/20',
      textColor: 'text-orange-400',
      borderColor: 'border-orange-500/30'
    };
  }
  
  if (lower.startsWith('@notificar')) {
    return {
      icon: Bell,
      label: 'Notificar Atendente',
      bgColor: 'bg-red-500/20',
      textColor: 'text-red-400',
      borderColor: 'border-red-500/30'
    };
  }
  
  if (lower.startsWith('@finalizar')) {
    return {
      icon: CheckSquare,
      label: 'Finalizar Conversa',
      bgColor: 'bg-green-500/20',
      textColor: 'text-green-400',
      borderColor: 'border-green-500/30'
    };
  }
  
  if (lower.startsWith('@negociacao:')) {
    const valor = acao.split(':').slice(1).join(':') || '';
    return {
      icon: DollarSign,
      label: `Criar Negociação: ${valor}`,
      bgColor: 'bg-emerald-500/20',
      textColor: 'text-emerald-400',
      borderColor: 'border-emerald-500/30'
    };
  }
  
  if (lower.startsWith('@agenda:')) {
    const valor = acao.split(':').slice(1).join(':') || '';
    return {
      icon: Calendar,
      label: `Agenda: ${valor}`,
      bgColor: 'bg-cyan-500/20',
      textColor: 'text-cyan-400',
      borderColor: 'border-cyan-500/30'
    };
  }
  
  if (lower.startsWith('@campo:')) {
    const valor = acao.split(':').slice(1).join(':') || '';
    return {
      icon: FileText,
      label: `Campo: ${valor}`,
      bgColor: 'bg-indigo-500/20',
      textColor: 'text-indigo-400',
      borderColor: 'border-indigo-500/30'
    };
  }
  
  if (lower.startsWith('@obter:')) {
    const valor = acao.split(':')[1] || '';
    return {
      icon: FileText,
      label: `Obter Campo: ${valor}`,
      bgColor: 'bg-teal-500/20',
      textColor: 'text-teal-400',
      borderColor: 'border-teal-500/30'
    };
  }
  
  if (lower.startsWith('@followup:')) {
    const valor = acao.split(':').slice(1).join(':') || '';
    return {
      icon: Calendar,
      label: `Follow-up: ${valor}`,
      bgColor: 'bg-pink-500/20',
      textColor: 'text-pink-400',
      borderColor: 'border-pink-500/30'
    };
  }
  
  if (lower.startsWith('@verificar_cliente')) {
    return {
      icon: UserCheck,
      label: 'Verificar Cliente',
      bgColor: 'bg-emerald-500/20',
      textColor: 'text-emerald-400',
      borderColor: 'border-emerald-500/30'
    };
  }
  
  // Default
  return {
    icon: Tag,
    label: acao,
    bgColor: 'bg-gray-500/20',
    textColor: 'text-gray-400',
    borderColor: 'border-gray-500/30'
  };
}

export const ActionChipNode: React.FC<NodeViewProps> = ({ node, deleteNode }) => {
  const action = node.attrs.action as string;
  const config = parseAcao(action);
  const Icon = config.icon;

  return (
    <NodeViewWrapper as="span" className="inline">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`
                inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                border ${config.bgColor} ${config.textColor} ${config.borderColor}
                cursor-default select-none mx-0.5
              `}
              contentEditable={false}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate max-w-[180px]">{config.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  deleteNode();
                }}
                className={`
                  ml-0.5 p-0.5 rounded-full hover:bg-white/20 transition-colors
                  ${config.textColor}
                `}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p>{action}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </NodeViewWrapper>
  );
};

export default ActionChipNode;
