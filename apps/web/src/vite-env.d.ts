/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** 'true' builds the debug tools into a production build; 'false' leaves them out of the dev server too (see utils/debug.ts). */
  readonly VITE_ENABLE_DEBUG?: string;
}

/** Whether this build includes the debug tools; set by vite.config.ts from VITE_ENABLE_DEBUG and dev/build. */
declare const __DEBUG_BUILD__: boolean;
