-- Supabase Postgres schema (شغّله مرة واحدة في SQL Editor)
create table if not exists horus_memory (
  id bigserial primary key,
  kind text not null,
  key text not null,
  value text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(kind, key)
);
create table if not exists horus_tasks (
  task_id text primary key,
  title text not null,
  status text not null default 'CREATED',
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists horus_lessons (
  id bigserial primary key,
  fingerprint text unique not null,
  context text, root_cause text, fix text, prevention text,
  created_at timestamptz default now()
);
create table if not exists horus_audit (
  id bigserial primary key,
  task_id text, tool text, action text,
  result text, ts timestamptz default now()
);
