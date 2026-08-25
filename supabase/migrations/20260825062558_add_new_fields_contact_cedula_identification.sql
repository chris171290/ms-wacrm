ALTER TABLE contacts
  ADD COLUMN identificacion TEXT;

-- Opcional: si querés evitar duplicados de identificación por cuenta
CREATE UNIQUE INDEX contacts_identificacion_unique
  ON contacts (account_id, identificacion)
  WHERE identificacion IS NOT NULL;