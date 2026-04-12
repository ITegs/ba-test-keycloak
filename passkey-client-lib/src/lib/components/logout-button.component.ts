import { Component, Input } from '@angular/core';
import { KeycloakLogoutOptions } from 'keycloak-js';
import { PasskeyClientService } from '../passkey-client.service';

@Component({
  selector: 'logout-button',
  standalone: true,
  template: `
    <button type="button" [disabled]="disabled" (click)="onClick()">
      {{ label }}
    </button>
  `
})
export class LogoutButtonComponent {
  @Input() label = 'Logout';
  @Input() disabled = false;
  @Input() options?: KeycloakLogoutOptions;

  constructor(private readonly passkeyClient: PasskeyClientService) {}

  onClick(): void {
    void this.passkeyClient.logout(this.options);
  }
}
