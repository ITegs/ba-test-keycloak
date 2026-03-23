import Keycloak from './vendor/keycloak.js';

const authStatus = document.getElementById('auth-status');
const authStatusAccount = document.getElementById('auth-status-account');
const loginWindow = document.getElementById('login-window');
const adminBtn = document.getElementById('admin-btn');
const loginTumBtn = document.getElementById('login-tum-btn');
const loginPasskeyBtn = document.getElementById('login-passkey-btn');
const createPasskeyBtn = document.getElementById('create-passkey-btn');
const logoutBtn = document.getElementById('logout-btn');
const userCard = document.getElementById('user-card');
const userInfo = document.getElementById('user-info');

let keycloak;
let keycloakUserProfile = null;
let appConfig;
const APP_BASE_URL = new URL('./', window.location.href).toString();

function getPasskeyEndpoint(path) {
  if (!keycloak?.authServerUrl || !keycloak?.realm) {
    throw new Error('Keycloak is not initialized');
  }

  const normalizedPath = String(path || '').replace(/^\/+/, '');
  return new URL(
    `/realms/${encodeURIComponent(keycloak.realm)}/passkey/${normalizedPath}`,
    keycloak.authServerUrl
  ).toString();
}

function parseJwtPayload(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function base64UrlToUint8Array(value) {
  if (!value || typeof value !== 'string') {
    return new Uint8Array();
  }

  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildUserInfo(user, token) {
  const claims = parseJwtPayload(token);
  const passkeys = user?.passkeys || [];
  const securityKeys = user?.security_keys || [];
  const webauthnCredentials = user?.webauthn_credentials || [];
  const emails = user?.emails || [];
  const identities = user?.identities || [];

  return {
    id: user?.id || user?.user_id || null,
    userId: user?.user_id || null,
    username: user?.username?.username || user?.username || user?.preferred_username || null,
    email: user?.email || emails.find((entry) => entry?.is_primary)?.address || null,
    verified: user?.verified ?? user?.emailVerified ?? emails.find((entry) => entry?.is_primary)?.is_verified ?? null,
    name: user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null,
    givenName: user?.given_name || user?.firstName || null,
    familyName: user?.family_name || user?.lastName || null,
    picture: user?.picture || null,
    createdAt: user?.created_at || null,
    updatedAt: user?.updated_at || null,
    hasPasskey: passkeys.length > 0 || webauthnCredentials.length > 0,
    passkeyCount: passkeys.length || webauthnCredentials.length || 0,
    securityKeyCount: securityKeys.length,
    emailCount: emails.length,
    identityCount: identities.length,
    identities: identities.map((identity) => ({
      provider: identity?.provider || null,
      id: identity?.id || null
    })),
    mfa: user?.mfa_config || null,
    metadata: user?.metadata || null,
    tokenClaims: claims
        ? {
          sub: claims.sub,
          email: claims.email,
          username: claims.username,
          amr: claims.amr,
          iat: claims.iat,
          exp: claims.exp
        }
        : null
  };
}

function renderAuthenticatedDetails() {
  const profile = {
    ...(keycloakUserProfile || {}),
    ...(keycloak.tokenParsed || {})
  };

  userInfo.textContent = JSON.stringify(buildUserInfo(profile, keycloak.token), null, 2);
}

function setAuthenticatedUi() {
  authStatus.textContent = 'authenticated';
  if (authStatusAccount) authStatusAccount.textContent = 'authenticated';
  if (loginWindow) loginWindow.hidden = true;
  if (loginTumBtn) loginTumBtn.disabled = true;
  if (loginPasskeyBtn) loginPasskeyBtn.disabled = true;
  if (createPasskeyBtn) createPasskeyBtn.disabled = false;
  if (logoutBtn) logoutBtn.disabled = false;
  userCard.hidden = false;
  renderAuthenticatedDetails();
}

function setLoggedOutUi() {
  authStatus.textContent = 'not authenticated';
  if (authStatusAccount) authStatusAccount.textContent = 'not authenticated';
  if (loginWindow) loginWindow.hidden = false;
  if (loginTumBtn) loginTumBtn.disabled = false;
  if (loginPasskeyBtn) loginPasskeyBtn.disabled = false;
  if (createPasskeyBtn) createPasskeyBtn.disabled = true;
  if (logoutBtn) logoutBtn.disabled = true;
  userCard.hidden = true;
}

function wireActions() {
  if (loginTumBtn) {
    loginTumBtn.addEventListener('click', () => {
      keycloak.login({
        redirectUri: window.location.href,
        idpHint: 'aet-tum-login-bridge'
      });
    });
  }

  loginPasskeyBtn?.addEventListener('click', async () => {
    await authenticatePasskey();
  });

  createPasskeyBtn?.addEventListener('click', async () => {
    await createPasskey();
  });

  logoutBtn?.addEventListener('click', () => {
    keycloak.logout({ redirectUri: APP_BASE_URL });
  });
}

async function loadAppConfig() {
  const response = await fetch('./config.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load app config');
  }
  const config = await response.json();
  if (!config?.keycloak?.url || !config?.keycloak?.realm || !config?.keycloak?.clientId) {
    throw new Error('Invalid app config');
  }
  return config;
}

function initAuth() {
  loadAppConfig()
    .then((config) => {
      appConfig = config;
      if (adminBtn && appConfig?.urls?.admin) {
        adminBtn.href = appConfig.urls.admin;
      }

      keycloak = new Keycloak({
        url: appConfig.keycloak.url,
        realm: appConfig.keycloak.realm,
        clientId: appConfig.keycloak.clientId
      });

      wireActions();

      return keycloak.init({ onLoad: 'check-sso', pkceMethod: 'S256' });
    })
    .then((authenticated) => {
      const params = new URLSearchParams(window.location.search);
      const actionStatus = params.get('kc_action_status');

      if (authenticated) {
        setAuthenticatedUi();
        keycloak
          .loadUserInfo()
          .then((userInfo) => {
            keycloakUserProfile = userInfo || {};
            renderAuthenticatedDetails();
          })
          .catch(() => {
            keycloakUserProfile = {};
            renderAuthenticatedDetails();
          });

        if (actionStatus === 'success') {
          authStatus.textContent = 'passkey registered';
          setTimeout(() => {
            authStatus.textContent = 'authenticated';
          }, 1500);
        }
        return;
      }

      setLoggedOutUi();
    })
    .catch((error) => {
      console.error('Keycloak init failed', error);
      authStatus.textContent = 'config/auth init failed';
    });
}

const createPasskey = async () => {
  console.log("Creating passkey...");
  try {
    if (!keycloak?.authenticated || !keycloak?.tokenParsed) {
      throw new Error('User must be logged in before creating a passkey.');
    }

    const claims = keycloak.tokenParsed || {};
    const profile = keycloakUserProfile || {};
    const accountId = String(claims.sub || profile.id || claims.preferred_username || profile.username || '');
    const accountName = String(claims.preferred_username || profile.username || claims.email || profile.email || '');
    const displayName = String(claims.name || profile.firstName || profile.lastName || accountName || 'Keycloak User');

    if (!accountId || !accountName) {
      throw new Error('Missing user identity claims for passkey registration.');
    }

    const userIdBytes = new TextEncoder().encode(accountId).slice(0, 64);
    const challenge = await fetch(getPasskeyEndpoint('challenge')).then(res => res.json());

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: base64UrlToUint8Array(challenge.challenge),
        rp: { name: "My App", id: window.location.hostname },
        user: { id: userIdBytes, name: accountName, displayName },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: { userVerification: "preferred", residentKey: "required" },
        attestation: "none",
      }
    });

    const savePayload = {
      credentialId: bufferToBase64Url(credential.rawId),
      rawId: bufferToBase64Url(credential.rawId),
      clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
      attestationObject: bufferToBase64Url(credential.response.attestationObject)
    };

    const saveResponse = await fetch(getPasskeyEndpoint('save'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keycloak.token}`
      },
      body: JSON.stringify(savePayload)
    });
    const saveResultText = await saveResponse.text();
    if (!saveResponse.ok) {
      throw new Error(saveResultText || 'Failed to store passkey');
    }

    authStatus.textContent = 'passkey created';
    console.log("Passkey created:", credential);
  } catch (error) {
    console.error("Error creating passkey:", error);
    authStatus.textContent = 'passkey creation failed';
  }
};

const authenticatePasskey = async () => {
  console.log("Authenticating with passkey...");
  try {
    const authenticateOptionsUrl = new URL(getPasskeyEndpoint('get-credential-id'));
    const optionsResponse = await fetch(authenticateOptionsUrl.toString());
    const res = await optionsResponse.json();

    if (!optionsResponse.ok) {
      throw new Error(res?.error || 'Failed to fetch passkey authentication options');
    }

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: base64UrlToUint8Array(res.challenge),
        ...(res.credentialId
          ? { allowCredentials: [{ type: "public-key", id: base64UrlToUint8Array(res.credentialId) }] }
          : {}),
        userVerification: "preferred",
      },
    });

    const authenticationPayload = {
      credentialId: bufferToBase64Url(assertion.rawId),
      rawId: bufferToBase64Url(assertion.rawId),
      clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
      authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
      signature: bufferToBase64Url(assertion.response.signature),
      challenge: res.challenge
    };

    const authenticateResponse = await fetch(getPasskeyEndpoint('authenticate'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(authenticationPayload)
    });
    const authResult = await authenticateResponse.json();

    if (!authenticateResponse.ok) {
      throw new Error(authResult?.error || 'Passkey authentication failed');
    }

    keycloak.token = authResult.access_token || '';
    keycloak.refreshToken = authResult.refresh_token || '';
    keycloak.tokenParsed = parseJwtPayload(keycloak.token) || {};
    keycloak.authenticated = Boolean(keycloak.token);
    keycloakUserProfile = null;

    setAuthenticatedUi();
    authStatus.textContent = 'authenticated (passkey)';
    console.log("Authentication successful:", authResult);
  } catch (error) {
    console.error("Error authenticating with passkey:", error);
    authStatus.textContent = 'passkey auth failed';
  }
};

initAuth();
