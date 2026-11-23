/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" builds the static, backend-free demo (used for the Vercel deployment). */
  readonly VITE_DEMO_MODE?: string;
}
