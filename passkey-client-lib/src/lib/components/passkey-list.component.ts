import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { PasskeyCredentialSummary } from '../passkey-client.models';
import { PasskeyClientService } from '../passkey-client.service';

@Component({
  selector: 'passkey-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div>
      <button type="button" (click)="refresh()" [disabled]="loading || disabled">{{ refreshLabel }}</button>

      <p *ngIf="errorMessage">{{ errorMessage }}</p>
      <p *ngIf="!loading && !errorMessage && credentials.length === 0">{{ emptyLabel }}</p>

      <ul *ngIf="credentials.length > 0">
        <li *ngFor="let credential of credentials">
          <div>
            <strong>{{ credential.name }}</strong>
            <div>{{ formatCreatedDate(credential.createdDate) }}</div>
          </div>
          <button
            type="button"
            [disabled]="loading || disabled || !credential.id"
            (click)="remove(credential.id)"
          >
            {{ removeLabel }}
          </button>
        </li>
      </ul>
    </div>
  `
})
export class PasskeyListComponent implements OnInit {
  @Input() disabled = false;
  @Input() autoLoad = true;
  @Input() emptyLabel = 'No passkeys registered yet.';
  @Input() refreshLabel = 'Refresh';
  @Input() removeLabel = 'Remove';

  @Output() refreshed = new EventEmitter<PasskeyCredentialSummary[]>();
  @Output() removed = new EventEmitter<string>();
  @Output() failure = new EventEmitter<Error>();

  credentials: PasskeyCredentialSummary[] = [];
  loading = false;
  errorMessage = '';

  constructor(private readonly passkeyClient: PasskeyClientService) {}

  ngOnInit(): void {
    if (this.autoLoad) {
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      this.credentials = await this.passkeyClient.listPasskeys();
      this.refreshed.emit(this.credentials);
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error('Unable to load passkeys.');
      this.errorMessage = typedError.message;
      this.failure.emit(typedError);
    } finally {
      this.loading = false;
    }
  }

  async remove(credentialId: string): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      await this.passkeyClient.deletePasskey(credentialId);
      this.removed.emit(credentialId);
      await this.refresh();
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error('Unable to remove passkey.');
      this.errorMessage = typedError.message;
      this.failure.emit(typedError);
      this.loading = false;
    }
  }

  formatCreatedDate(createdDate?: number | null): string {
    if (!createdDate || !Number.isFinite(createdDate)) {
      return 'Created date unavailable';
    }
    const parsed = new Date(createdDate);
    if (Number.isNaN(parsed.getTime())) {
      return 'Created date unavailable';
    }
    return `Created ${parsed.toLocaleString()}`;
  }
}
