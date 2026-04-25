-- Per-user Ask Edgar API keys (ciphertext from app, never raw).
-- Run in Supabase SQL editor or via supabase db push if you use the CLI.

create table if not exists public.user_askedgar_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  key_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_askedgar_keys is 'AES-GCM–encrypted Ask Edgar API key; plaintext only on app server.';

alter table public.user_askedgar_keys enable row level security;

create policy "user_askedgar_keys_select_own"
  on public.user_askedgar_keys for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_askedgar_keys_insert_own"
  on public.user_askedgar_keys for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_askedgar_keys_update_own"
  on public.user_askedgar_keys for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_askedgar_keys_delete_own"
  on public.user_askedgar_keys for delete
  to authenticated
  using (auth.uid() = user_id);
