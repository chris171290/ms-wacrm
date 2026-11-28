-- Find open conversations whose latest customer message remains
-- unanswered by a human agent past the configured cutoff.
CREATE INDEX IF NOT EXISTS idx_messages_unanswered_sender_latest
  ON messages(conversation_id, created_at DESC)
  WHERE sender_type IN ('customer', 'agent');

CREATE INDEX IF NOT EXISTS idx_conversations_unanswered_scan
  ON conversations(account_id, status, assigned_agent_id)
  WHERE status IN ('open', 'pending') AND assigned_agent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS unanswered_conversation_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  inbound_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'sent', 'failed')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  UNIQUE (automation_id, conversation_id, inbound_message_id)
);

CREATE INDEX IF NOT EXISTS idx_unanswered_alerts_retry
  ON unanswered_conversation_alerts(status, claimed_at)
  WHERE status IN ('processing', 'failed');

ALTER TABLE unanswered_conversation_alerts ENABLE ROW LEVEL SECURITY;
-- Access is server-side only through the service-role client.

CREATE OR REPLACE FUNCTION get_unanswered_conversations(
  p_automation_id UUID,
  p_account_id UUID,
  p_cutoff TIMESTAMPTZ
)
RETURNS TABLE (
  conversation_id UUID,
  contact_id UUID,
  assigned_agent_id UUID,
  last_customer_message_id UUID,
  last_customer_message_at TIMESTAMPTZ,
  last_customer_message_text TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.contact_id,
    c.assigned_agent_id,
    inbound.id,
    inbound.created_at,
    inbound.content_text
  FROM conversations c
  JOIN LATERAL (
    SELECT m.id, m.created_at, m.content_text
    FROM messages m
    WHERE m.conversation_id = c.id
      AND m.sender_type = 'customer'
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) inbound ON TRUE
  LEFT JOIN LATERAL (
    SELECT m.id, m.created_at
    FROM messages m
    WHERE m.conversation_id = c.id
      AND m.sender_type = 'agent'
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) reply ON TRUE
  WHERE c.account_id = p_account_id
    AND c.status IN ('open', 'pending')
    AND c.assigned_agent_id IS NOT NULL
    AND inbound.created_at < p_cutoff
    AND (
      reply.id IS NULL
      OR (reply.created_at, reply.id) < (inbound.created_at, inbound.id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM unanswered_conversation_alerts existing
      WHERE existing.automation_id = p_automation_id
        AND existing.conversation_id = c.id
        AND existing.inbound_message_id = inbound.id
        AND (
          existing.status = 'sent'
          OR (
            existing.status = 'processing'
            AND existing.claimed_at >= NOW() - INTERVAL '10 minutes'
          )
        )
    )
  ORDER BY inbound.created_at ASC
  LIMIT 200;
$$;

ALTER FUNCTION get_unanswered_conversations(UUID, UUID, TIMESTAMPTZ) OWNER TO postgres;
REVOKE ALL ON FUNCTION get_unanswered_conversations(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_unanswered_conversations(UUID, UUID, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_unanswered_conversations(UUID, UUID, TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION claim_unanswered_conversation_alert(
  p_account_id UUID,
  p_automation_id UUID,
  p_conversation_id UUID,
  p_inbound_message_id UUID
)
RETURNS UUID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO unanswered_conversation_alerts (
    account_id,
    automation_id,
    conversation_id,
    inbound_message_id,
    status,
    claimed_at,
    attempt_count,
    last_error
  )
  VALUES (
    p_account_id,
    p_automation_id,
    p_conversation_id,
    p_inbound_message_id,
    'processing',
    NOW(),
    1,
    NULL
  )
  ON CONFLICT (automation_id, conversation_id, inbound_message_id)
  DO UPDATE SET
    status = 'processing',
    claimed_at = NOW(),
    attempt_count = unanswered_conversation_alerts.attempt_count + 1,
    last_error = NULL
  WHERE unanswered_conversation_alerts.status = 'failed'
     OR (
       unanswered_conversation_alerts.status = 'processing'
       AND unanswered_conversation_alerts.claimed_at < NOW() - INTERVAL '10 minutes'
     )
  RETURNING id;
$$;

ALTER FUNCTION claim_unanswered_conversation_alert(UUID, UUID, UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION claim_unanswered_conversation_alert(UUID, UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_unanswered_conversation_alert(UUID, UUID, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION claim_unanswered_conversation_alert(UUID, UUID, UUID, UUID) TO service_role;
