
# Plano: Corrigir Erro de Build no Cloudflare Pages

## Problema Identificado

O Cloudflare Pages detectou o arquivo `bun.lockb` no repositório e tentou usar o Bun como gerenciador de pacotes. O erro ocorre porque:

1. O lockfile `bun.lockb` está desatualizado
2. O Cloudflare usa `--frozen-lockfile` que não permite mudanças
3. Resultado: falha na instalação de dependências

## Solução

Vamos configurar o Cloudflare Pages para usar **npm** ao invés de Bun, criando um arquivo `.node-version` e adicionando um arquivo de configuração que força o uso do npm.

## Arquivos a Criar/Modificar

### 1. Criar arquivo `.node-version` na raiz
Define a versão do Node.js para o Cloudflare Pages usar:
```text
20
```

### 2. Criar arquivo `crm-workers/.npmrc`
Garante que npm seja usado corretamente:
```text
engine-strict=false
```

### 3. Atualizar `.gitignore`
Adicionar os lockfiles do Bun para não serem enviados ao GitHub:
```text
bun.lockb
bun.lock
```

## Configuração no Cloudflare Pages

Após as mudanças, no Cloudflare Pages, configure:

| Campo | Valor |
|-------|-------|
| **Build command** | `cd crm-workers && npm install && npm run deploy` |
| **Build output directory** | `crm-workers` |
| **Root directory** | `/` |

Na seção **Environment variables**, adicione:
- `NPM_FLAGS` = `--legacy-peer-deps`

## Fluxo de Deploy

1. Faço as alterações nos arquivos
2. Você faz Push para o GitHub no Lovable
3. O Cloudflare Pages detecta a mudança
4. O build usa npm (não Bun) e funciona
5. Worker é implantado com sucesso

## Observação Importante

Como o projeto principal usa Bun (`bun.lockb`), mas o `crm-workers` precisa de npm para o Cloudflare, a solução isola os dois ambientes.
