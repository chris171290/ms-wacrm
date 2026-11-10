-- Amplía los tipos de documento permitidos en deal_attachments:
-- cedula, comprobante_transferencia + papeleta_votacion, otros.
--
-- El CHECK original era inline (sin nombre explícito), así que en lugar de
-- asumir su nombre se elimina cualquier CHECK de la tabla que mencione
-- document_type y se vuelve a crear con nombre propio. Idempotente.

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.deal_attachments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%document_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.deal_attachments DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.deal_attachments
  ADD CONSTRAINT deal_attachments_document_type_check
  CHECK (document_type IN (
    'cedula',
    'comprobante_transferencia',
    'papeleta_votacion',
    'otros'
  ));