import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  User,
  Car,
  Bike,
  MapPin,
  CalendarPlus,
  ClipboardList,
  Activity,
  History,
  FileText,
  CreditCard,
  Star,
  LifeBuoy,
  Bell,
  Settings,
  LogOut,
  Plus,
  Trash2,
  Edit3,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Globe,
  Menu,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  approveCustomerRecommendedWork,
  cancelCustomerBooking,
  createSupportTicket,
  markNotificationRead,
  removeVehicle,
  replyToSupportTicket,
  respondToReschedule,
  saveCustomerProfile,
  saveVehicle,
  submitVerifiedReview,
} from '../../services/firestoreService';
import { downloadInvoicePDF, formatDateTime, formatINR, getTodayISO } from '../../utils/exportHelpers';
import { BookingWizard } from '../booking/BookingWizard';
import { ActiveStatusLabel, BookingStatusBadge, PaymentStatusBadge } from '../common/StatusBadge';
import { GarageImage } from '../common/GarageImage';
import { useToast } from '../common/ToastProvider';
import { useAuth } from '../../context/AuthContext';
import type {
  AppNotification,
  Booking,
  CustomerProfile,
  Garage,
  Inspection,
  Invoice,
  JobCard,
  Payment,
  Review,
  ServiceCategory,
  ServicePackage,
  SupportTicket,
  UserAccount,
  Vehicle,
  VehicleType,
} from '../../types/autocare';

type CustomerTab =
  | 'overview'
  | 'profile'
  | 'vehicles'
  | 'find-garage'
  | 'book'
  | 'bookings'
  | 'track'
  | 'history'
  | 'invoices'
  | 'payments'
  | 'reviews'
  | 'support'
  | 'notifications'
  | 'settings';

interface CustomerDashboardProps {
  account: UserAccount;
  garages: Garage[];
  categories: ServiceCategory[];
  packages: ServicePackage[];
  initialTab?: CustomerTab;
  preselectedGarageId?: string;
  onGoPublic: () => void;
}

