-- Documentos adjuntos de un deal (cédula, comprobante de transferencia).
-- Bucket PRIVADO y sin políticas en storage.objects: solo el service role
-- (rutas /api/deals/[id]/attachments) puede leer o escribir los archivos.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'deal-documents',
  'deal-documents',
  FALSE,
  8388608, -- 8 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS deal_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id       UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('cedula', 'comprobante_transferencia')),
  storage_path  TEXT NOT NULL UNIQUE,
  file_name     TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  sha256        TEXT NOT NULL,
  uploaded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_attachments_deal ON deal_attachments(deal_id);
-- Evita adjuntar dos veces exactamente el mismo archivo al mismo deal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_attachments_deal_sha ON deal_attachments(deal_id, sha256);

ALTER TABLE deal_attachments ENABLE ROW LEVEL SECURITY;

-- Solo lectura para usuarios: agent+ y únicamente de deals que ya pueden ver
-- (el EXISTS hereda la RLS de deals: un agente solo ve los suyos).
-- Sin políticas de INSERT/UPDATE/DELETE: las escrituras van por service role.
DROP POLICY IF EXISTS deal_attachments_select ON deal_attachments;
CREATE POLICY deal_attachments_select ON deal_attachments FOR SELECT USING (
  is_account_member(account_id, 'agent')
  AND EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_attachments.deal_id)
);