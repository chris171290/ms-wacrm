CREATE TABLE automation_round_robin_state (
  step_id UUID PRIMARY KEY REFERENCES automation_steps(id) ON DELETE CASCADE,
  last_assigned_user_id UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);