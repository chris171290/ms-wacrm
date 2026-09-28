-- Un agente solo ve/edita los deals y conversaciones asignados a él.
-- owner/admin/viewer siguen viendo todo (viewer sin poder escribir).
-- Contactos NO se tocan: el agente los sigue viendo todos.

-- true si quien consulta es 'agent' en esa cuenta
CREATE OR REPLACE FUNCTION is_account_agent_only(target_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND p.account_role = 'agent'
  );
$$;

-- profiles.id del usuario actual (deals.assigned_to referencia profiles.id)
CREATE OR REPLACE FUNCTION current_profile_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION is_account_agent_only(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION current_profile_id() TO authenticated, service_role;

-- ============================================================
-- DEALS (assigned_to = profiles.id)
-- Los deals sin asignar (NULL) solo los ve owner/admin/viewer.
-- ============================================================
DROP POLICY IF EXISTS deals_select ON deals;
DROP POLICY IF EXISTS deals_insert ON deals;
DROP POLICY IF EXISTS deals_update ON deals;
DROP POLICY IF EXISTS deals_delete ON deals;

CREATE POLICY deals_select ON deals FOR SELECT USING (
  is_account_member(account_id)
  AND (NOT is_account_agent_only(account_id) OR assigned_to = current_profile_id())
);
CREATE POLICY deals_insert ON deals FOR INSERT WITH CHECK (
  is_account_member(account_id, 'agent')
  AND (NOT is_account_agent_only(account_id) OR assigned_to = current_profile_id())
);
CREATE POLICY deals_update ON deals FOR UPDATE USING (
  is_account_member(account_id, 'agent')
  AND (NOT is_account_agent_only(account_id) OR assigned_to = current_profile_id())
) WITH CHECK (
  is_account_member(account_id, 'agent')
  AND (NOT is_account_agent_only(account_id) OR assigned_to = current_profile_id())
);
CREATE POLICY deals_delete ON deals FOR DELETE USING (
  is_account_member(account_id, 'agent')
  AND (NOT is_account_agent_only(account_id) OR assigned_to = current_profile_id())
);

-- ============================================================
-- CONVERSATIONS (assigned_agent_id = auth.uid())
-- messages hereda esta visibilidad vía su EXISTS sobre conversations.
-- ============================================================
DROP POLICY IF EXISTS conversations_select ON conversations;
DROP POLICY IF EXISTS conversations_insert ON conversations;
DROP POLICY IF EXISTS conversations_update ON conversations;
DROP POLICY IF EXISTS conversations_delete ON conversations;

CREATE POLICY conversations_select ON conversations FOR SELECT USING (
  is_account_member(account_id)
  AND (NOT is_account_agent_only(account_id) OR assigned_agent_id = auth.uid())
);
CREATE POLICY conversations_insert ON conversations FOR INSERT WITH CHECK (
  is_account_member(account_id, 'agent')
  AND (NOT is_account_agent_only(account_id) OR assigned_agent_id = auth.uid())
);
CREATE POLICY conversations_update ON conversations FOR UPDATE USING (
  is_account_member(account_id, 'agent')
  AND (NOT is_account_agent_only(account_id) OR assigned_agent_id = auth.uid())
) WITH CHECK (
  is_account_member(account_id, 'agent')
  AND (NOT is_account_agent_only(account_id) OR assigned_agent_id = auth.uid())
);
CREATE POLICY conversations_delete ON conversations FOR DELETE USING (
  is_account_member(account_id, 'agent')
  AND (NOT is_account_agent_only(account_id) OR assigned_agent_id = auth.uid())
);