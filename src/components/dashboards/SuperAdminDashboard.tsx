import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Building2,
  ClipboardList,
  Users,
  UserCog,
  Wrench,
  Car,
  Package,
  FileText,
  CreditCard,
  TrendingUp,
  Star,
  LifeBuoy,
  Bell,
  Download,
  Settings,
  ShieldAlert,
  LogOut,
  Globe,
  Menu,
  X,
  Search,
  Edit3,
  Power,
  Eye,
  Plus,
  CheckCircle2,
  XCircle,
  Upload,
  RotateCcw,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile, signOut } from 'firebase/auth';
import { db, getSecondaryAuth, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  acceptGarageBooking,
  assignExistingStaffDirectly,
  assignMechanicAndCreateJobCard,
  createStaffInvite,
  markNotificationRead,
  rejectGarageBooking,
  revokeStaffInvite,
  seedInitialPlatformData,
  updateGarage,
  updatePlatformSettings,
} from '../../services/firestoreService';
import {
  downloadCSV,
  downloadInvoicePDF,
  formatDateTime,
  formatINR,
  getMonthPrefix,
  getTodayISO,
  toISOStringSafe,
} from '../../utils/exportHelpers';
import { getFallbackGarageImage, uploadGaragePhotoToStorage } from '../../utils/imageHelpers';
import { ActiveStatusLabel, BookingStatusBadge, PaymentStatusBadge } from '../common/StatusBadge';
import { GarageImage } from '../common/GarageImage';
import { GarageManagerDashboard } from './GarageManagerDashboard';
import { useToast } from '../common/ToastProvider';
import { useAuth } from '../../context/AuthContext';
import type {
  AppNotification,
  AuditLog,
  Booking,
  CustomerProfile,
  Expense,
  Garage,
  GarageManager,
  GarageMechanic,
  Inspection,
  Invoice,
  JobCard,
  Payment,
  PlatformSettings,
  Review,
  ServicePackage,
  SparePart,
  StaffInvite,
  SupportTicket,
  UserAccount,
  Vehicle,
} from '../../types/autocare';

type SuperTab =
  | 'overview'
  | 'garages'
  | 'bookings'
  | 'customers'
  | 'managers'
  | 'mechanics'
  | 'vehicles'
  | 'services'
  | 'job-cards'
  | 'inventory'
  | 'invoices'
  | 'payments'
  | 'analytics'
  | 'reviews'
  | 'tickets'
  | 'notifications'
  | 'reports'
  | 'settings'
  | 'audit';

interface SuperAdminDashboardProps {
  account: UserAccount;
  garages: Garage[];
  packages: ServicePackage[];
  settings: PlatformSettings | null;
  onGoPublic: () => void;
}