export function CustomerDashboard({
  account,
  garages,
  categories,
  packages,
  initialTab = 'overview',
  preselectedGarageId,
  onGoPublic,
}: CustomerDashboardProps) {
  const { showToast } = useToast();
  const { logout, sendResetPassword } = useAuth();

  const [tab, setTab] = useState<CustomerTab>(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bookingGarageId, setBookingGarageId] = useState<string>(preselectedGarageId || '');

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [myReviews, setMyReviews] = useState<Review[]>([]);

  // Profile form state
  const [profName, setProfName] = useState(account.displayName);
  const [profPhone, setProfPhone] = useState('');
  const [profAddress, setProfAddress] = useState('');
  const [profCity, setProfCity] = useState('');
  const [profPincode, setProfPincode] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Vehicle form state
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vType, setVType] = useState<VehicleType>('Car');
  const [vReg, setVReg] = useState('');
  const [vBrand, setVBrand] = useState('');
  const [vModel, setVModel] = useState('');
  const [vVariant, setVVariant] = useState('');
  const [vFuel, setVFuel] = useState('Petrol');
  const [vYear, setVYear] = useState(2022);
  const [vOdo, setVOdo] = useState(12000);
  const [vPhoto, setVPhoto] = useState('');
  const [savingVehicle, setSavingVehicle] = useState(false);

  // Review state
  const [revBookingId, setRevBookingId] = useState('');
  const [revRating, setRevRating] = useState(5);
  const [revComment, setRevComment] = useState('');

  // Support ticket state
  const [tktGarageId, setTktGarageId] = useState(garages[0]?.garageId || 'garage-1');
  const [tktBookingId, setTktBookingId] = useState('');
  const [tktSubject, setTktSubject] = useState('');
  const [tktMessage, setTktMessage] = useState('');
  const [tktPriority, setTktPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (preselectedGarageId) {
      setBookingGarageId(preselectedGarageId);
      setTab('book');
    }
  }, [preselectedGarageId]);

  useEffect(() => {
    const uid = account.uid;

    const unsubProf = onSnapshot(
      doc(db, 'customers', uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as CustomerProfile;
          setProfile(data);
          setProfName(data.name || account.displayName);
          setProfPhone(data.phone || '');
          setProfAddress(data.address || '');
          setProfCity(data.city || '');
          setProfPincode(data.pincode || '');
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `customers/${uid}`)
    );

    const unsubVeh = onSnapshot(
      query(collection(db, 'vehicles'), where('customerId', '==', uid)),
      (snap) => setVehicles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Vehicle) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'vehicles')
    );

    const unsubBk = onSnapshot(
      query(collection(db, 'bookings'), where('customerId', '==', uid)),
      (snap) => setBookings(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Booking) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'bookings')
    );

    const unsubJc = onSnapshot(
      query(collection(db, 'job_cards'), where('customerId', '==', uid)),
      (snap) => setJobCards(snap.docs.map((d) => ({ id: d.id, ...(d.data() as JobCard) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'job_cards')
    );

    const unsubIns = onSnapshot(
      query(collection(db, 'inspections'), where('customerId', '==', uid)),
      (snap) => setInspections(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Inspection) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'inspections')
    );

    const unsubInv = onSnapshot(
      query(collection(db, 'invoices'), where('customerId', '==', uid)),
      (snap) => setInvoices(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Invoice) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'invoices')
    );

    const unsubPay = onSnapshot(
      query(collection(db, 'payments'), where('customerId', '==', uid)),
      (snap) => setPayments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Payment) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );

    const unsubTkt = onSnapshot(
      query(collection(db, 'support_tickets'), where('customerId', '==', uid)),
      (snap) => setTickets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as SupportTicket) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'support_tickets')
    );

    const unsubNotif = onSnapshot(
      query(collection(db, 'notifications'), where('recipientId', '==', uid)),
      (snap) => setNotifications(snap.docs.map((d) => ({ id: d.id, ...(d.data() as AppNotification) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    const unsubRev = onSnapshot(
      collection(db, 'reviews'),
      (snap) => {
        const mine = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Review) }))
          .filter((r) => r.customerId === uid);
        setMyReviews(mine);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
    );

    return () => {
      unsubProf();
      unsubVeh();
      unsubBk();
      unsubJc();
      unsubIns();
      unsubInv();
      unsubPay();
      unsubTkt();
      unsubNotif();
      unsubRev();
    };
  }, [account.uid, account.displayName]);

  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => (b.appointmentDate || '').localeCompare(a.appointmentDate || ''));
  }, [bookings]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  const kpis = useMemo(() => {
    const today = getTodayISO();
    const pendingPaymentsTotal = invoices.reduce((sum, inv) => sum + Math.max(0, inv.finalTotal - inv.paidAmount), 0);
    return {
      totalBookings: bookings.length,
      pendingBookings: bookings.filter((b) => b.status === 'Pending').length,
      acceptedBookings: bookings.filter((b) => !['Pending', 'Rejected', 'Cancelled'].includes(b.status)).length,
      upcomingAppointments: bookings.filter((b) => b.appointmentDate >= today && !['Completed', 'Rejected', 'Cancelled'].includes(b.status)).length,
      vehiclesCount: vehicles.length,
      completedServices: bookings.filter((b) => b.status === 'Completed').length,
      pendingPaymentsTotal,
    };
  }, [bookings, vehicles, invoices]);

  const completedUnreviewedBookings = useMemo(() => {
    const reviewedIds = new Set(myReviews.map((r) => r.bookingId));
    return bookings.filter((b) => b.status === 'Completed' && b.id && !reviewedIds.has(b.id));
  }, [bookings, myReviews]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await saveCustomerProfile(account.uid, {
        name: profName,
        email: account.email,
        phone: profPhone,
        address: profAddress,
        city: profCity,
        pincode: profPincode,
      });
      showToast('Profile saved.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingVehicle(true);
    try {
      await saveVehicle({
        id: editingVehicleId || undefined,
        customerId: account.uid,
        vehicleType: vType,
        registrationNumber: vReg,
        brand: vBrand,
        model: vModel,
        variant: vVariant,
        fuelType: vFuel,
        year: vYear,
        odometer: vOdo,
        photoUrl: vPhoto,
      });
      showToast(editingVehicleId ? 'Vehicle updated.' : 'Vehicle added.', 'success');
      setEditingVehicleId(null);
      setVReg('');
      setVBrand('');
      setVModel('');
      setVVariant('');
      setVPhoto('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save vehicle.', 'error');
    } finally {
      setSavingVehicle(false);
    }
  };

  const navItems: Array<{ id: CustomerTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'vehicles', label: 'My Vehicles', icon: Car },
    { id: 'find-garage', label: 'Find a Garage', icon: MapPin },
    { id: 'book', label: 'Book a Service', icon: CalendarPlus },
    { id: 'bookings', label: 'My Bookings', icon: ClipboardList },
    { id: 'track', label: 'Track My Service', icon: Activity },
    { id: 'history', label: 'Service History', icon: History },
    { id: 'invoices', label: 'My Invoices', icon: FileText },
    { id: 'payments', label: 'Payment History', icon: CreditCard },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'support', label: 'Support', icon: LifeBuoy },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0B132B] text-white flex flex-col transition-transform lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-base font-extrabold tracking-tight font-display">AutoCare Garage</div>
            <div className="text-[11px] text-slate-400">Customer Portal</div>
          </div>
          <button type="button" onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  active ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="font-mono text-[11px] bg-white/20 px-1.5 py-0.5 rounded tabular-nums">{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-1">
          <button
            type="button"
            onClick={onGoPublic}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/10"
          >
            <Globe className="w-4 h-4" />
            <span>Public Website</span>
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-red-300 hover:bg-red-500/20"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-semibold text-slate-900 capitalize">
              Customer / {navItems.find((n) => n.id === tab)?.label}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTab('book')}
              className="px-3.5 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 whitespace-nowrap"
            >
              + Book Service
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6 max-w-6xl w-full mx-auto space-y-6">
          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#0B132B]">Welcome back, {profile?.name || account.displayName}</h1>
                <p className="text-xs text-slate-500 mt-1">Manage your vehicles, track live garage services, and view invoices across all 6 garages.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  ['Total Bookings', kpis.totalBookings],
                  ['Pending', kpis.pendingBookings],
                  ['Accepted / Active', kpis.acceptedBookings],
                  ['Upcoming', kpis.upcomingAppointments],
                  ['Vehicles', kpis.vehiclesCount],
                  ['Completed', kpis.completedServices],
                  ['Pending Due', formatINR(kpis.pendingPaymentsTotal)],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[11px] text-slate-500">{label}</div>
                    <div className="text-xl font-bold text-[#0B132B] tabular-nums mt-1">{val}</div>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">Recent Bookings</h2>
                  <button type="button" onClick={() => setTab('bookings')} className="text-xs font-semibold text-red-600 hover:underline">
                    View All Bookings
                  </button>
                </div>
                {sortedBookings.length === 0 ? (
                  <div className="p-6 border border-dashed border-slate-300 rounded-lg text-center text-xs text-slate-500 space-y-3">
                    <p>You have no service bookings yet.</p>
                    <button
                      type="button"
                      onClick={() => setTab('book')}
                      className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg"
                    >
                      Book Your First Service
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {sortedBookings.slice(0, 5).map((b) => (
                      <div key={b.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-[#0B132B]">{b.bookingCode}</span>
                            <span className="text-slate-400">·</span>
                            <span className="font-medium text-slate-800">{b.garageName}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {b.vehicleBrand} {b.vehicleModel} ({b.registrationNumber}) · {b.packageName} · {b.appointmentDate} {b.appointmentTime}
                          </div>
                        </div>
                        <BookingStatusBadge status={b.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PROFILE */}
          {tab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">My Customer Profile</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                  <input required value={profName} onChange={(e) => setProfName(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email (Account)</label>
                  <input disabled value={account.email} className="w-full px-3 py-2 text-sm border border-slate-200 bg-slate-50 rounded-lg text-slate-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
                  <input value={profPhone} onChange={(e) => setProfPhone(e.target.value)} placeholder="+91 98765 43210" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
                  <input value={profCity} onChange={(e) => setProfCity(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Saved Address</label>
                  <input value={profAddress} onChange={(e) => setProfAddress(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Pincode</label>
                  <input value={profPincode} onChange={(e) => setProfPincode(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
              </div>
              <button type="submit" disabled={savingProfile} className="px-5 py-2.5 bg-[#0B132B] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50">
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          )}

          {/* VEHICLES */}
          {tab === 'vehicles' && (
            <div className="space-y-6">
              <form onSubmit={handleSaveVehicle} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="text-base font-bold text-[#0B132B]">
                  {editingVehicleId ? 'Edit Vehicle' : 'Register a Car or Bike'}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Vehicle Type</label>
                    <select value={vType} onChange={(e) => setVType(e.target.value as VehicleType)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                      <option value="Car">Car</option>
                      <option value="Bike">Bike</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Registration Number</label>
                    <input required value={vReg} onChange={(e) => setVReg(e.target.value)} placeholder="MH12XY9988" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg uppercase" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Brand</label>
                    <input required value={vBrand} onChange={(e) => setVBrand(e.target.value)} placeholder="Maruti / Honda" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Model</label>
                    <input required value={vModel} onChange={(e) => setVModel(e.target.value)} placeholder="Baleno / Shine" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Variant</label>
                    <input value={vVariant} onChange={(e) => setVVariant(e.target.value)} placeholder="ZXI / Disc" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Fuel Type</label>
                    <select value={vFuel} onChange={(e) => setVFuel(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                      <option value="Petrol">Petrol</option>
                      <option value="Diesel">Diesel</option>
                      <option value="CNG">CNG</option>
                      <option value="Electric">Electric</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Manufacturing Year</label>
                    <input type="number" min={1980} max={2030} value={vYear} onChange={(e) => setVYear(Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Odometer (km)</label>
                    <input type="number" min={0} value={vOdo} onChange={(e) => setVOdo(Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Optional Photo URL</label>
                    <input value={vPhoto} onChange={(e) => setVPhoto(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={savingVehicle} className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700">
                    <Plus className="w-3.5 h-3.5" />
                    <span>{editingVehicleId ? 'Update Vehicle' : 'Add Vehicle'}</span>
                  </button>
                  {editingVehicleId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingVehicleId(null);
                        setVReg('');
                        setVBrand('');
                        setVModel('');
                      }}
                      className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vehicles.map((v) => (
                  <div key={v.id} className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-lg bg-slate-100 text-[#0B132B]">
                        {v.vehicleType === 'Car' ? <Car className="w-5 h-5" /> : <Bike className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-red-600">{v.registrationNumber}</div>
                        <h3 className="text-sm font-bold text-slate-900">{v.brand} {v.model} {v.variant}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {v.vehicleType} · {v.fuelType} · {v.year} · {v.odometer.toLocaleString('en-IN')} km
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingVehicleId(v.id || null);
                          setVType(v.vehicleType);
                          setVReg(v.registrationNumber);
                          setVBrand(v.brand);
                          setVModel(v.model);
                          setVVariant(v.variant || '');
                          setVFuel(v.fuelType);
                          setVYear(v.year);
                          setVOdo(v.odometer);
                          setVPhoto(v.photoUrl || '');
                        }}
                        className="p-1.5 text-slate-500 hover:text-[#0B132B]"
                        aria-label="Edit vehicle"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => v.id && removeVehicle(v.id)}
                        className="p-1.5 text-slate-500 hover:text-red-600"
                        aria-label="Remove vehicle"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FIND A GARAGE */}
          {tab === 'find-garage' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {garages.map((g) => (
                <div key={g.garageId} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="h-36 bg-slate-100 overflow-hidden">
                      <GarageImage
                        garageId={g.garageId}
                        photoUrl={g.photoUrl}
                        alt={g.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-[#0B132B]">{g.code}</span>
                        <ActiveStatusLabel isActive={g.isActive} />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{g.name}</h3>
                      <p className="text-xs text-slate-500">{g.address}</p>
                      <p className="text-xs text-slate-500">{g.operatingHours}</p>
                    </div>
                  </div>
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
                    <button
                      type="button"
                      disabled={!g.isActive}
                      onClick={() => {
                        setBookingGarageId(g.garageId);
                        setTab('book');
                      }}
                      className="w-full py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40"
                    >
                      {g.isActive ? `Book at ${g.code}` : 'Inactive'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* BOOK A SERVICE */}
          {tab === 'book' && (
            <BookingWizard
              account={account}
              customerProfile={profile}
              garages={garages}
              vehicles={vehicles}
              categories={categories}
              packages={packages}
              initialGarageId={bookingGarageId}
              onBookingCreated={() => {
                // Keep confirmation visible; user can switch to My Bookings
              }}
            />
          )}

          {/* MY BOOKINGS */}
          {tab === 'bookings' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">My Bookings &amp; Status</h2>
              {sortedBookings.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
                  No bookings found. Use Book a Service to schedule your first appointment.
                </div>
              ) : (
                sortedBookings.map((b) => (
                  <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-bold text-[#0B132B]">{b.bookingCode}</span>
                          <span>·</span>
                          <span className="font-semibold text-slate-800">{b.garageName}</span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 mt-1">
                          {b.packageName} ({b.vehicleBrand} {b.vehicleModel} · {b.registrationNumber})
                        </h3>
                        <div className="text-xs text-slate-600 mt-1">
                          Scheduled: <span className="font-semibold tabular-nums">{b.appointmentDate} · {b.appointmentTime}</span> · Estimate: <span className="font-semibold tabular-nums">{formatINR(b.estimatedPrice)}</span>
                        </div>
                      </div>
                      <BookingStatusBadge status={b.status} />
                    </div>

                    <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg">
                      <strong className="text-slate-800">Complaint:</strong> {b.problemDescription}
                    </p>

                    {b.assignedMechanicName && (
                      <div className="text-xs text-slate-700">
                        Assigned Mechanic: <span className="font-semibold">{b.assignedMechanicName}</span>
                      </div>
                    )}

                    {b.status === 'Rejected' && b.rejectionReason && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <span><strong>Rejection Reason:</strong> {b.rejectionReason}</span>
                      </div>
                    )}

                    {b.status === 'Reschedule Requested' && b.rescheduleSuggestedDate && (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                        <div className="text-xs text-amber-900">
                          <strong>Garage Suggested Reschedule:</strong> {b.rescheduleSuggestedDate} at {b.rescheduleSuggestedTime}
                          {b.rescheduleNote && <div className="mt-1">Note: {b.rescheduleNote}</div>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await respondToReschedule(b.id!, true, account.uid);
                                showToast('Rescheduled appointment confirmed.', 'success');
                              } catch (err) {
                                showToast(err instanceof Error ? err.message : 'Failed to accept reschedule.', 'error');
                              }
                            }}
                            className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700"
                          >
                            Accept New Slot
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await respondToReschedule(b.id!, false, account.uid);
                                showToast('Reschedule declined and booking cancelled.', 'info');
                              } catch (err) {
                                showToast(err instanceof Error ? err.message : 'Failed to decline reschedule.', 'error');
                              }
                            }}
                            className="px-3.5 py-1.5 bg-white border border-red-300 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-50"
                          >
                            Decline &amp; Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setTab('track')}
                        className="text-xs font-semibold text-[#0B132B] hover:underline"
                      >
                        Track Workshop Timeline →
                      </button>
                      {!['Completed', 'Rejected', 'Cancelled', 'Cancellation Requested'].includes(b.status) && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await cancelCustomerBooking(b.id!, account.uid);
                              showToast('Booking cancellation updated.', 'info');
                            } catch (err) {
                              showToast(err instanceof Error ? err.message : 'Unable to cancel.', 'error');
                            }
                          }}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          {['Pending', 'Accepted', 'Confirmed'].includes(b.status) ? 'Cancel Booking' : 'Request Cancellation'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TRACK MY SERVICE */}
          {tab === 'track' && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-[#0B132B]">Track My Service Live</h2>
              {sortedBookings.map((b) => {
                const jc = jobCards.find((j) => j.bookingId === b.id);
                const ins = inspections.find((i) => i.bookingId === b.id);
                return (
                  <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-mono text-xs font-bold text-[#0B132B]">{b.bookingCode} · {b.garageName}</div>
                        <div className="text-sm font-bold text-slate-900">{b.vehicleBrand} {b.vehicleModel} ({b.registrationNumber})</div>
                      </div>
                      <BookingStatusBadge status={b.status} />
                    </div>

                    {jc && (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span><strong>Job Card:</strong> <span className="font-mono">{jc.jobCardCode}</span></span>
                          <span><strong>Mechanic:</strong> {jc.assignedMechanicName}</span>
                        </div>
                        {jc.inspectionResults && (
                          <p><strong>Inspection Results:</strong> {jc.inspectionResults}</p>
                        )}
                        {jc.recommendedWork && (
                          <p><strong>Recommended Work:</strong> {jc.recommendedWork}</p>
                        )}
                        <div className="flex flex-wrap gap-4 pt-1 tabular-nums">
                          <span>Labour: <strong>{formatINR(jc.labourCharges)}</strong></span>
                          <span>Parts: <strong>{formatINR(jc.partsCharges)}</strong></span>
                        </div>
                        {(b.status === 'Estimate Prepared' || b.status === 'Awaiting Customer Approval') && !jc.customerApprovedExtraWork && (
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await approveCustomerRecommendedWork(b.id!, jc.id!, account.uid);
                                  showToast('Additional work approved. Mechanic can now proceed.', 'success');
                                } catch (err) {
                                  showToast(err instanceof Error ? err.message : 'Approval failed.', 'error');
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Approve Recommended Work &amp; Estimate
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {ins && ins.checklist.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-xs font-semibold text-slate-700">Inspection Checklist</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {ins.checklist.map((c, idx) => (
                            <div key={idx} className="text-xs p-2.5 border border-slate-200 rounded-lg flex items-center justify-between">
                              <span>{c.item}</span>
                              <span className={`font-semibold ${c.condition === 'OK' ? 'text-emerald-700' : c.condition === 'Critical' ? 'text-red-700' : 'text-amber-700'}`}>
                                {c.condition}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-700">Status History</div>
                      <div className="space-y-2">
                        {(b.statusHistory || []).map((h, i) => (
                          <div key={i} className="text-xs flex items-start justify-between gap-4 border-b border-slate-100 pb-2">
                            <div>
                              <span className="font-semibold text-slate-900">{h.status}</span>
                              <span className="text-slate-500"> — {h.note}</span>
                            </div>
                            <span className="text-slate-400 font-mono shrink-0 tabular-nums">{formatDateTime(h.timestamp)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SERVICE HISTORY */}
          {tab === 'history' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">Completed Service History</h2>
              {sortedBookings.filter((b) => b.status === 'Completed').length === 0 ? (
                <p className="text-xs text-slate-500">No completed services yet.</p>
              ) : (
                <div className="divide-y divide-slate-200">
                  {sortedBookings
                    .filter((b) => b.status === 'Completed')
                    .map((b) => (
                      <div key={b.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                        <div>
                          <div className="font-bold text-slate-900">{b.packageName} · {b.vehicleBrand} {b.vehicleModel}</div>
                          <div className="text-slate-500">{b.garageName} · {b.appointmentDate} · Mechanic: {b.assignedMechanicName || '—'}</div>
                        </div>
                        <span className="font-mono font-bold text-emerald-700">Completed</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* MY INVOICES */}
          {tab === 'invoices' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">My Invoices</h2>
              {invoices.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                  Invoices generated by your garage manager will appear here with PDF download.
                </div>
              ) : (
                invoices.map((inv) => (
                  <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-[#0B132B]">{inv.invoiceNumber}</span>
                        <span>·</span>
                        <span className="text-slate-600">{inv.garageName}</span>
                      </div>
                      <div className="text-sm font-bold text-slate-900">{inv.serviceDescription}</div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        Total: <strong>{formatINR(inv.finalTotal)}</strong> · Paid: <strong>{formatINR(inv.paidAmount)}</strong> · Balance: <strong>{formatINR(Math.max(0, inv.finalTotal - inv.paidAmount))}</strong>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <PaymentStatusBadge status={inv.paymentStatus} />
                      <button
                        type="button"
                        onClick={() => downloadInvoicePDF(inv)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0B132B] text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download PDF</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* PAYMENT HISTORY */}
          {tab === 'payments' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">Payment History</h2>
              {payments.length === 0 ? (
                <p className="text-xs text-slate-500">No verified payments recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">Invoice</th>
                        <th className="py-2 pr-4">Method</th>
                        <th className="py-2 pr-4">Reference</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2.5 pr-4 font-mono font-semibold">{p.invoiceNumber}</td>
                          <td className="py-2.5 pr-4">{p.method}</td>
                          <td className="py-2.5 pr-4 text-slate-500">{p.referenceNote || '—'}</td>
                          <td className="py-2.5 pr-4"><PaymentStatusBadge status={p.status} /></td>
                          <td className="py-2.5 text-right font-bold tabular-nums">{formatINR(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* REVIEWS */}
          {tab === 'reviews' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-bold text-[#0B132B]">Submit Verified Service Review</h2>
                {completedUnreviewedBookings.length === 0 ? (
                  <p className="text-xs text-slate-500">Only completed services not yet reviewed are eligible for verified reviews.</p>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const bk = bookings.find((b) => b.id === revBookingId) || completedUnreviewedBookings[0];
                      if (!bk || !bk.id) return;
                      try {
                        await submitVerifiedReview({
                          garageId: bk.garageId,
                          garageManagerId: bk.garageManagerId,
                          bookingId: bk.id,
                          customerId: account.uid,
                          customerName: profile?.name || account.displayName,
                          rating: revRating,
                          comment: revComment,
                        });
                        setRevComment('');
                        showToast('Verified review published.', 'success');
                      } catch (err) {
                        showToast(err instanceof Error ? err.message : 'Failed to submit review.', 'error');
                      }
                    }}
                    className="space-y-3 max-w-xl"
                  >
                    <select
                      value={revBookingId || completedUnreviewedBookings[0]?.id || ''}
                      onChange={(e) => setRevBookingId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    >
                      {completedUnreviewedBookings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bookingCode} · {b.garageName} · {b.packageName}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-700">Rating:</span>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRevRating(n)}
                          className={`px-2.5 py-1 text-xs rounded border ${revRating === n ? 'bg-amber-500 text-white border-amber-500' : 'border-slate-300 text-slate-600'}`}
                        >
                          {n} ★
                        </button>
                      ))}
                    </div>
                    <textarea
                      required
                      rows={3}
                      value={revComment}
                      onChange={(e) => setRevComment(e.target.value)}
                      placeholder="Share your service experience..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <button type="submit" className="px-4 py-2 bg-[#0B132B] text-white text-xs font-semibold rounded-lg">
                      Publish Verified Review
                    </button>
                  </form>
                )}
              </div>

              {myReviews.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">Your Submitted Reviews</h3>
                  {myReviews.map((r) => (
                    <div key={r.id} className="p-3 bg-slate-50 rounded-lg text-xs">
                      <div className="font-bold text-amber-600">{r.rating} / 5 ★</div>
                      <p className="text-slate-700 mt-1">{r.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUPPORT */}
          {tab === 'support' && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const g = garages.find((x) => x.garageId === tktGarageId);
                  try {
                    await createSupportTicket({
                      customerId: account.uid,
                      customerName: profile?.name || account.displayName,
                      garageId: tktGarageId,
                      garageManagerId: g?.managerUid,
                      bookingId: tktBookingId,
                      subject: tktSubject,
                      message: tktMessage,
                      priority: tktPriority,
                    });
                    setTktSubject('');
                    setTktMessage('');
                    showToast('Support ticket sent to garage manager.', 'success');
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : 'Failed to create ticket.', 'error');
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-3 max-w-2xl"
              >
                <h2 className="text-lg font-bold text-[#0B132B]">Open Support Ticket</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select value={tktGarageId} onChange={(e) => setTktGarageId(e.target.value)} className="px-3 py-2 text-sm border border-slate-300 rounded-lg">
                    {garages.map((g) => (
                      <option key={g.garageId} value={g.garageId}>{g.code} · {g.name}</option>
                    ))}
                  </select>
                  <select value={tktPriority} onChange={(e) => setTktPriority(e.target.value as 'Low' | 'Medium' | 'High')} className="px-3 py-2 text-sm border border-slate-300 rounded-lg">
                    <option value="Low">Low Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="High">High Priority</option>
                  </select>
                </div>
                <select value={tktBookingId} onChange={(e) => setTktBookingId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  <option value="">General Inquiry (No specific booking)</option>
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>{b.bookingCode} · {b.garageName}</option>
                  ))}
                </select>
                <input required value={tktSubject} onChange={(e) => setTktSubject(e.target.value)} placeholder="Subject" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                <textarea required rows={3} value={tktMessage} onChange={(e) => setTktMessage(e.target.value)} placeholder="Describe your question or issue..." className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                <button type="submit" className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg">
                  Submit Ticket
                </button>
              </form>

              <div className="space-y-3">
                {tickets.map((t) => (
                  <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-[#0B132B]">{t.ticketCode} · {t.priority}</span>
                      <span className="font-semibold text-slate-700">{t.status}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{t.subject}</h3>
                    <p className="text-xs text-slate-600">{t.message}</p>
                    {t.replies.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        {t.replies.map((r, i) => (
                          <div key={i} className="text-xs bg-slate-50 p-2.5 rounded-lg">
                            <strong>{r.authorName} ({r.authorRole}):</strong> {r.message}
                          </div>
                        ))}
                      </div>
                    )}
                    {t.status !== 'Closed' && (
                      <div className="flex gap-2">
                        <input
                          value={replyTexts[t.id!] || ''}
                          onChange={(e) => setReplyTexts((prev) => ({ ...prev, [t.id!]: e.target.value }))}
                          placeholder="Write a reply..."
                          className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const msg = (replyTexts[t.id!] || '').trim();
                            if (!msg) return;
                            await replyToSupportTicket(t.id!, t, {
                              authorId: account.uid,
                              authorName: profile?.name || account.displayName,
                              authorRole: 'customer',
                              message: msg,
                              timestamp: new Date().toISOString(),
                            });
                            setReplyTexts((prev) => ({ ...prev, [t.id!]: '' }));
                          }}
                          className="px-3 py-1.5 bg-[#0B132B] text-white text-xs font-semibold rounded-lg"
                        >
                          Reply
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NOTIFICATIONS */}
          {tab === 'notifications' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="text-lg font-bold text-[#0B132B]">Notifications</h2>
              {notifications.length === 0 ? (
                <p className="text-xs text-slate-500">No notifications yet.</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3.5 rounded-lg border flex items-start justify-between gap-3 ${
                      n.isRead ? 'border-slate-200 bg-white' : 'border-red-200 bg-red-50/40'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900">{n.title}</div>
                      <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                    </div>
                    {!n.isRead && n.id && (
                      <button
                        type="button"
                        onClick={() => markNotificationRead(n.id!)}
                        className="text-xs font-semibold text-[#0B132B] hover:underline shrink-0"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* SETTINGS */}
          {tab === 'settings' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-xl space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">Account Settings</h2>
              <div className="text-xs text-slate-600 space-y-1">
                <p><strong>Signed in Email:</strong> {account.email}</p>
                <p><strong>Account Role:</strong> {account.role}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const ok = await sendResetPassword(account.email);
                  if (ok) showToast('Password reset email dispatched.', 'success');
                }}
                className="px-4 py-2 border border-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-50"
              >
                Send Password Reset Email
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
