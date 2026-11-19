import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  type Auth,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

export const SUPER_ADMIN_EMAIL = 'aurobind9777@gmail.com';

interface FirebaseAppletConfig {
  projectId?: string;
  appId?: string;
  apiKey?: string;
  authDomain?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

export type FirebaseConfigIssueType = 'missing_env' | 'invalid_env' | 'init_error' | null;

// Optional local AI Studio config: resolves cleanly to {} when absent in GitHub / Vercel builds.
const localAppletConfigs = import.meta.glob<{ default?: FirebaseAppletConfig }>(
  '../../firebase-applet-config.json',
  { eager: true }
);
const localConfig: FirebaseAppletConfig = Object.values(localAppletConfigs)[0]?.default ?? {};

function cleanEnvValue(value?: string): string {
  return (value ?? '').trim();
}

function isPlaceholderValue(value: string): boolean {
  if (!value) return false;
  const upper = value.toUpperCase();
  return (
    upper.startsWith('MY_') ||
    upper.startsWith('YOUR_') ||
    upper.includes('REPLACE_WITH') ||
    value === '...' ||
    (value.startsWith('<') && value.endsWith('>'))
  );
}

const resolvedApiKey = cleanEnvValue(import.meta.env.VITE_FIREBASE_API_KEY) || cleanEnvValue(localConfig.apiKey);
const resolvedAuthDomain =
  cleanEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) || cleanEnvValue(localConfig.authDomain);
const resolvedProjectId =
  cleanEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID) || cleanEnvValue(localConfig.projectId);
const resolvedStorageBucket =
  cleanEnvValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) || cleanEnvValue(localConfig.storageBucket);
const resolvedMessagingSenderId =
  cleanEnvValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
  cleanEnvValue(localConfig.messagingSenderId);
const resolvedAppId = cleanEnvValue(import.meta.env.VITE_FIREBASE_APP_ID) || cleanEnvValue(localConfig.appId);
const resolvedFirestoreDatabaseId =
  cleanEnvValue(import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID) ||
  cleanEnvValue(localConfig.firestoreDatabaseId);
const resolvedMeasurementId =
  cleanEnvValue(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) || cleanEnvValue(localConfig.measurementId);

const resolvedConfig = {
  apiKey: resolvedApiKey,
  authDomain: resolvedAuthDomain,
  projectId: resolvedProjectId,
  storageBucket: resolvedStorageBucket,
  messagingSenderId: resolvedMessagingSenderId,
  appId: resolvedAppId,
  ...(resolvedMeasurementId ? { measurementId: resolvedMeasurementId } : {}),
};

const requiredEntries: Array<[string, string]> = [
  ['VITE_FIREBASE_API_KEY', resolvedApiKey],
  ['VITE_FIREBASE_AUTH_DOMAIN', resolvedAuthDomain],
  ['VITE_FIREBASE_PROJECT_ID', resolvedProjectId],
  ['VITE_FIREBASE_STORAGE_BUCKET', resolvedStorageBucket],
  ['VITE_FIREBASE_MESSAGING_SENDER_ID', resolvedMessagingSenderId],
  ['VITE_FIREBASE_APP_ID', resolvedAppId],
  ['VITE_FIREBASE_FIRESTORE_DATABASE_ID', resolvedFirestoreDatabaseId],
];

export const missingFirebaseEnvVars: string[] = requiredEntries
  .filter(([, val]) => !val)
  .map(([key]) => key);

export const invalidFirebaseEnvVars: string[] = requiredEntries
  .filter(([, val]) => isPlaceholderValue(val))
  .map(([key]) => key);

export let firebaseConfigIssueType: FirebaseConfigIssueType = null;
export let firebaseConfigError: string | null = null;

