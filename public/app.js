import Keycloak from '/vendor/keycloak.js';

const authStatus = document.getElementById('auth-status');
const loginBtn = document.getElementById('login-btn');
const registerPasskeyBtn = document.getElementById('register-passkey-btn');
const logoutBtn = document.getElementById('logout-btn');
const refreshBtn = document.getElementById('refresh-btn');
const userCard = document.getElementById('user-card');
const tokenCard = document.getElementById('token-card');
const userInfo = document.getElementById('user-info');
const tokenInfo = document.getElementById('token-info');
const PASSKEY_REQUIRED_ACTION = 'webauthn-register-passwordless';

let keycloak;

function setAuthenticatedUi() {
  authStatus.textContent = 'authenticated';
  loginBtn.disabled = true;
  registerPasskeyBtn.disabled = false;
  logoutBtn.disabled = false;
  refreshBtn.disabled = false;
  userCard.hidden = false;
  tokenCard.hidden = false;

  userInfo.textContent = JSON.stringify(
    {
      username: keycloak.tokenParsed?.preferred_username,
      email: keycloak.tokenParsed?.email,
      name: keycloak.tokenParsed?.name,
      roles: keycloak.tokenParsed?.realm_access?.roles || []
    },
    null,
    2
  );

  tokenInfo.textContent = keycloak.token || '';
}

function setLoggedOutUi() {
  authStatus.textContent = 'not authenticated';
  loginBtn.disabled = false;
  registerPasskeyBtn.disabled = true;
  logoutBtn.disabled = true;
  refreshBtn.disabled = true;
  userCard.hidden = true;
  tokenCard.hidden = true;
}

function wireActions() {
  loginBtn.addEventListener('click', () => {
    keycloak.login();
  });

  registerPasskeyBtn.addEventListener('click', async () => {
    authStatus.textContent = 'opening passkey registration';

    try {
      await keycloak.login({
        action: PASSKEY_REQUIRED_ACTION,
        redirectUri: window.location.href
      });
    } catch (error) {
      console.warn('Direct required action via adapter failed, using URL fallback', error);

      const authUrl = new URL(
        `/realms/${encodeURIComponent(keycloak.realm)}/protocol/openid-connect/auth`,
        keycloak.authServerUrl
      );
      authUrl.searchParams.set('client_id', keycloak.clientId);
      authUrl.searchParams.set('redirect_uri', window.location.href);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'openid');
      authUrl.searchParams.set('kc_action', PASSKEY_REQUIRED_ACTION);

      window.location.assign(authUrl.toString());
    }
  });

  logoutBtn.addEventListener('click', () => {
    keycloak.logout({ redirectUri: window.location.origin });
  });

  refreshBtn.addEventListener('click', async () => {
    try {
      const refreshed = await keycloak.updateToken(30);
      tokenInfo.textContent = keycloak.token || '';
      authStatus.textContent = refreshed ? 'token refreshed' : 'token still valid';
      setTimeout(() => {
        authStatus.textContent = 'authenticated';
      }, 1000);
    } catch (error) {
      console.error('Token refresh failed', error);
      authStatus.textContent = 'refresh failed';
    }
  });
}

function initAuth() {
  keycloak = new Keycloak({
    url: 'http://localhost:8080',
    realm: 'demo',
    clientId: 'demo-app'
  });

  wireActions();

  keycloak
    .init({ onLoad: 'check-sso', pkceMethod: 'S256' })
    .then((authenticated) => {
      const params = new URLSearchParams(window.location.search);
      const actionStatus = params.get('kc_action_status');

      if (authenticated) {
        setAuthenticatedUi();
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
      authStatus.textContent = 'Keycloak init failed';
    });
}

initAuth();
