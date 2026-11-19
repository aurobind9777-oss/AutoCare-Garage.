import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  SUPER_ADMIN_EMAIL,
  testFirestoreConnection,
} from '../lib/firebase';
import { seedInitialPlatformData } from '../services/firestoreService';
import type { StaffInvite, UserAccount, UserRole } from '../types/autocare';

interface AuthContextValue {
  firebaseUser: User | null;
  emailVerified: boolean;
  account: UserAccount | null;
  loading: boolean;
  authReady: boolean;
  firestoreOnline: boolean;
  authError: string | null;
  clearAuthError: () => void;
  loginWithGoogle: () => Promise<boolean>;
  loginWithEmail: (email: string, password: string) => Promise<boolean>;
  registerWithEmail: (name: string, email: string, password: string, phone?: string) => Promise<boolean>;
  sendResetPassword: (email: string) => Promise<boolean>;
  resendVerification: () => Promise<boolean>;
  refreshAuthUser: () => Promise<boolean>;
  retrySyncAccount: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  emailVerified: false,
  account: null,
  loading: true,
  authReady: false,
  firestoreOnline: true,
  authError: null,
  clearAuthError: () => {},
  loginWithGoogle: async () => false,
  loginWithEmail: async () => false,
  registerWithEmail: async () => false,
  sendResetPassword: async () => false,
  resendVerification: async () => false,
  refreshAuthUser: async () => false,
  retrySyncAccount: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (import.meta.env.DEV && err) {
    console.error('[AutoCare Auth] Firebase Auth error:', code || 'unknown', err);
  }

