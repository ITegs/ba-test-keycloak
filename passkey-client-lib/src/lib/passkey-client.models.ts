export interface PasskeyClientConfig {
  keycloak: {
    url: string;
    realm: string;
    clientId: string;
  };
  checkSso?: {
    redirectUri: string;
    silentFallback?: boolean;
  };
  passkey?: {
    rpName?: string;
    userVerification?: UserVerificationRequirement;
  };
}

export interface PasskeyCredentialSummary {
  id: string;
  name: string;
  createdDate?: number | null;
}

export interface PasskeyChallengeResponse {
  challenge: string;
  credentialId?: string | null;
}

export interface PasskeyActionResult {
  success: boolean;
  message?: string;
}

export interface PasskeyAuthState {
  authenticated: boolean;
  ready: boolean;
  userName: string | null;
  error: string | null;
}
