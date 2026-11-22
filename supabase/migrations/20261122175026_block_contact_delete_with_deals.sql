-- Un contacto con ventas relacionadas ya no se puede borrar.
-- NO ACTION (en vez de RESTRICT) comprueba la regla al final de la
-- sentencia, así que borrar una cuenta completa, que arrastra contactos
-- y deals a la vez, sigue funcionando.
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_contact_id_fkey;

ALTER TABLE deals
  ADD CONSTRAINT deals_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
    ON DELETE NO ACTION;