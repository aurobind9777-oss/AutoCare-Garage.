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
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDocFromServer,
  type Firestore,
} from 'firebase/firestore';
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

// Public Firebase Web App configuration for existing project gen-lang-client-0430430062.
// Overridden automatically by VITE_FIREBASE_* environment variables or local firebase-applet-config.json.
const DEFAULT_FIREBASE_CONFIG: Required<Omit<FirebaseAppletConfig, 'measurementId'>> = {
  apiKey: 'AIzaSyBMLW4Le60HYST6L7Qvn59X2Dq5QvlW2L4',
  authDomain: 'gen-lang-client-0430430062.firebaseapp.com',
  projectId: 'gen-lang-client-0430430062',
  storageBucket: 'gen-lang-client-0430430062.firebasestorage.app',
  messagingSenderId: '207710813560',
  appId: '1:207710813560:web:e686619b03a2e5e466dc8d',
  firestoreDatabaseId: 'ai-studio-4987f0f1-1154-4a7b-a937-8831e576b01b',
};

// Optional local AI Studio config: resolves cleanly to {} when absent in GitHub / Vercel builds.
const localAppletConfigs = import.meta.glob<{ default?: FirebaseAppletConfig }>(
  '../../firebase-applet-config.json',
  { eager: true }
);
const localConfig: FirebaseAppletConfig = Object.values(localAppletConfigs)[0]?.default ?? {};

function cleanEnvValue(value?: string): string {
  let trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  if (
    upper.startsWith('MY_') ||
    upper.startsWith('YOUR_') ||
    upper.includes('REPLACE_WITH') ||
    trimmed === '...' ||
    (trimmed.startsWith('<') && trimmed.endsWith('>'))
  ) {
    return '';
  }
  return trimmed;
}

const resolvedProjectId =
  cleanEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID) ||
  cleanEnvValue(localConfig.projectId) ||
  DEFAULT_FIREBASE_CONFIG.projectId;

const rawEnvDatabaseId = cleanEnvValue(import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID);
const rawLocalDatabaseId = cleanEnvValue(localConfig.firestoreDatabaseId);

// Guard against accidentally targeting "(default)" on gen-lang-client-0430430062, which only uses the named DB.
function resolveDatabaseId(): string {
  const candidate = rawEnvDatabaseId || rawLocalDatabaseId || DEFAULT_FIREBASE_CONFIG.firestoreDatabaseId;
  if (
    resolvedProjectId === DEFAULT_FIREBASE_CONFIG.projectId &&
    (candidate === '(default)' || candidate.toLowerCase() === 'default')
  ) {
    console.warn(
      '[AutoCare Firebase] Ignoring invalid "(default)" database override for project gen-lang-client-0430430062; using named Firestore database.'
    );
    return DEFAULT_FIREBASE_CONFIG.firestoreDatabaseId;
  }
  return candidate;
}

const resolvedMeasurementId =
  cleanEnvValue(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) ||
  cleanEnvValue(localConfig.measurementId);

const firebaseConfig = {
  apiKey:
    cleanEnvValue(import.meta.env.VITE_FIREBASE_API_KEY) ||
    cleanEnvValue(localConfig.apiKey) ||
    DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain:
    cleanEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) ||
    cleanEnvValue(localConfig.authDomain) ||
    DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: resolvedProjectId,
  storageBucket:
    cleanEnvValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) ||
    cleanEnvValue(localConfig.storageBucket) ||
    DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId:
    cleanEnvValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
    cleanEnvValue(localConfig.messagingSenderId) ||
    DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId:
    cleanEnvValue(import.meta.env.VITE_FIREBASE_APP_ID) ||
    cleanEnvValue(localConfig.appId) ||
    DEFAULT_FIREBASE_CONFIG.appId,
  ...(resolvedMeasurementId ? { measurementId: resolvedMeasurementId } : {}),
};

export const firestoreDatabaseId = resolveDatabaseId();
export let firebaseInitError: string | null = null;

