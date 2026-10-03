CREATE TYPE tipo_venta AS ENUM (
  'Línea Nueva',
  'Portabilidad Prepago',
  'Migración'
);

CREATE TYPE operadora AS ENUM (
  'Claro',
  'Movistar',
  'CNT',
  'Tuenti'
);

ALTER TABLE deals
  ADD COLUMN tipo_de_venta tipo_venta,
  ADD COLUMN operadora operadora;