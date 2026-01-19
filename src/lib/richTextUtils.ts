/**
 * Extracts readable text from Tiptap JSON content, preserving actions and basic formatting
 */
export function extractTextFromTiptapJson(value: string): string {
  if (!value) return '';
  
  try {
    const json = JSON.parse(value);
    
    const extractFromNode = (node: any): string => {
      if (node.type === 'text') {
        let text = node.text || '';
        if (node.marks) {
          for (const mark of node.marks) {
            if (mark.type === 'bold') text = `**${text}**`;
            if (mark.type === 'italic') text = `*${text}*`;
          }
        }
        return text;
      }
      if (node.type === 'action') {
        return node.attrs?.action || '';
      }
      if (node.type === 'hardBreak') {
        return '\n';
      }
      if (node.content && Array.isArray(node.content)) {
        const text = node.content.map(extractFromNode).join('');
        if (node.type === 'paragraph') {
          return text + '\n';
        }
        if (node.type === 'heading') {
          const level = node.attrs?.level || 1;
          return '#'.repeat(level) + ' ' + text + '\n';
        }
        if (node.type === 'bulletList' || node.type === 'orderedList') {
          return text + '\n';
        }
        if (node.type === 'listItem') {
          return '- ' + text;
        }
        if (node.type === 'blockquote') {
          return '> ' + text + '\n';
        }
        if (node.type === 'codeBlock') {
          return '```\n' + text + '\n```\n';
        }
        return text;
      }
      return '';
    };
    
    return json.content?.map(extractFromNode).join('').trim() || '';
  } catch {
    // If not valid JSON, return as-is (legacy plain text)
    return value;
  }
}
