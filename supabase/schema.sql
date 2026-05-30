-- Formuflash Supabase schema
-- Requires extensions: pgcrypto, pgvector

begin;

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- Enums
create type visibility_enum as enum ('public', 'private', 'collaborators');
create type resource_type_enum as enum ('note', 'deck', 'exam');
create type collaborator_role_enum as enum ('viewer', 'editor');
create type exam_format_enum as enum ('mcq', 'longform', 'mixed');
create type exam_item_type_enum as enum ('mcq', 'longform');
create type entity_type_enum as enum ('institution', 'course', 'topic', 'resource');
create type subscription_status_enum as enum (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid'
);

-- Core user profile
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique,
  display_name text,
  avatar_url text,
  bio text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  llm_provider text not null default 'gemini',
  use_builtin_llm boolean not null default true,
  api_key_ciphertext bytea,
  api_key_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table billing_customers (
  user_id uuid primary key references auth.users on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  stripe_subscription_id text not null unique,
  status subscription_status_enum not null,
  price_id text,
  product_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hierarchy: institutions -> courses -> topics -> resources
create table institutions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  slug text not null unique,
  name text not null,
  description text,
  visibility visibility_enum not null default 'public',
  forked_from_id uuid references institutions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  owner_id uuid not null references auth.users on delete cascade,
  slug text not null,
  name text not null,
  description text,
  visibility visibility_enum not null default 'public',
  forked_from_id uuid references courses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, slug)
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  owner_id uuid not null references auth.users on delete cascade,
  slug text not null,
  name text not null,
  description text,
  visibility visibility_enum not null default 'public',
  forked_from_id uuid references topics(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, slug)
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  owner_id uuid not null references auth.users on delete cascade,
  resource_type resource_type_enum not null,
  title text not null,
  slug text not null,
  visibility visibility_enum not null default 'public',
  forked_from_id uuid references resources(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (topic_id, slug)
);

create table notes (
  id uuid primary key references resources(id) on delete cascade,
  markdown text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table note_chunks (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references notes(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(768),
  embedding_model text,
  created_at timestamptz not null default now(),
  unique (note_id, chunk_index)
);

create table decks (
  id uuid primary key references resources(id) on delete cascade,
  description text
);

create table flashcards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references decks(id) on delete cascade,
  front text not null,
  back text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deck_id, position)
);

create table fsrs_state (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references flashcards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  due_at timestamptz not null default now(),
  interval_days int not null default 0,
  stability numeric(10,4) not null default 0,
  difficulty numeric(6,4) not null default 0,
  retrievability numeric(6,4) not null default 0,
  last_reviewed_at timestamptz,
  reps int not null default 0,
  lapses int not null default 0,
  state text,
  unique (card_id, user_id)
);

create table exams (
  id uuid primary key references resources(id) on delete cascade,
  format exam_format_enum not null default 'mixed',
  instructions text,
  time_limit_minutes int
);

create table exam_items (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  item_type exam_item_type_enum not null,
  prompt text not null,
  options jsonb,
  correct_answer text,
  points numeric(8,2) not null default 1,
  position int not null default 0,
  unique (exam_id, position)
);

create table collaborators (
  id uuid primary key default gen_random_uuid(),
  entity_type entity_type_enum not null,
  entity_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role collaborator_role_enum not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, user_id)
);

create table review_queue_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references flashcards(id) on delete cascade,
  due_date date not null,
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, card_id, due_date)
);

-- Indexes
create index courses_institution_id_idx on courses (institution_id);
create index courses_owner_id_idx on courses (owner_id);
create index topics_course_id_idx on topics (course_id);
create index topics_owner_id_idx on topics (owner_id);
create index resources_topic_id_idx on resources (topic_id);
create index resources_owner_id_idx on resources (owner_id);
create index note_chunks_note_id_idx on note_chunks (note_id);
create index note_chunks_embedding_idx on note_chunks using ivfflat (embedding vector_cosine_ops);
create index flashcards_deck_id_idx on flashcards (deck_id);
create index fsrs_state_user_due_idx on fsrs_state (user_id, due_at);
create index exam_items_exam_id_idx on exam_items (exam_id);
create index collaborators_entity_idx on collaborators (entity_type, entity_id);
create index collaborators_user_id_idx on collaborators (user_id);
create index subscriptions_user_status_idx on subscriptions (user_id, status);
create index review_queue_user_date_idx on review_queue_cache (user_id, due_date);

