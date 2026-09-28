# Agenda de Posts

Ferramenta simples para organizar os posts que uma social media planeja para cada cliente, e demonstrar esse planejamento por um link público — sem custo e sem complicação.

Contexto completo da pesquisa de mercado que motivou este projeto: [levantamentoinfo.md](levantamentoinfo.md).

## Stack

- React + Vite + TypeScript + Tailwind CSS (front-end, hospedado no Netlify).
- Supabase (tier gratuito) — Postgres + Auth + Storage, para persistência e o link público seguro.

## Funcionalidades

- **Login único** (só quem gerencia os clientes acessa; sem cadastro público).
- **Clientes**: cadastro com nome, @ do Instagram e foto de perfil (upload de arquivo).
- **Calendário mensal por cliente**, com miniatura do post no dia planejado e indicador "+N" quando há mais de um post no mesmo dia.
- **Posts**: imagem única, carrossel (várias imagens, reordenáveis por arraste ou pelas setas), vídeo e Reels (upload de vídeo de verdade, com capa opcional — se não escolher uma, o app gera automaticamente a partir do primeiro frame do vídeo).
- **Mockup fiel ao Instagram**: a pré-visualização do post respeita a proporção real da imagem/vídeo (sem cortar as bordas), navega pelo carrossel arrastando (como no Instagram) e se ajusta ao tamanho da tela.
- **Link público por cliente** (`/p/<token>`): o cliente abre sem precisar de login e vê o calendário com os posts em status "Agendado" ou "Publicado" — rascunhos nunca aparecem. O link pode ser regenerado a qualquer momento, invalidando o anterior.
- **Aprovação pelo cliente**: em cada post, o cliente informa o nome e pode **Aprovar** ou **Propor alteração** (com uma mensagem explicando o que mudar). Quem gerencia os clientes recebe um **e-mail** a cada resposta, e vê o status/histórico de feedback no calendário e na tela de edição do post.
- **Limpeza automática de armazenamento**: excluir um post, remover uma mídia ou trocar uma foto/capa também apaga o arquivo correspondente no Storage (evita acumular arquivos órfãos no plano gratuito).

## Configuração inicial

### 1. Criar o projeto no Supabase

1. Crie uma conta e um novo projeto em [supabase.com](https://supabase.com) (tier Free).
2. No **SQL Editor**, rode o conteúdo de [supabase/schema.sql](supabase/schema.sql) inteiro (já inclui a parte de aprovação do cliente).
   - Se você já tinha um projeto criado **antes** dessa funcionalidade existir, não rode o `schema.sql` de novo — em vez disso, rode só [supabase/migrations/002_client_approval.sql](supabase/migrations/002_client_approval.sql), que adiciona só o que falta sem apagar nada.
3. Em **Storage**, crie um bucket chamado `media`, marcado como **público**.
4. Em **Authentication > Users**, crie manualmente o usuário de quem vai gerenciar os clientes — não há cadastro público no app.
5. Em **Project Settings > API**, copie a **Project URL** e a chave **anon public** (ou **Publishable key**, no painel novo do Supabase).

### 2. Criar a conta no EmailJS (notificação por e-mail)

1. Crie uma conta gratuita em [emailjs.com](https://www.emailjs.com).
2. Em **Email Services**, conecte um serviço de e-mail (ex.: Gmail) e anote o **Service ID**.
3. Em **Email Templates**, crie um template com estas variáveis: `to_email`, `client_name`, `respondent_name`, `action_label`, `post_caption`, `post_date`, `message`. No campo **"To Email"** do template, use `{{to_email}}`. Anote o **Template ID**.
4. Em **Account > General**, copie a **Public Key**.
5. Em **Account > Security**, adicione em **Allowed origins** o domínio do seu site no Netlify (e `http://localhost:5173` para testar localmente).

### 3. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha com os dados dos passos anteriores:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
VITE_EMAILJS_SERVICE_ID=seu-service-id
VITE_EMAILJS_TEMPLATE_ID=seu-template-id
VITE_EMAILJS_PUBLIC_KEY=sua-public-key
VITE_NOTIFY_EMAIL=seu-email@exemplo.com
```

### 4. Rodar localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:5173` e faça login com o usuário criado no passo 1.4.

## Deploy no Netlify

1. Suba este repositório para o GitHub.
2. No Netlify, "Add new site" → "Import an existing project" → conecte o repositório.
3. Build command: `npm run build`. Publish directory: `dist` (já configurado em `netlify.toml`).
4. Em **Site settings > Environment variables**, adicione as mesmas variáveis do passo 3 acima (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_TEMPLATE_ID`, `VITE_EMAILJS_PUBLIC_KEY`, `VITE_NOTIFY_EMAIL`).
5. Faça o deploy e teste o link público (`/p/<token>`) em um celular real, incluindo aprovar um post e conferir se o e-mail chega.

## Estrutura do projeto

```
src/
  components/    InstagramPostMockup, PostApproval, AppLayout, ProtectedRoute
  context/        AuthContext (sessão do Supabase)
  lib/            supabaseClient, videoThumbnail, emailNotify
  pages/          Login, Clientes, CalendarioCliente, PostForm, PaginaPublica
  types/          tipos compartilhados (Client, Post, PostMedia, PostFeedback)
supabase/
  schema.sql              tabelas, RLS e funções RPC — setup do zero
  migrations/             alterações incrementais para quem já tem o projeto rodando
```

## Fora de escopo (ideias para uma v2 futura)

- Publicação automática real nas redes sociais.
- Assistente de IA para legenda/imagem.
- Mídia paga / anúncios.
- Dashboard de métricas reais via API das redes.