let initializedApp: FirebaseApp | null = null;
let initializedDb: Firestore | null = null;
let initializedStorage: FirebaseStorage | null = null;

function getAppIfExists(): FirebaseApp | null {
  try {
    return getApps().length > 0 ? getApp() : null;
  } catch {
    return null;
  }
}

function createFirestoreInstance(firebaseApp: FirebaseApp, databaseId: string): Firestore {
  try {
    return initializeFirestore(
      firebaseApp,
      {
        experimentalAutoDetectLongPolling: true,
        ignoreUndefinedProperties: true,
      },
      databaseId
    );
  } catch {
    return getFirestore(firebaseApp, databaseId);
  }
}

try {
  const existingDefault = getApps().find((a) => a.name === '[DEFAULT]');
  initializedApp = existingDefault ?? getAppIfExists() ?? initializeApp(firebaseConfig);
  initializedDb = createFirestoreInstance(initializedApp, firestoreDatabaseId);
  initializedStorage = getStorage(initializedApp);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  firebaseInitError = `Unable to initialize Firebase services: ${message}`;
  console.error('[AutoCare Firebase] Initialization failure:', {
    projectId: firebaseConfig.projectId,
    firestoreDatabaseId,
    message,
  });
}

function createPrimaryAuth(): Auth {
  if (!initializedApp) {
    return null as unknown as Auth;
  }
  try {
    return initializeAuth(initializedApp, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
        inMemoryPersistence,
      ],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(initializedApp);
  }
}

export const app: FirebaseApp = initializedApp as FirebaseApp;
export const auth: Auth = createPrimaryAuth();
export const db: Firestore = initializedDb as Firestore;
export const storage: FirebaseStorage = initializedStorage as FirebaseStorage;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function getSecondaryAuth(): Auth {
  if (firebaseInitError || !initializedApp) {
    throw new Error(firebaseInitError || 'Firebase is not initialized.');
  }
  const existing = getApps().find((a) => a.name === 'StaffProvisioningApp');
  const secondaryApp = existing ?? initializeApp(firebaseConfig, 'StaffProvisioningApp');
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
    ready: !firebaseInitError && Boolean(initializedApp && initializedDb && initializedStorage),
    projectId: firebaseConfig.projectId,
    firestoreDatabaseId,
    configSource: cleanEnvValue(import.meta.env.VITE_FIREBASE_API_KEY)
      ? 'vite_env'
      : cleanEnvValue(localConfig.apiKey)
        ? 'firebase_applet_config'
        : 'project_default',
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

export interface FirestoreConnectionStatus {
  connected: boolean;
  code?: 'permission-denied' | 'unavailable' | 'not-found' | 'invalid-database' | 'init-error' | 'unknown';
  error?: string;
}

export async function testFirestoreConnection(): Promise<FirestoreConnectionStatus> {
  if (firebaseInitError || !db) {
    return {
      connected: false,
      code: 'init-error',
      error: firebaseInitError || 'Firebase is not initialized.',
    };
  }
  try {
    await getDocFromServer(doc(db, 'garages', 'garage-1'));
    return { connected: true };
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[AutoCare Firestore] Connectivity check error:', {
      code: code || 'unknown',
      message: msg,
      projectId: firebaseConfig.projectId,
      firestoreDatabaseId,
    });

    if (code === 'permission-denied') {
      return {
        connected: true,
        code: 'permission-denied',
        error: 'Firestore reachable, but security rules denied read on garages/garage-1.',
      };
    }
    if (code === 'not-found' || msg.includes('5 NOT_FOUND')) {
      return {
        connected: false,
        code: 'invalid-database',
        error: `Configured Firestore database "${firestoreDatabaseId}" was not found on project "${firebaseConfig.projectId}".`,
      };
    }
    if (msg.includes('the client is offline') || code === 'unavailable' || code === 'deadline-exceeded') {
      return {
        connected: false,
        code: 'unavailable',
        error: 'Firestore client is offline or blocked by network/proxy.',
      };
    }
    return {
      connected: false,
      code: 'unknown',
      error: msg,
    };
  }
}
