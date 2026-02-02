
# Plano: Deploy Direto pelo Navegador (Sem Terminal)

## Visão Geral

Vamos conectar o GitHub ao Cloudflare para fazer deploy automático, tudo pelo navegador - sem precisar abrir terminal ou instalar nada no computador.

## Passo a Passo

### Passo 1: Enviar Código para o GitHub (no Lovable)

1. No Lovable, clique no botão **"GitHub"** no canto superior direito
2. Conecte sua conta GitHub se ainda não estiver conectada
3. Faça **Push** do código para o repositório

### Passo 2: Criar Worker no Cloudflare Dashboard

1. Acesse: https://dash.cloudflare.com
2. No menu lateral, clique em **"Workers & Pages"**
3. Clique em **"Create"**
4. Escolha **"Import from GitHub"** (Importar do GitHub)
5. Conecte sua conta GitHub ao Cloudflare
6. Selecione o repositório do seu projeto (moovemkt)
7. Configure:
   - **Production branch**: `main`
   - **Build command**: `cd crm-workers && npm install && npm run build`
   - **Build output directory**: `crm-workers/dist`
   - **Root directory**: `/` (raiz)

### Passo 3: Configurar Variáveis de Ambiente (Secrets)

1. Após criar o Worker, vá em **Settings → Variables**
2. Clique em **"Add variable"** e adicione:

| Nome | Valor | Tipo |
|------|-------|------|
| `SUPABASE_URL` | `https://vgesneiogwomqxwhkdvn.supabase.co` | Text |
| `SUPABASE_SERVICE_ROLE_KEY` | (pegar no Supabase) | Encrypt |
| `SUPABASE_ANON_KEY` | (pegar no Supabase) | Encrypt |
| `EVOLUTION_API_KEY` | (sua chave Evolution) | Encrypt |

3. Clique em **"Save and Deploy"**

### Passo 4: Obter a URL do Worker

Após o deploy, você receberá uma URL como:
```
https://crm-workers.seu-usuario.workers.dev
```

### Passo 5: Atualizar o Frontend

Me envie a URL gerada e eu atualizo o frontend para usar o novo Worker!

---

## Onde Encontrar as Chaves do Supabase

Como seu projeto usa o Supabase externo (`vgesneiogwomqxwhkdvn`):

1. Acesse: https://supabase.com/dashboard/project/vgesneiogwomqxwhkdvn/settings/api
2. Copie:
   - **anon public**: É a `SUPABASE_ANON_KEY`
   - **service_role**: É a `SUPABASE_SERVICE_ROLE_KEY` (clique no olhinho para revelar)

---

## Benefícios desta Abordagem

- Não precisa instalar nada no computador
- Não precisa usar terminal/CMD
- Deploy automático a cada push no GitHub
- Tudo configurado pelo navegador
- Mais fácil de manter

---

## Observação Técnica

Para que o Cloudflare Pages/Workers funcione com o repositório, precisamos adicionar um arquivo de configuração de build. Vou criar esse arquivo quando você confirmar que quer seguir por este caminho.

