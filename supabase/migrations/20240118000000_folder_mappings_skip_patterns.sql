ALTER TABLE folder_mappings
  ADD COLUMN IF NOT EXISTS skip_patterns text[] NOT NULL DEFAULT '{}';
