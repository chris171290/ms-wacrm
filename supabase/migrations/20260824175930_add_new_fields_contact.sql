-- 1. Crear el tipo ENUM para el campo estado
CREATE TYPE contact_status AS ENUM (
  'En Progreso', 
  'Verificacion', 
  'Negado', 
  'Aprobado', 
  'Desancle',
  'ASCP'
);

-- 2. Modificar la tabla contacts para agregar las nuevas columnas en minúsculas y snake_case
ALTER TABLE contacts 
  ADD COLUMN biometria BOOLEAN DEFAULT false,
  ADD COLUMN orden_venta TEXT,
  ADD COLUMN estado contact_status DEFAULT 'En Progreso',
  Add COLUMN ;