  switch (code) {
    case 'auth/user-not-found':
      return 'No account is registered with this email address. Please check your email or register a new account.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again or use Forgot Password to reset it.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Incorrect email address or password. If you previously signed in with Google, click "Continue with Google" or use "Forgot password?" to set an email password.';
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'Please enter a valid email address (for example, name@example.com).';
    case 'auth/missing-password':
      return 'Please enter your password.';
    case 'auth/weak-password':
      return 'Password is too weak. Please choose a password with at least 6 characters.';
    case 'auth/email-already-in-use':
      return 'This email address is already registered. Please sign in instead or reset your password.';
    case 'auth/account-exists-with-different-credential':
    case 'auth/credential-already-in-use':
      return 'An account already exists with this email using a different sign-in method. Please sign in with your original method.';
    case 'auth/too-many-requests':
      return 'Too many login or verification attempts. Please wait a few minutes before trying again.';
    case 'auth/network-request-failed':
    case 'auth/timeout':
      return 'Network error while connecting to Firebase Authentication. Please check your internet connection and try again.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication → Sign-in method). Enable Email/Password in Firebase Console or continue with Google Sign-In.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact AutoCare Garage support.';
    case 'auth/user-token-expired':
      return 'Your session has expired. Please sign in again.';
    case 'auth/unauthorized-domain':
      return `Domain "${window.location.hostname}" is not authorized in Firebase Authentication. Add it under Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/configuration-not-found':
    case 'auth/invalid-api-key':
    case 'auth/app-not-authorized':
    case 'auth/project-not-found':
    case 'auth/invalid-app-credential':
      return `Authentication service configuration error (${code}). Please verify Firebase project configuration and enabled sign-in methods.`;
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site in your browser address bar and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/redirect-cancelled-by-user':
      return 'Sign-in window was closed before completing authentication.';
    case 'auth/redirect-operation-pending':
      return 'A Google sign-in attempt is already in progress. Please complete or close the other window.';
    case 'auth/web-storage-unsupported':
      return 'Browser storage or third-party cookies are blocked (for example, in Firefox strict privacy mode). Allow site cookies/storage for this page and try again.';
    case 'auth/internal-error':
      return 'Browser security or popup settings interrupted sign-in. If using Firefox, allow popups and disable strict tracking protection for this preview, or sign in using Email/Password.';
    case 'auth/requires-recent-login':
      return 'For your security, please sign out and sign back in before retrying this action.';
    default:
      return code
        ? `Authentication failed (${code}). Please verify your details and try again.`
        : 'Authentication could not be completed. Please verify your details and try again.';
  }
}

function mapFirestoreSyncError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (import.meta.env.DEV && err) {
    console.error('[AutoCare Firestore] User profile sync error:', code || 'unknown', err);
  }
  if (code === 'permission-denied') {
    return 'Signed in, but Firestore Security Rules denied profile access (permission-denied). Please verify your email or contact Super Admin.';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'Signed in, but Firestore is currently unreachable. Please check your connection and click Retry.';
  }
  return code
    ? `Signed in, but failed to load your user profile from Firestore (${code}). Please retry.`
    : 'Signed in, but could not load your user profile from Firestore. Please retry.';
}

const VALID_ROLES: UserRole[] = ['super_admin', 'garage_manager', 'mechanic', 'customer'];

function normalizeUserAccount(raw: Partial<UserAccount>, user: User): UserAccount {
  const emailLower = (raw.email || user.email || '').toLowerCase();
  const safeRole: UserRole = raw.role && VALID_ROLES.includes(raw.role) ? raw.role : 'customer';
  return {
    uid: raw.uid || user.uid,
    email: emailLower,
    displayName: raw.displayName || user.displayName || emailLower.split('@')[0] || 'Customer',
    role: safeRole,
    garageId: typeof raw.garageId === 'string' ? raw.garageId : '',
    claimedInviteId: raw.claimedInviteId,
    isActive: raw.isActive !== false,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [firestoreOnline, setFirestoreOnline] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const syncInFlightRef = useRef<{ uid: string; promise: Promise<UserAccount | null> } | null>(null);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const syncUserAccount = useCallback(async (user: User, pendingPhone?: string): Promise<UserAccount | null> => {
    if (syncInFlightRef.current && syncInFlightRef.current.uid === user.uid) {
      return syncInFlightRef.current.promise;
    }

    const runSync = async (): Promise<UserAccount | null> => {
      const emailLower = (user.email || '').toLowerCase();
      const isBootstrappedSuperAdmin = emailLower === SUPER_ADMIN_EMAIL.toLowerCase() && user.emailVerified;

      // If unverified email/password user, return lightweight client object without writing protected docs yet
      if (!user.emailVerified) {
        return {
          uid: user.uid,
          email: emailLower,
          displayName: user.displayName || emailLower.split('@')[0] || 'Customer',
          role: 'customer',
          garageId: '',
          isActive: true,
        };
      }

      const userRef = doc(db, 'users', user.uid);
      const existingSnap = await getDoc(userRef);

      // Check if there is a pending Super Admin staff invite matching this verified email
      let claimedInvite: (StaffInvite & { id: string }) | null = null;
      try {
        const invQ = query(
          collection(db, 'staff_invites'),
          where('email', '==', emailLower),
          where('status', '==', 'pending')
        );
        const invSnaps = await getDocs(invQ);
        if (!invSnaps.empty) {
          const first = invSnaps.docs[0];
          claimedInvite = { id: first.id, ...(first.data() as StaffInvite) };
        }
      } catch {
        // Ignore if query fails
      }

      if (claimedInvite && !isBootstrappedSuperAdmin) {
        const invite = claimedInvite;
        await runTransaction(db, async (tx) => {
          const invRef = doc(db, 'staff_invites', invite.id);
          const invTxSnap = await tx.get(invRef);
          if (!invTxSnap.exists() || invTxSnap.data()?.status !== 'pending') {
            return;
          }

          const gRef = doc(db, 'garages', invite.garageId);
          const gSnap = await tx.get(gRef);
          const userTxSnap = await tx.get(userRef);

          tx.update(invRef, {
            status: 'claimed',
            updatedAt: serverTimestamp(),
          });

          const accountData: Record<string, unknown> = {
            uid: user.uid,
            email: emailLower,
            displayName: invite.name || user.displayName || emailLower.split('@')[0],
            role: invite.role,
            garageId: invite.garageId,
            claimedInviteId: invite.id,
            isActive: true,
            updatedAt: serverTimestamp(),
          };

          if (userTxSnap.exists()) {
            tx.update(userRef, {
              role: invite.role,
              garageId: invite.garageId,
              claimedInviteId: invite.id,
              updatedAt: serverTimestamp(),
            });
          } else {
            tx.set(userRef, {
              ...accountData,
              createdAt: serverTimestamp(),
            });
          }

          if (invite.role === 'garage_manager') {
            tx.set(doc(db, 'garage_managers', user.uid), {
              uid: user.uid,
              garageId: invite.garageId,
              name: invite.name || user.displayName || 'Garage Manager',
              email: emailLower,
              phone: invite.phone || '',
              isActive: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            if (gSnap.exists()) {
              tx.update(gRef, {
                managerUid: user.uid,
                managerName: (invite.name || user.displayName || 'Garage Manager').slice(0, 120),
                updatedAt: serverTimestamp(),
              });
            }
          } else if (invite.role === 'mechanic') {
            const gManagerUid = gSnap.exists() ? (gSnap.data().managerUid as string) || '' : '';
            tx.set(doc(db, 'garage_mechanics', user.uid), {
              uid: user.uid,
              garageId: invite.garageId,
              garageManagerId: gManagerUid,
              name: invite.name || user.displayName || 'Mechanic',
              email: emailLower,
              phone: invite.phone || '',
              specialization: invite.specialization || 'General Service',
              isAvailable: true,
              isActive: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        });

        if (invite.role === 'garage_manager') {
          const starterSuffixes = ['oil_5w30', 'brake_pad', 'bike_chain'];
          for (const suffix of starterSuffixes) {
            try {
              const pRef = doc(db, 'spare_parts', `${invite.garageId}_${suffix}`);
              const pSnap = await getDoc(pRef);
              if (pSnap.exists()) {
                await updateDoc(pRef, {
                  garageManagerId: user.uid,
                  updatedAt: serverTimestamp(),
                });
              }
            } catch {
              // Non-blocking if starter part was removed or already updated
            }
          }
        }

        const refreshed = await getDoc(userRef);
        if (refreshed.exists()) {
          return normalizeUserAccount(refreshed.data() as Partial<UserAccount>, user);
        }
      }

      if (existingSnap.exists()) {
        const existingData = normalizeUserAccount(existingSnap.data() as Partial<UserAccount>, user);
        if (isBootstrappedSuperAdmin && existingData.role !== 'super_admin') {
          await setDoc(
            userRef,
            {
              ...existingData,
              role: 'super_admin',
              garageId: '',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          try {
            await seedInitialPlatformData(user.uid, emailLower);
          } catch (seedErr) {
            console.warn('Non-blocking initial platform seed warning:', seedErr);
          }
          return { ...existingData, role: 'super_admin', garageId: '' };
        }
        if (existingData.role === 'super_admin') {
          try {
            await seedInitialPlatformData(user.uid, emailLower);
          } catch (seedErr) {
            console.warn('Non-blocking initial platform seed warning:', seedErr);
          }
        }
        return existingData;
      }

      // Create new user profile
      const role: UserRole = isBootstrappedSuperAdmin ? 'super_admin' : 'customer';
      const displayName = (user.displayName || emailLower.split('@')[0] || 'Customer').slice(0, 120);

      await setDoc(userRef, {
        uid: user.uid,
        email: emailLower,
        displayName,
        role,
        garageId: '',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (role === 'customer') {
        const custRef = doc(db, 'customers', user.uid);
        const existingCustSnap = await getDoc(custRef);
        if (!existingCustSnap.exists()) {
          await setDoc(custRef, {
            uid: user.uid,
            name: displayName,
            email: emailLower,
            phone: (pendingPhone || user.phoneNumber || '').slice(0, 30),
            address: '',
            city: '',
            pincode: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } else if (role === 'super_admin') {
        try {
          await seedInitialPlatformData(user.uid, emailLower);
        } catch (seedErr) {
          console.warn('Non-blocking initial platform seed warning:', seedErr);
        }
      }

      return {
        uid: user.uid,
        email: emailLower,
        displayName,
        role,
        garageId: '',
        isActive: true,
      };
    };

    const promise = runSync().finally(() => {
      if (syncInFlightRef.current?.uid === user.uid) {
        syncInFlightRef.current = null;
      }
    });
    syncInFlightRef.current = { uid: user.uid, promise };
    return promise;
  }, []);

  useEffect(() => {
    let mounted = true;
    testFirestoreConnection().then((res) => {
      if (mounted) setFirestoreOnline(res.connected);
    });

    getRedirectResult(auth).catch((err) => {
      const code = (err as { code?: string })?.code;
      if (mounted && err && code !== 'auth/no-auth-event') {
        setAuthError(mapFirebaseAuthError(err));
      }
    });

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!mounted) return;
      setFirebaseUser(user);
      setEmailVerified(Boolean(user?.emailVerified));
      if (user) {
        try {
          const acc = await syncUserAccount(user);
          if (mounted) setAccount(acc);
        } catch (err) {
          if (mounted) setAuthError(mapFirestoreSyncError(err));
        }
      } else {
        setAccount(null);
      }
      if (mounted) {
        setLoading(false);
        setAuthReady(true);
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [syncUserAccount]);

  const loginWithGoogle = useCallback(async (): Promise<boolean> => {
    setAuthError(null);
    let user: User;
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      user = cred.user;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-blocked') {
        const inIframe = typeof window !== 'undefined' && window.self !== window.top;
        if (inIframe) {
          setAuthError(
            'Your browser (such as Firefox) blocked the Google Sign-In popup inside this embedded view. Please allow popups for this site in your browser bar and click Continue with Google again, or sign in with Email/Password.'
          );
          return false;
        }
        setAuthError('Sign-in popup was blocked by your browser. Switching to Google redirect sign-in...');
        try {
          await signInWithRedirect(auth, googleProvider);
          return true;
        } catch (redirectErr) {
          setAuthError(mapFirebaseAuthError(redirectErr));
          return false;
        }
      }
      setAuthError(mapFirebaseAuthError(err));
      return false;
    }

    setFirebaseUser(user);
    setEmailVerified(Boolean(user.emailVerified));
    try {
      const acc = await syncUserAccount(user);
      setAccount(acc);
    } catch (syncErr) {
      setAuthError(mapFirestoreSyncError(syncErr));
    }
    return true;
  }, [syncUserAccount]);

  const loginWithEmail = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setAuthError(null);
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !password) {
        setAuthError('Please enter both your email address and password.');
        return false;
      }

      let user: User;
      try {
        const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
        user = cred.user;
      } catch (err) {
        setAuthError(mapFirebaseAuthError(err));
        return false;
      }

      try {
        if (user.emailVerified) {
          await user.getIdToken(true);
        }
      } catch {
        // Ignore non-fatal token refresh error; onAuthStateChanged still has active session
      }

      setFirebaseUser(user);
      setEmailVerified(Boolean(user.emailVerified));
      try {
        const acc = await syncUserAccount(user);
        setAccount(acc);
      } catch (syncErr) {
        setAuthError(mapFirestoreSyncError(syncErr));
      }
      return true;
    },
    [syncUserAccount]
  );

  const registerWithEmail = useCallback(
    async (name: string, email: string, password: string, phone?: string): Promise<boolean> => {
      setAuthError(null);
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      if (!trimmedName) {
        setAuthError('Please enter your full name.');
        return false;
      }
      if (!trimmedEmail || !password) {
        setAuthError('Please enter a valid email address and password.');
        return false;
      }

      let user: User;
      try {
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        user = cred.user;
      } catch (err) {
        setAuthError(mapFirebaseAuthError(err));
        return false;
      }

      try {
        await updateProfile(user, { displayName: trimmedName });
        await sendEmailVerification(user);
        await user.reload();
      } catch (postCreateErr) {
        setAuthError(mapFirebaseAuthError(postCreateErr));
      }

      setFirebaseUser(user);
      setEmailVerified(Boolean(user.emailVerified));
      try {
        const acc = await syncUserAccount(user, phone);
        setAccount(acc);
      } catch (syncErr) {
        setAuthError(mapFirestoreSyncError(syncErr));
      }
      return true;
    },
    [syncUserAccount]
  );

  const sendResetPassword = useCallback(async (email: string): Promise<boolean> => {
    setAuthError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthError('Please enter your registered email address.');
      return false;
    }
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      return true;
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
      return false;
    }
  }, []);

  const resendVerification = useCallback(async (): Promise<boolean> => {
    setAuthError(null);
    if (!auth.currentUser) return false;
    try {
      await sendEmailVerification(auth.currentUser);
      return true;
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
      return false;
    }
  }, []);

  const refreshAuthUser = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    let verified = false;
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      verified = Boolean(auth.currentUser.emailVerified);
      setFirebaseUser(auth.currentUser);
      setEmailVerified(verified);
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
      return false;
    }

    if (verified && auth.currentUser) {
      try {
        const acc = await syncUserAccount(auth.currentUser);
        setAccount(acc);
      } catch (syncErr) {
        setAuthError(mapFirestoreSyncError(syncErr));
      }
    }
    return verified;
  }, [syncUserAccount]);

  const retrySyncAccount = useCallback(async () => {
    if (!auth.currentUser) return;
    setAuthError(null);
    try {
      await auth.currentUser.getIdToken(true);
      const acc = await syncUserAccount(auth.currentUser);
      setAccount(acc);
    } catch (err) {
      setAuthError(mapFirestoreSyncError(err));
    }
  }, [syncUserAccount]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setFirebaseUser(null);
    setEmailVerified(false);
    setAccount(null);
    setAuthError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        emailVerified,
        account,
        loading,
        authReady,
        firestoreOnline,
        authError,
        clearAuthError,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        sendResetPassword,
        resendVerification,
        refreshAuthUser,
        retrySyncAccount,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
