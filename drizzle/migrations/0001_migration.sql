CREATE TABLE IF NOT EXISTS public.cloud_saves (
  key_hash text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cloud_saves TO service_role;
ALTER TABLE public.cloud_saves ENABLE ROW LEVEL SECURITY;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.cloud_save_put(_key text, _payload jsonb)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE ts timestamptz := now();
BEGIN
  IF _key IS NULL OR length(_key) < 12 OR length(_key) > 64 THEN RAISE EXCEPTION 'invalid key'; END IF;
  IF pg_column_size(_payload) > 3000000 THEN RAISE EXCEPTION 'save too large'; END IF;
  INSERT INTO public.cloud_saves(key_hash, payload, updated_at)
  VALUES (encode(extensions.digest(upper(_key), 'sha256'), 'hex'), _payload, ts)
  ON CONFLICT (key_hash) DO UPDATE SET payload = EXCLUDED.payload, updated_at = ts;
  RETURN ts;
END $$;

CREATE OR REPLACE FUNCTION public.cloud_save_get(_key text)
RETURNS TABLE(payload jsonb, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT c.payload, c.updated_at FROM public.cloud_saves c
  WHERE c.key_hash = encode(extensions.digest(upper(_key), 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION public.cloud_save_put(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cloud_save_get(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cloud_save_put(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_save_get(text) TO anon, authenticated;