-- Migration: aprovação de posts pelo cliente + notificação por e-mail
-- Roda contra um projeto Supabase que já tem o schema.sql original aplicado.
-- Não apaga nem altera dados existentes — só adiciona.

-- =========================================================
-- 1. Coluna de status de aprovação em posts
-- =========================================================

alter table posts
  add column approval_status text not null default 'pendente'
  check (approval_status in ('pendente', 'aprovado', 'alteracao_solicitada'));

-- =========================================================
-- 2. Histórico de respostas do cliente
-- =========================================================

create table post_feedback (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid references posts(id) on delete cascade not null,
  client_name text not null,
  action      text not null check (action in ('aprovado', 'alteracao_solicitada')),
  message     text,
  created_at  timestamptz not null default now()
);

create index post_feedback_post_id_idx on post_feedback(post_id);

alter table post_feedback enable row level security;

create policy "owner reads own post_feedback"
  on post_feedback for select
  using (
    exists (
      select 1 from posts p
      join clients c on c.id = p.client_id
      where p.id = post_feedback.post_id and c.owner_id = auth.uid()
    )
  );

-- Nenhuma policy de insert/update/delete para authenticated/anon: toda escrita
-- acontece pela função submit_post_feedback abaixo, que valida o token antes.

-- =========================================================
-- 3. get_posts_by_token passa a devolver approval_status também
-- =========================================================

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

-- =========================================================
-- 4. Função para o cliente aprovar / propor alteração (sem login)
-- =========================================================

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
