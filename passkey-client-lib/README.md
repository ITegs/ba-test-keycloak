# passkey-client-lib

Angular client library for apps that authenticate against this repository's Keycloak instance with the custom passkey extension.

It includes:
- Keycloak + passkey client logic (`PasskeyClientService`)
- reusable UI components:
  - `<login-with-passkey-button>`
  - `<login-with-password-button>`
  - `<register-passkey-button>`
  - `<logout-button>`
  - `<passkey-list>`
  - `<passkey-manager>`

## Install

Add this library and its peer dependencies to your Angular app.

## Configure

Register the client config in your app providers:

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { providePasskeyClient } from 'passkey-client-lib';

bootstrapApplication(AppComponent, {
  providers: [
    providePasskeyClient({
      keycloak: {
        url: 'http://localhost:8080',
        realm: 'demo',
        clientId: 'demo-app'
      },
      checkSso: {
        redirectUri: `${window.location.origin}/silent-check-sso.html`,
        silentFallback: false
      },
      passkey: {
        rpName: 'My App',
        userVerification: 'preferred'
      }
    })
  ]
});
```

## Init auth once on app start

```ts
import { Component, inject } from '@angular/core';
import { PasskeyClientService } from 'passkey-client-lib';

@Component({
  selector: 'app-root',
  template: '<router-outlet />'
})
export class AppComponent {
  private readonly passkeyClient = inject(PasskeyClientService);

  async ngOnInit(): Promise<void> {
    await this.passkeyClient.init();
  }
}
```

## Use reusable components

```ts
import { Component } from '@angular/core';
import {
  LoginWithPasskeyButtonComponent,
  LoginWithPasswordButtonComponent,
  LogoutButtonComponent,
  PasskeyManagerComponent
} from 'passkey-client-lib';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [
    LoginWithPasswordButtonComponent,
    LoginWithPasskeyButtonComponent,
    LogoutButtonComponent,
    PasskeyManagerComponent
  ],
  template: `
    <login-with-password-button label="Login"></login-with-password-button>
    <login-with-passkey-button label="Login with Passkey"></login-with-passkey-button>
    <logout-button></logout-button>
    <passkey-manager></passkey-manager>
  `
})
export class AuthPageComponent {}
```

## Notes

- Serve a `silent-check-sso.html` page in your app:
  ```html
  <!doctype html>
  <html lang="en">
    <body>
      <script>parent.postMessage(location.href, location.origin);</script>
    </body>
  </html>
  ```
- `loginWithPasskey()` calls `/realms/{realm}/passkey/authenticate`, then refreshes Keycloak state via `check-sso`.
- `passkey-list` uses Keycloak account endpoint `/realms/{realm}/account/credentials` to list/remove passkeys.
