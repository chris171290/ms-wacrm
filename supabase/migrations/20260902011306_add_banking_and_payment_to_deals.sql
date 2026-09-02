-- Tabla de catálogo para entidades bancarias
CREATE TABLE entidades_bancarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL
);

-- Enum para forma de pago
CREATE TYPE forma_pago AS ENUM (
  'Efectivo',
  'Tarjeta de crédito/débito',
  'Transferencia bancaria'
);

ALTER TABLE deals
  ADD COLUMN icc TEXT,
  ADD COLUMN mesh BOOLEAN DEFAULT false,
  ADD COLUMN forma_de_pago forma_pago,
  ADD COLUMN entidad_bancaria_id UUID REFERENCES entidades_bancarias(id),
  ADD COLUMN numero_cuenta TEXT;