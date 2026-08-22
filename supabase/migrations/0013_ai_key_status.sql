-- ============ AI key status columns ============
-- Add usage, validated_at, is_valid to user_api_keys.
-- These columns were added in the application code (lib/db/ai-keys.ts) but
-- the migration was not created in phase 05. This migration adds them.

alter table user_api_keys
  add column if not exists usage jsonb,
  add column if not exists validated_at timestamptz,
  add column if not exists is_valid boolean;

-- Column grants for the new columns (authenticated role)
-- The authenticated role already has SELECT on (user_id, provider, last_four, created_at)
-- from 0007_rls_and_grants.sql. Extend it to include the new columns.
grant select (usage, validated_at, is_valid) on user_api_keys to authenticated;