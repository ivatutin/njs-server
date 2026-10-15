-- Разовая чистка встроенных ролей Keycloak из shadow-БД (ADR-0020).
-- Денлист обязан совпадать с BUILTIN_REALM_ROLES / DEFAULT_ROLES_PREFIX
-- в src/modules/auth/infrastructure/keycloak/realm-roles.ts.
UPDATE "user"."users"
SET roles = COALESCE(
  ARRAY(
    SELECT r
    FROM unnest(roles) AS r
    WHERE r NOT IN ('offline_access', 'uma_authorization')
      AND r NOT LIKE 'default-roles-%'
  ),
  ARRAY[]::text[]
)
WHERE roles IS NOT NULL;
