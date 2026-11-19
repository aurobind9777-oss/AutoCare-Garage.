import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, Loader2, LogOut, MailCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  db,
  firebaseConfigError,
  handleFirestoreError,
  missingFirebaseEnvVars,
  OperationType,
} from './lib/firebase';
import { DEMO_SIX_GARAGES, DEFAULT_PLATFORM_SETTINGS } from './data/seedCatalog';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastProvider, useToast } from './components/common/ToastProvider';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PublicWebsite } from './components/public/PublicWebsite';
import { AuthModal } from './components/auth/AuthModal';
import { CustomerDashboard } from './components/dashboards/CustomerDashboard';
import { MechanicDashboard } from './components/dashboards/MechanicDashboard';
import { GarageManagerDashboard } from './components/dashboards/GarageManagerDashboard';
import { SuperAdminDashboard } from './components/dashboards/SuperAdminDashboard';
import type {
  Garage,
  PlatformSettings,
  Review,
  ServiceCategory,
  ServicePackage,
} from './types/autocare';

function AutoCareAppShell() {
  const { showToast } = useToast();
  const {
    firebaseUser,
    emailVerified,
    account,
    loading,
    firestoreOnline,
    authError,
    resendVerification,
    refreshAuthUser,
    retrySyncAccount,
    logout,
  } = useAuth();
  const [checkingVerify, setCheckingVerify] = useState(false);
  const [resendingVerify, setResendingVerify] = useState(false);

  const [view, setView] = useState<'public' | 'dashboard'>('public');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [pendingBookGarageId, setPendingBookGarageId] = useState<string>('');

  const [garages, setGarages] = useState<Garage[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [settings, setSettings] = useState<PlatformSettings | null>(DEFAULT_PLATFORM_SETTINGS);

  useEffect(() => {
    const unsubGarages = onSnapshot(
      collection(db, 'garages'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as Garage), garageId: d.id }))
          .sort((a, b) => a.garageId.localeCompare(b.garageId));
        setGarages(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'garages')
    );

    const unsubCats = onSnapshot(
      collection(db, 'service_categories'),
      (snap) => setCategories(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ServiceCategory) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'service_categories')
    );

    const unsubPkgs = onSnapshot(
      collection(db, 'service_packages'),
      (snap) => setPackages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ServicePackage) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'service_packages')
    );

    const unsubReviews = onSnapshot(
      collection(db, 'reviews'),
      (snap) => setReviews(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Review) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
    );

    const unsubSettings = onSnapshot(
      doc(db, 'platform_settings', 'global'),
      (snap) => {
        if (snap.exists()) {
          setSettings(snap.data() as PlatformSettings);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'platform_settings/global')
    );

    return () => {
      unsubGarages();
      unsubCats();
      unsubPkgs();
      unsubReviews();
      unsubSettings();
    };
  }, []);

  // Automatically navigate authenticated verified user to dashboard if they triggered a booking
  useEffect(() => {
    if (firebaseUser && emailVerified && account && pendingBookGarageId) {
      setView('dashboard');
      setAuthModalOpen(false);
    }
  }, [firebaseUser, emailVerified, account, pendingBookGarageId]);

  // Prevent unauthorized access to dashboard when signed out
  useEffect(() => {
    if (!loading && !firebaseUser && view === 'dashboard') {
      setView('public');
    }
  }, [loading, firebaseUser, view]);

  const effectiveGarages = useMemo(() => {
    return garages.length > 0 ? garages : DEMO_SIX_GARAGES;
  }, [garages]);

  const handleOpenAuth = (mode: 'login' | 'register') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const handleBookAtGarage = (garageId: string) => {
    setPendingBookGarageId(garageId);
    if (!firebaseUser) {
      setAuthModalMode('register');
      setAuthModalOpen(true);
      showToast('Please sign in or register to book a service slot.', 'info');
      return;
    }
    setView('dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B132B] text-white flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="text-2xl font-extrabold tracking-tight font-display">AutoCare Garage</div>
          <p className="text-xs text-slate-300">Connecting to six-garage service platform...</p>
        </div>
      </div>
    );
  }

  // Unverified email/password sign-in gate
  if (firebaseUser && !emailVerified && view === 'dashboard') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-sm">
          <div className="w-11 h-11 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
            <MailCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-[#0B132B]">Verify Your Email to Continue</h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            AutoCare Garage enforces verified email accounts before booking slots or accessing garage dashboards. We sent a verification link to <strong>{firebaseUser.email}</strong>.
          </p>
          {authError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {authError}
            </div>
          )}
          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              disabled={checkingVerify}
              onClick={async () => {
                setCheckingVerify(true);
                try {
                  const verified = await refreshAuthUser();
                  if (verified) {
                    showToast('Email verified! Loading your dashboard...', 'success');
                  } else {
                    showToast('Email is not verified yet. Please click the link in your inbox.', 'info');
                  }
                } finally {
                  setCheckingVerify(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B132B] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60"
            >
              {checkingVerify ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>{checkingVerify ? 'Checking...' : "I've Verified — Refresh"}</span>
            </button>
            <button
              type="button"
              disabled={resendingVerify}
              onClick={async () => {
                setResendingVerify(true);
                try {
                  const ok = await resendVerification();
                  if (ok) showToast('Verification email resent. Check your inbox and spam folder.', 'success');
                } finally {
                  setResendingVerify(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resendingVerify ? 'animate-spin' : ''}`} />
              <span>{resendingVerify ? 'Sending...' : 'Resend Link'}</span>
            </button>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <button type="button" onClick={() => setView('public')} className="text-slate-600 hover:underline">
              ← Back to Public Website
            </button>
            <button type="button" onClick={logout} className="inline-flex items-center gap-1 text-red-600 font-semibold hover:underline">
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Verified user whose Firestore role/profile is still syncing or encountered an error
  if (view === 'dashboard' && firebaseUser && emailVerified && !account) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-sm text-center">
          {authError ? (
            <>
              <div className="w-11 h-11 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-[#0B132B]">Could Not Load User Role</h2>
              <p className="text-xs text-slate-600">{authError}</p>
              <div className="flex justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={retrySyncAccount}
                  className="px-4 py-2 bg-[#0B132B] text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
                >
                  Retry Loading Role
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="px-4 py-2 border border-slate-300 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-[#0B132B] mx-auto" />
              <h2 className="text-base font-bold text-[#0B132B]">Loading Your Dashboard...</h2>
              <p className="text-xs text-slate-500">Verifying your assigned role and garage access.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Role-isolated dashboard router
  if (view === 'dashboard' && firebaseUser && emailVerified && account) {
    if (!account.isActive) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white border border-red-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-700 font-bold">
              <ShieldAlert className="w-5 h-5" />
              <span>Account Suspended</span>
            </div>
            <p className="text-xs text-slate-600">
              Your account ({account.email}) is currently inactive. Contact AutoCare Garage Super Admin for assistance.
            </p>
            <button type="button" onClick={logout} className="px-4 py-2 bg-[#0B132B] text-white text-xs font-semibold rounded-lg">
              Sign Out
            </button>
          </div>
        </div>
      );
    }

    if (account.role === 'super_admin') {
      return (
        <SuperAdminDashboard
          account={account}
          garages={garages}
          packages={packages}
          settings={settings}
          onGoPublic={() => setView('public')}
        />
      );
    }

    if (account.role === 'garage_manager') {
      const myGarage = garages.find((g) => g.garageId === account.garageId);
      if (!myGarage) {
        return (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
            <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-3 text-center">
              <h2 className="text-base font-bold text-[#0B132B]">Garage Assignment Pending</h2>
              <p className="text-xs text-slate-600">
                Your Garage Manager account ({account.email}) is waiting for branch initialization ({account.garageId || 'unassigned'}).
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button type="button" onClick={() => setView('public')} className="px-4 py-2 border border-slate-300 text-xs font-semibold rounded-lg">
                  Public Website
                </button>
                <button type="button" onClick={logout} className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg">
                  Logout
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <GarageManagerDashboard
          account={account}
          garage={myGarage}
          defaultTaxRate={settings?.defaultTaxRate ?? 18}
          onGoPublic={() => setView('public')}
        />
      );
    }

    if (account.role === 'mechanic') {
      return (
        <MechanicDashboard
          account={account}
          garages={effectiveGarages}
          onGoPublic={() => setView('public')}
        />
      );
    }

    return (
      <CustomerDashboard
        account={account}
        garages={effectiveGarages}
        categories={categories}
        packages={packages}
        initialTab={pendingBookGarageId ? 'book' : 'overview'}
        preselectedGarageId={pendingBookGarageId || undefined}
        onGoPublic={() => {
          setPendingBookGarageId('');
          setView('public');
        }}
      />
    );
  }

  return (
    <>
      {!firestoreOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Offline / Firestore connectivity notice: some live updates may be delayed until connection restores.</span>
        </div>
      )}

      <PublicWebsite
        garages={garages}
        packages={packages}
        reviews={reviews}
        settings={settings}
        account={account}
        onOpenAuth={handleOpenAuth}
        onOpenDashboard={() => setView('dashboard')}
        onBookAtGarage={handleBookAtGarage}
      />

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        onClose={() => {
          setAuthModalOpen(false);
        }}
        onAuthSuccess={() => {
          setView('dashboard');
        }}
      />
    </>
  );
}

export default function App() {
  if (firebaseConfigError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-red-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5 text-red-700 font-bold text-base">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>Firebase Configuration Required</span>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">{firebaseConfigError}</p>
          <div className="bg-slate-900 text-slate-100 rounded-lg p-3 text-xs font-mono space-y-1">
            {missingFirebaseEnvVars.map((envKey) => (
              <div key={envKey}>{envKey}=...</div>
            ))}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Also ensure <code className="font-mono text-slate-700">VITE_FIREBASE_STORAGE_BUCKET</code>,{' '}
            <code className="font-mono text-slate-700">VITE_FIREBASE_MESSAGING_SENDER_ID</code>, and{' '}
            <code className="font-mono text-slate-700">VITE_FIREBASE_FIRESTORE_DATABASE_ID</code> are configured for Production/Preview in Vercel Project Settings, then trigger a fresh deployment so Vite bundles them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <AutoCareAppShell />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
