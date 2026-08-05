-- ============ AI ============
-- BYOK key storage. ciphertext is AES-256-GCM, key from env, NEVER returned to
-- the client. The only thing the UI ever displays is last_four.
create table user_api_keys (
  user_id      uuid not null references profiles(id) on delete cascade,
  provider     ai_provider not null,
  ciphertext   bytea not null,
  iv           bytea not null,
  last_four    char(4) not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, provider)
);

create table ai_jobs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  kind           text not null check (kind in ('pdf_to_notes','copilot','notes_to_cards')),
  status         text not null default 'pending' check (status in ('pending','running','done','error')),
  input_tokens   integer,
  output_tokens  integer,
  error          text,
  created_at     timestamptz not null default now()
);
