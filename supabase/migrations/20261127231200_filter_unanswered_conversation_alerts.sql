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
    AND COALESCE(c.unread_count, 0) > 0
    AND (inbound.created_at AT TIME ZONE 'America/Guayaquil')::date
      = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date
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
