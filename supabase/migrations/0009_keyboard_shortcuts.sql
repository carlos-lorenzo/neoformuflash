-- Phase 00b: keyboard shortcut infrastructure
-- Adds the per-user toggle for bare-letter shortcuts.
-- Default true so no existing profile breaks.

ALTER TABLE profiles
  ADD COLUMN keyboard_shortcuts_enabled boolean DEFAULT true NOT NULL;
