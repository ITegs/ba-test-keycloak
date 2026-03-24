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
const refreshPasskeysBtn = document.getElementById('refresh-passkeys-btn');
const passkeyList = document.getElementById('passkey-list');
const passkeyEmpty = document.getElementById('passkey-empty');
const passkeyFeedback = document.getElementById('passkey-feedback');

let keycloak;
let keycloakUserProfile = null;
let appConfig;
const APP_BASE_URL = new URL('./', window.location.href).toString();
const PASSKEY_CREDENTIAL_TYPES = new Set(['webauthn-passwordless', 'webauthn']);

function requireKeycloakAuthServer() {
  if (!keycloak?.authServerUrl || !keycloak?.realm) {
    throw new Error('Keycloak is not initialized');
  }
}

function getRealmEndpoint(path = '') {
  requireKeycloakAuthServer();
  const normalizedPath = String(path).replace(/^\/+/, '');
  return new URL(
    `/realms/${encodeURIComponent(keycloak.realm)}/${normalizedPath}`,
    keycloak.authServerUrl
  ).toString();
}

function getPasskeyEndpoint(path) {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  return getRealmEndpoint(`passkey/${normalizedPath}`);
}

function getAccountCredentialsEndpoint() {
  return getRealmEndpoint('account/credentials');
}

async function parseJsonResponse(response, fallbackValue = {}) {
  return response.json().catch(() => fallbackValue);
}

function setElementDisabled(element, isDisabled) {
  if (element) {
    element.disabled = Boolean(isDisabled);
  }
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
  if (!keycloak || !userInfo) {
    return;
  }

  const profile = {
    ...(keycloakUserProfile || {}),
    ...(keycloak.tokenParsed || {})
  };

  userInfo.textContent = JSON.stringify(buildUserInfo(profile, keycloak.token), null, 2);
}

function setPasskeyFeedback(message = '', isError = false) {
  if (!passkeyFeedback) {
    return;
  }

  if (!message) {
    passkeyFeedback.textContent = '';
    passkeyFeedback.hidden = true;
    passkeyFeedback.classList.remove('error');
    return;
  }

  passkeyFeedback.textContent = message;
  passkeyFeedback.hidden = false;
  passkeyFeedback.classList.toggle('error', Boolean(isError));
}

function formatPasskeyCreatedDate(createdDate) {
  const timestamp = Number(createdDate);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 'Created date unavailable';
  }
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return 'Created date unavailable';
  }
  return `Created ${value.toLocaleString()}`;
}

function renderPasskeyList(credentials = []) {
  if (!passkeyList || !passkeyEmpty) {
    return;
  }

  passkeyList.innerHTML = '';
  if (!Array.isArray(credentials) || credentials.length === 0) {
    passkeyEmpty.hidden = false;
    return;
  }

  passkeyEmpty.hidden = true;
  credentials.forEach((credential) => {
    const item = document.createElement('li');
    item.className = 'passkey-item';

    const meta = document.createElement('div');
    meta.className = 'passkey-meta';

    const name = document.createElement('div');
    name.className = 'passkey-name';
    name.textContent = String(credential?.name || 'Passkey');

    const created = document.createElement('div');
    created.className = 'passkey-created';
    created.textContent = formatPasskeyCreatedDate(credential?.createdDate);

    meta.append(name, created);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'passkey-remove-btn';
    removeButton.textContent = 'Remove';
    removeButton.disabled = !credential?.id;
    removeButton.addEventListener('click', async () => {
      await deletePasskeyCredential(credential.id, removeButton);
    });

    item.append(meta, removeButton);
    passkeyList.append(item);
  });
}

