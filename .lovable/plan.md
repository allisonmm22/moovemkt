
# Plano: Forcar uso do npm no Cloudflare Pages

## Problema

O Cloudflare Pages detecta automaticamente os arquivos `bun.lockb` e `bun.lock` no repositorio e tenta usar o Bun como gerenciador de pacotes. Isso falha porque o lockfile esta desatualizado.

## Solucao

Precisamos remover os arquivos de lockfile do Bun do repositorio para que o Cloudflare use npm automaticamente.

## Passos

### 1. Atualizar .gitignore

Adicionar `bun.lockb` e `bun.lock` ao arquivo `.gitignore` para que nao sejam enviados ao GitHub.

**Arquivo:** `.gitignore`
**Adicionar ao final:**
```text
# Bun lockfiles (forcar uso do npm no Cloudflare)
bun.lockb
bun.lock
```

### 2. Remover os arquivos do Git

Como os arquivos ja estao no repositorio, eles precisam ser removidos manualmente do Git.

**Voce precisa fazer isso no GitHub:**
1. Acesse seu repositorio no GitHub
2. Navegue ate o arquivo `bun.lockb`
3. Clique no icone de lixeira (Delete this file)
4. Confirme a exclusao
5. Repita para o arquivo `bun.lock`

**Alternativa via terminal (se tiver acesso):**
```bash
git rm bun.lockb bun.lock
git commit -m "Remover lockfiles do Bun para forcar npm"
git push
```

### 3. Retry do build

Apos remover os arquivos:
1. Volte ao Cloudflare Pages
2. Clique em "Retry build"
3. O Cloudflare vai detectar apenas `package-lock.json` e usar npm

## Configuracao do Build (Cloudflare Pages)

Certifique-se de que as configuracoes estao assim:

| Campo | Valor |
|-------|-------|
| Build command | `cd crm-workers && npm install && npm run deploy` |
| Build output directory | `crm-workers` |
| Root directory | `/` (vazio ou raiz) |

## Por que isso funciona?

O Cloudflare Pages detecta o gerenciador de pacotes pela ordem:
1. Se encontrar `bun.lockb` ou `bun.lock` -> usa Bun
2. Se encontrar `pnpm-lock.yaml` -> usa pnpm
3. Se encontrar `yarn.lock` -> usa Yarn
4. Se encontrar `package-lock.json` -> usa npm

Removendo os lockfiles do Bun, o Cloudflare usara automaticamente o npm.

## Arquivos a modificar

1. **`.gitignore`** - Adicionar exclusao dos lockfiles do Bun
