import { Component, Input } from '@angular/core';
import { KeycloakLoginOptions } from 'keycloak-js';
import { PasskeyClientService } from '../passkey-client.service';

@Component({
  selector: 'login-with-password-button',
  standalone: true,
  template: `
    <button type="button" [disabled]="disabled" (click)="onClick()">
      {{ label }}
    </button>
  `
})
export class LoginWithPasswordButtonComponent {
  @Input() label = 'Login';
  @Input() disabled = false;
  @Input() options?: KeycloakLoginOptions;

  constructor(private readonly passkeyClient: PasskeyClientService) {}

  onClick(): void {
    void this.passkeyClient.loginWithPassword(this.options);
  }
}
