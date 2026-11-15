# KAI Planner — como colocar no ar

Organizador pessoal (escola, academia, hábitos e metas). É um site simples
(HTML + CSS + JavaScript, sem instalar nada) que pode ser instalado como app.

- **Hospedagem:** GitHub Pages (grátis)
- **Dados e login:** Supabase (grátis)
- **Sem notificações:** o app nunca avisa nada sozinho. Só mostra as coisas quando você abre.

---

## O que tem em cada arquivo

| Arquivo | Para que serve |
|---|---|
| `index.html` | A página que o navegador abre |
| `css/style.css` | As cores e o visual (tema escuro) |
| `js/app.js` | Barra do topo, barra lateral, login e troca de telas |
| `js/db.js` | Salva e lê os dados (no Supabase ou no navegador) |
| `js/config.js` | **Onde você cola o endereço e a chave pública do Supabase** |
| `js/views/*.js` | Cada tela (Início, Configurações…) |
| `supabase/fase1.sql` … `fase5.sql` | Criam as tabelas e a segurança no Supabase (rode cada um uma vez, em ordem) |
| `manifest.webmanifest` + `sw.js` | Deixam o site instalável como app |

---

## Passo 1 — Criar o projeto no Supabase

1. Entre em **supabase.com** e faça login com a conta do Pietro.
2. Clique em **New project**.
   - Nome: `kai-planner`
   - Database password: clique em **Generate** e guarde num lugar seguro (gerenciador de senhas).
     **Essa senha nunca vai para o código.**
   - Region: **South America (São Paulo)**.
3. Espere uns 2 minutos até o projeto ficar pronto.
4. No menu da esquerda, abra **SQL Editor** → **New query**.
5. Abra o arquivo `supabase/fase1.sql`, copie tudo, cole lá e clique em **Run**.
   Deve aparecer "Success. No rows returned".
   Esse arquivo cria 3 tabelas e liga o **Row Level Security** (cada pessoa só vê as próprias linhas).
6. Vá em **Project Settings** (engrenagem) → **API** (ou **Data API** / **API Keys**) e copie:
   - **Project URL** (algo como `https://abcdxyz.supabase.co`)
   - a chave **anon public** (um texto bem longo que começa com `eyJ…`), ou a **publishable key** (`sb_publishable_…`)
   - ⚠️ **NÃO** copie a `service_role` nem a `secret key`. Elas são secretas e nunca vão para o código.
7. Abra `js/config.js` e cole:
   ```js
   export const SUPABASE_URL = 'https://abcdxyz.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```

> **Por que a chave "anon" pode ficar no GitHub público?** Ela só deixa o site *pedir*
> dados. Quem decide o que cada um pode ver é o RLS, e ele só libera as linhas do dono.

---

## Passo 2 — Criar o repositório no GitHub

1. Entre em **github.com** com a conta do Pietro.
2. Clique no **+** (canto de cima) → **New repository**.
   - Repository name: `kai-planner`
   - Marque **Public** (o GitHub Pages grátis precisa de repositório público)
   - Clique em **Create repository**.
3. Na página do repositório novo, clique no link **uploading an existing file**.
4. Abra a pasta do projeto no computador, selecione **tudo, menos a pasta `.claude`**
   (`index.html`, `manifest.webmanifest`, `sw.js`, `LEIA-ME.md`, `.gitignore` e as pastas
   `css`, `js`, `icons`, `supabase`) e **arraste** para a página do GitHub.
5. Embaixo, clique em **Commit changes**.

---

## Passo 3 — Publicar com o GitHub Pages

1. No repositório, vá em **Settings** → **Pages** (menu da esquerda).
2. Em **Source**, escolha **Deploy from a branch**.
3. Em **Branch**, escolha **main** e a pasta **/ (root)** → **Save**.
4. Espere 1 ou 2 minutos e recarregue a página. Vai aparecer o endereço do site:
   `https://SEU-USUARIO.github.io/kai-planner/`

---

## Passo 4 — Ligar o login ao endereço do site

No Supabase:

1. **Authentication** → **URL Configuration**
   - **Site URL:** `https://SEU-USUARIO.github.io/kai-planner/`
   - Em **Redirect URLs**, adicione o mesmo endereço.
   (Assim o link de confirmação do e-mail volta para o seu site.)
2. Abra o site, clique em **"Não tenho conta — criar"**, use o e-mail e uma senha nova.
3. Abra o e-mail de confirmação e clique no link. Depois entre no site.
4. **Recomendado:** depois de criar a sua conta, vá em **Authentication** → **Sign In / Providers**
   e **desligue "Allow new users to sign up"**. Assim ninguém mais consegue criar conta no seu app.

---

## Passo 5 — Instalar como app

- **Android (Chrome):** abra o site → menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari):** botão de compartilhar → **Adicionar à Tela de Início**.
- **Computador (Chrome/Edge):** ícone de instalar na barra de endereço.

---

## Atualizar o site depois (a cada fase)

1. Se a fase trouxer um arquivo novo `supabase/faseN.sql`, rode ele no **SQL Editor** do Supabase
   (igual ao da Fase 1). Ele só acrescenta coisas; não apaga seus dados.
2. Repita o upload: no repositório, **Add file** → **Upload files**, arraste os arquivos
novos/alterados e **Commit changes**. Em 1–2 minutos o site atualiza.
Se o app instalado não mostrar a novidade, feche e abra de novo.

---

## Testar no computador sem publicar

Com o `config.js` **vazio**, o app roda em **modo local** (salva só naquele navegador).
Para abrir, na pasta do projeto rode:

```
python -m http.server 5173
```

e acesse `http://localhost:5173`. (Abrir o `index.html` com dois cliques **não** funciona,
porque o navegador bloqueia os módulos JavaScript fora de um servidor.)

---

## Limites do plano grátis do Supabase

- Banco de dados: 500 MB. Texto ocupa muito pouco, então é bastante.
- Armazenamento de arquivos: **1 GB** no total, e **50 MB por arquivo**.
- Fotos das metas e sonhos (pasta `sonhos`): até **10 MB** cada, e o app diminui antes de enviar (fica uns 200–400 KB). Dá pra guardar milhares.
  Quando chegarmos nos vídeos "como fazer" e nos PDFs, prefira vídeos curtos (5–15 s, até ~10 MB).
- Projeto parado por 7 dias pode ser **pausado**. É só entrar no painel e clicar em "Restore".
  Abrir o app de vez em quando já evita isso.

## Backup (faça de vez em quando!)

Em **Configurações → Backup e dados → Baixar backup** o app baixa **um arquivo** (`kai-planner-backup-DATA.json`)
com todos os seus dados. Guarde num lugar seguro (Google Drive, pendrive…).
Para voltar: **Importar → Escolher arquivo de backup**. Isso troca todos os dados atuais pelos do arquivo.
Os PDFs, vídeos e fotos ficam na nuvem; o backup leva a lista deles.
