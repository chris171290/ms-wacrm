ALTER TABLE deals
  ADD COLUMN esta_integrado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN twenty_opportunity_id TEXT;

-- Mientras esta_integrado = true, nadie puede actualizar el deal
-- excepto admin/owner (quienes lo pueden "desbloquear"). Reemplaza la
-- política de 20260928120000_restrict_agent_visibility.sql sumando
-- esta condición extra; lo demás queda igual.
DROP POLICY IF EXISTS deals_update ON deals;
CREATE POLICY deals_update ON deals FOR UPDATE USING (
  is_account_member(account_id, 'agent')
  AND (NOT is_account_agent_only(account_id) OR assigned_to = current_profile_id())
  AND (NOT esta_integrado OR is_account_member(account_id, 'admin'))
) WITH CHECK (
  is_account_member(account_id, 'agent')
  AND (NOT is_account_agent_only(account_id) OR assigned_to = current_profile_id())
  AND (NOT esta_integrado OR is_account_member(account_id, 'admin'))
);