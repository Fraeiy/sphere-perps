-- Expose perps schema to PostgREST roles

GRANT USAGE ON SCHEMA perps TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA perps TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA perps TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA perps TO service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA perps TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA perps
  GRANT SELECT ON TABLES TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA perps
  GRANT ALL ON TABLES TO service_role;