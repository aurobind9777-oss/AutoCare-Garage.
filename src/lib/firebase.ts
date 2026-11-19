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

// Optional local AI Studio config: resolves cleanly to {} when absent in GitHub / Vercel builds.
const localAppletConfigs = import.meta.glob<{ default?: FirebaseAppletConfig }>(
  '../../firebase-applet-config.json',
  { eager: true }
);
const localConfig: FirebaseAppletConfig = Object.values(localAppletConfigs)[0]?.default ?? {};

const resolvedConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() || localConfig.apiKey || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || localConfig.authDomain || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || localConfig.projectId || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || localConfig.storageBucket || '',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || localConfig.messagingSenderId || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() || localConfig.appId || '',
  ...(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim() || localConfig.measurementId
    ? {
        measurementId:
          import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim() || localConfig.measurementId,
      }
    : {}),
};

const firestoreDatabaseId =
  import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID?.trim() ||
  localConfig.firestoreDatabaseId ||
  '(default)';

const requiredEntries: Array<[string, string]> = [
  ['VITE_FIREBASE_API_KEY', resolvedConfig.apiKey],
  ['VITE_FIREBASE_AUTH_DOMAIN', resolvedConfig.authDomain],
  ['VITE_FIREBASE_PROJECT_ID', resolvedConfig.projectId],
  ['VITE_FIREBASE_APP_ID', resolvedConfig.appId],
];

export const missingFirebaseEnvVars: string[] = requiredEntries
  .filter(([, val]) => !val)
  .map(([key]) => key);

export let firebaseConfigError: string | null =
  missingFirebaseEnvVars.length > 0
    ? `Missing required Firebase client configuration (${missingFirebaseEnvVars.join(', ')}). Configure these VITE_FIREBASE_* environment variables in Vercel Project Settings → Environment Variables or a local .env file.`
    : null;

let initializedApp: FirebaseApp | null = null;
let initializedDb: Firestore | null = null;

if (!firebaseConfigError) {
  try {
    const hasDefaultApp = getApps().some((a) => a.name === '[DEFAULT]');
    initializedApp = hasDefaultApp ? getApp() : initializeApp(resolvedConfig);
    initializedDb = getFirestore(initializedApp, firestoreDatabaseId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    firebaseConfigError = `Firebase initialization failed: ${message}`;
  }
}

if (firebaseConfigError) {
  console.error('[AutoCare Firebase]', firebaseConfigError);
}

const app: FirebaseApp | null = initializedApp;

export const db: Firestore = initializedDb as unknown as Firestore;

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
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { connected: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return { connected: false, error: 'Firestore client is offline. Verify Firebase configuration.' };
    }
    // Missing permissions or not-found on test/connection still confirms network/server reachability
    return { connected: true };
  }
}