async function loadRegisteredPasskeys() {
  if (!keycloak?.authenticated || !keycloak?.token) {
    renderPasskeyList([]);
    return;
  }

  setElementDisabled(refreshPasskeysBtn, true);

  try {
    const response = await fetch(getAccountCredentialsEndpoint(), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${keycloak.token}`
      }
    });
    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load passkeys');
    }

    const credentials = Array.isArray(payload)
      ? payload.flatMap((credentialType) => {
        const type = String(credentialType?.type || '').toLowerCase();
        if (!PASSKEY_CREDENTIAL_TYPES.has(type)) {
          return [];
        }

        const metadatas = Array.isArray(credentialType?.userCredentialMetadatas)
          ? credentialType.userCredentialMetadatas
          : [];

        return metadatas
          .map((metadata) => metadata?.credential)
          .filter(Boolean);
      })
      : Array.isArray(payload?.credentials)
        ? payload.credentials
        : [];

    const passkeyCredentials = credentials.map((credential) => ({
      id: credential?.id || null,
      name: credential?.name || credential?.userLabel || 'Passkey',
      createdDate: credential?.createdDate || null
    }));

    renderPasskeyList(passkeyCredentials);
  } catch (error) {
    console.error('Error loading registered passkeys:', error);
    renderPasskeyList([]);
    setPasskeyFeedback('Unable to load passkeys.', true);
  } finally {
    setElementDisabled(refreshPasskeysBtn, false);
  }
}

async function deletePasskeyCredential(credentialModelId, triggerButton) {
  if (!credentialModelId || !keycloak?.token) {
    return;
  }

  setElementDisabled(triggerButton, true);

  try {
    const response = await fetch(getAccountCredentialsEndpoint() + `/${encodeURIComponent(credentialModelId)}`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${keycloak.token}`
      }
    });
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to delete passkey');
    }

    authStatus.textContent = 'passkey removed';
    setPasskeyFeedback('Passkey removed.');
    await loadRegisteredPasskeys();
  } catch (error) {
    console.error('Error deleting passkey:', error);
    setPasskeyFeedback('Failed to remove passkey.', true);
  } finally {
    setElementDisabled(triggerButton, false);
  }
}

function setAuthenticatedUi() {
  authStatus.textContent = 'authenticated';
  if (authStatusAccount) {
    authStatusAccount.textContent = 'authenticated';
  }
  if (loginWindow) {
    loginWindow.hidden = true;
  }
  setElementDisabled(loginTumBtn, true);
  setElementDisabled(loginPasskeyBtn, true);
  setElementDisabled(createPasskeyBtn, false);
  setElementDisabled(logoutBtn, false);
  if (userCard) {
    userCard.hidden = false;
  }
  setPasskeyFeedback('');
  renderAuthenticatedDetails();
  void loadRegisteredPasskeys();
}

