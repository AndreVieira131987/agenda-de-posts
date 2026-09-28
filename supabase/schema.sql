-- Ferramenta de Agenda de Posts — schema do Supabase (Postgres)
-- Rodar este arquivo inteiro no SQL Editor do painel do Supabase, no projeto do zero.

-- =========================================================
-- 1. Tabelas
-- =========================================================

create table clients (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid references auth.users(id) not null,
  name              text not null,
  avatar_url        text,
  instagram_handle  text,
  public_token      uuid unique not null default gen_random_uuid(),
  created_at        timestamptz not null default now()
);

create table posts (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references clients(id) on delete cascade not null,
  caption       text,
  post_type     text not null check (post_type in ('imagem', 'carrossel', 'video', 'reels', 'story')),
  network       text not null default 'instagram',
  status        text not null default 'rascunho' check (status in ('rascunho', 'pronto', 'agendado', 'publicado')),
  approval_status text not null default 'pendente' check (approval_status in ('pendente', 'aprovado', 'alteracao_solicitada')),
  scheduled_at  timestamptz,
  order_index   int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table post_media (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid references posts(id) on delete cascade not null,
  media_type      text not null check (media_type in ('imagem', 'video')),
  storage_path    text not null,
  thumbnail_path  text,
  position        int not null default 0
);

create table post_feedback (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid references posts(id) on delete cascade not null,
  client_name text not null,
  action      text not null check (action in ('aprovado', 'alteracao_solicitada')),
  message     text,
  created_at  timestamptz not null default now()
);

create index posts_client_id_idx on posts(client_id);
create index posts_scheduled_at_idx on posts(scheduled_at);
create index post_media_post_id_idx on post_media(post_id);
create index post_feedback_post_id_idx on post_feedback(post_id);

-- =========================================================
-- 2. Row Level Security — só a dona dos dados (Paula) acessa via API autenticada
-- =========================================================

alter table clients enable row level security;
alter table posts enable row level security;
alter table post_media enable row level security;
alter table post_feedback enable row level security;

create policy "owner manages own clients"
  on clients for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owner manages own posts"
  on posts for all
  using (
    exists (select 1 from clients c where c.id = posts.client_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from clients c where c.id = posts.client_id and c.owner_id = auth.uid())
  );

create policy "owner manages own post_media"
  on post_media for all
  using (
    exists (
      select 1 from posts p
      join clients c on c.id = p.client_id
      where p.id = post_media.post_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from posts p
      join clients c on c.id = p.client_id
      where p.id = post_media.post_id and c.owner_id = auth.uid()
    )
  );

create policy "owner reads own post_feedback"
  on post_feedback for select
  using (
    exists (
      select 1 from posts p
      join clients c on c.id = p.client_id
      where p.id = post_feedback.post_id and c.owner_id = auth.uid()
    )
  );

-- Nenhuma policy é criada para o papel "anon" — o acesso público só acontece
-- através das funções RPC abaixo, nunca direto nas tabelas. post_feedback também
-- não tem policy de insert/update/delete: toda escrita passa por submit_post_feedback.

-- =========================================================
-- 3. Funções RPC para o link público (somente leitura, filtrado por token)
-- =========================================================

create or replace function get_client_by_token(p_token uuid)
returns table (id uuid, name text, avatar_url text, instagram_handle text)
language sql
security definer
set search_path = public
as $$
  select c.id, c.name, c.avatar_url, c.instagram_handle
  from clients c
  where c.public_token = p_token;
$$;

create or replace function get_posts_by_token(p_token uuid)
returns table (
  id uuid,
  caption text,
  post_type text,
  network text,
  status text,
  approval_status text,
  scheduled_at timestamptz,
  order_index int,
  media jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.caption,
    p.post_type,
    p.network,
    p.status,
    p.approval_status,
    p.scheduled_at,
    p.order_index,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', pm.id,
            'media_type', pm.media_type,
            'storage_path', pm.storage_path,
            'thumbnail_path', pm.thumbnail_path,
            'position', pm.position
          ) order by pm.position
        )
        from post_media pm
        where pm.post_id = p.id
      ),
      '[]'::jsonb
    ) as media
  from posts p
  join clients c on c.id = p.client_id
  where c.public_token = p_token
    and p.status in ('agendado', 'publicado')
  order by p.scheduled_at asc;
$$;

grant execute on function get_client_by_token(uuid) to anon, authenticated;
grant execute on function get_posts_by_token(uuid) to anon, authenticated;

-- Permite que o cliente (sem login) aprove ou proponha alteração num post,
-- validando que o post pertence ao cliente do token informado.
create or replace function submit_post_feedback(
  p_token uuid,
  p_post_id uuid,
  p_name text,
  p_action text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_client_id uuid;
  v_token_client_id uuid;
begin
  if p_action not in ('aprovado', 'alteracao_solicitada') then
    raise exception 'Ação inválida';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Nome é obrigatório';
  end if;

  if p_action = 'alteracao_solicitada' and trim(coalesce(p_message, '')) = '' then
    raise exception 'Mensagem é obrigatória ao propor alteração';
  end if;

  select client_id into v_post_client_id
  from posts
  where id = p_post_id and status in ('agendado', 'publicado');

  select id into v_token_client_id
  from clients
  where public_token = p_token;

  if v_post_client_id is null or v_token_client_id is null or v_post_client_id <> v_token_client_id then
    raise exception 'Post não encontrado para este link';
  end if;

  insert into post_feedback (post_id, client_name, action, message)
  values (p_post_id, trim(p_name), p_action, nullif(trim(p_message), ''));

  update posts set approval_status = p_action where id = p_post_id;
end;
$$;

grant execute on function submit_post_feedback(uuid, uuid, text, text, text) to anon, authenticated;

-- =========================================================
-- 4. Trigger para manter updated_at em dia
-- =========================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger posts_set_updated_at
  before update on posts
  for each row
  execute function set_updated_at();

-- =========================================================
-- 5. Storage — bucket público de mídia (rodar depois de criar o bucket "media" no painel)
-- =========================================================

-- Criar o bucket "media" pelo painel do Supabase (Storage > New bucket), marcado como "Public bucket".
-- Depois, rodar as policies abaixo para restringir upload/edição só à Paula autenticada,
-- mantendo a leitura pública (necessária para os mockups aparecerem no link do cliente).

create policy "public read media"
  on storage.objects for select
  using (bucket_id = 'media');

create policy "authenticated upload media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'media');

create policy "authenticated update media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'media');

create policy "authenticated delete media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'media');
