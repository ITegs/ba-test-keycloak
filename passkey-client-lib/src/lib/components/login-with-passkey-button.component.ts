import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PasskeyClientService } from '../passkey-client.service';

@Component({
  selector: 'login-with-passkey-button',
  standalone: true,
  template: `
    <button type="button" [disabled]="loading || disabled" (click)="onClick()">
      {{ loading ? loadingLabel : label }}
    </button>
  `
})
export class LoginWithPasskeyButtonComponent {
  @Input() label = 'Login with Passkey';
  @Input() loadingLabel = 'Logging in...';
  @Input() disabled = false;
  @Output() success = new EventEmitter<void>();
  @Output() failure = new EventEmitter<Error>();

  loading = false;

  constructor(private readonly passkeyClient: PasskeyClientService) {}

  async onClick(): Promise<void> {
    this.loading = true;
    try {
      await this.passkeyClient.loginWithPasskey();
      this.success.emit();
    } catch (error) {
      this.failure.emit(error instanceof Error ? error : new Error('Passkey login failed'));
    } finally {
      this.loading = false;
    }
  }
}