-- Updated-at trigger
create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on profiles
for each row execute function set_updated_at();

create trigger user_settings_set_updated_at
before update on user_settings
for each row execute function set_updated_at();

create trigger billing_customers_set_updated_at
before update on billing_customers
for each row execute function set_updated_at();

create trigger subscriptions_set_updated_at
before update on subscriptions
for each row execute function set_updated_at();

create trigger institutions_set_updated_at
before update on institutions
for each row execute function set_updated_at();

create trigger courses_set_updated_at
before update on courses
for each row execute function set_updated_at();

create trigger topics_set_updated_at
before update on topics
for each row execute function set_updated_at();

create trigger resources_set_updated_at
before update on resources
for each row execute function set_updated_at();

create trigger notes_set_updated_at
before update on notes
for each row execute function set_updated_at();

create trigger flashcards_set_updated_at
before update on flashcards
for each row execute function set_updated_at();

-- Cleanup note chunks on content update
create function purge_note_chunks()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    delete from note_chunks where note_id = old.id;
  end if;
  return new;
end;
$$;

create trigger notes_purge_chunks_on_update
after update of markdown on notes
for each row execute function purge_note_chunks();

create function ensure_resource_type_note()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from resources r
    where r.id = new.id
      and r.resource_type = 'note'
  ) then
    raise exception 'resource type mismatch for notes';
  end if;
  return new;
end;
$$;

create trigger notes_resource_type_guard
before insert on notes
for each row execute function ensure_resource_type_note();

create function ensure_resource_type_deck()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from resources r
    where r.id = new.id
      and r.resource_type = 'deck'
  ) then
    raise exception 'resource type mismatch for decks';
  end if;
  return new;
end;
$$;

create trigger decks_resource_type_guard
before insert on decks
for each row execute function ensure_resource_type_deck();

create function ensure_resource_type_exam()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from resources r
    where r.id = new.id
      and r.resource_type = 'exam'
  ) then
    raise exception 'resource type mismatch for exams';
  end if;
  return new;
end;
$$;

create trigger exams_resource_type_guard
before insert on exams
for each row execute function ensure_resource_type_exam();

create function ensure_collaborator_target_exists()
returns trigger
language plpgsql
as $$
begin
  if new.entity_type = 'institution' then
    if not exists (select 1 from institutions i where i.id = new.entity_id) then
      raise exception 'invalid collaborator target for institution';
    end if;
  elsif new.entity_type = 'course' then
    if not exists (select 1 from courses c where c.id = new.entity_id) then
      raise exception 'invalid collaborator target for course';
    end if;
  elsif new.entity_type = 'topic' then
    if not exists (select 1 from topics t where t.id = new.entity_id) then
      raise exception 'invalid collaborator target for topic';
    end if;
  elsif new.entity_type = 'resource' then
    if not exists (select 1 from resources r where r.id = new.entity_id) then
      raise exception 'invalid collaborator target for resource';
    end if;
  end if;

  return new;
end;
$$;

create trigger collaborators_target_guard
before insert or update on collaborators
for each row execute function ensure_collaborator_target_exists();

-- Collaborator helpers
create function is_collaborator(
  p_entity_type entity_type_enum,
  p_entity_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from collaborators c
    where c.entity_type = p_entity_type
      and c.entity_id = p_entity_id
      and c.user_id = p_user_id
  );
$$;

create function is_editor(
  p_entity_type entity_type_enum,
  p_entity_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from collaborators c
    where c.entity_type = p_entity_type
      and c.entity_id = p_entity_id
      and c.user_id = p_user_id
      and c.role = 'editor'
  );
