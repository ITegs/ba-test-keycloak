import { CommonModule } from '@angular/common';
import { Component, Input, ViewChild } from '@angular/core';
import { PasskeyListComponent } from './passkey-list.component';
import { RegisterPasskeyButtonComponent } from './register-passkey-button.component';

@Component({
  selector: 'passkey-manager',
  standalone: true,
  imports: [CommonModule, RegisterPasskeyButtonComponent, PasskeyListComponent],
  template: `
    <section>
      <header>
        <h3>{{ title }}</h3>
        <register-passkey-button
          [label]="registerLabel"
          [loadingLabel]="registerLoadingLabel"
          [disabled]="disabled"
          (success)="onRegistered()"
        />
      </header>

      <passkey-list
        #passkeyList
        [disabled]="disabled"
        [emptyLabel]="emptyLabel"
        [refreshLabel]="refreshLabel"
        [removeLabel]="removeLabel"
      />
    </section>
  `
})
export class PasskeyManagerComponent {
  @Input() title = 'Your Passkeys';
  @Input() registerLabel = 'Register Passkey';
  @Input() registerLoadingLabel = 'Registering...';
  @Input() refreshLabel = 'Refresh';
  @Input() removeLabel = 'Remove';
  @Input() emptyLabel = 'No passkeys registered yet.';
  @Input() disabled = false;

  @ViewChild('passkeyList') private passkeyList?: PasskeyListComponent;

  onRegistered(): void {
    void this.passkeyList?.refresh();
  }
}
