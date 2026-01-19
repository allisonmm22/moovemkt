import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { InputRule } from '@tiptap/core';
import { ActionChipNode } from './ActionChipNode';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    action: {
      insertAction: (action: string) => ReturnType;
    };
  }
}

export const ActionNode = Node.create({
  name: 'action',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      action: {
        default: '',
        parseHTML: element => element.getAttribute('data-action'),
        renderHTML: attributes => {
          return { 'data-action': attributes.action };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-action]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-action': HTMLAttributes.action }, HTMLAttributes), HTMLAttributes.action];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ActionChipNode, {
      as: 'span',
      className: 'inline-action-wrapper',
    });
  },

  addCommands() {
    return {
      insertAction: (action: string) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { action },
        });
      },
    };
  },

  addInputRules() {
    // Pattern to match action syntax: @tipo or @tipo:valor
    // Triggers when followed by space, newline, or end of input
    const actionPattern = /@(nome|tag|etapa|transferir|notificar|finalizar|negociacao|agenda|campo|obter|followup|verificar_cliente)(:[^\s@<>]+)?(?=\s|$)/;

    return [
      new InputRule({
        find: actionPattern,
        handler: ({ state, range, match }) => {
          const fullMatch = match[0];
          const { tr } = state;
          
          if (fullMatch) {
            tr.replaceWith(
              range.from,
              range.to,
              this.type.create({ action: fullMatch })
            );
          }
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        // Default behavior handles deletion
        return false;
      },
    };
  },
});

export default ActionNode;