$$;

create function is_owner(
  p_entity_type entity_type_enum,
  p_entity_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
as $$
  select case p_entity_type
    when 'institution' then exists (
      select 1 from institutions i where i.id = p_entity_id and i.owner_id = p_user_id
    )
    when 'course' then exists (
      select 1 from courses c where c.id = p_entity_id and c.owner_id = p_user_id
    )
    when 'topic' then exists (
      select 1 from topics t where t.id = p_entity_id and t.owner_id = p_user_id
    )
    when 'resource' then exists (
      select 1 from resources r where r.id = p_entity_id and r.owner_id = p_user_id
    )
    else false
  end;
$$;

create function is_paid_user(p_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from subscriptions s
    where s.user_id = p_user_id
      and s.status in ('trialing', 'active')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

create function can_read_institution(p_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from institutions i
    where i.id = p_id
      and (
        i.visibility = 'public'
        or i.owner_id = auth.uid()
        or is_collaborator('institution', i.id, auth.uid())
      )
  );
$$;

create function can_read_course(p_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from courses c
    where c.id = p_id
      and (
        c.visibility = 'public'
        or c.owner_id = auth.uid()
        or is_collaborator('course', c.id, auth.uid())
        or is_owner('institution', c.institution_id, auth.uid())
        or is_collaborator('institution', c.institution_id, auth.uid())
      )
  );
$$;

create function can_read_topic(p_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from topics t
    join courses c on c.id = t.course_id
    where t.id = p_id
      and (
        t.visibility = 'public'
        or t.owner_id = auth.uid()
        or is_collaborator('topic', t.id, auth.uid())
        or is_owner('course', c.id, auth.uid())
        or is_collaborator('course', c.id, auth.uid())
        or is_owner('institution', c.institution_id, auth.uid())
        or is_collaborator('institution', c.institution_id, auth.uid())
      )
  );
$$;

create function can_read_resource(p_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from resources r
    join topics t on t.id = r.topic_id
    join courses c on c.id = t.course_id
    where r.id = p_id
      and (
        r.visibility = 'public'
        or r.owner_id = auth.uid()
        or is_collaborator('resource', r.id, auth.uid())
        or is_owner('topic', t.id, auth.uid())
        or is_collaborator('topic', t.id, auth.uid())
        or is_owner('course', c.id, auth.uid())
        or is_collaborator('course', c.id, auth.uid())
        or is_owner('institution', c.institution_id, auth.uid())
        or is_collaborator('institution', c.institution_id, auth.uid())
      )
  );
$$;

create function can_edit_institution(p_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from institutions i
    where i.id = p_id
      and (
        i.owner_id = auth.uid()
        or is_editor('institution', i.id, auth.uid())
      )
  );
$$;

create function can_edit_course(p_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from courses c
    where c.id = p_id
      and (
        c.owner_id = auth.uid()
        or is_editor('course', c.id, auth.uid())
        or is_owner('institution', c.institution_id, auth.uid())
        or is_editor('institution', c.institution_id, auth.uid())
      )
  );
$$;

create function can_edit_topic(p_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from topics t
    join courses c on c.id = t.course_id
    where t.id = p_id
      and (
        t.owner_id = auth.uid()
        or is_editor('topic', t.id, auth.uid())
        or is_owner('course', c.id, auth.uid())
        or is_editor('course', c.id, auth.uid())
        or is_owner('institution', c.institution_id, auth.uid())
        or is_editor('institution', c.institution_id, auth.uid())
      )
  );
$$;

create function can_edit_resource(p_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from resources r
    join topics t on t.id = r.topic_id
    join courses c on c.id = t.course_id
    where r.id = p_id
      and (
        r.owner_id = auth.uid()
        or is_editor('resource', r.id, auth.uid())
        or is_owner('topic', t.id, auth.uid())
        or is_editor('topic', t.id, auth.uid())
        or is_owner('course', c.id, auth.uid())
        or is_editor('course', c.id, auth.uid())
        or is_owner('institution', c.institution_id, auth.uid())
        or is_editor('institution', c.institution_id, auth.uid())
      )
  );
$$;

-- RLS
alter table profiles enable row level security;
alter table user_settings enable row level security;
alter table billing_customers enable row level security;
alter table subscriptions enable row level security;
alter table institutions enable row level security;
alter table courses enable row level security;
alter table topics enable row level security;
alter table resources enable row level security;
alter table notes enable row level security;
alter table note_chunks enable row level security;
alter table decks enable row level security;
alter table flashcards enable row level security;
alter table fsrs_state enable row level security;
alter table exams enable row level security;
alter table exam_items enable row level security;
alter table collaborators enable row level security;
alter table review_queue_cache enable row level security;

-- Profiles policies
create policy profiles_select on profiles
for select using (is_public or auth.uid() = id);

create policy profiles_insert on profiles
for insert with check (auth.uid() = id);

create policy profiles_update on profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

-- User settings policies
create policy user_settings_select on user_settings
for select using (auth.uid() = user_id);

create policy user_settings_insert on user_settings
for insert with check (auth.uid() = user_id);

create policy user_settings_update on user_settings
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Billing policies
create policy billing_customers_select on billing_customers
for select using (auth.uid() = user_id);

create policy billing_customers_insert on billing_customers
for insert with check (auth.uid() = user_id);

create policy billing_customers_update on billing_customers
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy subscriptions_select on subscriptions
for select using (auth.uid() = user_id);

create policy subscriptions_insert on subscriptions
for insert with check (auth.uid() = user_id);

create policy subscriptions_update on subscriptions
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Institutions policies
create policy institutions_select on institutions
for select using (can_read_institution(id));

create policy institutions_insert on institutions
for insert with check (auth.uid() = owner_id);

create policy institutions_update on institutions
for update using (can_edit_institution(id)) with check (can_edit_institution(id));

create policy institutions_delete on institutions
for delete using (can_edit_institution(id));

-- Courses policies
create policy courses_select on courses
for select using (can_read_course(id));

create policy courses_insert on courses
for insert with check (
  auth.uid() = owner_id
  and can_edit_institution(institution_id)
);

create policy courses_update on courses
for update using (can_edit_course(id))
with check (
  can_edit_course(id)
  and can_edit_institution(institution_id)
);

create policy courses_delete on courses
for delete using (can_edit_course(id));

-- Topics policies
create policy topics_select on topics
for select using (can_read_topic(id));

create policy topics_insert on topics
for insert with check (
  auth.uid() = owner_id
  and can_edit_course(course_id)
);

create policy topics_update on topics
for update using (can_edit_topic(id))
with check (
  can_edit_topic(id)
  and can_edit_course(course_id)
);

create policy topics_delete on topics
for delete using (can_edit_topic(id));

-- Resources policies
create policy resources_select on resources
for select using (can_read_resource(id));

create policy resources_insert on resources
for insert with check (
  auth.uid() = owner_id
  and can_edit_topic(topic_id)
);

create policy resources_update on resources
for update using (can_edit_resource(id))
with check (
  can_edit_resource(id)
  and can_edit_topic(topic_id)
);

create policy resources_delete on resources
for delete using (can_edit_resource(id));

-- Notes, decks, exams policies
create policy notes_select on notes
for select using (can_read_resource(id));

create policy notes_insert on notes
for insert with check (can_edit_resource(id));

create policy notes_update on notes
for update using (can_edit_resource(id)) with check (can_edit_resource(id));

create policy notes_delete on notes
for delete using (can_edit_resource(id));

create policy note_chunks_select on note_chunks
for select using (
  exists (
    select 1 from notes n
    join resources r on r.id = n.id
    where n.id = note_chunks.note_id
      and can_read_resource(r.id)
  )
);

create policy note_chunks_insert on note_chunks
for insert with check (
  exists (
    select 1 from notes n
    join resources r on r.id = n.id
    where n.id = note_chunks.note_id
      and can_edit_resource(r.id)
  )
);

create policy note_chunks_update on note_chunks
for update using (
  exists (
    select 1 from notes n
    join resources r on r.id = n.id
    where n.id = note_chunks.note_id
      and can_edit_resource(r.id)
  )
) with check (
  exists (
    select 1 from notes n
    join resources r on r.id = n.id
    where n.id = note_chunks.note_id
      and can_edit_resource(r.id)
  )
);

create policy note_chunks_delete on note_chunks
for delete using (
  exists (
    select 1 from notes n
    join resources r on r.id = n.id
    where n.id = note_chunks.note_id
      and can_edit_resource(r.id)
  )
);

create policy decks_select on decks
for select using (can_read_resource(id));

create policy decks_insert on decks
for insert with check (can_edit_resource(id));

create policy decks_update on decks
for update using (can_edit_resource(id)) with check (can_edit_resource(id));

create policy decks_delete on decks
for delete using (can_edit_resource(id));

create policy flashcards_select on flashcards
for select using (can_read_resource(deck_id));

create policy flashcards_insert on flashcards
for insert with check (can_edit_resource(deck_id));

create policy flashcards_update on flashcards
for update using (can_edit_resource(deck_id)) with check (can_edit_resource(deck_id));

create policy flashcards_delete on flashcards
for delete using (can_edit_resource(deck_id));

create policy fsrs_state_select on fsrs_state
for select using (auth.uid() = user_id);

create policy fsrs_state_insert on fsrs_state
for insert with check (auth.uid() = user_id);

create policy fsrs_state_update on fsrs_state
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy fsrs_state_delete on fsrs_state
for delete using (auth.uid() = user_id);

create policy exams_select on exams
for select using (can_read_resource(id));

create policy exams_insert on exams
for insert with check (can_edit_resource(id));

create policy exams_update on exams
for update using (can_edit_resource(id)) with check (can_edit_resource(id));

create policy exams_delete on exams
for delete using (can_edit_resource(id));

create policy exam_items_select on exam_items
for select using (
  exists (
    select 1 from exams e
    where e.id = exam_items.exam_id
      and can_read_resource(e.id)
  )
);

create policy exam_items_insert on exam_items
for insert with check (
  exists (
    select 1 from exams e
    where e.id = exam_items.exam_id
      and can_edit_resource(e.id)
  )
);

create policy exam_items_update on exam_items
for update using (
  exists (
    select 1 from exams e
    where e.id = exam_items.exam_id
      and can_edit_resource(e.id)
  )
) with check (
  exists (
    select 1 from exams e
    where e.id = exam_items.exam_id
      and can_edit_resource(e.id)
  )
);

create policy exam_items_delete on exam_items
for delete using (
  exists (
    select 1 from exams e
    where e.id = exam_items.exam_id
      and can_edit_resource(e.id)
  )
);

-- Collaborators policies
create policy collaborators_select on collaborators
for select using (
  is_owner(entity_type, entity_id, auth.uid())
  or is_collaborator(entity_type, entity_id, auth.uid())
);

create policy collaborators_insert on collaborators
for insert with check (is_owner(entity_type, entity_id, auth.uid()));

create policy collaborators_update on collaborators
for update using (is_owner(entity_type, entity_id, auth.uid()))
  with check (is_owner(entity_type, entity_id, auth.uid()));

create policy collaborators_delete on collaborators
for delete using (is_owner(entity_type, entity_id, auth.uid()));

-- Review queue cache policies
create policy review_queue_select on review_queue_cache
for select using (auth.uid() = user_id);

create policy review_queue_insert on review_queue_cache
for insert with check (auth.uid() = user_id);

create policy review_queue_delete on review_queue_cache
for delete using (auth.uid() = user_id);

-- Forking functions (set-based, executed in DB)
create function unique_institution_slug(p_slug text)
returns text
language plpgsql
stable
as $$
declare
  v_slug text := p_slug;
  v_suffix int := 1;
begin
  while exists (select 1 from institutions where slug = v_slug) loop
    v_slug := p_slug || '-' || v_suffix;
    v_suffix := v_suffix + 1;
  end loop;
  return v_slug;
end;
$$;

create function unique_course_slug(p_institution_id uuid, p_slug text)
returns text
language plpgsql
stable
as $$
declare
  v_slug text := p_slug;
  v_suffix int := 1;
begin
  while exists (
    select 1 from courses
    where institution_id = p_institution_id
      and slug = v_slug
  ) loop
    v_slug := p_slug || '-' || v_suffix;
    v_suffix := v_suffix + 1;
  end loop;
  return v_slug;
end;
$$;

create function unique_topic_slug(p_course_id uuid, p_slug text)
returns text
language plpgsql
stable
as $$
declare
  v_slug text := p_slug;
  v_suffix int := 1;
begin
  while exists (
    select 1 from topics
    where course_id = p_course_id
      and slug = v_slug
  ) loop
    v_slug := p_slug || '-' || v_suffix;
    v_suffix := v_suffix + 1;
  end loop;
  return v_slug;
end;
$$;

create function unique_resource_slug(p_topic_id uuid, p_slug text)
returns text
language plpgsql
stable
as $$
declare
  v_slug text := p_slug;
  v_suffix int := 1;
begin
  while exists (
    select 1 from resources
    where topic_id = p_topic_id
      and slug = v_slug
  ) loop
    v_slug := p_slug || '-' || v_suffix;
    v_suffix := v_suffix + 1;
  end loop;
  return v_slug;
end;
$$;

create function fork_resource(
  p_resource_id uuid,
  p_target_topic_id uuid default null,
  p_visibility visibility_enum default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_resource resources%rowtype;
  v_new_resource_id uuid;
  v_target_topic_id uuid;
  v_slug text;
  v_visibility visibility_enum;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_resource from resources where id = p_resource_id;
  if not found then
    raise exception 'resource not found';
  end if;

  if not can_read_resource(p_resource_id) then
    raise exception 'not authorized to fork';
  end if;

  v_target_topic_id := coalesce(p_target_topic_id, v_resource.topic_id);
  v_slug := unique_resource_slug(v_target_topic_id, v_resource.slug);
  if is_paid_user(v_user_id) then
    v_visibility := coalesce(p_visibility, 'private');
  else
    v_visibility := 'public';
  end if;

  insert into resources (
    topic_id, owner_id, resource_type, title, slug, visibility, forked_from_id
  )
  values (
    v_target_topic_id, v_user_id, v_resource.resource_type, v_resource.title,
    v_slug, v_visibility, v_resource.id
  )
  returning id into v_new_resource_id;

  if v_resource.resource_type = 'note' then
    insert into notes (id, markdown)
    select v_new_resource_id, n.markdown
    from notes n
    where n.id = v_resource.id;
  elsif v_resource.resource_type = 'deck' then
    insert into decks (id, description)
    select v_new_resource_id, d.description
    from decks d
    where d.id = v_resource.id;

    insert into flashcards (deck_id, front, back, position)
    select v_new_resource_id, f.front, f.back, f.position
    from flashcards f
    where f.deck_id = v_resource.id;

    insert into fsrs_state (card_id, user_id)
    select f.id, v_user_id
    from flashcards f
    where f.deck_id = v_new_resource_id;
  elsif v_resource.resource_type = 'exam' then
    insert into exams (id, format, instructions, time_limit_minutes)
    select v_new_resource_id, e.format, e.instructions, e.time_limit_minutes
    from exams e
    where e.id = v_resource.id;

    insert into exam_items (exam_id, item_type, prompt, options, correct_answer, points, position)
    select v_new_resource_id, i.item_type, i.prompt, i.options, i.correct_answer, i.points, i.position
    from exam_items i
    where i.exam_id = v_resource.id;
  end if;

  return v_new_resource_id;
end;
$$;

create function fork_topic(
  p_topic_id uuid,
  p_target_course_id uuid default null,
  p_visibility visibility_enum default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_topic topics%rowtype;
  v_new_topic_id uuid;
  v_target_course_id uuid;
  v_slug text;
  v_visibility visibility_enum;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_topic from topics where id = p_topic_id;
  if not found then
    raise exception 'topic not found';
  end if;

  if not can_read_topic(p_topic_id) then
    raise exception 'not authorized to fork';
  end if;

  v_target_course_id := coalesce(p_target_course_id, v_topic.course_id);
  v_slug := unique_topic_slug(v_target_course_id, v_topic.slug);
  if is_paid_user(v_user_id) then
    v_visibility := coalesce(p_visibility, 'private');
  else
    v_visibility := 'public';
  end if;

  insert into topics (
    course_id, owner_id, slug, name, description, visibility, forked_from_id
  )
  values (
    v_target_course_id, v_user_id, v_slug, v_topic.name, v_topic.description,
    v_visibility, v_topic.id
  )
  returning id into v_new_topic_id;

  -- Fork resources under this topic
  perform fork_resource(r.id, v_new_topic_id, p_visibility)
  from resources r
  where r.topic_id = v_topic.id;

  return v_new_topic_id;
end;
$$;

create function fork_course(
  p_course_id uuid,
  p_target_institution_id uuid default null,
  p_visibility visibility_enum default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_course courses%rowtype;
  v_new_course_id uuid;
  v_target_institution_id uuid;
  v_topic_id uuid;
  v_slug text;
  v_visibility visibility_enum;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_course from courses where id = p_course_id;
  if not found then
    raise exception 'course not found';
  end if;

  if not can_read_course(p_course_id) then
    raise exception 'not authorized to fork';
  end if;

  v_target_institution_id := coalesce(p_target_institution_id, v_course.institution_id);
  v_slug := unique_course_slug(v_target_institution_id, v_course.slug);
  if is_paid_user(v_user_id) then
    v_visibility := coalesce(p_visibility, 'private');
  else
    v_visibility := 'public';
  end if;

  insert into courses (
    institution_id, owner_id, slug, name, description, visibility, forked_from_id
  )
  values (
    v_target_institution_id, v_user_id, v_slug, v_course.name, v_course.description,
    v_visibility, v_course.id
  )
  returning id into v_new_course_id;

  for v_topic_id in
    select id from topics where course_id = v_course.id
  loop
    perform fork_topic(v_topic_id, v_new_course_id, p_visibility);
  end loop;

  return v_new_course_id;
end;
$$;

create function fork_institution(
  p_institution_id uuid,
  p_visibility visibility_enum default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_inst institutions%rowtype;
  v_new_institution_id uuid;
  v_course_id uuid;
  v_slug text;
  v_visibility visibility_enum;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_inst from institutions where id = p_institution_id;
  if not found then
    raise exception 'institution not found';
  end if;

  if not can_read_institution(p_institution_id) then
    raise exception 'not authorized to fork';
  end if;

  v_slug := unique_institution_slug(v_inst.slug);
  if is_paid_user(v_user_id) then
    v_visibility := coalesce(p_visibility, 'private');
  else
    v_visibility := 'public';
  end if;

  insert into institutions (
    owner_id, slug, name, description, visibility, forked_from_id
  )
  values (
    v_user_id, v_slug, v_inst.name, v_inst.description, v_visibility, v_inst.id
  )
  returning id into v_new_institution_id;

  for v_course_id in
    select id from courses where institution_id = v_inst.id
  loop
    perform fork_course(v_course_id, v_new_institution_id, p_visibility);
  end loop;

  return v_new_institution_id;
end;
$$;

-- Review queue refresh helper
create function refresh_review_queue_cache(
  p_user_id uuid,
  p_day date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from review_queue_cache
  where user_id = p_user_id
    and due_date = p_day;

  insert into review_queue_cache (user_id, card_id, due_date, due_at)
  select s.user_id, s.card_id, p_day, s.due_at
  from fsrs_state s
  where s.user_id = p_user_id
    and s.due_at < (p_day + 1)::timestamptz;
end;
$$;

commit;
