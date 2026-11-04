-- Agentes: no pueden mover deals entre etapas; solo pueden editar/borrar deals
-- en las dos primeras etapas del pipeline (por `position`) y crear solo en la
-- primera. owner/admin no cambian. Las llamadas con service role
-- (auth.uid() IS NULL: automatizaciones, webhook) tampoco se restringen.

-- Rango 0-based de una etapa dentro de su pipeline. NULL si la etapa no existe
-- (así las políticas fallan cerradas en vez de abrirse).
CREATE OR REPLACE FUNCTION pipeline_stage_rank(target_stage_id UUID)
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(*) FROM pipeline_stages o
    WHERE o.pipeline_id = s.pipeline_id AND o.position < s.position
  )
  FROM pipeline_stages s
  WHERE s.id = target_stage_id;
$$;

GRANT EXECUTE ON FUNCTION pipeline_stage_rank(UUID) TO authenticated, service_role;

-- Una política no puede comparar OLD vs NEW; para impedir el cambio de etapa
-- hace falta un trigger.
CREATE OR REPLACE FUNCTION prevent_agent_deal_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id
     AND auth.uid() IS NOT NULL
     AND is_account_agent_only(OLD.account_id) THEN
    RAISE EXCEPTION 'Los agentes no pueden mover negocios entre etapas'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_agent_deal_stage_change ON deals;
CREATE TRIGGER trg_prevent_agent_deal_stage_change
  BEFORE UPDATE OF stage_id ON deals
  FOR EACH ROW EXECUTE FUNCTION prevent_agent_deal_stage_change();

DROP POLICY IF EXISTS deals_insert ON deals;
DROP POLICY IF EXISTS deals_update ON deals;
DROP POLICY IF EXISTS deals_delete ON deals;

CREATE POLICY deals_insert ON deals FOR INSERT WITH CHECK (
  is_account_member(account_id, 'agent')
  AND (
    NOT is_account_agent_only(account_id)
    OR (assigned_to = current_profile_id() AND pipeline_stage_rank(stage_id) = 0)
  )
);

CREATE POLICY deals_update ON deals FOR UPDATE USING (
  is_account_member(account_id, 'agent')
  AND (
    NOT is_account_agent_only(account_id)
    OR (assigned_to = current_profile_id() AND pipeline_stage_rank(stage_id) < 2)
  )
  AND (NOT esta_integrado OR is_account_member(account_id, 'admin'))
) WITH CHECK (
  is_account_member(account_id, 'agent')
  AND (
    NOT is_account_agent_only(account_id)
    OR (assigned_to = current_profile_id() AND pipeline_stage_rank(stage_id) < 2)
  )
  AND (NOT esta_integrado OR is_account_member(account_id, 'admin'))
);

CREATE POLICY deals_delete ON deals FOR DELETE USING (
  is_account_member(account_id, 'agent')
  AND (
    NOT is_account_agent_only(account_id)
    OR (assigned_to = current_profile_id() AND pipeline_stage_rank(stage_id) < 2)
  )
);