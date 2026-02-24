# Keycloak IdP Setup + Demo App + Passkeys

This project includes:
- A local Keycloak Identity Provider (IdP) via Docker Compose
- A demo web app on `http://localhost:3000` that authenticates with Keycloak
- WebAuthn passkey policy enabled for realm `demo`

## 1. Start Keycloak

```bash
npm run keycloak:up
```

Keycloak URL:
- `http://localhost:8080`

Admin console credentials:
- Username: `admin`
- Password: `admin`

## 2. Start Demo App

```bash
npm run start
```

Demo app URL:
- `http://localhost:3000`

## Imported Realm Config

The file `keycloak/realm-export.json` is imported automatically and contains:
- Realm: `demo`
- OIDC Client ID: `demo-app`
- Redirect URI: `http://localhost:3000/*`
- Demo user:
  - Username: `demo`
  - Password: `demo`
- Passkey policy:
  - Passwordless WebAuthn (resident key required, user verification required)
  - RP ID set to `localhost`

## Use Password Login

1. Open `http://localhost:3000`
2. Click **Login**
3. Sign in using `demo` / `demo`
4. You are redirected back and see token/user info

## Register And Use A Passkey (From Frontend)

1. Sign in once with `demo` / `demo`
2. Click **Register Passkey** in the demo app
3. Complete the platform/browser authenticator flow
4. Logout from the demo app
5. Click **Login** again and use the passkey option on the Keycloak login screen

Notes:
- Passkeys require a browser/platform authenticator that supports WebAuthn.
- On localhost, modern browsers allow passkey flows over HTTP for local development.
- The demo app loads the Keycloak JS adapter from a local npm dependency (`keycloak-js@26.0.7`) served at `/vendor/keycloak.js`.

## OIDC Endpoints (realm: `demo`)

- Issuer: `http://localhost:8080/realms/demo`
- Discovery: `http://localhost:8080/realms/demo/.well-known/openid-configuration`
- Auth: `http://localhost:8080/realms/demo/protocol/openid-connect/auth`
- Token: `http://localhost:8080/realms/demo/protocol/openid-connect/token`

## Stop Keycloak

```bash
npm run keycloak:down
```
