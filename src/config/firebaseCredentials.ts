/**
 * Firebase credentials and app configuration.
 *
 * TEMPORARY: This file uses hardcoded credentials so the app works when .env is not loaded.
 * TODO (security): When you move to env-based config:
 *   - Remove the "Hardcoded fallback" block below.
 *   - Use only the env vars in the "From env" section (uncomment/restore that path).
 *   - Add .env.local to .gitignore and never commit real API keys.
 */

export interface FirebaseCredentials {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  /** Required for Realtime Database (e.g. https://PROJECT_ID-default-rtdb.firebaseio.com) */
  databaseURL?: string;
}

const env = typeof process !== 'undefined' ? process.env : {};

/** Credentials used to connect to the Firebase backend. */
export const firebaseCredentials: FirebaseCredentials | null = (() => {
  // ----- From env (use this when .env.local is working) -----
  const apiKeyFromEnv = env.REACT_APP_FIREBASE_API_KEY;
  const authDomainFromEnv = env.REACT_APP_FIREBASE_AUTH_DOMAIN;
  const projectIdFromEnv = env.REACT_APP_FIREBASE_PROJECT_ID;
  const storageBucketFromEnv = env.REACT_APP_FIREBASE_STORAGE_BUCKET;
  const messagingSenderIdFromEnv = env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID;
  const appIdFromEnv = env.REACT_APP_FIREBASE_APP_ID;
  const databaseURLFromEnv = env.REACT_APP_FIREBASE_DATABASE_URL;

  const envComplete =
    apiKeyFromEnv &&
    authDomainFromEnv &&
    projectIdFromEnv &&
    storageBucketFromEnv &&
    messagingSenderIdFromEnv &&
    appIdFromEnv;

  if (envComplete) {
    return {
      apiKey: apiKeyFromEnv,
      authDomain: authDomainFromEnv,
      projectId: projectIdFromEnv,
      storageBucket: storageBucketFromEnv,
      messagingSenderId: messagingSenderIdFromEnv,
      appId: appIdFromEnv,
      ...(databaseURLFromEnv && { databaseURL: databaseURLFromEnv }),
    };
  }

  // ----- Hardcoded fallback (remove when moving to env-only) -----
  // When .env.local works: delete the return { ... } below and use "return null;" here instead.
  // SECURITY: Do not commit production keys. Use .env.local and add it to .gitignore.
  return {
    apiKey: 'AIzaSyCNgPpwhwStsUaxdrEw-uJ8wISHxCamrxw',
    authDomain: 'fir-101-15966.firebaseapp.com',
    projectId: 'fir-101-15966',
    storageBucket: 'fir-101-15966.firebasestorage.app',
    messagingSenderId: '547588712015',
    appId: '1:547588712015:web:1c0578849412e16e726c3a',
    databaseURL: 'https://fir-101-15966-default-rtdb.firebaseio.com',
  };
})();

export const isFirebaseConfigured = firebaseCredentials !== null;

/** Names of env vars that are missing or empty (for troubleshooting). */
export const missingEnvVars: string[] = (() => {
  const names = [
    'REACT_APP_FIREBASE_API_KEY',
    'REACT_APP_FIREBASE_AUTH_DOMAIN',
    'REACT_APP_FIREBASE_PROJECT_ID',
    'REACT_APP_FIREBASE_STORAGE_BUCKET',
    'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
    'REACT_APP_FIREBASE_APP_ID',
    'REACT_APP_FIREBASE_DATABASE_URL',
  ] as const;
  return names.filter((n) => !env[n] || String(env[n]).trim() === '');
})();

// Dev-only: log when using hardcoded credentials (remind to switch to env later)
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production' && missingEnvVars.length > 0) {
  console.warn(
    '[Firebase] Using hardcoded credentials (env missing:',
    missingEnvVars.join(', '),
    '). For production, use .env.local and remove the hardcoded fallback in firebaseCredentials.ts.'
  );
}
