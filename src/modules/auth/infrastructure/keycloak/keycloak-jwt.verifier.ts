import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { KeycloakHttpClient } from './keycloak-http.client';

/**
 * Verifies Keycloak-issued JWT access tokens using JWKS public keys.
 * Caching + rate limiting handled by jwks-rsa to avoid hammering Keycloak
 * on every request.
 */
@Injectable()
export class KeycloakJwtVerifier {
  private readonly client: JwksClient;
  private readonly issuer: string;

  constructor(httpClient: KeycloakHttpClient) {
    this.client = new JwksClient({
      jwksUri: httpClient.certsUrl,
      cache: true,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
    this.issuer = httpClient.issuerUrl;
  }

  async verify(token: string): Promise<jwt.JwtPayload> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header?.kid) {
      throw new Error('Malformed JWT: no kid in header');
    }

    const key = await this.client.getSigningKey(decoded.header.kid);
    const publicKey = key.getPublicKey();

    const payload = jwt.verify(token, publicKey, {
      issuer: this.issuer,
      algorithms: ['RS256'],
    });

    if (typeof payload === 'string') {
      throw new Error('Unexpected JWT payload type');
    }
    return payload;
  }
}
