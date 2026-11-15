CREATE TABLE IF NOT EXISTS candidates (
  id uuid PRIMARY KEY,
  internal_reference text NOT NULL UNIQUE,
  name text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS candidate_sessions (
  id uuid PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES candidates(id),
  session_code text NOT NULL CHECK (session_code = '2025-2026'),
  curriculum text NOT NULL CHECK (curriculum = 'GCE'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, session_code)
);
CREATE TABLE IF NOT EXISTS academic_revisions (
  id uuid PRIMARY KEY,
  candidate_session_id uuid NOT NULL REFERENCES candidate_sessions(id),
  revision_no integer NOT NULL,
  snapshot jsonb NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_session_id, revision_no)
);
CREATE TABLE IF NOT EXISTS exam_revisions (
  id uuid PRIMARY KEY,
  candidate_session_id uuid NOT NULL REFERENCES candidate_sessions(id),
  unit_code text NOT NULL,
  revision_no integer NOT NULL,
  snapshot jsonb NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_session_id, unit_code, revision_no)
);
CREATE TABLE IF NOT EXISTS practical_revisions (
  id uuid PRIMARY KEY,
  candidate_session_id uuid NOT NULL REFERENCES candidate_sessions(id),
  department_code text NOT NULL,
  revision_no integer NOT NULL,
  snapshot jsonb NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_session_id, department_code, revision_no)
);
CREATE TABLE IF NOT EXISTS evaluations (
  id uuid PRIMARY KEY,
  actor_id text NOT NULL,
  request_id text NOT NULL,
  candidate_session_id uuid NOT NULL REFERENCES candidate_sessions(id),
  academic_revision_id uuid NOT NULL REFERENCES academic_revisions(id),
  exam_revision_ids uuid[] NOT NULL DEFAULT '{}',
  practical_revision_ids uuid[] NOT NULL DEFAULT '{}',
  phase text NOT NULL CHECK (phase IN ('UNITS','DEPARTMENTS')),
  policy_version text NOT NULL,
  policy_hash text NOT NULL,
  engine_version text NOT NULL,
  input_snapshot jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, request_id)
);
CREATE INDEX IF NOT EXISTS evaluations_candidate_session_idx ON evaluations(candidate_session_id, created_at DESC);
CREATE TABLE IF NOT EXISTS choice_list_drafts (
  id uuid PRIMARY KEY,
  candidate_session_id uuid NOT NULL REFERENCES candidate_sessions(id),
  evaluation_id uuid NOT NULL REFERENCES evaluations(id),
  items jsonb NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  actor_id text NOT NULL,
  action text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