if (missingFirebaseEnvVars.length > 0) {
  firebaseConfigIssueType = 'missing_env';
  firebaseConfigError = `Missing required Firebase client configuration (${missingFirebaseEnvVars.join(', ')}). Add these VITE_FIREBASE_* environment variables in Vercel Project Settings → Environment Variables (for Production and Preview) or a local .env file, then trigger a fresh build.`;
} else if (invalidFirebaseEnvVars.length > 0) {
  firebaseConfigIssueType = 'invalid_env';
  firebaseConfigError = `Placeholder Firebase configuration detected for (${invalidFirebaseEnvVars.join(', ')}). Replace placeholders with your actual Firebase Web App values and trigger a fresh build.`;
}

let initializedApp: FirebaseApp | null = null;
let initializedDb: Firestore | null = null;
let initializedStorage: FirebaseStorage | null = null;

if (!firebaseConfigError) {
  try {
    const hasDefaultApp = getApps().some((a) => a.name === '[DEFAULT]');
    initializedApp = hasDefaultApp ? getApp() : initializeApp(resolvedConfig);
    initializedDb = getFirestore(initializedApp, resolvedFirestoreDatabaseId);
    initializedStorage = getStorage(initializedApp);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    firebaseConfigIssueType = 'init_error';
    firebaseConfigError = `Firebase initialization failed: ${message}`;
  }
}

if (firebaseConfigError) {
  console.error('[AutoCare Firebase]', firebaseConfigError);
} else if (import.meta.env.DEV) {
  console.info('[AutoCare Firebase] Initialized', {
    projectId: resolvedProjectId,
    firestoreDatabaseId: resolvedFirestoreDatabaseId,
    source: cleanEnvValue(import.meta.env.VITE_FIREBASE_API_KEY) ? 'vite_env' : 'firebase_applet_config',
  });
}

export const app: FirebaseApp | null = initializedApp;
export const db: Firestore = initializedDb as unknown as Firestore;
export const storage: FirebaseStorage = initializedStorage as unknown as FirebaseStorage;

function createPrimaryAuth(): Auth {
  if (!app) {
    return null as unknown as Auth;
  }
  try {
    return initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
        inMemoryPersistence,
      ],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth: Auth = createPrimaryAuth();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function getSecondaryAuth(): Auth {
  if (firebaseConfigError) {
    throw new Error(firebaseConfigError);
  }
  const existing = getApps().find((a) => a.name === 'StaffProvisioningApp');
  const secondaryApp = existing ?? initializeApp(resolvedConfig, 'StaffProvisioningApp');
  try {
    return initializeAuth(secondaryApp, {
      persistence: inMemoryPersistence,
    });
  } catch {
    return getAuth(getApp('StaffProvisioningApp'));
  }
}

export function getFirebaseDiagnostics() {
  return {
    ready: !firebaseConfigError && Boolean(initializedApp && initializedDb && initializedStorage),
    issueType: firebaseConfigIssueType,
    missingVars: [...missingFirebaseEnvVars],
    invalidVars: [...invalidFirebaseEnvVars],
    hasProjectId: Boolean(resolvedProjectId),
    hasDatabaseId: Boolean(resolvedFirestoreDatabaseId),
    hasStorageBucket: Boolean(resolvedStorageBucket),
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<{ connected: boolean; error?: string }> {
  if (firebaseConfigError || !db) {
    return {
      connected: false,
      error: firebaseConfigError || 'Firebase is not initialized.',
    };
  }
  try {
    await getDocFromServer(doc(db, 'garages', 'garage-1'));
    return { connected: true };
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline') || code === 'unavailable') {
      return { connected: false, error: 'Firestore client is offline. Verify network connectivity.' };
    }
    if (code === 'not-found' && msg.includes('5 NOT_FOUND')) {
      return {
        connected: false,
        error: 'Configured Firestore database was not found. Verify VITE_FIREBASE_FIRESTORE_DATABASE_ID.',
      };
    }
    // Any other response confirms the Firestore endpoint is reachable
    return { connected: true };
  }
}
