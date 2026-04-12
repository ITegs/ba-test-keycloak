import { InjectionToken, Provider } from '@angular/core';
import { PasskeyClientConfig } from './passkey-client.models';

export const PASSKEY_CLIENT_CONFIG = new InjectionToken<PasskeyClientConfig>('PASSKEY_CLIENT_CONFIG');

export function providePasskeyClient(config: PasskeyClientConfig): Provider {
  return {
    provide: PASSKEY_CLIENT_CONFIG,
    useValue: config
  };
}
