import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Copy, Key, Plus, Trash2, Eye, EyeOff, RefreshCw, Code, Send, Users, Briefcase, Workflow, Link2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ApiKey {
  id: string;
  nome: string;
  key: string;
  ativo: boolean;
  ultimo_uso: string | null;
  created_at: string;
}

const ApiDocs = () => {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const baseUrl = `https://mfaxpkfpackofxklccyl.supabase.co/functions/v1/api-externa`;

  useEffect(() => {
    if (usuario) {
      loadApiKeys();
    }
  }, [usuario]);

  const loadApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error) {
      console.error('Erro ao carregar API keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const gerarApiKey = async () => {
    if (!usuario?.conta_id) return;
    
    setGerando(true);
    try {
      // Gerar key aleatória
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const key = 'mk_' + Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

      const { error } = await supabase
        .from('api_keys')
        .insert({
          conta_id: usuario.conta_id,
          nome: novoNome || 'API Key Principal',
          key
        });

      if (error) throw error;

      toast({
        title: 'API Key gerada!',
        description: 'Copie e guarde sua key em um local seguro.',
      });

      setNovoNome('');
      loadApiKeys();
    } catch (error: unknown) {
      console.error('Erro ao gerar API key:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível gerar a API key.',
        variant: 'destructive'
      });
    } finally {
      setGerando(false);
    }
  };

  const deletarApiKey = async (id: string) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'API Key removida',
      });

      loadApiKeys();
    } catch (error) {
      console.error('Erro ao deletar API key:', error);
    }
  };

  const copiar = (texto: string, label: string) => {
    navigator.clipboard.writeText(texto);
    toast({ title: `${label} copiado!` });
  };

  const toggleShowKey = (id: string) => {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const CodeBlock = ({ code, language = 'json' }: { code: string; language?: string }) => (
    <div className="relative">
      <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2"
        onClick={() => copiar(code, 'Código')}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );

  const EndpointDoc = ({ 
    method, 
    path, 
    description, 
    params, 
    requestExample, 
    responseExample 
  }: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    description: string;
    params?: { name: string; type: string; required: boolean; description: string }[];
    requestExample?: string;
    responseExample: string;
  }) => {
    const methodColors = {
      GET: 'bg-emerald-500',
      POST: 'bg-blue-500',
      PATCH: 'bg-amber-500',
      DELETE: 'bg-red-500'
    };

    return (
      <AccordionItem value={`${method}-${path}`} className="border rounded-lg mb-2 px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-3">
            <Badge className={`${methodColors[method]} text-white font-mono`}>{method}</Badge>
            <code className="text-sm">{path}</code>
          </div>
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pt-4">
          <p className="text-muted-foreground">{description}</p>
          
          {params && params.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Parâmetros</h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Nome</th>
                      <th className="text-left p-2">Tipo</th>
                      <th className="text-left p-2">Obrigatório</th>
                      <th className="text-left p-2">Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {params.map(param => (
                      <tr key={param.name} className="border-t">
                        <td className="p-2 font-mono text-primary">{param.name}</td>
                        <td className="p-2 text-muted-foreground">{param.type}</td>
                        <td className="p-2">{param.required ? <Badge variant="destructive" className="text-xs">Sim</Badge> : <Badge variant="secondary" className="text-xs">Não</Badge>}</td>
                        <td className="p-2 text-muted-foreground">{param.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {requestExample && (
            <div>
              <h4 className="font-medium mb-2">Exemplo de Request</h4>
              <CodeBlock code={requestExample} />
            </div>
          )}

          <div>
            <h4 className="font-medium mb-2">Exemplo de Response</h4>
            <CodeBlock code={responseExample} />
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  return (
    <MainLayout>
      <div className="container max-w-5xl py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">API para Integrações</h1>
          <p className="text-muted-foreground">
            Use esses endpoints para integrar com n8n, Make, Zapier e outros via HTTP
          </p>
        </div>

        {/* Gerenciamento de API Keys */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Keys
            </CardTitle>
            <CardDescription>
              Gerencie suas chaves de API para autenticação
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Gerar nova key */}
            <div className="flex gap-2">
              <Input
                placeholder="Nome da API Key (opcional)"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                className="max-w-xs"
              />
              <Button onClick={gerarApiKey} disabled={gerando}>
                {gerando ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Gerar Nova API Key
              </Button>
            </div>

            {/* Lista de keys */}
            {loading ? (
              <div className="text-center py-4 text-muted-foreground">Carregando...</div>
            ) : apiKeys.length === 0 ? (
              <Alert>
                <AlertDescription>
                  Você ainda não possui nenhuma API Key. Gere uma para começar a integrar.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                {apiKeys.map(apiKey => (
                  <div key={apiKey.id} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{apiKey.nome}</span>
                        {!apiKey.ativo && <Badge variant="secondary">Inativa</Badge>}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm text-muted-foreground font-mono">
                          {showKeys[apiKey.id] ? apiKey.key : apiKey.key.substring(0, 10) + '...'}
                        </code>
                        <Button variant="ghost" size="sm" onClick={() => toggleShowKey(apiKey.id)}>
                          {showKeys[apiKey.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => copiar(apiKey.key, 'API Key')}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      {apiKey.ultimo_uso && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Último uso: {new Date(apiKey.ultimo_uso).toLocaleString('pt-BR')}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deletarApiKey(apiKey.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Base URL */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              URL Base
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted p-3 rounded-lg text-sm font-mono">{baseUrl}</code>
              <Button variant="outline" onClick={() => copiar(baseUrl, 'URL')}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Todas as requisições devem incluir o header: <code className="bg-muted px-1 rounded">Authorization: Bearer SUA_API_KEY</code>
            </p>
          </CardContent>
        </Card>

        {/* Documentação dos Endpoints */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Endpoints Disponíveis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="mensagens">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="mensagens" className="flex items-center gap-1">
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">Mensagens</span>
                </TabsTrigger>
                <TabsTrigger value="contatos" className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">Contatos</span>
                </TabsTrigger>
                <TabsTrigger value="negociacoes" className="flex items-center gap-1">
                  <Briefcase className="h-4 w-4" />
                  <span className="hidden sm:inline">Negociações</span>
                </TabsTrigger>
                <TabsTrigger value="funis" className="flex items-center gap-1">
                  <Workflow className="h-4 w-4" />
                  <span className="hidden sm:inline">Funis</span>
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[600px] mt-4">
                <TabsContent value="mensagens" className="mt-0">
                  <Accordion type="single" collapsible>
                    <EndpointDoc
                      method="POST"
                      path="/enviar-mensagem"
                      description="Envia uma mensagem de texto ou mídia via WhatsApp"
                      params={[
                        { name: 'telefone', type: 'string', required: true, description: 'Número do destinatário (ex: 5511999999999)' },
                        { name: 'mensagem', type: 'string', required: true, description: 'Conteúdo da mensagem' },
                        { name: 'tipo', type: 'string', required: false, description: 'Tipo: texto, imagem, audio, video, documento' },
                        { name: 'media_url', type: 'string', required: false, description: 'URL da mídia (se tipo != texto)' },
                        { name: 'conexao_id', type: 'string', required: false, description: 'ID da conexão (usa a primeira ativa se não informado)' },
                      ]}
                      requestExample={`{
  "telefone": "5511999999999",
  "mensagem": "Olá! Como posso ajudar?",
  "tipo": "texto"
}`}
                      responseExample={`{
  "success": true,
  "data": {
    "message_id": "ABCD1234..."
  }
}`}
                    />

                    <EndpointDoc
                      method="GET"
                      path="/conexoes"
                      description="Lista todas as conexões WhatsApp/Instagram disponíveis"
                      responseExample={`{
  "success": true,
  "data": [
    {
      "id": "uuid-da-conexao",
      "nome": "WhatsApp Principal",
      "numero": "5511999999999",
      "status": "conectado",
      "tipo_canal": "whatsapp",
      "tipo_provedor": "evolution"
    }
  ]
}`}
                    />
                  </Accordion>
                </TabsContent>

                <TabsContent value="contatos" className="mt-0">
                  <Accordion type="single" collapsible>
                    <EndpointDoc
                      method="GET"
                      path="/contatos"
                      description="Busca contatos. Use o parâmetro telefone para filtrar."
                      params={[
                        { name: 'telefone', type: 'string', required: false, description: 'Filtra por número de telefone' },
                      ]}
                      responseExample={`{
  "success": true,
  "data": [
    {
      "id": "uuid-do-contato",
      "nome": "João Silva",
      "telefone": "5511999999999",
      "email": "joao@email.com",
      "tags": ["lead", "instagram"],
      "avatar_url": null,
      "canal": "whatsapp",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}`}
                    />

                    <EndpointDoc
                      method="POST"
                      path="/contatos"
                      description="Cria um novo contato"
                      params={[
                        { name: 'nome', type: 'string', required: true, description: 'Nome do contato' },
                        { name: 'telefone', type: 'string', required: true, description: 'Número de telefone' },
                        { name: 'email', type: 'string', required: false, description: 'E-mail do contato' },
                        { name: 'tags', type: 'string[]', required: false, description: 'Lista de tags' },
                      ]}
                      requestExample={`{
  "nome": "João Silva",
  "telefone": "5511999999999",
  "email": "joao@email.com",
  "tags": ["lead", "instagram"]
}`}
                      responseExample={`{
  "success": true,
  "data": {
    "id": "uuid-do-contato",
    "nome": "João Silva",
    "telefone": "5511999999999",
    "email": "joao@email.com",
    "tags": ["lead", "instagram"]
  }
}`}
                    />
                  </Accordion>
                </TabsContent>

                <TabsContent value="negociacoes" className="mt-0">
                  <Accordion type="single" collapsible>
                    <EndpointDoc
                      method="GET"
                      path="/negociacoes"
                      description="Busca negociações. Use telefone ou contato_id para filtrar."
                      params={[
                        { name: 'telefone', type: 'string', required: false, description: 'Filtra pelo telefone do contato' },
                        { name: 'contato_id', type: 'string', required: false, description: 'Filtra pelo ID do contato' },
                        { name: 'status', type: 'string', required: false, description: 'Filtra por status: aberto, ganho, perdido' },
                      ]}
                      responseExample={`{
  "success": true,
  "data": [
    {
      "id": "uuid-da-negociacao",
      "titulo": "Venda Produto X",
      "valor": 1500.00,
      "status": "aberto",
      "notas": "Cliente interessado",
      "estagio": {
        "id": "uuid-do-estagio",
        "nome": "Em Negociação",
        "cor": "#3B82F6",
        "funil": {
          "id": "uuid-do-funil",
          "nome": "Vendas"
        }
      },
      "contato": {
        "id": "uuid-do-contato",
        "nome": "João Silva",
        "telefone": "5511999999999"
      }
    }
  ]
}`}
                    />

                    <EndpointDoc
                      method="POST"
                      path="/negociacoes"
                      description="Cria uma nova negociação"
                      params={[
                        { name: 'contato_id', type: 'string', required: false, description: 'ID do contato (ou use telefone)' },
                        { name: 'telefone', type: 'string', required: false, description: 'Telefone do contato (se não tiver contato_id)' },
                        { name: 'titulo', type: 'string', required: true, description: 'Título da negociação' },
                        { name: 'valor', type: 'number', required: false, description: 'Valor da negociação' },
                        { name: 'estagio_id', type: 'string', required: false, description: 'ID do estágio (usa o primeiro se não informado)' },
                        { name: 'notas', type: 'string', required: false, description: 'Notas adicionais' },
                      ]}
                      requestExample={`{
  "telefone": "5511999999999",
  "titulo": "Venda Produto X",
  "valor": 1500.00,
  "notas": "Cliente veio pelo Instagram"
}`}
                      responseExample={`{
  "success": true,
  "data": {
    "id": "uuid-da-negociacao",
    "titulo": "Venda Produto X",
    "valor": 1500.00,
    "status": "aberto",
    "estagio": { ... },
    "contato": { ... }
  }
}`}
                    />

                    <EndpointDoc
                      method="PATCH"
                      path="/negociacoes/:id"
                      description="Atualiza uma negociação existente (muda estágio, valor, status, etc)"
                      params={[
                        { name: 'estagio_id', type: 'string', required: false, description: 'Novo ID do estágio' },
                        { name: 'funil_id', type: 'string', required: false, description: 'Mover para outro funil (usa primeiro estágio)' },
                        { name: 'valor', type: 'number', required: false, description: 'Novo valor' },
                        { name: 'status', type: 'string', required: false, description: 'Novo status: aberto, ganho, perdido' },
                        { name: 'titulo', type: 'string', required: false, description: 'Novo título' },
                        { name: 'notas', type: 'string', required: false, description: 'Novas notas' },
                      ]}
                      requestExample={`{
  "estagio_id": "uuid-novo-estagio",
  "valor": 2000.00,
  "status": "ganho"
}`}
                      responseExample={`{
  "success": true,
  "data": {
    "id": "uuid-da-negociacao",
    "titulo": "Venda Produto X",
    "valor": 2000.00,
    "status": "ganho",
    "estagio": { ... },
    "contato": { ... }
  }
}`}
                    />
                  </Accordion>
                </TabsContent>

                <TabsContent value="funis" className="mt-0">
                  <Accordion type="single" collapsible>
                    <EndpointDoc
                      method="GET"
                      path="/funis"
                      description="Lista todos os funis com seus estágios"
                      responseExample={`{
  "success": true,
  "data": [
    {
      "id": "uuid-do-funil",
      "nome": "Vendas",
      "descricao": "Funil principal de vendas",
      "cor": "#3B82F6",
      "ordem": 1,
      "estagios": [
        {
          "id": "uuid-estagio-1",
          "nome": "Novo Lead",
          "cor": "#6B7280",
          "ordem": 1,
          "tipo": "entrada"
        },
        {
          "id": "uuid-estagio-2",
          "nome": "Em Negociação",
          "cor": "#F59E0B",
          "ordem": 2,
          "tipo": null
        }
      ]
    }
  ]
}`}
                    />

                    <EndpointDoc
                      method="GET"
                      path="/estagios"
                      description="Lista estágios. Use funil_id para filtrar por funil."
                      params={[
                        { name: 'funil_id', type: 'string', required: false, description: 'Filtra por funil específico' },
                      ]}
                      responseExample={`{
  "success": true,
  "data": [
    {
      "id": "uuid-do-estagio",
      "nome": "Novo Lead",
      "cor": "#6B7280",
      "ordem": 1,
      "tipo": "entrada",
      "funil": {
        "id": "uuid-do-funil",
        "nome": "Vendas"
      }
    }
  ]
}`}
                    />
                  </Accordion>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </CardContent>
        </Card>

        {/* Exemplo n8n/Make */}
        <Card>
          <CardHeader>
            <CardTitle>Exemplo de Uso no n8n / Make</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">1. Configure o HTTP Request</h4>
              <CodeBlock code={`URL: ${baseUrl}/contatos?telefone=5511999999999
Method: GET
Headers:
  Authorization: Bearer mk_sua_api_key_aqui
  Content-Type: application/json`} language="plaintext" />
            </div>

            <div>
              <h4 className="font-medium mb-2">2. Para enviar dados (POST/PATCH)</h4>
              <CodeBlock code={`URL: ${baseUrl}/enviar-mensagem
Method: POST
Headers:
  Authorization: Bearer mk_sua_api_key_aqui
  Content-Type: application/json
Body:
{
  "telefone": "5511999999999",
  "mensagem": "Olá! Mensagem automática do n8n"
}`} language="plaintext" />
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default ApiDocs;
