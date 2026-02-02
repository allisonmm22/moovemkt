// Utilitários compartilhados

export const EVOLUTION_API_URL = 'https://evolution.cognityx.com.br';
export const META_API_URL = 'https://graph.facebook.com/v18.0';
export const INSTAGRAM_API_URL = 'https://graph.instagram.com/v18.0';

// Sleep helper
export const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

// Retry com backoff exponencial
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Se resposta OK ou erro de cliente (4xx), retorna imediatamente
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      console.log(`Tentativa ${attempt + 1} falhou com status ${response.status}, retentando...`);

      // Backoff exponencial: 1s, 2s, 4s
      if (attempt < maxRetries - 1) {
        await sleep(1000 * Math.pow(2, attempt));
      } else {
        return response;
      }
    } catch (error) {
      console.error(`Tentativa ${attempt + 1} falhou com erro:`, error);
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        await sleep(1000 * Math.pow(2, attempt));
      }
    }
  }

  throw lastError || new Error('Todas as tentativas falharam');
}

// Dividir mensagem de forma inteligente
export function dividirMensagem(texto: string, tamanhoMax: number): string[] {
  if (texto.length <= tamanhoMax) {
    return [texto];
  }

  const fracoes: string[] = [];
  const paragrafos = texto.split(/\n\n+/);
  let fracaoAtual = '';

  const dividirPorPalavras = (segmento: string): void => {
    const palavras = segmento.split(/\s+/);
    for (const palavra of palavras) {
      if (fracaoAtual.length + palavra.length + 1 <= tamanhoMax) {
        fracaoAtual = fracaoAtual ? `${fracaoAtual} ${palavra}` : palavra;
      } else {
        if (fracaoAtual) fracoes.push(fracaoAtual.trim());
        fracaoAtual = palavra;
      }
    }
  };

  const dividirPorPontuacaoMedia = (frase: string): void => {
    const segmentos = frase.split(/(?<=[,;:])\s+/);
    if (segmentos.length === 1) {
      dividirPorPalavras(frase);
      return;
    }

    for (const segmento of segmentos) {
      if (fracaoAtual.length + segmento.length + 1 <= tamanhoMax) {
        fracaoAtual = fracaoAtual ? `${fracaoAtual} ${segmento}` : segmento;
      } else {
        if (fracaoAtual) fracoes.push(fracaoAtual.trim());
        if (segmento.length > tamanhoMax) {
          fracaoAtual = '';
          dividirPorPalavras(segmento);
        } else {
          fracaoAtual = segmento;
        }
      }
    }
  };

  for (const paragrafo of paragrafos) {
    if (fracaoAtual.length + paragrafo.length + 2 <= tamanhoMax) {
      fracaoAtual = fracaoAtual ? `${fracaoAtual}\n\n${paragrafo}` : paragrafo;
    } else {
      if (fracaoAtual) {
        fracoes.push(fracaoAtual.trim());
        fracaoAtual = '';
      }

      if (paragrafo.length > tamanhoMax) {
        const frases = paragrafo.split(/(?<=[.!?])\s+/);
        for (const frase of frases) {
          if (fracaoAtual.length + frase.length + 1 <= tamanhoMax) {
            fracaoAtual = fracaoAtual ? `${fracaoAtual} ${frase}` : frase;
          } else {
            if (fracaoAtual) fracoes.push(fracaoAtual.trim());
            if (frase.length > tamanhoMax) {
              fracaoAtual = '';
              dividirPorPontuacaoMedia(frase);
            } else {
              fracaoAtual = frase;
            }
          }
        }
      } else {
        fracaoAtual = paragrafo;
      }
    }
  }

  if (fracaoAtual.trim()) {
    fracoes.push(fracaoAtual.trim());
  }

  return fracoes;
}

// Formatar número de telefone
export function formatPhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

// Extrair texto de JSON Tiptap
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
      if (node.type === 'action') return node.attrs?.action || '';
      if (node.type === 'hardBreak') return '\n';
      if (node.content && Array.isArray(node.content)) {
        const text = node.content.map(extractFromNode).join('');
        if (node.type === 'paragraph') return text + '\n';
        if (node.type === 'heading') {
          const level = node.attrs?.level || 1;
          return '#'.repeat(level) + ' ' + text + '\n';
        }
        if (node.type === 'listItem') return '- ' + text;
        if (node.type === 'bulletList' || node.type === 'orderedList') return text + '\n';
        if (node.type === 'blockquote') return '> ' + text + '\n';
        return text;
      }
      return '';
    };

    return json.content?.map(extractFromNode).join('').trim() || '';
  } catch {
    return value;
  }
}
