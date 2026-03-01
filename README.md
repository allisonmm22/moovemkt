# Cognityx– Guia de Instalação e Operação

Sistema de atendimento e CRM com WhatsApp (Evolution API), IA e Supabase local.

## ✅ Requisitos

- Node.js 18+ (recomendado 20/22)
- Nginx
- Docker + Docker Compose
- Supabase CLI

## 📦 Stack

- Vite + React + TypeScript
- Supabase local (Postgres + Auth + Storage + Edge Functions)
- Evolution API (WhatsApp)
- Nginx (proxy + static)

---

## 🚀 Deploy na VPS (resumo)

1) **Clonar** o repositório:
```bash
git clone git@github.com:allisonmm22/moovemkt.git
cd moovemkt
```

2) **Instalar dependências**:
```bash
npm install
```

3) **Subir Supabase local**:
```bash
supabase start
supabase db reset
```

4) **Configurar `.env` (frontend)**
Crie `.env` baseado em `.env.example`:
```
VITE_SUPABASE_PROJECT_ID="local"
VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY>"
VITE_SUPABASE_URL="http://<IP>:8000"
```

5) **Configurar Edge Functions (.env)**
Crie `supabase/functions/.env` baseado em `supabase/functions/.env.example`:
```
EVOLUTION_API_KEY=<EVOLUTION_API_KEY>
PUBLIC_SUPABASE_URL=http://<IP>:8000
EXTERNAL_SUPABASE_URL=http://<IP>:8000
EXTERNAL_SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
```

6) **Build e publicar**:
```bash
npm run build
rsync -a --delete dist/ /var/www/moovemkt/
```

---

## 🌐 Nginx (exemplo)

### Frontend
```nginx
server {
  listen 80;
  server_name _;
  root /var/www/moovemkt;
  index index.html;

  location / {
    try_files $uri /index.html;
  }
}
```

### Supabase Proxy (porta 8000)
```nginx
server {
  listen 8000;
  server_name _;
  client_max_body_size 25m;

  location /realtime/ {
    proxy_pass http://127.0.0.1:54321;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
  }

  location /storage/ {
    proxy_pass http://127.0.0.1:54321;
  }

  location / {
    proxy_pass http://127.0.0.1:54321;
  }
}
```

---

## 🔑 Credenciais Supabase Local

Verifique com:
```bash
supabase status
```

Use:
- **ANON_KEY** no `.env` do frontend
- **SERVICE_ROLE_KEY** nas Edge Functions

---

## 📷 Storage / Mídia

Bucket usado: **whatsapp-media** (público)

Criar bucket:
```bash
supabase storage create-bucket whatsapp-media --public
```

Políticas (RLS) para permitir upload/download:
```sql
-- anon
create policy "whatsapp-media select anon" on storage.objects for select to anon using (bucket_id='whatsapp-media');
create policy "whatsapp-media insert anon" on storage.objects for insert to anon with check (bucket_id='whatsapp-media');

-- authenticated
create policy "whatsapp-media select" on storage.objects for select to authenticated using (bucket_id='whatsapp-media');
create policy "whatsapp-media insert" on storage.objects for insert to authenticated with check (bucket_id='whatsapp-media');
```

---

## 🤖 Evolution API

Configuração da API:
- URL: `https://evolution.cognityx.com.br`
- KEY: definida em `EVOLUTION_API_KEY`

Webhook usado:
```
http://<IP>:8000/functions/v1/whatsapp-webhook
```

---

## 🧠 Agentes de IA

O prompt principal fica em **Agente IA → Prompt**.
Se não existir etapa criada, use o botão **“Criar Prompt”**.

Ações inteligentes precisam do prefixo **@**:
- `@negociacao:criar`
- `@etapa:qualificacao`
- `@tag:vip`

---

## 🔧 Comandos úteis

```bash
# Subir Supabase local
supabase start

# Reiniciar Supabase local
supabase stop && supabase start

# Resetar banco local
supabase db reset
```

---

## 🛠️ Troubleshooting

**Erro 401 / Invalid JWT**
- Faça logout/login e recarregue (Ctrl+F5)

**Upload de imagem falha (413)**
- Aumente `client_max_body_size` no Nginx

**Prompt não aparece**
- Crie etapa com botão “Criar Prompt”

---

## 📌 URLs padrão

- Frontend: `http://<IP>`
- Supabase (proxy): `http://<IP>:8000`
- Studio local (somente local): `http://127.0.0.1:54323`

---

## 📝 Licença

Uso privado do projeto.