export function SuperAdminDashboard({
  account,
  garages,
  packages,
  settings,
  onGoPublic,
}: SuperAdminDashboardProps) {
  const { showToast } = useToast();
  const { logout } = useAuth();

  const [tab, setTab] = useState<SuperTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Drill-down into a specific Garage Dashboard (1..6)
  const [activeGarageView, setActiveGarageView] = useState<{
    garageId: string;
    initialTab: 'overview' | 'requests' | 'accepted' | 'rejected' | 'settings';
  } | null>(null);

  // Live collections
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [usersList, setUsersList] = useState<UserAccount[]>([]);
  const [managers, setManagers] = useState<GarageManager[]>([]);
  const [mechanics, setMechanics] = useState<GarageMechanic[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Filters
  const [garageSearch, setGarageSearch] = useState('');
  const [garageStatusFilter, setGarageStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [bookingGarageFilter, setBookingGarageFilter] = useState('all');
  const [bookingStatusFilter, setBookingStatusFilter] = useState('all');

  // Edit Garage modal
  const [editGarage, setEditGarage] = useState<Garage | null>(null);
  const [uploadingGaragePhoto, setUploadingGaragePhoto] = useState(false);

  // Super Admin booking controls
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [rejectModalBooking, setRejectModalBooking] = useState<Booking | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedMechByBooking, setSelectedMechByBooking] = useState<Record<string, string>>({});

  // Staff Invite / Provisioning form
  const [staffRole, setStaffRole] = useState<'garage_manager' | 'mechanic'>('garage_manager');
  const [staffGarageId, setStaffGarageId] = useState('garage-1');
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffSpec, setStaffSpec] = useState('Car & Bike Service');
  const [staffPassword, setStaffPassword] = useState('');
  const [createLoginNow, setCreateLoginNow] = useState(false);

  // Platform settings form
  const [platName, setPlatName] = useState(settings?.businessName || 'AutoCare Garage');
  const [platTagline, setPlatTagline] = useState(settings?.tagline || 'Your Vehicle, Our Responsibility.');
  const [platTax, setPlatTax] = useState(settings?.defaultTaxRate ?? 18);
  const [platEmail, setPlatEmail] = useState(settings?.supportEmail || '');
  const [platPhone, setPlatPhone] = useState(settings?.supportPhone || '');

  useEffect(() => {
    if (settings) {
      setPlatName(settings.businessName || 'AutoCare Garage');
      setPlatTagline(settings.tagline || 'Your Vehicle, Our Responsibility.');
      setPlatTax(settings.defaultTaxRate ?? 18);
      setPlatEmail(settings.supportEmail || '');
      setPlatPhone(settings.supportPhone || '');
    }
  }, [settings]);

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, 'bookings'), (s) => setBookings(s.docs.map((d) => ({ id: d.id, ...(d.data() as Booking) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'bookings')),
      onSnapshot(collection(db, 'customers'), (s) => setCustomers(s.docs.map((d) => d.data() as CustomerProfile)), (e) => handleFirestoreError(e, OperationType.LIST, 'customers')),
      onSnapshot(collection(db, 'users'), (s) => setUsersList(s.docs.map((d) => d.data() as UserAccount)), (e) => handleFirestoreError(e, OperationType.LIST, 'users')),
      onSnapshot(collection(db, 'garage_managers'), (s) => setManagers(s.docs.map((d) => d.data() as GarageManager)), (e) => handleFirestoreError(e, OperationType.LIST, 'garage_managers')),
      onSnapshot(collection(db, 'garage_mechanics'), (s) => setMechanics(s.docs.map((d) => d.data() as GarageMechanic)), (e) => handleFirestoreError(e, OperationType.LIST, 'garage_mechanics')),
      onSnapshot(collection(db, 'staff_invites'), (s) => setInvites(s.docs.map((d) => ({ id: d.id, ...(d.data() as StaffInvite) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'staff_invites')),
      onSnapshot(collection(db, 'vehicles'), (s) => setVehicles(s.docs.map((d) => ({ id: d.id, ...(d.data() as Vehicle) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'vehicles')),
      onSnapshot(collection(db, 'job_cards'), (s) => setJobCards(s.docs.map((d) => ({ id: d.id, ...(d.data() as JobCard) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'job_cards')),
      onSnapshot(collection(db, 'inspections'), (s) => setInspections(s.docs.map((d) => ({ id: d.id, ...(d.data() as Inspection) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'inspections')),
      onSnapshot(collection(db, 'spare_parts'), (s) => setSpareParts(s.docs.map((d) => ({ id: d.id, ...(d.data() as SparePart) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'spare_parts')),
      onSnapshot(collection(db, 'invoices'), (s) => setInvoices(s.docs.map((d) => ({ id: d.id, ...(d.data() as Invoice) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'invoices')),
      onSnapshot(collection(db, 'payments'), (s) => setPayments(s.docs.map((d) => ({ id: d.id, ...(d.data() as Payment) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'payments')),
      onSnapshot(collection(db, 'expenses'), (s) => setExpenses(s.docs.map((d) => ({ id: d.id, ...(d.data() as Expense) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'expenses')),
      onSnapshot(collection(db, 'reviews'), (s) => setReviews(s.docs.map((d) => ({ id: d.id, ...(d.data() as Review) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'reviews')),
      onSnapshot(collection(db, 'support_tickets'), (s) => setTickets(s.docs.map((d) => ({ id: d.id, ...(d.data() as SupportTicket) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'support_tickets')),
      onSnapshot(collection(db, 'notifications'), (s) => setNotifications(s.docs.map((d) => ({ id: d.id, ...(d.data() as AppNotification) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'notifications')),
      onSnapshot(collection(db, 'audit_logs'), (s) => setAuditLogs(s.docs.map((d) => ({ id: d.id, ...(d.data() as AuditLog) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'audit_logs')),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const todayISO = getTodayISO();
  const monthPrefix = getMonthPrefix();

  const platformKpis = useMemo(() => {
    const verifiedPay = payments.filter((p) => p.status === 'Paid' || p.status === 'Partially Paid');
    const totalRevenue = verifiedPay.reduce((s, p) => s + Number(p.amount || 0), 0);
    const todayRevenue = verifiedPay
      .filter((p) => toISOStringSafe(p.createdAt).startsWith(todayISO))
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const monthlyRevenue = verifiedPay
      .filter((p) => toISOStringSafe(p.createdAt).startsWith(monthPrefix))
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const pendingPayments = invoices.reduce((s, inv) => s + Math.max(0, inv.finalTotal - inv.paidAmount), 0);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const lowStockAlerts = spareParts.filter((p) => p.isActive && p.quantity <= p.minStockLevel).length;

    return {
      totalRevenue,
      todayRevenue,
      monthlyRevenue,
      totalCustomers: customers.length,
      totalVehicles: vehicles.length,
      totalGarages: garages.length,
      totalBookings: bookings.length,
      pendingBookings: bookings.filter((b) => b.status === 'Pending').length,
      acceptedBookings: bookings.filter((b) => !['Pending', 'Rejected', 'Cancelled'].includes(b.status)).length,
      rejectedBookings: bookings.filter((b) => b.status === 'Rejected').length,
      activeJobs: bookings.filter((b) => ['Mechanic Assigned', 'Vehicle Received', 'Inspection', 'Estimate Prepared', 'Awaiting Customer Approval', 'Work In Progress', 'Waiting for Parts', 'Quality Check', 'Ready for Pickup'].includes(b.status)).length,
      completedServices: bookings.filter((b) => b.status === 'Completed').length,
      totalMechanics: mechanics.length,
      pendingPayments,
      totalExpenses,
      lowStockAlerts,
    };
  }, [payments, invoices, expenses, spareParts, customers, vehicles, garages, bookings, mechanics, todayISO, monthPrefix]);

  const garageStatsMap = useMemo(() => {
    const map: Record<
      string,
      {
        totalBookings: number;
        pending: number;
        accepted: number;
        rejected: number;
        todayAppts: number;
        completed: number;
        mechanicsCount: number;
        monthlyRevenue: number;
        totalRevenue: number;
        totalExpenses: number;
      }
    > = {};

    for (const g of garages) {
      const gBookings = bookings.filter((b) => b.garageId === g.garageId);
      const gMechs = mechanics.filter((m) => m.garageId === g.garageId);
      const gPay = payments.filter((p) => p.garageId === g.garageId && (p.status === 'Paid' || p.status === 'Partially Paid'));
      const gExp = expenses.filter((e) => e.garageId === g.garageId);

      map[g.garageId] = {
        totalBookings: gBookings.length,
        pending: gBookings.filter((b) => b.status === 'Pending').length,
        accepted: gBookings.filter((b) => !['Pending', 'Rejected', 'Cancelled'].includes(b.status)).length,
        rejected: gBookings.filter((b) => b.status === 'Rejected').length,
        todayAppts: gBookings.filter((b) => b.appointmentDate === todayISO && !['Rejected', 'Cancelled'].includes(b.status)).length,
        completed: gBookings.filter((b) => b.status === 'Completed').length,
        mechanicsCount: gMechs.length,
        monthlyRevenue: gPay.filter((p) => toISOStringSafe(p.createdAt).startsWith(monthPrefix)).reduce((s, p) => s + Number(p.amount || 0), 0),
        totalRevenue: gPay.reduce((s, p) => s + Number(p.amount || 0), 0),
        totalExpenses: gExp.reduce((s, e) => s + Number(e.amount || 0), 0),
      };
    }
    return map;
  }, [garages, bookings, mechanics, payments, expenses, todayISO, monthPrefix]);

  const filteredGarages = useMemo(() => {
    return garages.filter((g) => {
      const matchesStatus =
        garageStatusFilter === 'all' ||
        (garageStatusFilter === 'active' && g.isActive) ||
        (garageStatusFilter === 'inactive' && !g.isActive);
      const q = garageSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        g.name.toLowerCase().includes(q) ||
        g.garageId.toLowerCase().includes(q) ||
        g.code.toLowerCase().includes(q) ||
        g.city.toLowerCase().includes(q) ||
        g.address.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [garages, garageSearch, garageStatusFilter]);

  const filteredBookings = useMemo(() => {
    const filtered = bookings.filter(
      (b) =>
        (bookingGarageFilter === 'all' || b.garageId === bookingGarageFilter) &&
        (bookingStatusFilter === 'all' || b.status === bookingStatusFilter)
    );
    return filtered.sort((a, b) => {
      if (a.status === 'Pending' && b.status !== 'Pending') return -1;
      if (b.status === 'Pending' && a.status !== 'Pending') return 1;
      return (b.appointmentDate || '').localeCompare(a.appointmentDate || '');
    });
  }, [bookings, bookingGarageFilter, bookingStatusFilter]);

  const handleAcceptBooking = async (booking: Booking) => {
    if (!booking.id || busyBookingId) return;
    setBusyBookingId(booking.id);
    try {
      await acceptGarageBooking(booking.id, account.uid, 'super_admin');
      showToast(`Booking ${booking.bookingCode} accepted.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to accept booking.', 'error');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleRejectBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalBooking?.id || busyBookingId) return;
    setBusyBookingId(rejectModalBooking.id);
    try {
      await rejectGarageBooking(rejectModalBooking.id, rejectReason, account.uid, 'super_admin');
      showToast(`Booking ${rejectModalBooking.bookingCode} rejected and slot released.`, 'info');
      setRejectModalBooking(null);
      setRejectReason('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reject booking.', 'error');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleAssignMechanicForBooking = async (booking: Booking) => {
    if (!booking.id || busyBookingId) return;
    const garageMechs = mechanics.filter((m) => m.isActive && m.garageId === booking.garageId);
    const chosenUid = selectedMechByBooking[booking.id] || garageMechs[0]?.uid;
    const mech = garageMechs.find((m) => m.uid === chosenUid);
    if (!mech) {
      showToast(`No active mechanic selected for ${booking.garageName}.`, 'error');
      return;
    }
    setBusyBookingId(booking.id);
    try {
      await assignMechanicAndCreateJobCard(booking.id, mech, account.uid, 'super_admin');
      showToast(`Assigned ${mech.name} to ${booking.bookingCode} and opened Job Card.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to assign mechanic.', 'error');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleProvisionStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailLower = staffEmail.trim().toLowerCase();
    try {
      // If user already exists in users collection, assign directly!
      const existingUser = usersList.find((u) => u.email.toLowerCase() === emailLower);
      if (existingUser) {
        await assignExistingStaffDirectly({
          targetUid: existingUser.uid,
          email: emailLower,
          name: staffName,
          role: staffRole,
          garageId: staffGarageId,
          phone: staffPhone,
          specialization: staffSpec,
          actorUid: account.uid,
          actorEmail: account.email,
        });
        showToast(`Assigned existing user ${emailLower} as ${staffRole} for ${staffGarageId}.`, 'success');
      } else {
        await createStaffInvite(
          {
            email: emailLower,
            role: staffRole,
            garageId: staffGarageId,
            name: staffName,
            phone: staffPhone,
            specialization: staffSpec,
            createdBy: account.uid,
          },
          account.email
        );

        if (createLoginNow && staffPassword.length >= 6) {
          try {
            const secAuth = getSecondaryAuth();
            const cred = await createUserWithEmailAndPassword(secAuth, emailLower, staffPassword);
            await updateProfile(cred.user, { displayName: staffName.trim() });
            await sendEmailVerification(cred.user);
            await signOut(secAuth);
            showToast(`Staff invite & email login created for ${emailLower}. They must verify their email on first login.`, 'success');
          } catch (secErr) {
            const code = (secErr as { code?: string })?.code;
            if (code === 'auth/operation-not-allowed') {
              showToast(`Staff invite created for ${emailLower}. (Email/Password Auth is disabled in Firebase Console, so staff should sign in with Google using ${emailLower}.)`, 'info');
            } else {
              showToast(`Staff invite saved. Secondary login creation note: ${secErr instanceof Error ? secErr.message : String(secErr)}`, 'info');
            }
          }
        } else {
          showToast(`Staff authorization invite created for ${emailLower} (${staffRole} → ${staffGarageId}).`, 'success');
        }
      }

      setStaffName('');
      setStaffEmail('');
      setStaffPhone('');
      setStaffPassword('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to authorize staff.', 'error');
    }
  };

  // If Super Admin clicked "View Dashboard" / "Manage Garage" / "View Bookings" on a specific garage card
  if (activeGarageView) {
    const targetGarage = garages.find((g) => g.garageId === activeGarageView.garageId);
    if (targetGarage) {
      return (
        <GarageManagerDashboard
          account={account}
          garage={targetGarage}
          defaultTaxRate={settings?.defaultTaxRate ?? 18}
          initialTab={activeGarageView.initialTab}
          onBackToSuperAdmin={() => setActiveGarageView(null)}
          onGoPublic={onGoPublic}
        />
      );
    }
  }

  const maxBookingsCompare = Math.max(1, ...garages.map((g) => garageStatsMap[g.garageId]?.totalBookings || 0));
  const maxRevenueCompare = Math.max(1, ...garages.map((g) => garageStatsMap[g.garageId]?.totalRevenue || 0));

  const navItems: Array<{ id: SuperTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: 'overview', label: 'Executive Dashboard', icon: LayoutDashboard },
    { id: 'garages', label: 'My 6 Garages', icon: Building2 },
    { id: 'bookings', label: 'All Bookings', icon: ClipboardList, badge: platformKpis.pendingBookings },
    { id: 'customers', label: 'Customer Management', icon: Users },
    { id: 'managers', label: 'Garage Managers', icon: UserCog },
    { id: 'mechanics', label: 'Mechanic Management', icon: Wrench },
    { id: 'vehicles', label: 'Vehicle Management', icon: Car },
    { id: 'services', label: 'Services & Packages', icon: Wrench },
    { id: 'job-cards', label: 'Job Cards & Inspections', icon: ClipboardList },
    { id: 'inventory', label: 'Inventory & Spare Parts', icon: Package, badge: platformKpis.lowStockAlerts },
    { id: 'invoices', label: 'Billing & Invoices', icon: FileText },
    { id: 'payments', label: 'Payments & Expenses', icon: CreditCard },
    { id: 'analytics', label: 'Revenue Analytics', icon: TrendingUp },
    { id: 'reviews', label: 'Customer Reviews', icon: Star },
    { id: 'tickets', label: 'Support Tickets', icon: LifeBuoy },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: notifications.filter((n) => !n.isRead).length },
    { id: 'reports', label: 'Reports & Exports', icon: Download },
    { id: 'settings', label: 'Platform Settings', icon: Settings },
    { id: 'audit', label: 'Audit Logs', icon: ShieldAlert },
  ];

  const renderSixGaragesSection = () => (
    <section className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#0B132B] tracking-tight font-display">MY 6 GARAGES</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Live operational overview of all six independent AutoCare Garage branches. Click View Dashboard to enter any garage.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
            <input
              type="text"
              value={garageSearch}
              onChange={(e) => setGarageSearch(e.target.value)}
              placeholder="Search garage name, ID, location..."
              className="pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B132B]"
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {(['all', 'active', 'inactive'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setGarageStatusFilter(f)}
                className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition-colors ${
                  garageStatusFilter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {garages.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-sm text-slate-600">No garages initialized in Firestore yet.</p>
          <button
            type="button"
            onClick={async () => {
              await seedInitialPlatformData(account.uid, account.email);
              showToast('Initialized all 6 AutoCare Garage branches.', 'success');
            }}
            className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg"
          >
            Initialize All 6 Garages Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredGarages.map((g) => {
            const st = garageStatsMap[g.garageId] || {
              totalBookings: 0,
              pending: 0,
              accepted: 0,
              rejected: 0,
              todayAppts: 0,
              completed: 0,
              mechanicsCount: 0,
              monthlyRevenue: 0,
              totalRevenue: 0,
              totalExpenses: 0,
            };
            return (
              <div key={g.garageId} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="h-40 bg-slate-100 relative overflow-hidden">
                    <GarageImage
                      garageId={g.garageId}
                      photoUrl={g.photoUrl}
                      alt={g.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-bold text-[#0B132B]">{g.garageId} · {g.code}</span>
                      <ActiveStatusLabel isActive={g.isActive} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{g.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{g.city} — {g.address}</p>
                    </div>

                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-center">
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-[10px] text-slate-500">Total</div>
                        <div className="text-sm font-bold text-[#0B132B] tabular-nums">{st.totalBookings}</div>
                      </div>
                      <div className="bg-amber-50/70 rounded-lg p-2">
                        <div className="text-[10px] text-amber-700">Pending</div>
                        <div className="text-sm font-bold text-amber-800 tabular-nums">{st.pending}</div>
                      </div>
                      <div className="bg-emerald-50/70 rounded-lg p-2">
                        <div className="text-[10px] text-emerald-700">Accepted</div>
                        <div className="text-sm font-bold text-emerald-800 tabular-nums">{st.accepted}</div>
                      </div>
                      <div className="bg-red-50/70 rounded-lg p-2">
                        <div className="text-[10px] text-red-700">Rejected</div>
                        <div className="text-sm font-bold text-red-800 tabular-nums">{st.rejected}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pt-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Today&apos;s Appts</span>
                        <span className="font-semibold text-slate-900 tabular-nums">{st.todayAppts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Completed</span>
                        <span className="font-semibold text-slate-900 tabular-nums">{st.completed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Mechanics</span>
                        <span className="font-semibold text-slate-900 tabular-nums">{st.mechanicsCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Monthly Rev</span>
                        <span className="font-bold text-[#0B132B] tabular-nums">{formatINR(st.monthlyRevenue)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveGarageView({ garageId: g.garageId, initialTab: 'overview' })}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-[#0B132B] text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Dashboard</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGarageView({ garageId: g.garageId, initialTab: 'settings' })}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-100"
                  >
                    <span>Manage Garage</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGarageView({ garageId: g.garageId, initialTab: 'requests' })}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700"
                  >
                    <span>View Bookings</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditGarage(g)}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-100"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Garage</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

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
            <div className="text-[11px] text-red-400 font-semibold">Super Admin Control</div>
          </div>
          <button type="button" onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === item.id ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
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
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-1">
          <button type="button" onClick={onGoPublic} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/10">
            <Globe className="w-4 h-4" />
            <span>Public Website</span>
          </button>
          <button type="button" onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-red-300 hover:bg-red-500/20">
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-slate-600">
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-semibold text-slate-900">
              Super Admin / {navItems.find((n) => n.id === tab)?.label}
            </div>
          </div>
          <div className="text-xs text-slate-500 font-mono truncate">{account.email}</div>
        </header>

        <main className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-8">
          {/* EXECUTIVE DASHBOARD (With MY 6 GARAGES prominently displayed) */}
          {tab === 'overview' && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {[
                  ['Total Revenue', formatINR(platformKpis.totalRevenue)],
                  ["Today's Revenue", formatINR(platformKpis.todayRevenue)],
                  ['Monthly Revenue', formatINR(platformKpis.monthlyRevenue)],
                  ['Total Garages', platformKpis.totalGarages],
                  ['Total Bookings', platformKpis.totalBookings],
                  ['Pending', platformKpis.pendingBookings],
                  ['Accepted', platformKpis.acceptedBookings],
                  ['Rejected', platformKpis.rejectedBookings],
                  ['Active Jobs', platformKpis.activeJobs],
                  ['Completed', platformKpis.completedServices],
                  ['Customers', platformKpis.totalCustomers],
                  ['Vehicles', platformKpis.totalVehicles],
                  ['Mechanics', platformKpis.totalMechanics],
                  ['Pending Dues', formatINR(platformKpis.pendingPayments)],
                  ['Total Expenses', formatINR(platformKpis.totalExpenses)],
                  ['Low Stock', platformKpis.lowStockAlerts],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-3.5">
                    <div className="text-[11px] text-slate-500 truncate">{label}</div>
                    <div className="text-lg font-bold text-[#0B132B] tabular-nums mt-1">{val}</div>
                  </div>
                ))}
              </div>

              {/* MANDATORY: MY 6 GARAGES DIRECTLY ON MAIN SUPER ADMIN DASHBOARD */}
              {renderSixGaragesSection()}

              {/* Garage-Wise Comparison Charts */}
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-[#0B132B]">Garage-Wise Booking Comparison</h3>
                  <div className="space-y-3">
                    {garages.map((g) => {
                      const count = garageStatsMap[g.garageId]?.totalBookings || 0;
                      const pct = Math.round((count / maxBookingsCompare) * 100);
                      return (
                        <div key={g.garageId} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-slate-700">{g.code} · {g.name}</span>
                            <span className="font-mono font-bold text-[#0B132B] tabular-nums">{count}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#0B132B] rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-[#0B132B]">Garage-Wise Verified Revenue Comparison</h3>
                  <div className="space-y-3">
                    {garages.map((g) => {
                      const rev = garageStatsMap[g.garageId]?.totalRevenue || 0;
                      const pct = Math.round((rev / maxRevenueCompare) * 100);
                      return (
                        <div key={g.garageId} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-slate-700">{g.code} · {g.name}</span>
                            <span className="font-mono font-bold text-red-600 tabular-nums">{formatINR(rev)}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-red-600 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>
          )}

          {tab === 'garages' && renderSixGaragesSection()}

          {/* ALL BOOKINGS */}
          {tab === 'bookings' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#0B132B]">All Six-Garage Bookings ({filteredBookings.length})</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Accept or reject Pending bookings and assign garage-scoped mechanics to Accepted bookings.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select value={bookingGarageFilter} onChange={(e) => setBookingGarageFilter(e.target.value)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg">
                    <option value="all">All 6 Garages</option>
                    {garages.map((g) => (
                      <option key={g.garageId} value={g.garageId}>{g.code} · {g.name}</option>
                    ))}
                  </select>
                  <select value={bookingStatusFilter} onChange={(e) => setBookingStatusFilter(e.target.value)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg">
                    <option value="all">All Statuses</option>
                    {['Pending', 'Accepted', 'Rejected', 'Reschedule Requested', 'Confirmed', 'Mechanic Assigned', 'Work In Progress', 'Completed', 'Cancelled'].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => setBookingStatusFilter('all')}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    bookingStatusFilter === 'all' ? 'border-[#0B132B] bg-slate-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-[11px] text-slate-500">All Bookings</div>
                  <div className="text-lg font-bold text-[#0B132B] tabular-nums">{platformKpis.totalBookings}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setBookingStatusFilter('Pending')}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    bookingStatusFilter === 'Pending' ? 'border-amber-600 bg-amber-50' : 'border-slate-200 hover:bg-amber-50/40'
                  }`}
                >
                  <div className="text-[11px] text-amber-700 font-medium">Pending Review</div>
                  <div className="text-lg font-bold text-amber-800 tabular-nums">{platformKpis.pendingBookings}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setBookingStatusFilter('Accepted')}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    bookingStatusFilter === 'Accepted' ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 hover:bg-emerald-50/40'
                  }`}
                >
                  <div className="text-[11px] text-emerald-700 font-medium">Accepted / Active</div>
                  <div className="text-lg font-bold text-emerald-800 tabular-nums">{platformKpis.acceptedBookings}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setBookingStatusFilter('Rejected')}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    bookingStatusFilter === 'Rejected' ? 'border-red-600 bg-red-50' : 'border-slate-200 hover:bg-red-50/40'
                  }`}
                >
                  <div className="text-[11px] text-red-700 font-medium">Rejected</div>
                  <div className="text-lg font-bold text-red-800 tabular-nums">{platformKpis.rejectedBookings}</div>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Booking</th>
                      <th className="py-2 pr-3">Garage</th>
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3">Vehicle &amp; Service</th>
                      <th className="py-2 pr-3">Slot</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBookings.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          No bookings match the selected garage/status filter.
                        </td>
                      </tr>
                    ) : (
                      filteredBookings.map((b) => {
                        const garageMechs = mechanics.filter((m) => m.isActive && m.garageId === b.garageId);
                        const isBusy = busyBookingId === b.id;
                        return (
                          <tr key={b.id} className="align-top">
                            <td className="py-3 pr-3 font-mono font-bold text-[#0B132B] whitespace-nowrap">{b.bookingCode}</td>
                            <td className="py-3 pr-3 font-semibold">{b.garageName}</td>
                            <td className="py-3 pr-3">
                              <div className="font-medium text-slate-900">{b.customerName}</div>
                              <div className="text-slate-500">{b.customerPhone}</div>
                            </td>
                            <td className="py-3 pr-3">
                              <div>{b.vehicleBrand} {b.vehicleModel} ({b.registrationNumber})</div>
                              <div className="text-slate-500">{b.packageName}</div>
                            </td>
                            <td className="py-3 pr-3 tabular-nums whitespace-nowrap">{b.appointmentDate} {b.appointmentTime}</td>
                            <td className="py-3 pr-3"><BookingStatusBadge status={b.status} /></td>
                            <td className="py-3">
                              {b.status === 'Pending' && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleAcceptBooking(b)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white text-[11px] font-semibold rounded-md hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>{isBusy ? 'Saving...' : 'Accept'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => {
                                      setRejectReason('');
                                      setRejectModalBooking(b);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-600 text-white text-[11px] font-semibold rounded-md hover:bg-red-700 disabled:opacity-50"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Reject</span>
                                  </button>
                                </div>
                              )}

                              {['Accepted', 'Confirmed'].includes(b.status) && !b.assignedMechanicId && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {garageMechs.length > 0 ? (
                                    <>
                                      <select
                                        value={selectedMechByBooking[b.id!] || garageMechs[0]?.uid || ''}
                                        onChange={(e) =>
                                          setSelectedMechByBooking((prev) => ({
                                            ...prev,
                                            [b.id!]: e.target.value,
                                          }))
                                        }
                                        className="px-2 py-1 text-[11px] border border-slate-300 rounded-md bg-white max-w-[160px]"
                                      >
                                        {garageMechs.map((m) => (
                                          <option key={m.uid} value={m.uid}>
                                            {m.name} {m.isAvailable ? '' : '(Busy)'}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => handleAssignMechanicForBooking(b)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#0B132B] text-white text-[11px] font-semibold rounded-md hover:bg-slate-800 disabled:opacity-50"
                                      >
                                        <Wrench className="w-3 h-3" />
                                        <span>{isBusy ? 'Assigning...' : 'Assign Mechanic'}</span>
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setStaffRole('mechanic');
                                        setStaffGarageId(b.garageId);
                                        setTab('mechanics');
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 text-[#0B132B] text-[11px] font-semibold rounded-md hover:bg-slate-50"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Authorize {b.garageId} Mechanic</span>
                                    </button>
                                  )}
                                </div>
                              )}

                              {!(b.status === 'Pending') &&
                                !(['Accepted', 'Confirmed'].includes(b.status) && !b.assignedMechanicId) && (
                                  <div className="space-y-1">
                                    {b.assignedMechanicName && (
                                      <div className="text-[11px] text-slate-600">
                                        Mechanic: <strong>{b.assignedMechanicName}</strong>
                                      </div>
                                    )}
                                    {b.status === 'Rejected' && b.rejectionReason && (
                                      <div className="text-[11px] text-red-700 max-w-[200px] truncate" title={b.rejectionReason}>
                                        Reason: {b.rejectionReason}
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setActiveGarageView({ garageId: b.garageId, initialTab: 'accepted' })}
                                      className="text-[11px] font-semibold text-[#0B132B] hover:underline"
                                    >
                                      Manage in {b.garageId} →
                                    </button>
                                  </div>
                                )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CUSTOMERS */}
          {tab === 'customers' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">Registered Customers ({customers.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Email</th>
                      <th className="py-2 pr-3">Phone</th>
                      <th className="py-2">City</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customers.map((c) => (
                      <tr key={c.uid}>
                        <td className="py-2.5 pr-3 font-semibold">{c.name}</td>
                        <td className="py-2.5 pr-3">{c.email}</td>
                        <td className="py-2.5 pr-3">{c.phone || '—'}</td>
                        <td className="py-2.5">{c.city || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GARAGE MANAGERS & MECHANICS PROVISIONING */}
          {(tab === 'managers' || tab === 'mechanics') && (
            <div className="space-y-6">
              <form onSubmit={handleProvisionStaff} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="text-base font-bold text-[#0B132B]">
                  Authorize {tab === 'managers' ? 'Garage Manager' : 'Mechanic'} Account
                </h2>
                <p className="text-xs text-slate-500">
                  Enter an email address and target garage. If that email is already registered, the role applies immediately; otherwise a secure Staff Invitation is created and automatically claimed when they sign in with Google or verified email.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select value={staffRole} onChange={(e) => setStaffRole(e.target.value as 'garage_manager' | 'mechanic')} className="px-3 py-2 text-xs border border-slate-300 rounded-lg">
                    <option value="garage_manager">Garage Manager</option>
                    <option value="mechanic">Mechanic</option>
                  </select>
                  <select value={staffGarageId} onChange={(e) => setStaffGarageId(e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg">
                    {garages.map((g) => (
                      <option key={g.garageId} value={g.garageId}>{g.code} · {g.name}</option>
                    ))}
                  </select>
                  <input required value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Full Name" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input required type="email" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} placeholder="Staff Email" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input value={staffPhone} onChange={(e) => setStaffPhone(e.target.value)} placeholder="Phone" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  {staffRole === 'mechanic' && (
                    <input value={staffSpec} onChange={(e) => setStaffSpec(e.target.value)} placeholder="Specialization" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={createLoginNow} onChange={(e) => setCreateLoginNow(e.target.checked)} />
                    <span>Also provision Email/Password login (requires Email/Password enabled in Firebase Auth)</span>
                  </label>
                  {createLoginNow && (
                    <input type="password" minLength={6} value={staffPassword} onChange={(e) => setStaffPassword(e.target.value)} placeholder="Initial password (min 6)" className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg" />
                  )}
                </div>
                <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg">
                  <Plus className="w-3.5 h-3.5" /> Authorize Staff Member
                </button>
              </form>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-[#0B132B]">
                    {tab === 'managers' ? `Active Garage Managers (${managers.length})` : `Active Mechanics (${mechanics.length})`}
                  </h3>
                  {(tab === 'managers' ? managers : mechanics).map((person) => (
                    <div key={person.uid} className="p-3 border border-slate-200 rounded-lg text-xs flex justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{person.name}</div>
                        <div className="text-slate-500">{person.email} · Garage: {person.garageId}</div>
                      </div>
                      <ActiveStatusLabel isActive={person.isActive} />
                    </div>
                  ))}
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-[#0B132B]">Staff Authorization Invites ({invites.length})</h3>
                  {invites.map((inv) => (
                    <div key={inv.id} className="p-3 border border-slate-200 rounded-lg text-xs flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900">{inv.name} ({inv.role})</div>
                        <div className="text-slate-500">{inv.email} → {inv.garageId} · Status: <strong>{inv.status}</strong></div>
                      </div>
                      {inv.status === 'pending' && inv.id && (
                        <button type="button" onClick={() => revokeStaffInvite(inv.id!, account.uid, account.email)} className="text-red-600 font-semibold">
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* VEHICLES */}
          {tab === 'vehicles' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">Platform Vehicles ({vehicles.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {vehicles.map((v) => (
                  <div key={v.id} className="p-4 border border-slate-200 rounded-xl text-xs">
                    <div className="font-mono font-bold text-red-600">{v.registrationNumber}</div>
                    <div className="font-bold text-slate-900 text-sm">{v.brand} {v.model}</div>
                    <div className="text-slate-500">{v.vehicleType} · {v.fuelType} · {v.year} · {v.odometer} km</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SERVICES & PACKAGES */}
          {tab === 'services' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">All Six-Garage Service Packages ({packages.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {packages.map((p) => (
                  <div key={p.id} className="p-4 border border-slate-200 rounded-xl text-xs">
                    <div className="flex justify-between">
                      <span className="font-mono font-semibold text-red-600">{p.garageId} · {p.vehicleType}</span>
                      <span className="font-bold text-[#0B132B] tabular-nums">{formatINR(p.startingPrice)}</span>
                    </div>
                    <div className="font-bold text-sm text-slate-900 mt-1">{p.name}</div>
                    <div className="text-slate-500">{p.categoryName}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* JOB CARDS & INSPECTIONS */}
          {tab === 'job-cards' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h2 className="text-lg font-bold text-[#0B132B]">All Job Cards ({jobCards.length}) &amp; Inspections ({inspections.length})</h2>
              {jobCards.map((jc) => (
                <div key={jc.id} className="p-4 border border-slate-200 rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <div className="font-mono font-bold text-[#0B132B]">{jc.jobCardCode} · {jc.garageId}</div>
                    <div className="font-semibold text-slate-900">{jc.vehicleSummary} · Mechanic: {jc.assignedMechanicName}</div>
                  </div>
                  <BookingStatusBadge status={jc.status} />
                </div>
              ))}
            </div>
          )}

          {/* INVENTORY */}
          {tab === 'inventory' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-[#0B132B]">Consolidated Six-Garage Inventory ({spareParts.length})</h2>
                <button
                  type="button"
                  onClick={() =>
                    downloadCSV(
                      'autocare-consolidated-inventory.csv',
                      ['GarageID', 'SKU', 'Name', 'Brand', 'Qty', 'MinStock', 'SellingPrice'],
                      spareParts.map((p) => [p.garageId, p.sku, p.name, p.brand, p.quantity, p.minStockLevel, p.sellingPrice])
                    )
                  }
                  className="px-3 py-1.5 bg-[#0B132B] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Garage</th>
                      <th className="py-2 pr-3">SKU</th>
                      <th className="py-2 pr-3">Part</th>
                      <th className="py-2 pr-3">Stock</th>
                      <th className="py-2">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {spareParts.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 pr-3 font-mono font-semibold">{p.garageId}</td>
                        <td className="py-2 pr-3 font-mono">{p.sku}</td>
                        <td className="py-2 pr-3">{p.name}</td>
                        <td className={`py-2 pr-3 font-bold tabular-nums ${p.quantity <= p.minStockLevel ? 'text-red-600' : 'text-emerald-700'}`}>{p.quantity}</td>
                        <td className="py-2 tabular-nums">{formatINR(p.sellingPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* INVOICES */}
          {tab === 'invoices' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h2 className="text-lg font-bold text-[#0B132B]">All Invoices ({invoices.length})</h2>
              {invoices.map((inv) => (
                <div key={inv.id} className="p-4 border border-slate-200 rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <div className="font-mono font-bold text-[#0B132B]">{inv.invoiceNumber} · {inv.garageName}</div>
                    <div className="text-slate-600">{inv.customerName} · Total <strong className="tabular-nums">{formatINR(inv.finalTotal)}</strong></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <PaymentStatusBadge status={inv.paymentStatus} />
                    <button type="button" onClick={() => downloadInvoicePDF(inv)} className="px-3 py-1.5 bg-[#0B132B] text-white font-semibold rounded-lg">PDF</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PAYMENTS & EXPENSES / ANALYTICS */}
          {(tab === 'payments' || tab === 'analytics') && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <h2 className="text-lg font-bold text-[#0B132B]">Garage-Wise Financial Report (Garages 1 – 6)</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2 pr-3">Garage</th>
                        <th className="py-2 pr-3 text-right">Bookings</th>
                        <th className="py-2 pr-3 text-right">Verified Revenue</th>
                        <th className="py-2 pr-3 text-right">Expenses</th>
                        <th className="py-2 text-right">Gross Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {garages.map((g) => {
                        const st = garageStatsMap[g.garageId];
                        const profit = (st?.totalRevenue || 0) - (st?.totalExpenses || 0);
                        return (
                          <tr key={g.garageId}>
                            <td className="py-2.5 pr-3 font-semibold">{g.code} · {g.name}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">{st?.totalBookings || 0}</td>
                            <td className="py-2.5 pr-3 text-right font-semibold text-emerald-700 tabular-nums">{formatINR(st?.totalRevenue || 0)}</td>
                            <td className="py-2.5 pr-3 text-right text-red-700 tabular-nums">{formatINR(st?.totalExpenses || 0)}</td>
                            <td className="py-2.5 text-right font-bold text-[#0B132B] tabular-nums">{formatINR(profit)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* REVIEWS */}
          {tab === 'reviews' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h2 className="text-lg font-bold text-[#0B132B]">Customer Reviews ({reviews.length})</h2>
              {reviews.map((r) => (
                <div key={r.id} className="p-4 border border-slate-200 rounded-xl text-xs">
                  <div className="flex justify-between">
                    <span className="font-bold">{r.customerName} · {r.garageId}</span>
                    <span className="font-mono font-bold text-amber-600">{r.rating} / 5 ★</span>
                  </div>
                  <p className="text-slate-600 mt-1">{r.comment}</p>
                </div>
              ))}
            </div>
          )}

          {/* SUPPORT TICKETS */}
          {tab === 'tickets' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h2 className="text-lg font-bold text-[#0B132B]">All Support Tickets ({tickets.length})</h2>
              {tickets.map((t) => (
                <div key={t.id} className="p-4 border border-slate-200 rounded-xl text-xs">
                  <div className="flex justify-between">
                    <span className="font-mono font-bold text-[#0B132B]">{t.ticketCode} · {t.garageId} · {t.customerName}</span>
                    <span className="font-semibold">{t.status}</span>
                  </div>
                  <div className="font-bold text-sm text-slate-900 mt-1">{t.subject}</div>
                  <p className="text-slate-600 mt-1">{t.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* NOTIFICATIONS */}
          {tab === 'notifications' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h2 className="text-lg font-bold text-[#0B132B]">Platform Notifications ({notifications.length})</h2>
              {notifications.map((n) => (
                <div key={n.id} className="p-3 border border-slate-200 rounded-lg text-xs flex justify-between">
                  <div>
                    <div className="font-bold">{n.title} ({n.garageId || 'Platform'})</div>
                    <div className="text-slate-600">{n.message}</div>
                  </div>
                  {!n.isRead && n.id && (
                    <button type="button" onClick={() => markNotificationRead(n.id!)} className="font-semibold text-[#0B132B]">Mark read</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* REPORTS & EXPORTS */}
          {tab === 'reports' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">Consolidated Reports &amp; CSV Exports</h2>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    downloadCSV(
                      'autocare-all-bookings.csv',
                      ['BookingCode', 'GarageID', 'Customer', 'Phone', 'Vehicle', 'Package', 'Date', 'Time', 'Status'],
                      bookings.map((b) => [b.bookingCode, b.garageId, b.customerName, b.customerPhone, `${b.vehicleBrand} ${b.vehicleModel} (${b.registrationNumber})`, b.packageName, b.appointmentDate, b.appointmentTime, b.status])
                    )
                  }
                  className="px-4 py-2 bg-[#0B132B] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" /> Export All Bookings CSV
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadCSV(
                      'autocare-revenue-report.csv',
                      ['InvoiceNumber', 'GarageID', 'Customer', 'Total', 'Paid', 'Status'],
                      invoices.map((i) => [i.invoiceNumber, i.garageId, i.customerName, i.finalTotal, i.paidAmount, i.paymentStatus])
                    )
                  }
                  className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" /> Export Invoices &amp; Revenue CSV
                </button>
              </div>
            </div>
          )}

          {/* PLATFORM SETTINGS */}
          {tab === 'settings' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await updatePlatformSettings(
                  {
                    businessName: platName,
                    tagline: platTagline,
                    currency: 'INR',
                    defaultTaxRate: Number(platTax),
                    supportEmail: platEmail,
                    supportPhone: platPhone,
                  },
                  { uid: account.uid, email: account.email }
                );
                showToast('Platform settings saved.', 'success');
              }}
              className="bg-white border border-slate-200 rounded-xl p-6 max-w-xl space-y-4"
            >
              <h2 className="text-lg font-bold text-[#0B132B]">Platform Settings</h2>
              <input value={platName} onChange={(e) => setPlatName(e.target.value)} placeholder="Business Name" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              <input value={platTagline} onChange={(e) => setPlatTagline(e.target.value)} placeholder="Tagline" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              <input type="number" min={0} max={50} value={platTax} onChange={(e) => setPlatTax(Number(e.target.value))} placeholder="Default GST %" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              <input value={platEmail} onChange={(e) => setPlatEmail(e.target.value)} placeholder="Support Email" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              <input value={platPhone} onChange={(e) => setPlatPhone(e.target.value)} placeholder="Support Phone" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              <button type="submit" className="px-5 py-2.5 bg-[#0B132B] text-white text-xs font-semibold rounded-lg">Save Platform Settings</button>
            </form>
          )}

          {/* AUDIT LOGS */}
          {tab === 'audit' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h2 className="text-lg font-bold text-[#0B132B]">Immutable Security &amp; Operations Audit Logs ({auditLogs.length})</h2>
              <div className="divide-y divide-slate-100 text-xs">
                {auditLogs.map((log) => (
                  <div key={log.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-[#0B132B]">{log.action}</span> · <span className="text-slate-600">{log.details}</span>
                    </div>
                    <span className="text-slate-400 font-mono shrink-0">{log.actorRole} · {formatDateTime(log.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Edit Garage Modal */}
      {editGarage && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await updateGarage(
                  editGarage.garageId,
                  {
                    name: editGarage.name,
                    city: editGarage.city,
                    address: editGarage.address,
                    phone: editGarage.phone,
                    email: editGarage.email,
                    operatingHours: editGarage.operatingHours,
                    dailyCapacity: Number(editGarage.dailyCapacity),
                    photoUrl: (editGarage.photoUrl || '').trim().slice(0, 500),
                    isActive: editGarage.isActive,
                    isDemoInfo: false,
                  },
                  { uid: account.uid, role: 'super_admin', email: account.email }
                );
                showToast(`Updated ${editGarage.name}.`, 'success');
                setEditGarage(null);
              } catch (err) {
                showToast(err instanceof Error ? err.message : 'Failed to update garage.', 'error');
              }
            }}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-3 my-8"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-[#0B132B]">Edit {editGarage.code} ({editGarage.garageId})</h3>
              <button
                type="button"
                onClick={() => setEditGarage({ ...editGarage, isActive: !editGarage.isActive })}
                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg ${
                  editGarage.isActive ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                {editGarage.isActive ? 'Active' : 'Inactive'}
              </button>
            </div>

            <div className="h-36 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
              <GarageImage
                garageId={editGarage.garageId}
                photoUrl={editGarage.photoUrl}
                alt={editGarage.name}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-700">Garage Photo URL or Upload to Firebase Storage</label>
              <div className="flex flex-wrap gap-2">
                <input
                  maxLength={500}
                  value={editGarage.photoUrl || ''}
                  onChange={(e) => setEditGarage({ ...editGarage, photoUrl: e.target.value })}
                  placeholder="https://firebasestorage.googleapis.com/... or leave default"
                  className="flex-1 min-w-[200px] px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <label className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingGaragePhoto ? 'Uploading...' : 'Upload'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingGaragePhoto}
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setUploadingGaragePhoto(true);
                      try {
                        const uploadedRef = await uploadGaragePhotoToStorage(editGarage.garageId, file);
                        setEditGarage((prev) => (prev ? { ...prev, photoUrl: uploadedRef } : prev));
                        showToast('Garage photo uploaded to Firebase Storage. Click Save Changes to apply.', 'success');
                      } catch (err) {
                        showToast(
                          err instanceof Error
                            ? `Storage upload failed: ${err.message}`
                            : 'Failed to upload image to Firebase Storage.',
                          'error'
                        );
                      } finally {
                        setUploadingGaragePhoto(false);
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setEditGarage({
                      ...editGarage,
                      photoUrl: getFallbackGarageImage(editGarage.garageId),
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
                  title="Reset to default branch photo"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <input required value={editGarage.name} onChange={(e) => setEditGarage({ ...editGarage, name: e.target.value })} placeholder="Garage Name" className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg" />
            <input required value={editGarage.city} onChange={(e) => setEditGarage({ ...editGarage, city: e.target.value })} placeholder="City / Zone" className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg" />
            <input required value={editGarage.address} onChange={(e) => setEditGarage({ ...editGarage, address: e.target.value })} placeholder="Full Address" className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg" />
            <div className="grid grid-cols-2 gap-2">
              <input required value={editGarage.phone} onChange={(e) => setEditGarage({ ...editGarage, phone: e.target.value })} placeholder="Phone" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
              <input required value={editGarage.email} onChange={(e) => setEditGarage({ ...editGarage, email: e.target.value })} placeholder="Email" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input required value={editGarage.operatingHours} onChange={(e) => setEditGarage({ ...editGarage, operatingHours: e.target.value })} placeholder="Operating Hours" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
              <input type="number" min={1} max={100} value={editGarage.dailyCapacity} onChange={(e) => setEditGarage({ ...editGarage, dailyCapacity: Number(e.target.value) })} placeholder="Capacity" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditGarage(null)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">Cancel</button>
              <button type="submit" disabled={uploadingGaragePhoto} className="px-4 py-2 text-xs font-semibold bg-[#0B132B] text-white rounded-lg disabled:opacity-50">Save Changes</button>
            </div>
          </form>
        </div>
      )}

      {/* Reject Booking Confirmation Modal */}
      {rejectModalBooking && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <form onSubmit={handleRejectBookingSubmit} className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Confirm Reject — {rejectModalBooking.bookingCode}
            </h3>
            <p className="text-xs text-slate-600">
              Rejecting this booking at <strong>{rejectModalBooking.garageName}</strong> will release the reserved time slot and notify <strong>{rejectModalBooking.customerName}</strong>. Please enter a clear reason:
            </p>
            <textarea
              required
              minLength={3}
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Service bay unavailable at requested slot..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={Boolean(busyBookingId)}
                onClick={() => setRejectModalBooking(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={Boolean(busyBookingId)}
                className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {busyBookingId ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
