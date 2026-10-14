import { registerAs } from '@nestjs/config';

export default registerAs('keycloak', () => {
  const url = process.env.KEYCLOAK_URL;
  const realm = process.env.KEYCLOAK_REALM;

  return {
    url,
    realm,
    clientId: process.env.KEYCLOAK_CLIENT_ID,
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
    /**
     * Ожидаемый `iss` в токенах Keycloak.
     *
     * По умолчанию — `${KEYCLOAK_URL}/realms/${realm}` (прежнее поведение).
     * Явное значение нужно там, где Keycloak «считает себя» публичным адресом
     * (`KC_HOSTNAME`), а приложение обращается к нему по внутреннему: например,
     * в Docker `KEYCLOAK_URL=http://keycloak:8080`, а issuer —
     * `http://localhost:8088/realms/app`. См. ADR-0013.
     */
    issuer: process.env.KEYCLOAK_ISSUER || `${url}/realms/${realm}`,
  };
});

