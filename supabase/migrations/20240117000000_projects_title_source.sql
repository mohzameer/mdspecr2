ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS title_source text NOT NULL DEFAULT 'first_heading'
  CHECK (title_source IN ('first_heading', 'filename'));
