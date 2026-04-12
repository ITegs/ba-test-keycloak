import { Inject, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import Keycloak, {
  KeycloakInitOptions,
  KeycloakInstance,
  KeycloakLoginOptions,
  KeycloakLogoutOptions
} from 'keycloak-js';
import { arrayBufferToBase64Url, base64UrlToUint8Array } from './base64url';
import {
  PasskeyActionResult,
  PasskeyAuthState,
  PasskeyChallengeResponse,
  PasskeyClientConfig,
  PasskeyCredentialSummary
} from './passkey-client.models';
import { PASSKEY_CLIENT_CONFIG } from './passkey-client.config';

interface PasskeyCredentialResponse {
  id?: string;
  name?: string;
  userLabel?: string;
  createdDate?: number;
}

interface AccountCredentialTypeResponse {
  type?: string;
  userCredentialMetadatas?: Array<{ credential?: PasskeyCredentialResponse }>;
}

const PASSKEY_CREDENTIAL_TYPES = new Set(['webauthn-passwordless', 'webauthn']);

@Injectable({ providedIn: 'root' })
export class PasskeyClientService {
  private keycloak: KeycloakInstance;
  private readonly stateSubject = new BehaviorSubject<PasskeyAuthState>({
    authenticated: false,
    ready: false,
    userName: null,
    error: null
  });

  readonly state$ = this.stateSubject.asObservable();

  constructor(@Inject(PASSKEY_CLIENT_CONFIG) private readonly config: PasskeyClientConfig) {
    this.keycloak = this.createKeycloak();
  }

  async init(): Promise<boolean> {
    try {
      this.keycloak = this.createKeycloak();
      const authenticated = await this.keycloak.init(this.checkSsoOptions);
      this.setState({
        authenticated,
        ready: true,
        userName: this.keycloak.tokenParsed?.preferred_username ?? null,
        error: null
      });
      return authenticated;
    } catch (error) {
      this.setState({
        authenticated: false,
        ready: true,
        userName: null,
        error: this.errorMessage(error, 'Keycloak initialization failed')
      });
      return false;
    }
  }

  loginWithPassword(options?: KeycloakLoginOptions): Promise<void> {
    return this.keycloak.login({
      redirectUri: this.currentUrl(),
      ...options
    });
  }

  logout(options?: KeycloakLogoutOptions): Promise<void> {
    return this.keycloak.logout(options);
  }

  async registerPasskey(): Promise<PasskeyActionResult> {
    this.requireBrowserApi();
    if (!this.keycloak.authenticated || !this.keycloak.tokenParsed) {
      throw new Error('User must be logged in before creating a passkey.');
    }

    const challengePayload = await this.fetchChallenge();
    const claims = this.keycloak.tokenParsed;
    const accountId = String(
      claims.sub ?? claims.preferred_username ?? claims.email ?? this.keycloak.subject ?? ''
    );
    const accountName = String(claims.preferred_username ?? claims.email ?? claims.sub ?? '');
    const displayName = String(claims.name ?? claims.preferred_username ?? accountName);

    if (!accountId || !accountName) {
      throw new Error('Missing user identity claims for passkey registration.');
    }

    const userIdBytes = new TextEncoder().encode(accountId).slice(0, 64);
    const creationResult = (await navigator.credentials.create({
      publicKey: {
        challenge: base64UrlToUint8Array(challengePayload.challenge),
        rp: {
          name: this.config.passkey?.rpName ?? 'Keycloak App',
          id: window.location.hostname
        },
        user: {
          id: userIdBytes,
          name: accountName,
          displayName
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: {
          userVerification: this.config.passkey?.userVerification ?? 'preferred',
          residentKey: 'required'
        },
        attestation: 'none'
      }
    })) as PublicKeyCredential | null;

    const response = creationResult?.response as AuthenticatorAttestationResponse | undefined;
    if (!creationResult?.rawId || !response?.clientDataJSON || !response?.attestationObject) {
      throw new Error('Passkey registration returned an incomplete credential.');
    }

    const savePayload = {
      credentialId: arrayBufferToBase64Url(creationResult.rawId),
      rawId: arrayBufferToBase64Url(creationResult.rawId),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
      challenge: challengePayload.challenge
    };

    const saveResponse = await fetch(this.passkeyEndpoint('save'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.keycloak.token}`
      },
      body: JSON.stringify(savePayload)
    });

    if (!saveResponse.ok) {
      throw new Error((await saveResponse.text()) || 'Failed to store passkey');
    }

    return { success: true, message: 'Passkey created.' };
  }

  async loginWithPasskey(): Promise<PasskeyActionResult> {
    this.requireBrowserApi();

    const challengePayload = await this.fetchChallenge();
    const assertionResult = (await navigator.credentials.get({
      publicKey: {
        challenge: base64UrlToUint8Array(challengePayload.challenge),
        ...(challengePayload.credentialId
          ? {
              allowCredentials: [
                {
                  type: 'public-key',
                  id: base64UrlToUint8Array(challengePayload.credentialId)
                }
              ]
            }
          : {}),
        userVerification: this.config.passkey?.userVerification ?? 'preferred'
      }
    })) as PublicKeyCredential | null;

    const response = assertionResult?.response as AuthenticatorAssertionResponse | undefined;
    if (
      !assertionResult?.rawId ||
      !response?.clientDataJSON ||
      !response?.authenticatorData ||
      !response?.signature
    ) {
      throw new Error('Passkey authentication returned an incomplete assertion.');
    }

    const authenticateResponse = await fetch(this.passkeyEndpoint('authenticate'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        credentialId: arrayBufferToBase64Url(assertionResult.rawId),
        rawId: arrayBufferToBase64Url(assertionResult.rawId),
        clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
        authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
        signature: arrayBufferToBase64Url(response.signature),
        challenge: challengePayload.challenge
      })
    });

    if (!authenticateResponse.ok) {
      const payload = await this.parseJsonResponse<{ error?: string }>(authenticateResponse, {});
      throw new Error(payload.error ?? 'Passkey authentication failed');
    }

    await this.refreshFromBrowserSession();
    return { success: true, message: 'Authenticated with passkey.' };
  }

  async listPasskeys(): Promise<PasskeyCredentialSummary[]> {
    if (!this.keycloak.authenticated || !this.keycloak.token) {
      return [];
    }

    const response = await fetch(this.accountCredentialsEndpoint(), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.keycloak.token}`
      }
    });
    const payload = await this.parseJsonResponse<unknown>(response, []);

    if (!response.ok) {
      throw new Error('Failed to load passkeys');
    }

    const mappedCredentials = Array.isArray(payload)
      ? this.parseCredentialTypes(payload as AccountCredentialTypeResponse[])
      : this.parseCredentialPayload(payload);

    return mappedCredentials.map((credential) => ({
      id: credential.id ?? '',
      name: credential.name ?? credential.userLabel ?? 'Passkey',
      createdDate: credential.createdDate ?? null
    }));
  }

  async deletePasskey(credentialId: string): Promise<void> {
    if (!credentialId || !this.keycloak.token) {
      return;
    }
    const response = await fetch(`${this.accountCredentialsEndpoint()}/${encodeURIComponent(credentialId)}`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.keycloak.token}`
      }
    });
    if (!response.ok) {
      throw new Error('Failed to delete passkey');
    }
  }

  get authenticated(): boolean {
    return Boolean(this.keycloak.authenticated);
  }

  get keycloakClient(): KeycloakInstance {
    return this.keycloak;
  }

  private createKeycloak(): KeycloakInstance {
    return new Keycloak({
      url: this.config.keycloak.url,
      realm: this.config.keycloak.realm,
      clientId: this.config.keycloak.clientId
    });
  }

  private get checkSsoOptions(): KeycloakInitOptions {
    return {
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      silentCheckSsoRedirectUri: this.config.checkSso?.redirectUri,
      silentCheckSsoFallback: this.config.checkSso?.silentFallback ?? false
    };
  }

  private passkeyEndpoint(path: string): string {
    return this.realmEndpoint(`passkey/${String(path).replace(/^\/+/, '')}`);
  }

  private accountCredentialsEndpoint(): string {
    return this.realmEndpoint('account/credentials');
  }

  private realmEndpoint(path: string): string {
    return new URL(
      `/realms/${encodeURIComponent(this.config.keycloak.realm)}/${String(path).replace(/^\/+/, '')}`,
      this.config.keycloak.url
    ).toString();
  }

  private async fetchChallenge(): Promise<PasskeyChallengeResponse> {
    const challengeResponse = await fetch(this.passkeyEndpoint('challenge'), {
      credentials: 'include'
    });
    const challengePayload = await this.parseJsonResponse<PasskeyChallengeResponse>(challengeResponse, {
      challenge: ''
    });
    if (!challengeResponse.ok || !challengePayload.challenge) {
      throw new Error('Failed to fetch passkey challenge');
    }
    return challengePayload;
  }

  private async refreshFromBrowserSession(): Promise<void> {
    const refreshedClient = this.createKeycloak();
    const authenticated = await refreshedClient.init(this.checkSsoOptions);
    if (!authenticated) {
      throw new Error('Session cookie was not accepted by Keycloak check-sso');
    }

    this.keycloak = refreshedClient;
    this.setState({
      authenticated: true,
      ready: true,
      userName: refreshedClient.tokenParsed?.preferred_username ?? null,
      error: null
    });
  }

  private parseCredentialTypes(payload: AccountCredentialTypeResponse[]): PasskeyCredentialResponse[] {
    return payload.flatMap((credentialType) => {
      const type = String(credentialType.type ?? '').toLowerCase();
      if (!PASSKEY_CREDENTIAL_TYPES.has(type)) {
        return [];
      }
      const metadatas = Array.isArray(credentialType.userCredentialMetadatas)
        ? credentialType.userCredentialMetadatas
        : [];
      return metadatas.map((metadata) => metadata.credential).filter(Boolean) as PasskeyCredentialResponse[];
    });
  }

  private parseCredentialPayload(payload: unknown): PasskeyCredentialResponse[] {
    if (
      payload &&
      typeof payload === 'object' &&
      Array.isArray((payload as { credentials?: PasskeyCredentialResponse[] }).credentials)
    ) {
      return (payload as { credentials: PasskeyCredentialResponse[] }).credentials;
    }
    return [];
  }

  private async parseJsonResponse<T>(response: Response, fallbackValue: T): Promise<T> {
    return (await response.json().catch(() => fallbackValue)) as T;
  }

  private setState(next: PasskeyAuthState): void {
    this.stateSubject.next(next);
  }

  private currentUrl(): string {
    return typeof window === 'undefined' ? '/' : window.location.href;
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  }

  private requireBrowserApi(): void {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      throw new Error('Passkey flows require a browser environment.');
    }
  }
}
