-- ============ spaced repetition: FSRS-6 (ADR-001) ============
-- Per-user, decoupled from card content. Scheduling maths lives in ts-fsrs,
-- NOT in the database.
create table card_states (
  user_id          uuid not null references profiles(id) on delete cascade,
  card_id          uuid not null references cards(id) on delete cascade,
  deck_id          uuid not null references decks(id) on delete cascade, -- denormalised: the queue is per-deck
  stability        real not null default 0.0 check (stability >= 0.0),
  difficulty       real not null default 5.0 check (difficulty between 1.0 and 10.0),
  phase            card_phase not null default 'new',
  -- ts-fsrs's own step counter within the Learning/Relearning short-term steps
  -- (1m/10m). Must round-trip through apply_review unchanged, or a card on its
  -- second learning step gets treated as step 1 again and never graduates.
  learning_steps   integer not null default 0 check (learning_steps >= 0),
  reps             integer not null default 0 check (reps >= 0),
  -- highest cards.content_version this user has accepted. See decision 8.
  seen_version     integer not null default 1 check (seen_version >= 1),
  lapses           integer not null default 0 check (lapses >= 0),
  due_at           timestamptz not null default now(),
  last_reviewed_at timestamptz,
  primary key (user_id, card_id)
);
-- Serves the actual query: "what is due for me, in this deck, soonest first".
create index card_states_queue_idx on card_states (user_id, deck_id, due_at);
create index card_states_card_idx  on card_states (card_id);

-- Every column below exists so the official FSRS optimizer can be run later.
-- Dropping any of them makes the logs unusable for training. Do not trim this table.
create table review_logs (
  id                   bigserial primary key,
  user_id              uuid not null references profiles(id) on delete cascade,
  card_id              uuid not null references cards(id) on delete cascade,
  rating               review_rating not null,
  phase                card_phase not null,            -- state BEFORE this review
  elapsed_days         real not null check (elapsed_days >= 0.0),   -- true time since last review
  scheduled_days       real not null check (scheduled_days >= 0.0), -- interval it was scheduled for
  review_stability     real not null check (review_stability >= 0.0),
  -- 0.0 is a valid PRE-review value: ts-fsrs reports difficulty=0 for a card's
  -- first-ever review (not yet assessed). card_states.difficulty stays 1.0-10.0
  -- because it only ever holds a POST-review value.
  review_difficulty    real not null check (review_difficulty between 0.0 and 10.0),
  elapsed_ms           integer check (elapsed_ms >= 0), -- RECORDED, never used for scheduling in MVP
  edited_during_review boolean not null default false,
  reviewed_at          timestamptz not null default now()
);
create index review_logs_user_time_idx on review_logs (user_id, reviewed_at desc);
create index review_logs_fit_idx       on review_logs (user_id, card_id, reviewed_at asc);

-- Per-user optimised weights. V2 — the table exists now so adding it needs no migration.
-- Global defaults live in packages/contracts/src/srs.ts, NOT as a null-user_id row here
-- (a primary key column cannot be null).
create table fsrs_parameters (
  user_id    uuid primary key references profiles(id) on delete cascade,
  weights    double precision[] not null check (array_length(weights, 1) = 21),
  updated_at timestamptz not null default now()
);

create table streaks (
  user_id          uuid primary key references profiles(id) on delete cascade,
  current_streak   integer not null default 0,
  longest_streak   integer not null default 0,
  last_active_date date
);
