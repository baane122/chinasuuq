-- ChinaSuuq - AI Provider settings (admin-configurable)
-- Stores API key, base URL, and model name in the database.
-- Only admin role can read/write via RLS policies.

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by TEXT REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the AI settings row (empty by default — admin fills it in)
INSERT INTO app_settings (key, value) VALUES
  ('ai_provider', jsonb_build_object(
    'api_key', '',
    'base_url', '',
    'model', '',
    'is_configured', false
  ))
ON CONFLICT (key) DO NOTHING;

-- RLS: only authenticated admins can read/write
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read settings"
  ON app_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update settings"
  ON app_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert settings"
  ON app_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Index for fast lookups
CREATE INDEX idx_app_settings_key ON app_settings(key);
