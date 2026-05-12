-- Init script for postgres container. Runs only on first startup
-- (when /var/lib/postgresql/data is empty).

-- Create separate database for Keycloak
CREATE DATABASE keycloak;

-- Create "user" schema in the app database (Prisma multiSchema requires
-- the schema to exist before running migrations)
\c app
CREATE SCHEMA IF NOT EXISTS "user";
