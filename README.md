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
- **Limpeza automática de armazenamento**: excluir um post, remover uma mídia ou trocar uma foto/capa também apaga o arquivo correspondente no Storage (evita acumular arquivos órfãos no plano gratuito).

## Configuração inicial

### 1. Criar o projeto no Supabase

1. Crie uma conta e um novo projeto em [supabase.com](https://supabase.com) (tier Free).
2. No **SQL Editor**, rode o conteúdo de [supabase/schema.sql](supabase/schema.sql) inteiro.
3. Em **Storage**, crie um bucket chamado `media`, marcado como **público**.
4. Em **Authentication > Users**, crie manualmente o usuário de quem vai gerenciar os clientes — não há cadastro público no app.
5. Em **Project Settings > API**, copie a **Project URL** e a chave **anon public** (ou **Publishable key**, no painel novo do Supabase).

### 2. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha com os dados do passo anterior:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

### 3. Rodar localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:5173` e faça login com o usuário criado no passo 1.4.

## Deploy no Netlify

1. Suba este repositório para o GitHub.
2. No Netlify, "Add new site" → "Import an existing project" → conecte o repositório.
3. Build command: `npm run build`. Publish directory: `dist` (já configurado em `netlify.toml`).
4. Em **Site settings > Environment variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
5. Faça o deploy e teste o link público (`/p/<token>`) em um celular real.

## Estrutura do projeto

```
src/
  components/    InstagramPostMockup, AppLayout, ProtectedRoute
  context/        AuthContext (sessão do Supabase)
  lib/            supabaseClient, videoThumbnail
  pages/          Login, Clientes, CalendarioCliente, PostForm, PaginaPublica
  types/          tipos compartilhados (Client, Post, PostMedia)
supabase/
  schema.sql      tabelas, RLS e funções RPC do link público
```

## Fora de escopo (ideias para uma v2 futura)

- Aprovação/comentários do cliente pelo link público.
- Publicação automática real nas redes sociais.
- Assistente de IA para legenda/imagem.
- Mídia paga / anúncios.
- Dashboard de métricas reais via API das redes.
