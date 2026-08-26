-- 1. Cambiar la columna a TEXT y ELIMINAR el valor por defecto viejo
ALTER TABLE contacts 
  ALTER COLUMN estado DROP DEFAULT,
  ALTER COLUMN estado SET DATA TYPE TEXT;

-- 2. Ahora sí puedes eliminar el tipo ENUM viejo sin errores
DROP TYPE contact_status;

-- 3. Crear el nuevo tipo ENUM con los 3 estados
CREATE TYPE contact_status AS ENUM (
  'En Progreso', 
  'Aprobado', 
  'Negado'
);

-- 4. Homologar los registros antiguos (Verificacion y Desancle -> En Progreso)
UPDATE contacts 
SET estado = 'En Progreso' 
WHERE estado IN ('Verificacion', 'Desancle') OR estado IS NULL;

-- 5. Volver a asignar el tipo ENUM y definir el NUEVO valor por defecto
ALTER TABLE contacts 
  ALTER COLUMN estado SET DATA TYPE contact_status USING estado::contact_status,
  ALTER COLUMN estado SET DEFAULT 'En Progreso'::contact_status;
