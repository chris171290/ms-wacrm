-- La orden de venta no puede repetirse dentro de una misma cuenta.
-- Los deals sin orden (NULL) no cuentan, así que pueden existir varios.
CREATE UNIQUE INDEX IF NOT EXISTS deals_orden_de_venta_unique
  ON deals (account_id, orden_de_venta)
  WHERE orden_de_venta IS NOT NULL;