function setLoggedOutUi() {
  authStatus.textContent = 'not authenticated';
  if (authStatusAccount) {
    authStatusAccount.textContent = 'not authenticated';
  }
  if (loginWindow) {
    loginWindow.hidden = false;
  }
  setElementDisabled(loginTumBtn, false);
  setElementDisabled(loginPasskeyBtn, false);
  setElementDisabled(createPasskeyBtn, true);
  setElementDisabled(logoutBtn, true);
  if (userCard) {
    userCard.hidden = true;
  }
  renderPasskeyList([]);
  setPasskeyFeedback('');
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

  loginPasskeyBtn?.addEventListener('click', () => authenticatePasskey());

  createPasskeyBtn?.addEventListener('click', () => createPasskey());

  refreshPasskeysBtn?.addEventListener('click', () => {
    setPasskeyFeedback('');
    return loadRegisteredPasskeys();
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

async function initAuth() {
  try {
    appConfig = await loadAppConfig();
    if (adminBtn && appConfig?.urls?.admin) {
      adminBtn.href = appConfig.urls.admin;
    }

    keycloak = new Keycloak({
      url: appConfig.keycloak.url,
      realm: appConfig.keycloak.realm,
      clientId: appConfig.keycloak.clientId
    });

    wireActions();

    const authenticated = await keycloak.init({ onLoad: 'check-sso', pkceMethod: 'S256' });
    const params = new URLSearchParams(window.location.search);
    const actionStatus = params.get('kc_action_status');

    if (!authenticated) {
      setLoggedOutUi();
      return;
    }

    setAuthenticatedUi();
    try {
      keycloakUserProfile = (await keycloak.loadUserInfo()) || {};
    } catch {
      keycloakUserProfile = {};
    }
    renderAuthenticatedDetails();

    if (actionStatus === 'success') {
      authStatus.textContent = 'passkey registered';
      setTimeout(() => {
        authStatus.textContent = 'authenticated';
      }, 1500);
    }
  } catch (error) {
    console.error('Keycloak init failed', error);
    authStatus.textContent = 'config/auth init failed';
  }
}

async function createPasskey() {
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

    const passkeyDefaultName = String(appConfig?.passkey?.defaultName || 'My App');
    const userIdBytes = new TextEncoder().encode(accountId).slice(0, 64);
    const challengeResponse = await fetch(getPasskeyEndpoint('challenge'), {
      credentials: 'include'
    });
    const challengePayload = await parseJsonResponse(challengeResponse);
    if (!challengeResponse.ok) {
      throw new Error(challengePayload?.error || 'Failed to create passkey challenge');
    }

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: base64UrlToUint8Array(challengePayload.challenge),
        rp: { name: passkeyDefaultName, id: window.location.hostname },
        user: { id: userIdBytes, name: accountName, displayName },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { userVerification: 'preferred', residentKey: 'required' },
        attestation: 'none'
      }
    });
    if (!credential?.rawId || !credential?.response?.clientDataJSON || !credential?.response?.attestationObject) {
      throw new Error('Passkey registration returned an incomplete credential.');
    }

    const savePayload = {
      credentialId: bufferToBase64Url(credential.rawId),
      rawId: bufferToBase64Url(credential.rawId),
      clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
      attestationObject: bufferToBase64Url(credential.response.attestationObject),
      challenge: challengePayload.challenge
    };

    const saveResponse = await fetch(getPasskeyEndpoint('save'), {
      method: 'POST',
      credentials: 'include',
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
    setPasskeyFeedback('Passkey created.');
    await loadRegisteredPasskeys();
  } catch (error) {
    console.error('Error creating passkey:', error);
    authStatus.textContent = 'passkey creation failed';
    setPasskeyFeedback('Passkey creation failed.', true);
  }
}

async function authenticatePasskey() {
  try {
    const optionsResponse = await fetch(getPasskeyEndpoint('challenge'), {
      credentials: 'include'
    });
    const optionsPayload = await parseJsonResponse(optionsResponse);

    if (!optionsResponse.ok) {
      throw new Error(optionsPayload?.error || 'Failed to fetch passkey authentication options');
    }

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: base64UrlToUint8Array(optionsPayload.challenge),
        ...(optionsPayload.credentialId
          ? { allowCredentials: [{ type: 'public-key', id: base64UrlToUint8Array(optionsPayload.credentialId) }] }
          : {}),
        userVerification: 'preferred'
      }
    });
    if (
      !assertion?.rawId ||
      !assertion?.response?.clientDataJSON ||
      !assertion?.response?.authenticatorData ||
      !assertion?.response?.signature
    ) {
      throw new Error('Passkey authentication returned an incomplete assertion.');
    }

    const authenticationPayload = {
      credentialId: bufferToBase64Url(assertion.rawId),
      rawId: bufferToBase64Url(assertion.rawId),
      clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
      authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
      signature: bufferToBase64Url(assertion.response.signature),
      challenge: optionsPayload.challenge
    };

    const authenticateResponse = await fetch(getPasskeyEndpoint('authenticate'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(authenticationPayload)
    });
    const authResult = await parseJsonResponse(authenticateResponse);

    if (!authenticateResponse.ok) {
      throw new Error(authResult?.error || 'Passkey authentication failed');
    }

    authStatus.textContent = 'authenticated (passkey)';
    window.location.replace(APP_BASE_URL);
  } catch (error) {
    console.error('Error authenticating with passkey:', error);
    authStatus.textContent = 'passkey auth failed';
  }
}

void initAuth();
