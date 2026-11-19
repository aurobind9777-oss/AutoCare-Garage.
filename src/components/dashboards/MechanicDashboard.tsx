import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Wrench,
  Calendar,
  ClipboardCheck,
  Package,
  Activity,
  History,
  User,
  LogOut,
  Globe,
  Menu,
  X,
  Plus,
  CheckCircle2,
} from 'lucide-react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  adjustSparePartStock,
  advanceWorkshopStage,
  saveInspection,
  toggleMechanicAvailability,
} from '../../services/firestoreService';
import { formatDateTime, formatINR, getTodayISO } from '../../utils/exportHelpers';
import { BookingStatusBadge } from '../common/StatusBadge';
import { GarageImage } from '../common/GarageImage';
import { useToast } from '../common/ToastProvider';
import { useAuth } from '../../context/AuthContext';
import type {
  Booking,
  BookingStatus,
  ChecklistItem,
  Garage,
  GarageMechanic,
  Inspection,
  JobCard,
  MechanicUpdate,
  PartUsageItem,
  SparePart,
  UserAccount,
} from '../../types/autocare';

type MechanicTab =
  | 'overview'
  | 'jobs'
  | 'today'
  | 'inspection'
  | 'parts'
  | 'progress'
  | 'history'
  | 'profile';

interface MechanicDashboardProps {
  account: UserAccount;
  garages: Garage[];
  onGoPublic: () => void;
}

const MECHANIC_ALLOWED_STAGES: BookingStatus[] = [
  'Vehicle Received',
  'Inspection',
  'Estimate Prepared',
  'Awaiting Customer Approval',
  'Work In Progress',
  'Waiting for Parts',
  'Quality Check',
  'Ready for Pickup',
];

