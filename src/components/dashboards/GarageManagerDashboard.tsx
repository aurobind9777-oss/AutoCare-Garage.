import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Inbox,
  CheckCircle2,
  XCircle,
  CalendarClock,
  CalendarDays,
  Users,
  Wrench,
  Clock,
  ClipboardList,
  Package,
  FileText,
  CreditCard,
  TrendingUp,
  LifeBuoy,
  Bell,
  Settings,
  LogOut,
  ArrowLeft,
  Download,
  Plus,
  AlertTriangle,
  Menu,
  X,
  Globe,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  acceptGarageBooking,
  addSupportInternalNote,
  adjustSparePartStock,
  advanceWorkshopStage,
  assignMechanicAndCreateJobCard,
  generateInvoice,
  markNotificationRead,
  recordExpense,
  recordVerifiedPayment,
  rejectGarageBooking,
  replyToSupportTicket,
  requestBookingReschedule,
  saveInspection,
  saveServiceCategory,
  saveServicePackage,
  saveSparePart,
  updateGarage,
  upsertAppointmentSlot,
} from '../../services/firestoreService';
import { DEFAULT_TIME_SLOTS } from '../../data/seedCatalog';
import {
  downloadCSV,
  downloadInvoicePDF,
  formatDateTime,
  formatINR,
  getMonthPrefix,
  getTodayISO,
  toISOStringSafe,
} from '../../utils/exportHelpers';
import { ActiveStatusLabel, BookingStatusBadge, PaymentStatusBadge } from '../common/StatusBadge';
import { GarageImage } from '../common/GarageImage';
import { useToast } from '../common/ToastProvider';
import { useAuth } from '../../context/AuthContext';
import type {
  AppNotification,
  AppointmentSlot,
  Booking,
  Expense,
  ExpenseCategory,
  Garage,
  GarageMechanic,
  Inspection,
  InventoryLog,
  Invoice,
  JobCard,
  Payment,
  PaymentMethod,
  ServiceCategory,
  ServicePackage,
  SparePart,
  SupportInternalNote,
  SupportTicket,
  UserAccount,
  VehicleType,
} from '../../types/autocare';

type ManagerTab =
  | 'overview'
  | 'requests'
  | 'accepted'
  | 'rejected'
  | 'reschedules'
  | 'today'
  | 'mechanics'
  | 'services'
  | 'slots'
  | 'job-cards'
  | 'inventory'
  | 'invoices'
  | 'payments'
  | 'financials'
  | 'tickets'
  | 'notifications'
  | 'settings';

interface GarageManagerDashboardProps {
  account: UserAccount;
  garage: Garage;
  defaultTaxRate?: number;
  initialTab?: ManagerTab;
  onBackToSuperAdmin?: () => void;
  onGoPublic: () => void;
}

