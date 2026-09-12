/// <reference types="vite/client" />

import type { AutoaiApi } from '@shared/ipc-contract';

declare global {
  interface Window {
    readonly autoai: AutoaiApi;
  }
}
