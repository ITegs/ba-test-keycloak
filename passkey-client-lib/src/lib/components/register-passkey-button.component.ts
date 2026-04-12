import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PasskeyClientService } from '../passkey-client.service';

@Component({
  selector: 'register-passkey-button',
  standalone: true,
  template: `
    <button type="button" [disabled]="loading || disabled" (click)="onClick()">
      {{ loading ? loadingLabel : label }}
    </button>
  `
})
export class RegisterPasskeyButtonComponent {
  @Input() label = 'Register Passkey';
  @Input() loadingLabel = 'Registering...';
  @Input() disabled = false;
  @Output() success = new EventEmitter<void>();
  @Output() failure = new EventEmitter<Error>();

  loading = false;

  constructor(private readonly passkeyClient: PasskeyClientService) {}

  async onClick(): Promise<void> {
    this.loading = true;
    try {
      await this.passkeyClient.registerPasskey();
      this.success.emit();
    } catch (error) {
      this.failure.emit(error instanceof Error ? error : new Error('Passkey registration failed'));
    } finally {
      this.loading = false;
    }
  }
}
