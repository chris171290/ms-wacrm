-- Mensajes entrantes/salientes por día, agrupados en la zona horaria del usuario.
-- SECURITY INVOKER (por defecto): se ejecuta con los permisos y el RLS de quien consulta.
CREATE OR REPLACE FUNCTION conversations_series(p_days integer, p_tz text)
RETURNS TABLE(day date, incoming bigint, outgoing bigint)
LANGUAGE sql
STABLE
AS $$
  WITH days AS (
    SELECT generate_series(
      (now() AT TIME ZONE p_tz)::date - (p_days - 1),
      (now() AT TIME ZONE p_tz)::date,
      interval '1 day'
    )::date AS day
  ),
  counts AS (
    SELECT
      (m.created_at AT TIME ZONE p_tz)::date AS day,
      count(*) FILTER (WHERE m.sender_type = 'customer') AS incoming,
      count(*) FILTER (WHERE m.sender_type IS DISTINCT FROM 'customer') AS outgoing
    FROM messages m
    WHERE m.created_at >=
      (((now() AT TIME ZONE p_tz)::date - (p_days - 1))::timestamp AT TIME ZONE p_tz)
    GROUP BY 1
  )
  SELECT d.day, COALESCE(c.incoming, 0), COALESCE(c.outgoing, 0)
  FROM days d
  LEFT JOIN counts c USING (day)
  ORDER BY d.day;
$$;

GRANT EXECUTE ON FUNCTION conversations_series(integer, text) TO authenticated;