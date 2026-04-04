CREATE TABLE workspaces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  business_name TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('launch', 'build', 'scale')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  current_stage INTEGER DEFAULT 1,
  currency TEXT DEFAULT 'EGP' CHECK (currency IN ('EGP', 'USD')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stage_outputs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 6),
  stage_name TEXT NOT NULL,
  input_data JSONB,
  output_data JSONB,
  raw_output TEXT,
  prompt_used TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'needs_review')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE transcripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  raw_transcript TEXT NOT NULL,
  duration_seconds INTEGER,
  language TEXT DEFAULT 'en',
  extracted_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated access" ON workspaces
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON stage_outputs
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON transcripts
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated access" ON assets
  FOR ALL USING (auth.role() = 'authenticated');