export function MechanicDashboard({ account, garages, onGoPublic }: MechanicDashboardProps) {
  const { showToast } = useToast();
  const { logout } = useAuth();

  const [tab, setTab] = useState<MechanicTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [mechanicProfile, setMechanicProfile] = useState<GarageMechanic | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [updates, setUpdates] = useState<MechanicUpdate[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);

  // Inspection & progress workspace state
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [insNotes, setInsNotes] = useState('');
  const [recommendedWork, setRecommendedWork] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    { item: 'Engine Oil & Leaks', condition: 'OK', note: '' },
    { item: 'Brake Pads & Fluid', condition: 'OK', note: '' },
    { item: 'Battery & Electricals', condition: 'OK', note: '' },
    { item: 'Tyres & Suspension', condition: 'OK', note: '' },
  ]);

  // Part usage state
  const [selectedPartId, setSelectedPartId] = useState('');
  const [partQty, setPartQty] = useState(1);

  // Progress update state
  const [nextStage, setNextStage] = useState<BookingStatus>('Work In Progress');
  const [progressNote, setProgressNote] = useState('');
  const [labourNotes, setLabourNotes] = useState('');

  const myGarage = useMemo(
    () => garages.find((g) => g.garageId === account.garageId) || null,
    [garages, account.garageId]
  );

  useEffect(() => {
    const uid = account.uid;

    const unsubMech = onSnapshot(
      doc(db, 'garage_mechanics', uid),
      (snap) => {
        if (snap.exists()) setMechanicProfile(snap.data() as GarageMechanic);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `garage_mechanics/${uid}`)
    );

    const unsubBk = onSnapshot(
      query(collection(db, 'bookings'), where('assignedMechanicId', '==', uid)),
      (snap) => setBookings(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Booking) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'bookings')
    );

    const unsubJc = onSnapshot(
      query(collection(db, 'job_cards'), where('assignedMechanicId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as JobCard) }));
        setJobCards(list);
        if (!selectedJobId && list.length > 0 && list[0].id) {
          setSelectedJobId(list[0].id);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'job_cards')
    );

    const unsubIns = onSnapshot(
      query(collection(db, 'inspections'), where('assignedMechanicId', '==', uid)),
      (snap) => setInspections(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Inspection) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'inspections')
    );

    const unsubUpd = onSnapshot(
      query(collection(db, 'mechanic_updates'), where('assignedMechanicId', '==', uid)),
      (snap) => setUpdates(snap.docs.map((d) => ({ id: d.id, ...(d.data() as MechanicUpdate) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'mechanic_updates')
    );

    const unsubParts = onSnapshot(
      query(collection(db, 'spare_parts'), where('authorizedMechanicIds', 'array-contains', uid)),
      (snap) => setSpareParts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as SparePart) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'spare_parts')
    );

    return () => {
      unsubMech();
      unsubBk();
      unsubJc();
      unsubIns();
      unsubUpd();
      unsubParts();
    };
  }, [account.uid, selectedJobId]);

  const activeJob = useMemo(() => jobCards.find((j) => j.id === selectedJobId) || jobCards[0] || null, [jobCards, selectedJobId]);
  const activeBooking = useMemo(
    () => (activeJob ? bookings.find((b) => b.id === activeJob.bookingId) || null : null),
    [bookings, activeJob]
  );

  const kpis = useMemo(() => {
    const today = getTodayISO();
    return {
      assigned: jobCards.length,
      today: bookings.filter((b) => b.appointmentDate === today).length,
      pendingInspection: bookings.filter((b) => ['Mechanic Assigned', 'Vehicle Received', 'Inspection'].includes(b.status)).length,
      inProgress: bookings.filter((b) => ['Work In Progress', 'Quality Check'].includes(b.status)).length,
      completed: bookings.filter((b) => ['Ready for Pickup', 'Completed'].includes(b.status)).length,
      waitingParts: bookings.filter((b) => b.status === 'Waiting for Parts').length,
    };
  }, [bookings, jobCards]);

  const handleSaveInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJob || !activeBooking) return;
    try {
      const existingIns = inspections.find((i) => i.jobCardId === activeJob.id);
      await saveInspection({
        id: existingIns?.id,
        jobCardId: activeJob.id!,
        bookingId: activeBooking.id!,
        garageId: activeJob.garageId,
        garageManagerId: activeJob.garageManagerId,
        assignedMechanicId: account.uid,
        customerId: activeJob.customerId,
        notes: insNotes,
        checklist,
        submittedForApproval: true,
        managerApproved: existingIns?.managerApproved || false,
      });

      await advanceWorkshopStage({
        bookingId: activeBooking.id!,
        jobCardId: activeJob.id!,
        newStatus: recommendedWork.trim() ? 'Awaiting Customer Approval' : 'Inspection',
        notes: `Inspection logged: ${insNotes.slice(0, 140)}`,
        inspectionResults: insNotes,
        recommendedWork,
        actorUid: account.uid,
        actorRole: 'mechanic',
      });
      showToast('Inspection saved and submitted.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save inspection.', 'error');
    }
  };

  const handleLogSparePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJob || !activeBooking || !selectedPartId) return;
    try {
      const { part } = await adjustSparePartStock({
        partId: selectedPartId,
        delta: -Math.abs(partQty),
        type: 'usage',
        notes: `Used on Job Card ${activeJob.jobCardCode} (${activeBooking.bookingCode})`,
        actorUid: account.uid,
        bookingId: activeBooking.id,
      });

      const usedItem: PartUsageItem = {
        partId: selectedPartId,
        partName: part.name,
        quantity: partQty,
        unitPrice: part.sellingPrice,
      };

      await advanceWorkshopStage({
        bookingId: activeBooking.id!,
        jobCardId: activeJob.id!,
        newStatus: 'Work In Progress',
        notes: `Used ${partQty}x ${part.name}`,
        partsUsed: [usedItem],
        actorUid: account.uid,
        actorRole: 'mechanic',
      });

      showToast(`Logged ${partQty}x ${part.name} (inventory updated safely).`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to log spare part.', 'error');
    }
  };

  const handleUpdateProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJob || !activeBooking) return;
    try {
      await advanceWorkshopStage({
        bookingId: activeBooking.id!,
        jobCardId: activeJob.id!,
        newStatus: nextStage,
        notes: progressNote || `Progress updated to ${nextStage}`,
        labourNotes,
        actorUid: account.uid,
        actorRole: 'mechanic',
      });
      setProgressNote('');
      showToast(`Job moved to ${nextStage}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update progress.', 'error');
    }
  };

  const navItems: Array<{ id: MechanicTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'jobs', label: 'My Assigned Jobs', icon: Wrench },
    { id: 'today', label: "Today's Schedule", icon: Calendar },
    { id: 'inspection', label: 'Vehicle Inspection', icon: ClipboardCheck },
    { id: 'parts', label: 'Spare Parts Used', icon: Package },
    { id: 'progress', label: 'Work Progress', icon: Activity },
    { id: 'history', label: 'Service History', icon: History },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0B132B] text-white flex flex-col transition-transform lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-base font-extrabold tracking-tight font-display">AutoCare Mechanic</div>
            <div className="text-[11px] text-slate-400 truncate">{myGarage ? `${myGarage.code} · ${myGarage.name}` : account.garageId}</div>
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
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === item.id ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
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
              {myGarage?.code || account.garageId} Mechanic / {navItems.find((n) => n.id === tab)?.label}
            </div>
          </div>
          {jobCards.length > 0 && (
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white max-w-xs"
            >
              {jobCards.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.jobCardCode} · {j.vehicleSummary}
                </option>
              ))}
            </select>
          )}
        </header>

        <main className="p-4 sm:p-6 max-w-6xl w-full mx-auto space-y-6">
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col sm:flex-row">
                <div className="sm:w-52 h-36 sm:h-auto shrink-0 bg-slate-100">
                  <GarageImage
                    garageId={myGarage?.garageId || account.garageId}
                    photoUrl={myGarage?.photoUrl}
                    alt={myGarage?.name || account.garageId || 'Assigned Garage'}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-5 flex flex-col justify-center">
                  <div className="text-[11px] font-mono font-bold text-red-600 uppercase">
                    {myGarage ? `${myGarage.code} · ${myGarage.city}` : account.garageId}
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold text-[#0B132B] mt-0.5">
                    Mechanic Workbench — {mechanicProfile?.name || account.displayName}
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Scoped strictly to jobs assigned to you at {myGarage?.name || account.garageId}.
                    {myGarage?.operatingHours ? ` · ${myGarage.operatingHours}` : ''}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  ['Assigned Jobs', kpis.assigned],
                  ["Today's Slots", kpis.today],
                  ['Pending Inspection', kpis.pendingInspection],
                  ['Work In Progress', kpis.inProgress],
                  ['Waiting for Parts', kpis.waitingParts],
                  ['Completed / Ready', kpis.completed],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[11px] text-slate-500">{label}</div>
                    <div className="text-xl font-bold text-[#0B132B] tabular-nums mt-1">{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(tab === 'jobs' || tab === 'today' || tab === 'overview') && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                {tab === 'today' ? "Today's Assigned Appointments" : 'Assigned Job Cards'}
              </h2>
              {jobCards.length === 0 ? (
                <p className="text-xs text-slate-500">No job cards assigned to you yet.</p>
              ) : (
                <div className="space-y-3">
                  {jobCards
                    .filter((jc) => {
                      if (tab !== 'today') return true;
                      const b = bookings.find((x) => x.id === jc.bookingId);
                      return b?.appointmentDate === getTodayISO();
                    })
                    .map((jc) => {
                      const b = bookings.find((x) => x.id === jc.bookingId);
                      return (
                        <div key={jc.id} className="p-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-mono font-bold text-[#0B132B]">{jc.jobCardCode}</span>
                              {b && <span className="text-slate-500">· {b.bookingCode} · {b.appointmentDate} {b.appointmentTime}</span>}
                            </div>
                            <div className="text-sm font-bold text-slate-900 mt-1">{jc.vehicleSummary}</div>
                            <div className="text-xs text-slate-600 mt-0.5">Complaint: {jc.customerComplaint || '—'}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <BookingStatusBadge status={jc.status} />
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedJobId(jc.id!);
                                setTab('inspection');
                              }}
                              className="px-3 py-1.5 bg-[#0B132B] text-white text-xs font-semibold rounded-lg"
                            >
                              Open Job
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {tab === 'inspection' && activeJob && activeBooking && (
            <form onSubmit={handleSaveInspection} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-[#0B132B]">
                Vehicle Inspection — {activeJob.jobCardCode} ({activeJob.vehicleSummary})
              </h2>
              <div className="space-y-2">
                {checklist.map((c, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2.5 border border-slate-200 rounded-lg">
                    <input
                      value={c.item}
                      onChange={(e) => {
                        const copy = [...checklist];
                        copy[idx].item = e.target.value;
                        setChecklist(copy);
                      }}
                      className="sm:col-span-5 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                    />
                    <select
                      value={c.condition}
                      onChange={(e) => {
                        const copy = [...checklist];
                        copy[idx].condition = e.target.value as ChecklistItem['condition'];
                        setChecklist(copy);
                      }}
                      className="sm:col-span-3 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                    >
                      <option value="OK">OK</option>
                      <option value="Needs Attention">Needs Attention</option>
                      <option value="Critical">Critical</option>
                    </select>
                    <input
                      value={c.note || ''}
                      onChange={(e) => {
                        const copy = [...checklist];
                        copy[idx].note = e.target.value;
                        setChecklist(copy);
                      }}
                      placeholder="Condition note"
                      className="sm:col-span-4 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setChecklist((prev) => [...prev, { item: 'Additional Check', condition: 'OK', note: '' }])}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B132B]"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Checklist Item
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Inspection Notes</label>
                <textarea required rows={3} value={insNotes} onChange={(e) => setInsNotes(e.target.value)} placeholder="Detailed diagnostic findings..." className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Recommended Extra Repairs (Requires Customer Approval)</label>
                <textarea rows={2} value={recommendedWork} onChange={(e) => setRecommendedWork(e.target.value)} placeholder="Leave blank if no additional repairs needed" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <button type="submit" className="px-5 py-2.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700">
                Save Inspection &amp; Submit
              </button>
            </form>
          )}

          {tab === 'parts' && activeJob && activeBooking && (
            <form onSubmit={handleLogSparePart} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 max-w-xl">
              <h2 className="text-lg font-bold text-[#0B132B]">Record Spare Parts Used — {activeJob.jobCardCode}</h2>
              <p className="text-xs text-slate-500">Parts are deducted atomically from your garage inventory. Negative stock is blocked.</p>
              {spareParts.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-lg">
                  Ask your Garage Manager to authorize your Mechanic ID on spare parts items before logging usage.
                </p>
              ) : (
                <>
                  <select required value={selectedPartId} onChange={(e) => setSelectedPartId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                    <option value="">Select Spare Part</option>
                    {spareParts.filter((p) => p.isActive && p.quantity > 0).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku}) — Stock: {p.quantity} · {formatINR(p.sellingPrice)}
                      </option>
                    ))}
                  </select>
                  <input type="number" min={1} value={partQty} onChange={(e) => setPartQty(Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                  <button type="submit" className="px-4 py-2 bg-[#0B132B] text-white text-xs font-semibold rounded-lg">
                    Record Part Usage
                  </button>
                </>
              )}
            </form>
          )}

          {tab === 'progress' && activeJob && activeBooking && (
            <div className="space-y-6">
              <form onSubmit={handleUpdateProgress} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 max-w-xl">
                <h2 className="text-lg font-bold text-[#0B132B]">Update Work Progress — {activeJob.jobCardCode}</h2>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Next Workshop Stage</label>
                  <select value={nextStage} onChange={(e) => setNextStage(e.target.value as BookingStatus)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                    {MECHANIC_ALLOWED_STAGES.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Work Progress Notes</label>
                  <textarea required rows={3} value={progressNote} onChange={(e) => setProgressNote(e.target.value)} placeholder="Describe completed repairs or quality check status..." className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Labour Notes</label>
                  <input value={labourNotes} onChange={(e) => setLabourNotes(e.target.value)} placeholder="Hours / technician remarks" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <button type="submit" className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-red-600 text-white text-xs font-semibold rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Submit Update</span>
                </button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Recent Logged Updates</h3>
                {updates.map((u) => (
                  <div key={u.id} className="text-xs border-b border-slate-100 pb-2 flex justify-between gap-4">
                    <div>
                      <span className="font-semibold text-[#0B132B]">{u.status}</span> — {u.notes}
                    </div>
                    <span className="text-slate-400 font-mono shrink-0">{formatDateTime(u.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="text-lg font-bold text-[#0B132B]">Completed Job History</h2>
              {jobCards.filter((j) => ['Ready for Pickup', 'Completed'].includes(j.status)).map((j) => (
                <div key={j.id} className="py-3 border-b border-slate-100 flex justify-between text-xs">
                  <span><strong>{j.jobCardCode}</strong> · {j.vehicleSummary}</span>
                  <BookingStatusBadge status={j.status} />
                </div>
              ))}
            </div>
          )}

          {tab === 'profile' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden max-w-lg">
              <div className="h-40 bg-slate-100">
                <GarageImage
                  garageId={myGarage?.garageId || account.garageId}
                  photoUrl={myGarage?.photoUrl}
                  alt={myGarage?.name || account.garageId || 'Assigned Garage'}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 space-y-4">
                <h2 className="text-lg font-bold text-[#0B132B]">Mechanic Profile</h2>
                <div className="text-xs space-y-1 text-slate-600">
                  <p><strong>Name:</strong> {mechanicProfile?.name || account.displayName}</p>
                  <p><strong>Email:</strong> {account.email}</p>
                  <p><strong>Assigned Garage:</strong> {myGarage?.name || account.garageId}</p>
                  <p><strong>Specialization:</strong> {mechanicProfile?.specialization || 'General Service'}</p>
                </div>
              {mechanicProfile && (
                <button
                  type="button"
                  onClick={() => toggleMechanicAvailability(account.uid, !mechanicProfile.isAvailable)}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg ${
                    mechanicProfile.isAvailable ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  Status: {mechanicProfile.isAvailable ? 'Available for Assignments' : 'Busy / Unavailable'} (Click to Toggle)
                </button>
              )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