export function GarageManagerDashboard({
  account,
  garage,
  defaultTaxRate = 18,
  initialTab = 'overview',
  onBackToSuperAdmin,
  onGoPublic,
}: GarageManagerDashboardProps) {
  const { showToast } = useToast();
  const { logout } = useAuth();

  const [tab, setTab] = useState<ManagerTab>(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [mechanics, setMechanics] = useState<GarageMechanic[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [internalNotes, setInternalNotes] = useState<SupportInternalNote[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Dialog states for Reject / Reschedule / Assign Mechanic
  const [rejectModalBooking, setRejectModalBooking] = useState<Booking | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rescheduleModalBooking, setRescheduleModalBooking] = useState<Booking | null>(null);
  const [reschedDate, setReschedDate] = useState(getTodayISO());
  const [reschedTime, setReschedTime] = useState(DEFAULT_TIME_SLOTS[0]);
  const [reschedNote, setReschedNote] = useState('');
  const [selectedMechByBooking, setSelectedMechByBooking] = useState<Record<string, string>>({});
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  // Slot Management state
  const [slotDate, setSlotDate] = useState(getTodayISO());
  const [slotCapacityInput, setSlotCapacityInput] = useState(Math.max(2, Math.ceil((garage.dailyCapacity || 10) / 4)));

  // Service Package form
  const [catName, setCatName] = useState('');
  const [catVType, setCatVType] = useState<VehicleType>('Car');
  const [pkgName, setPkgName] = useState('');
  const [pkgVType, setPkgVType] = useState<VehicleType>('Car');
  const [pkgCatId, setPkgCatId] = useState('');
  const [pkgLabour, setPkgLabour] = useState(999);
  const [pkgParts, setPkgParts] = useState(1200);
  const [pkgDuration, setPkgDuration] = useState(120);
  const [pkgServicesText, setPkgServicesText] = useState('Engine Oil Change, Filter Cleaning, Safety Inspection');

  // Spare part form
  const [partName, setPartName] = useState('');
  const [partSku, setPartSku] = useState('');
  const [partCat, setPartCat] = useState('Lubricants');
  const [partBrand, setPartBrand] = useState('');
  const [partBuy, setPartBuy] = useState(300);
  const [partSell, setPartSell] = useState(500);
  const [partQty, setPartQty] = useState(10);
  const [partMin, setPartMin] = useState(4);
  const [partSupplier, setPartSupplier] = useState('');
  const [partSearch, setPartSearch] = useState('');

  // Invoice generation modal/form
  const [invBookingId, setInvBookingId] = useState('');
  const [invLabour, setInvLabour] = useState(1000);
  const [invParts, setInvParts] = useState(500);
  const [invDiscount, setInvDiscount] = useState(0);
  const [invTaxRate, setInvTaxRate] = useState(defaultTaxRate);
  const [invDesc, setInvDesc] = useState('');

  // Payment form
  const [payInvoiceId, setPayInvoiceId] = useState('');
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('UPI');
  const [payRef, setPayRef] = useState('');

  // Expense form
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('Spare Parts Purchases');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState(0);
  const [expDate, setExpDate] = useState(getTodayISO());

  // Ticket replies & internal notes
  const [ticketReply, setTicketReply] = useState<Record<string, string>>({});
  const [internalNoteText, setInternalNoteText] = useState<Record<string, string>>({});

  // Garage settings form
  const [setHours, setSetHours] = useState(garage.operatingHours);
  const [setCap, setSetCap] = useState(garage.dailyCapacity);
  const [setDur, setSetDur] = useState(garage.slotDurationMins);
  const [setPhone, setSetPhone] = useState(garage.phone);
  const [setEmail, setSetEmail] = useState(garage.email);
  const [setAddress, setSetAddress] = useState(garage.address);

  useEffect(() => {
    setSetHours(garage.operatingHours);
    setSetCap(garage.dailyCapacity);
    setSetDur(garage.slotDurationMins);
    setSetPhone(garage.phone);
    setSetEmail(garage.email);
    setSetAddress(garage.address);
  }, [garage]);

  useEffect(() => {
    const gId = garage.garageId;
    const isSuper = account.role === 'super_admin';

    const scopedQuery = (colName: string) =>
      isSuper
        ? query(collection(db, colName), where('garageId', '==', gId))
        : query(collection(db, colName), where('garageManagerId', '==', account.uid), where('garageId', '==', gId));

    const publicScopedQuery = (colName: string) =>
      query(collection(db, colName), where('garageId', '==', gId));

    const unsubs = [
      onSnapshot(scopedQuery('bookings'), (s) => setBookings(s.docs.map((d) => ({ id: d.id, ...(d.data() as Booking) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'bookings')),
      onSnapshot(scopedQuery('garage_mechanics'), (s) => setMechanics(s.docs.map((d) => d.data() as GarageMechanic)), (e) => handleFirestoreError(e, OperationType.LIST, 'garage_mechanics')),
      onSnapshot(publicScopedQuery('service_categories'), (s) => setCategories(s.docs.map((d) => ({ id: d.id, ...(d.data() as ServiceCategory) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'service_categories')),
      onSnapshot(publicScopedQuery('service_packages'), (s) => setPackages(s.docs.map((d) => ({ id: d.id, ...(d.data() as ServicePackage) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'service_packages')),
      onSnapshot(publicScopedQuery('appointment_slots'), (s) => setSlots(s.docs.map((d) => ({ id: d.id, ...(d.data() as AppointmentSlot) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'appointment_slots')),
      onSnapshot(scopedQuery('job_cards'), (s) => setJobCards(s.docs.map((d) => ({ id: d.id, ...(d.data() as JobCard) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'job_cards')),
      onSnapshot(scopedQuery('inspections'), (s) => setInspections(s.docs.map((d) => ({ id: d.id, ...(d.data() as Inspection) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'inspections')),
      onSnapshot(scopedQuery('spare_parts'), (s) => setSpareParts(s.docs.map((d) => ({ id: d.id, ...(d.data() as SparePart) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'spare_parts')),
      onSnapshot(scopedQuery('inventory_logs'), (s) => setInventoryLogs(s.docs.map((d) => ({ id: d.id, ...(d.data() as InventoryLog) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'inventory_logs')),
      onSnapshot(scopedQuery('invoices'), (s) => setInvoices(s.docs.map((d) => ({ id: d.id, ...(d.data() as Invoice) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'invoices')),
      onSnapshot(scopedQuery('payments'), (s) => setPayments(s.docs.map((d) => ({ id: d.id, ...(d.data() as Payment) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'payments')),
      onSnapshot(scopedQuery('expenses'), (s) => setExpenses(s.docs.map((d) => ({ id: d.id, ...(d.data() as Expense) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'expenses')),
      onSnapshot(scopedQuery('support_tickets'), (s) => setTickets(s.docs.map((d) => ({ id: d.id, ...(d.data() as SupportTicket) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'support_tickets')),
      onSnapshot(scopedQuery('support_internal_notes'), (s) => setInternalNotes(s.docs.map((d) => ({ id: d.id, ...(d.data() as SupportInternalNote) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'support_internal_notes')),
      onSnapshot(query(collection(db, 'notifications'), where('recipientId', '==', account.uid)), (s) => setNotifications(s.docs.map((d) => ({ id: d.id, ...(d.data() as AppNotification) }))), (e) => handleFirestoreError(e, OperationType.LIST, 'notifications')),
    ];

    return () => unsubs.forEach((u) => u());
  }, [garage.garageId, account.uid, account.role]);

  const todayISO = getTodayISO();
  const monthPrefix = getMonthPrefix();

  const kpis = useMemo(() => {
    const verifiedPayments = payments.filter((p) => p.status === 'Paid' || p.status === 'Partially Paid');
    const monthlyRevenue = verifiedPayments
      .filter((p) => toISOStringSafe(p.createdAt).startsWith(monthPrefix))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalRevenue = verifiedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const pendingPayments = invoices.reduce((sum, inv) => sum + Math.max(0, inv.finalTotal - inv.paidAmount), 0);
    const lowStock = spareParts.filter((p) => p.isActive && p.quantity <= p.minStockLevel);

    return {
      totalBookings: bookings.length,
      pendingRequests: bookings.filter((b) => b.status === 'Pending').length,
      acceptedBookings: bookings.filter((b) => !['Pending', 'Rejected', 'Cancelled'].includes(b.status)).length,
      rejectedBookings: bookings.filter((b) => b.status === 'Rejected').length,
      todayAppointments: bookings.filter((b) => b.appointmentDate === todayISO && !['Rejected', 'Cancelled'].includes(b.status)).length,
      activeJobs: bookings.filter((b) => ['Mechanic Assigned', 'Vehicle Received', 'Inspection', 'Estimate Prepared', 'Awaiting Customer Approval', 'Work In Progress', 'Waiting for Parts', 'Quality Check', 'Ready for Pickup'].includes(b.status)).length,
      completedServices: bookings.filter((b) => b.status === 'Completed').length,
      availableMechanics: mechanics.filter((m) => m.isActive && m.isAvailable).length,
      monthlyRevenue,
      totalRevenue,
      totalExpenses,
      grossProfit: totalRevenue - totalExpenses,
      pendingPayments,
      lowStockCount: lowStock.length,
    };
  }, [bookings, mechanics, payments, expenses, invoices, spareParts, todayISO, monthPrefix]);

  const pendingBookings = useMemo(() => bookings.filter((b) => b.status === 'Pending'), [bookings]);
  const acceptedBookingsList = useMemo(
    () => bookings.filter((b) => !['Pending', 'Rejected', 'Cancelled', 'Reschedule Requested'].includes(b.status)),
    [bookings]
  );

  const handleAccept = async (booking: Booking) => {
    if (!booking.id || busyBookingId) return;
    setBusyBookingId(booking.id);
    try {
      await acceptGarageBooking(booking.id, account.uid, account.role, garage.garageId);
      showToast(`Booking ${booking.bookingCode} accepted at ${garage.code}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to accept booking.', 'error');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalBooking?.id || busyBookingId) return;
    setBusyBookingId(rejectModalBooking.id);
    try {
      await rejectGarageBooking(rejectModalBooking.id, rejectReason, account.uid, account.role, garage.garageId);
      showToast(`Booking ${rejectModalBooking.bookingCode} rejected and slot released.`, 'info');
      setRejectModalBooking(null);
      setRejectReason('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reject booking.', 'error');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleModalBooking) return;
    try {
      await requestBookingReschedule(
        rescheduleModalBooking.id!,
        reschedDate,
        reschedTime,
        reschedNote,
        account.uid,
        account.role
      );
      showToast(`Reschedule suggestion sent for ${rescheduleModalBooking.bookingCode}.`, 'success');
      setRescheduleModalBooking(null);
      setReschedNote('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to request reschedule.', 'error');
    }
  };

  const handleAssignMechanic = async (booking: Booking) => {
    if (!booking.id || busyBookingId) return;
    const mechUid = selectedMechByBooking[booking.id] || mechanics.find((m) => m.isActive)?.uid;
    const mech = mechanics.find((m) => m.uid === mechUid);
    if (!mech) {
      showToast('Select a mechanic from this garage first.', 'error');
      return;
    }
    setBusyBookingId(booking.id);
    try {
      await assignMechanicAndCreateJobCard(booking.id, mech, account.uid, account.role);
      showToast(`Assigned ${mech.name} and created Job Card.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to assign mechanic.', 'error');
    } finally {
      setBusyBookingId(null);
    }
  };

  const navItems: Array<{ id: ManagerTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'requests', label: 'New Booking Requests', icon: Inbox, badge: kpis.pendingRequests },
    { id: 'accepted', label: 'Accepted & Active', icon: CheckCircle2 },
    { id: 'rejected', label: 'Rejected Bookings', icon: XCircle },
    { id: 'reschedules', label: 'Reschedule Requests', icon: CalendarClock },
    { id: 'today', label: "Today's Appointments", icon: CalendarDays },
    { id: 'mechanics', label: 'Mechanic Management', icon: Users },
    { id: 'services', label: 'Services & Packages', icon: Wrench },
    { id: 'slots', label: 'Appointment Slots', icon: Clock },
    { id: 'job-cards', label: 'Job Cards & Inspections', icon: ClipboardList },
    { id: 'inventory', label: 'Inventory & Spare Parts', icon: Package, badge: kpis.lowStockCount },
    { id: 'invoices', label: 'Billing & Invoices', icon: FileText },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'financials', label: 'Expenses & Revenue', icon: TrendingUp },
    { id: 'tickets', label: 'Support Tickets', icon: LifeBuoy },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: notifications.filter((n) => !n.isRead).length },
    { id: 'settings', label: 'Garage Settings', icon: Settings },
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
          <div className="min-w-0">
            <div className="text-sm font-extrabold tracking-tight truncate font-display">{garage.code} · Manager</div>
            <div className="text-[11px] text-slate-400 truncate">{garage.name}</div>
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
          {onBackToSuperAdmin && (
            <button type="button" onClick={onBackToSuperAdmin} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/20">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to My 6 Garages</span>
            </button>
          )}
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
          <div className="flex items-center gap-3 min-w-0">
            <button type="button" onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-slate-600">
              <Menu className="w-5 h-5" />
            </button>
            {onBackToSuperAdmin && (
              <button
                type="button"
                onClick={onBackToSuperAdmin}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#0B132B] text-xs font-semibold rounded-lg shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>My 6 Garages</span>
              </button>
            )}
            <div className="text-sm font-semibold text-slate-900 truncate">
              {garage.name} ({garage.code}) / {navItems.find((n) => n.id === tab)?.label}
            </div>
          </div>
          <ActiveStatusLabel isActive={garage.isActive} />
        </header>

        <main className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col sm:flex-row">
                <div className="sm:w-56 h-36 sm:h-auto shrink-0 bg-slate-100">
                  <GarageImage
                    garageId={garage.garageId}
                    photoUrl={garage.photoUrl}
                    alt={garage.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-5 flex flex-col justify-center">
                  <div className="text-[11px] font-mono font-bold text-red-600 uppercase">
                    {garage.code} · {garage.city}
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold text-[#0B132B] mt-0.5">{garage.name} — Garage Dashboard</h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Independent branch workspace ({garage.garageId}) · Manager: {garage.managerName || 'Unassigned'} · {garage.operatingHours}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  ['Total Bookings', kpis.totalBookings],
                  ['Pending Requests', kpis.pendingRequests],
                  ['Accepted Bookings', kpis.acceptedBookings],
                  ['Rejected Bookings', kpis.rejectedBookings],
                  ["Today's Slots", kpis.todayAppointments],
                  ['Active Jobs', kpis.activeJobs],
                  ['Completed Services', kpis.completedServices],
                  ['Available Mechanics', kpis.availableMechanics],
                  ['Monthly Revenue', formatINR(kpis.monthlyRevenue)],
                  ['Pending Payments', formatINR(kpis.pendingPayments)],
                  ['Low Stock Alerts', kpis.lowStockCount],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[11px] text-slate-500">{label}</div>
                    <div className="text-xl font-bold text-[#0B132B] tabular-nums mt-1">{val}</div>
                  </div>
                ))}
              </div>

              {/* Quick Pending Requests Panel */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">Incoming Booking Requests ({pendingBookings.length})</h2>
                  <button type="button" onClick={() => setTab('requests')} className="text-xs font-semibold text-red-600 hover:underline">
                    Manage All Requests →
                  </button>
                </div>
                {pendingBookings.length === 0 ? (
                  <p className="text-xs text-slate-500">No pending booking requests at {garage.code}.</p>
                ) : (
                  <div className="space-y-3">
                    {pendingBookings.slice(0, 4).map((b) => (
                      <div key={b.id} className="p-4 border border-slate-200 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="text-xs font-mono font-bold text-[#0B132B]">{b.bookingCode} · {b.appointmentDate} at {b.appointmentTime}</div>
                          <div className="text-sm font-bold text-slate-900">{b.customerName} ({b.customerPhone}) — {b.vehicleBrand} {b.vehicleModel} ({b.registrationNumber})</div>
                          <div className="text-xs text-slate-600">{b.packageName} · Complaint: {b.problemDescription}</div>
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                          <button type="button" disabled={busyBookingId === b.id} onClick={() => handleAccept(b)} className="px-3.5 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                            {busyBookingId === b.id ? 'Processing...' : 'Accept Booking'}
                          </button>
                          <button type="button" disabled={busyBookingId === b.id} onClick={() => { setRejectReason(''); setRejectModalBooking(b); }} className="px-3.5 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50">
                            Reject Booking
                          </button>
                          <button type="button" disabled={busyBookingId === b.id} onClick={() => setRescheduleModalBooking(b)} className="px-3.5 py-2 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-50">
                            Request Reschedule
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NEW BOOKING REQUESTS */}
          {tab === 'requests' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">New Booking Requests — {garage.code}</h2>
              {pendingBookings.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                  All incoming requests for {garage.name} have been processed.
                </div>
              ) : (
                pendingBookings.map((b) => (
                  <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-mono font-bold text-[#0B132B]">{b.bookingCode} · Submitted {formatDateTime(b.createdAt)}</div>
                        <h3 className="text-base font-bold text-slate-900 mt-1">
                          {b.customerName} · {b.customerPhone}
                        </h3>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {b.vehicleType}: <strong>{b.vehicleBrand} {b.vehicleModel}</strong> ({b.registrationNumber}) · Package: <strong>{b.packageName}</strong>
                        </div>
                        <div className="text-xs text-slate-700 mt-0.5 tabular-nums">
                          Requested Slot: <strong>{b.appointmentDate} at {b.appointmentTime}</strong> · Demo Est: <strong>{formatINR(b.estimatedPrice)}</strong>
                        </div>
                      </div>
                      <BookingStatusBadge status={b.status} />
                    </div>
                    <p className="text-xs bg-slate-50 p-3 rounded-lg text-slate-700">
                      <strong>Customer Complaint:</strong> {b.problemDescription}
                    </p>
                    <div className="flex flex-wrap gap-2.5 pt-1">
                      <button type="button" disabled={busyBookingId === b.id} onClick={() => handleAccept(b)} className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                        {busyBookingId === b.id ? 'ACCEPTING...' : 'ACCEPT BOOKING'}
                      </button>
                      <button type="button" disabled={busyBookingId === b.id} onClick={() => { setRejectReason(''); setRejectModalBooking(b); }} className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50">
                        REJECT BOOKING
                      </button>
                      <button type="button" disabled={busyBookingId === b.id} onClick={() => setRescheduleModalBooking(b)} className="px-4 py-2 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50">
                        REQUEST RESCHEDULE
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ACCEPTED & ACTIVE BOOKINGS */}
          {(tab === 'accepted' || tab === 'today') && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">
                {tab === 'today' ? `Today's Appointments (${todayISO})` : 'Accepted & Active Bookings'}
              </h2>
              {(tab === 'today' ? bookings.filter((b) => b.appointmentDate === todayISO) : acceptedBookingsList).map((b) => {
                const jc = jobCards.find((j) => j.bookingId === b.id);
                return (
                  <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-mono font-bold text-[#0B132B]">{b.bookingCode} · {b.appointmentDate} {b.appointmentTime}</div>
                        <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                          {b.customerName} ({b.customerPhone}) · {b.vehicleBrand} {b.vehicleModel} ({b.registrationNumber})
                        </h3>
                        <div className="text-xs text-slate-600">{b.packageName} · Assigned Mechanic: <strong>{b.assignedMechanicName || 'Not yet assigned'}</strong></div>
                      </div>
                      <BookingStatusBadge status={b.status} />
                    </div>

                    {!b.assignedMechanicId && ['Accepted', 'Confirmed'].includes(b.status) && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                        <select
                          value={selectedMechByBooking[b.id!] || ''}
                          onChange={(e) => setSelectedMechByBooking((prev) => ({ ...prev, [b.id!]: e.target.value }))}
                          className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                        >
                          <option value="">Select {garage.code} Mechanic</option>
                          {mechanics.filter((m) => m.isActive).map((m) => (
                            <option key={m.uid} value={m.uid}>
                              {m.name} ({m.specialization || 'General'}) {m.isAvailable ? '' : '[Busy]'}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={busyBookingId === b.id}
                          onClick={() => handleAssignMechanic(b)}
                          className="px-3.5 py-1.5 bg-[#0B132B] text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                        >
                          {busyBookingId === b.id ? 'Assigning...' : 'Assign Mechanic & Open Job Card'}
                        </button>
                      </div>
                    )}

                    {b.assignedMechanicId && b.status !== 'Completed' && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={async () => {
                            await advanceWorkshopStage({
                              bookingId: b.id!,
                              jobCardId: jc?.id,
                              newStatus: 'Completed',
                              notes: 'Quality approved and completed by Garage Manager',
                              actorUid: account.uid,
                              actorRole: account.role,
                            });
                            showToast(`Booking ${b.bookingCode} marked Completed.`, 'success');
                          }}
                          className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg"
                        >
                          Mark Service Completed
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInvBookingId(b.id!);
                            setInvDesc(`${b.packageName} — ${b.vehicleBrand} ${b.vehicleModel}`);
                            setInvLabour(jc?.labourCharges || b.estimatedPrice);
                            setInvParts(jc?.partsCharges || 0);
                            setTab('invoices');
                          }}
                          className="px-3.5 py-1.5 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg"
                        >
                          Generate Invoice
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* REJECTED / RESCHEDULED */}
          {tab === 'rejected' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="text-lg font-bold text-[#0B132B]">Rejected Bookings</h2>
              {bookings.filter((b) => b.status === 'Rejected').length === 0 ? (
                <p className="text-xs text-slate-500">No rejected bookings at {garage.code}.</p>
              ) : (
                bookings
                  .filter((b) => b.status === 'Rejected')
                  .map((b) => (
                    <div key={b.id} className="p-4 border border-red-200 bg-red-50/40 rounded-lg text-xs">
                      <div className="font-bold text-slate-900">{b.bookingCode} · {b.customerName} · {b.appointmentDate}</div>
                      <div className="text-red-800 mt-1">Reason: {b.rejectionReason}</div>
                    </div>
                  ))
              )}
            </div>
          )}

          {tab === 'reschedules' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="text-lg font-bold text-[#0B132B]">Reschedule Requests</h2>
              {bookings.filter((b) => b.status === 'Reschedule Requested').length === 0 ? (
                <p className="text-xs text-slate-500">No pending reschedule suggestions.</p>
              ) : (
                bookings
                  .filter((b) => b.status === 'Reschedule Requested')
                  .map((b) => (
                    <div key={b.id} className="p-4 border border-amber-200 bg-amber-50/40 rounded-lg text-xs">
                      <div className="font-bold text-slate-900">{b.bookingCode} · {b.customerName}</div>
                      <div className="text-amber-900 mt-1">
                        Suggested: {b.rescheduleSuggestedDate} at {b.rescheduleSuggestedTime} ({b.rescheduleNote || 'No note'})
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}

          {/* MECHANICS */}
          {tab === 'mechanics' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">Mechanics at {garage.name}</h2>
              {mechanics.length === 0 ? (
                <p className="text-xs text-slate-500">No mechanics assigned to {garage.code} yet. Super Admin can authorize mechanics under Mechanic Management.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mechanics.map((m) => (
                    <div key={m.uid} className="p-4 border border-slate-200 rounded-xl text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="font-bold text-sm text-slate-900">{m.name}</span>
                        <span className={m.isAvailable ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                          {m.isAvailable ? 'Available' : 'Busy'}
                        </span>
                      </div>
                      <div className="text-slate-600">{m.email} · {m.phone || 'No phone'}</div>
                      <div className="text-slate-500">Specialization: {m.specialization || 'General'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SERVICES & PACKAGES */}
          {tab === 'services' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await saveServiceCategory({
                      garageId: garage.garageId,
                      garageManagerId: garage.managerUid || '',
                      name: catName,
                      vehicleType: catVType,
                      description: '',
                      isActive: true,
                    });
                    setCatName('');
                    showToast('Service category saved.', 'success');
                  }}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                >
                  <h3 className="text-sm font-bold text-[#0B132B]">Add Service Category ({garage.code})</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <input required value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Category name" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                    <select value={catVType} onChange={(e) => setCatVType(e.target.value as VehicleType)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg">
                      <option value="Car">Car</option>
                      <option value="Bike">Bike</option>
                    </select>
                  </div>
                  <button type="submit" className="px-4 py-2 bg-[#0B132B] text-white text-xs font-semibold rounded-lg">Save Category</button>
                </form>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const cat = categories.find((c) => c.id === pkgCatId) || categories.find((c) => c.vehicleType === pkgVType);
                    if (!cat) {
                      showToast('Create a category first.', 'error');
                      return;
                    }
                    await saveServicePackage({
                      garageId: garage.garageId,
                      garageManagerId: garage.managerUid || '',
                      categoryId: cat.id!,
                      categoryName: cat.name,
                      name: pkgName,
                      vehicleType: pkgVType,
                      includedServices: pkgServicesText.split(',').map((s) => s.trim()).filter(Boolean),
                      labourCharge: pkgLabour,
                      partsEstimate: pkgParts,
                      startingPrice: pkgLabour + pkgParts,
                      estimatedDurationMins: pkgDuration,
                      isDemoEstimate: false,
                      isActive: true,
                    });
                    setPkgName('');
                    showToast('Service package added.', 'success');
                  }}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                >
                  <h3 className="text-sm font-bold text-[#0B132B]">Add Service Package ({garage.code})</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <input required value={pkgName} onChange={(e) => setPkgName(e.target.value)} placeholder="Package name" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                    <select value={pkgVType} onChange={(e) => setPkgVType(e.target.value as VehicleType)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg">
                      <option value="Car">Car</option>
                      <option value="Bike">Bike</option>
                    </select>
                    <select value={pkgCatId} onChange={(e) => setPkgCatId(e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg col-span-2">
                      <option value="">Select Category</option>
                      {categories.filter((c) => c.vehicleType === pkgVType).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <input type="number" min={0} value={pkgLabour} onChange={(e) => setPkgLabour(Number(e.target.value))} placeholder="Labour ₹" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                    <input type="number" min={0} value={pkgParts} onChange={(e) => setPkgParts(Number(e.target.value))} placeholder="Parts Est ₹" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  </div>
                  <input value={pkgServicesText} onChange={(e) => setPkgServicesText(e.target.value)} placeholder="Included services (comma-separated)" className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <button type="submit" className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg">Create Package</button>
                </form>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <h3 className="text-base font-bold text-slate-900">Active Packages at {garage.code} ({packages.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {packages.map((p) => (
                    <div key={p.id} className="p-4 border border-slate-200 rounded-xl text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="font-semibold text-red-600">{p.vehicleType} · {p.categoryName}</span>
                        <span className="font-mono font-bold text-[#0B132B] tabular-nums">{formatINR(p.startingPrice)}</span>
                      </div>
                      <div className="font-bold text-sm text-slate-900">{p.name}</div>
                      <div className="text-slate-500 tabular-nums">Labour {formatINR(p.labourCharge)} + Parts {formatINR(p.partsEstimate)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* APPOINTMENT SLOTS */}
          {tab === 'slots' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-[#0B132B]">Independent Slot Calendar — {garage.code}</h2>
                  <p className="text-xs text-slate-500">Configure bay capacity or block breaks/holidays per time slot.</p>
                </div>
                <div className="flex items-center gap-3">
                  <input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg" />
                  <input type="number" min={1} max={50} value={slotCapacityInput} onChange={(e) => setSlotCapacityInput(Number(e.target.value))} className="w-20 px-3 py-1.5 text-xs border border-slate-300 rounded-lg" title="Slot Capacity" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {DEFAULT_TIME_SLOTS.map((ts) => {
                  const found = slots.find((s) => s.date === slotDate && s.timeSlot === ts);
                  const cap = found ? found.capacity : slotCapacityInput;
                  const booked = found ? found.bookedCount : 0;
                  const blocked = found ? found.isBlocked : false;
                  return (
                    <div key={ts} className="p-4 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-sm text-[#0B132B] tabular-nums">{ts}</span>
                        <span className={`text-xs font-semibold ${blocked ? 'text-red-600' : 'text-emerald-700'}`}>
                          {blocked ? 'Blocked' : 'Open'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 tabular-nums">Booked: {booked} / {cap}</div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await upsertAppointmentSlot({
                              garageId: garage.garageId,
                              garageManagerId: garage.managerUid || '',
                              date: slotDate,
                              timeSlot: ts,
                              capacity: slotCapacityInput,
                              bookedCount: booked,
                              isBlocked: !blocked,
                              note: !blocked ? 'Blocked by manager' : '',
                            });
                            showToast(`Slot ${ts} ${!blocked ? 'blocked' : 'opened'}.`, 'info');
                          }}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                            blocked ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                          }`}
                        >
                          {blocked ? 'Unblock Slot' : 'Block / Holiday'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* JOB CARDS & INSPECTIONS */}
          {tab === 'job-cards' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">Job Cards &amp; Inspections — {garage.code}</h2>
              {jobCards.map((jc) => {
                const ins = inspections.find((i) => i.jobCardId === jc.id);
                return (
                  <div key={jc.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-[#0B132B]">{jc.jobCardCode}</span>
                        <h3 className="text-sm font-bold text-slate-900">{jc.vehicleSummary}</h3>
                        <div className="text-xs text-slate-500">Mechanic: {jc.assignedMechanicName} · Labour {formatINR(jc.labourCharges)} · Parts {formatINR(jc.partsCharges)}</div>
                      </div>
                      <BookingStatusBadge status={jc.status} />
                    </div>
                    {ins && (
                      <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-2">
                        <div><strong>Inspection Notes:</strong> {ins.notes}</div>
                        <div className="flex items-center justify-between">
                          <span>Manager Approval: <strong>{ins.managerApproved ? 'Approved' : 'Pending Review'}</strong></span>
                          {!ins.managerApproved && (
                            <button
                              type="button"
                              onClick={async () => {
                                await saveInspection({
                                  ...ins,
                                  id: ins.id,
                                  managerApproved: true,
                                });
                                showToast('Inspection approved by manager.', 'success');
                              }}
                              className="px-3 py-1 bg-emerald-600 text-white font-semibold rounded"
                            >
                              Approve Inspection
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* INVENTORY & SPARE PARTS */}
          {tab === 'inventory' && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await saveSparePart({
                    garageId: garage.garageId,
                    garageManagerId: garage.managerUid || '',
                    authorizedMechanicIds: mechanics.map((m) => m.uid),
                    name: partName,
                    sku: partSku,
                    category: partCat,
                    brand: partBrand || 'OEM',
                    purchasePrice: partBuy,
                    sellingPrice: partSell,
                    quantity: partQty,
                    minStockLevel: partMin,
                    supplier: partSupplier,
                    isActive: true,
                  });
                  setPartName('');
                  setPartSku('');
                  showToast('Spare part saved to garage inventory.', 'success');
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <h2 className="text-base font-bold text-[#0B132B]">Add Spare Part — {garage.code}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <input required value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="Part name" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input required value={partSku} onChange={(e) => setPartSku(e.target.value)} placeholder="SKU" className="px-3 py-2 text-xs border border-slate-300 rounded-lg uppercase" />
                  <input required value={partCat} onChange={(e) => setPartCat(e.target.value)} placeholder="Category" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input required value={partBrand} onChange={(e) => setPartBrand(e.target.value)} placeholder="Brand" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input type="number" min={0} value={partBuy} onChange={(e) => setPartBuy(Number(e.target.value))} placeholder="Purchase ₹" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input type="number" min={0} value={partSell} onChange={(e) => setPartSell(Number(e.target.value))} placeholder="Selling ₹" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input type="number" min={0} value={partQty} onChange={(e) => setPartQty(Number(e.target.value))} placeholder="Qty" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input type="number" min={0} value={partMin} onChange={(e) => setPartMin(Number(e.target.value))} placeholder="Min Alert" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                </div>
                <div className="flex gap-2">
                  <input value={partSupplier} onChange={(e) => setPartSupplier(e.target.value)} placeholder="Supplier name" className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <button type="submit" className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg">Add Part</button>
                </div>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-slate-900">Garage Spare Parts ({spareParts.length})</h3>
                  <div className="flex items-center gap-2">
                    <input value={partSearch} onChange={(e) => setPartSearch(e.target.value)} placeholder="Search SKU or name..." className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg" />
                    <button
                      type="button"
                      onClick={() =>
                        downloadCSV(
                          `${garage.code}-inventory.csv`,
                          ['SKU', 'Name', 'Category', 'Brand', 'PurchasePrice', 'SellingPrice', 'Quantity', 'MinStock'],
                          spareParts.map((p) => [p.sku, p.name, p.category, p.brand, p.purchasePrice, p.sellingPrice, p.quantity, p.minStockLevel])
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B132B] text-white text-xs font-semibold rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5" /> CSV
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2 pr-3">SKU</th>
                        <th className="py-2 pr-3">Part</th>
                        <th className="py-2 pr-3">Selling Price</th>
                        <th className="py-2 pr-3">Stock</th>
                        <th className="py-2">Restock / Adjust</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {spareParts
                        .filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(partSearch.toLowerCase()))
                        .map((p) => (
                          <tr key={p.id}>
                            <td className="py-2.5 pr-3 font-mono font-semibold">{p.sku}</td>
                            <td className="py-2.5 pr-3">
                              <div className="font-semibold text-slate-900">{p.name}</div>
                              <div className="text-slate-500">{p.brand} · {p.category}</div>
                            </td>
                            <td className="py-2.5 pr-3 tabular-nums">{formatINR(p.sellingPrice)}</td>
                            <td className="py-2.5 pr-3 tabular-nums">
                              <span className={`font-bold ${p.quantity === 0 ? 'text-red-700' : p.quantity <= p.minStockLevel ? 'text-amber-700' : 'text-emerald-700'}`}>
                                {p.quantity}
                              </span>
                              {p.quantity <= p.minStockLevel && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-amber-700">
                                  <AlertTriangle className="w-3 h-3" /> Low
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 flex gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  await adjustSparePartStock({
                                    partId: p.id!,
                                    delta: 5,
                                    type: 'purchase',
                                    notes: 'Stock purchase (+5)',
                                    actorUid: account.uid,
                                  });
                                  showToast(`Added +5 units to ${p.name}.`, 'success');
                                }}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded font-semibold"
                              >
                                +5 Purchase
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await saveSparePart({
                                    ...p,
                                    authorizedMechanicIds: mechanics.map((m) => m.uid),
                                  });
                                  showToast('Mechanics authorized on this part.', 'success');
                                }}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded"
                              >
                                Sync Mechanics
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {inventoryLogs.length > 0 && (
                  <div className="pt-3 border-t border-slate-200">
                    <div className="text-xs font-bold text-slate-700 mb-2">Recent Stock Movements</div>
                    <div className="space-y-1 text-xs text-slate-600">
                      {inventoryLogs.slice(0, 6).map((l) => (
                        <div key={l.id} className="flex justify-between">
                          <span>[{l.type}] {l.partName} ({l.quantityDelta > 0 ? `+${l.quantityDelta}` : l.quantityDelta}) → {l.newQty}</span>
                          <span className="text-slate-400">{l.notes}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BILLING & INVOICES */}
          {tab === 'invoices' && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const bk = bookings.find((b) => b.id === invBookingId);
                  if (!bk) {
                    showToast('Select a booking to invoice.', 'error');
                    return;
                  }
                  const jc = jobCards.find((j) => j.bookingId === bk.id);
                  await generateInvoice({
                    booking: bk,
                    jobCard: jc,
                    garage,
                    serviceDescription: invDesc || bk.packageName,
                    labourCharges: invLabour,
                    partsCharges: invParts,
                    discount: invDiscount,
                    taxRate: invTaxRate,
                    actorUid: account.uid,
                    actorRole: account.role,
                  });
                  showToast('Invoice generated and sent to customer.', 'success');
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <h2 className="text-base font-bold text-[#0B132B]">Generate Garage Invoice ({garage.code})</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select required value={invBookingId} onChange={(e) => setInvBookingId(e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg">
                    <option value="">Select Accepted / Completed Booking</option>
                    {acceptedBookingsList.map((b) => (
                      <option key={b.id} value={b.id}>{b.bookingCode} · {b.customerName} · {b.vehicleBrand} {b.vehicleModel}</option>
                    ))}
                  </select>
                  <input value={invDesc} onChange={(e) => setInvDesc(e.target.value)} placeholder="Service description" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input type="number" min={0} value={invLabour} onChange={(e) => setInvLabour(Number(e.target.value))} placeholder="Labour ₹" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input type="number" min={0} value={invParts} onChange={(e) => setInvParts(Number(e.target.value))} placeholder="Parts ₹" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input type="number" min={0} value={invDiscount} onChange={(e) => setInvDiscount(Number(e.target.value))} placeholder="Discount ₹" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input type="number" min={0} max={50} value={invTaxRate} onChange={(e) => setInvTaxRate(Number(e.target.value))} placeholder="GST %" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                </div>
                <button type="submit" className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg">Generate Invoice</button>
              </form>

              <div className="space-y-3">
                {invoices.map((inv) => (
                  <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                    <div>
                      <div className="font-mono font-bold text-[#0B132B]">{inv.invoiceNumber} · {inv.customerName}</div>
                      <div className="text-slate-500">{inv.vehicleSummary} · Total <strong className="tabular-nums">{formatINR(inv.finalTotal)}</strong> · Paid <strong className="tabular-nums">{formatINR(inv.paidAmount)}</strong></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <PaymentStatusBadge status={inv.paymentStatus} />
                      <button type="button" onClick={() => downloadInvoicePDF(inv)} className="px-3 py-1.5 bg-[#0B132B] text-white font-semibold rounded-lg inline-flex items-center gap-1">
                        <Download className="w-3.5 h-3.5" /> PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PAYMENTS */}
          {tab === 'payments' && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await recordVerifiedPayment({
                      invoiceId: payInvoiceId,
                      amount: payAmount,
                      method: payMethod,
                      referenceNote: payRef,
                      actorUid: account.uid,
                      actorRole: account.role,
                    });
                    setPayAmount(0);
                    setPayRef('');
                    showToast('Payment verified and recorded.', 'success');
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : 'Payment recording failed.', 'error');
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 max-w-2xl"
              >
                <h2 className="text-base font-bold text-[#0B132B]">Record Verified Manual Payment</h2>
                <select required value={payInvoiceId} onChange={(e) => setPayInvoiceId(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg">
                  <option value="">Select Unpaid / Partially Paid Invoice</option>
                  {invoices.filter((i) => i.paymentStatus !== 'Paid').map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.invoiceNumber} · {i.customerName} · Balance Due: {formatINR(Math.max(0, i.finalTotal - i.paidAmount))}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" min={1} required value={payAmount || ''} onChange={(e) => setPayAmount(Number(e.target.value))} placeholder="Amount ₹" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg">
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card (Manual)">Card (Manual)</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Transaction / Receipt Reference" className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg">Verify &amp; Record Payment</button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                <h3 className="text-sm font-bold text-slate-900">Verified Payments ({payments.length})</h3>
                {payments.map((p) => (
                  <div key={p.id} className="py-2 border-b border-slate-100 flex justify-between text-xs">
                    <span><strong>{p.invoiceNumber}</strong> · {p.method} · {p.referenceNote || '—'}</span>
                    <span className="font-bold tabular-nums">{formatINR(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EXPENSES & REVENUE */}
          {tab === 'financials' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  ['Verified Revenue', formatINR(kpis.totalRevenue)],
                  ['Total Expenses', formatINR(kpis.totalExpenses)],
                  ['Gross Profit', formatINR(kpis.grossProfit)],
                  ['Outstanding Dues', formatINR(kpis.pendingPayments)],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="text-xl font-bold text-[#0B132B] tabular-nums mt-1">{val}</div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await recordExpense({
                    garageId: garage.garageId,
                    garageManagerId: garage.managerUid || '',
                    category: expCategory,
                    description: expDesc,
                    amount: expAmount,
                    expenseDate: expDate,
                    recordedBy: account.uid,
                  });
                  setExpDesc('');
                  setExpAmount(0);
                  showToast('Expense recorded.', 'success');
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 max-w-2xl"
              >
                <h2 className="text-base font-bold text-[#0B132B]">Record Garage Expense ({garage.code})</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select value={expCategory} onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg">
                    {['Spare Parts Purchases', 'Mechanic Salaries', 'Rent', 'Electricity', 'Equipment', 'Maintenance', 'Other'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input type="number" min={1} required value={expAmount || ''} onChange={(e) => setExpAmount(Number(e.target.value))} placeholder="Amount ₹" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input type="date" required value={expDate} onChange={(e) => setExpDate(e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                </div>
                <input required value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Expense description" className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                <button type="submit" className="px-4 py-2 bg-[#0B132B] text-white text-xs font-semibold rounded-lg">Record Expense</button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                <h3 className="text-sm font-bold text-slate-900">Recorded Expenses ({expenses.length})</h3>
                {expenses.map((ex) => (
                  <div key={ex.id} className="py-2 border-b border-slate-100 flex justify-between text-xs">
                    <span><strong>{ex.category}</strong> · {ex.description} ({ex.expenseDate})</span>
                    <span className="font-bold text-red-700 tabular-nums">{formatINR(ex.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUPPORT TICKETS */}
          {tab === 'tickets' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">Garage Support Tickets — {garage.code}</h2>
              {tickets.map((t) => {
                const notesForTicket = internalNotes.filter((n) => n.ticketId === t.id);
                return (
                  <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
                    <div className="flex justify-between">
                      <span className="font-mono font-bold text-[#0B132B]">{t.ticketCode} · {t.customerName} · {t.priority}</span>
                      <span className="font-semibold">{t.status}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{t.subject}</h3>
                    <p className="text-slate-600">{t.message}</p>
                    <div className="flex gap-2">
                      <input
                        value={ticketReply[t.id!] || ''}
                        onChange={(e) => setTicketReply((p) => ({ ...p, [t.id!]: e.target.value }))}
                        placeholder="Public reply to customer..."
                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const msg = (ticketReply[t.id!] || '').trim();
                          if (!msg) return;
                          await replyToSupportTicket(
                            t.id!,
                            t,
                            {
                              authorId: account.uid,
                              authorName: account.displayName,
                              authorRole: account.role,
                              message: msg,
                              timestamp: new Date().toISOString(),
                            },
                            'In Progress'
                          );
                          setTicketReply((p) => ({ ...p, [t.id!]: '' }));
                        }}
                        className="px-3 py-1.5 bg-[#0B132B] text-white font-semibold rounded-lg"
                      >
                        Reply
                      </button>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                      <div className="font-semibold text-slate-700">Private Staff Internal Notes (Hidden from Customer)</div>
                      {notesForTicket.map((n) => (
                        <div key={n.id} className="text-slate-600">• {n.note}</div>
                      ))}
                      <div className="flex gap-2">
                        <input
                          value={internalNoteText[t.id!] || ''}
                          onChange={(e) => setInternalNoteText((p) => ({ ...p, [t.id!]: e.target.value }))}
                          placeholder="Add private internal note..."
                          className="flex-1 px-2.5 py-1 border border-slate-300 rounded bg-white"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const txt = (internalNoteText[t.id!] || '').trim();
                            if (!txt) return;
                            await addSupportInternalNote({
                              ticketId: t.id!,
                              garageId: garage.garageId,
                              garageManagerId: garage.managerUid,
                              authorId: account.uid,
                              note: txt,
                            });
                            setInternalNoteText((p) => ({ ...p, [t.id!]: '' }));
                          }}
                          className="px-3 py-1 bg-slate-700 text-white font-semibold rounded"
                        >
                          Save Note
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* NOTIFICATIONS */}
          {tab === 'notifications' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="text-lg font-bold text-[#0B132B]">Garage Manager Notifications</h2>
              {notifications.map((n) => (
                <div key={n.id} className="p-3 border border-slate-200 rounded-lg flex justify-between items-start gap-3 text-xs">
                  <div>
                    <div className="font-bold text-slate-900">{n.title}</div>
                    <div className="text-slate-600">{n.message}</div>
                  </div>
                  {!n.isRead && n.id && (
                    <button type="button" onClick={() => markNotificationRead(n.id!)} className="text-[#0B132B] font-semibold">
                      Mark read
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* GARAGE SETTINGS */}
          {tab === 'settings' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await updateGarage(
                  garage.garageId,
                  {
                    operatingHours: setHours,
                    dailyCapacity: Number(setCap),
                    slotDurationMins: Number(setDur),
                    phone: setPhone,
                    email: setEmail,
                    address: setAddress,
                  },
                  { uid: account.uid, role: account.role, email: account.email }
                );
                showToast('Garage settings updated.', 'success');
              }}
              className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-4"
            >
              <h2 className="text-lg font-bold text-[#0B132B]">Garage Settings — {garage.name}</h2>
              <div className="h-44 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                <GarageImage
                  garageId={garage.garageId}
                  photoUrl={garage.photoUrl}
                  alt={garage.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Operating Hours</label>
                  <input value={setHours} onChange={(e) => setSetHours(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Daily Capacity</label>
                  <input type="number" min={1} max={100} value={setCap} onChange={(e) => setSetCap(Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Slot Duration (mins)</label>
                  <input type="number" min={15} max={240} value={setDur} onChange={(e) => setSetDur(Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Desk Phone</label>
                  <input value={setPhone} onChange={(e) => setSetPhone(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Desk Email</label>
                  <input value={setEmail} onChange={(e) => setSetEmail(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
                  <input value={setAddress} onChange={(e) => setSetAddress(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
              </div>
              <button type="submit" className="px-5 py-2.5 bg-[#0B132B] text-white text-xs font-semibold rounded-lg">Save Garage Settings</button>
            </form>
          )}
        </main>
      </div>

      {/* Reject Booking Dialog */}
      {rejectModalBooking && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <form onSubmit={handleRejectSubmit} className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Reject Booking {rejectModalBooking.bookingCode}</h3>
            <p className="text-xs text-slate-600">
              A rejection reason is mandatory and will be shown directly to {rejectModalBooking.customerName}. The reserved appointment slot will be released.
            </p>
            <textarea
              required
              minLength={3}
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Hydraulic bay maintenance during requested time..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRejectModalBooking(null)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">
                Cancel
              </button>
              <button type="submit" disabled={Boolean(busyBookingId)} className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {busyBookingId ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reschedule Dialog */}
      {rescheduleModalBooking && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <form onSubmit={handleRescheduleSubmit} className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Suggest Reschedule — {rescheduleModalBooking.bookingCode}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Suggested Date</label>
                <input type="date" min={getTodayISO()} required value={reschedDate} onChange={(e) => setReschedDate(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Suggested Time</label>
                <select value={reschedTime} onChange={(e) => setReschedTime(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg">
                  {DEFAULT_TIME_SLOTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <textarea rows={2} value={reschedNote} onChange={(e) => setReschedNote(e.target.value)} placeholder="Optional note to customer..." className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRescheduleModalBooking(null)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B132B] text-white rounded-lg">Send Suggestion</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
