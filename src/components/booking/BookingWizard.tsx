import React, { useState, useEffect, useMemo } from 'react';
import {
  Car,
  Bike,
  MapPin,
  Clock,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Plus,
  AlertCircle,
  Calendar,
  Wrench,
  FileText,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { DEFAULT_TIME_SLOTS } from '../../data/seedCatalog';
import { makeSlotId, saveVehicle, submitGarageBooking } from '../../services/firestoreService';
import { formatINR, getTodayISO } from '../../utils/exportHelpers';
import { useToast } from '../common/ToastProvider';
import type {
  AppointmentSlot,
  CustomerProfile,
  Garage,
  ServiceCategory,
  ServicePackage,
  UserAccount,
  Vehicle,
  VehicleType,
} from '../../types/autocare';

interface BookingWizardProps {
  account: UserAccount;
  customerProfile: CustomerProfile | null;
  garages: Garage[];
  vehicles: Vehicle[];
  categories: ServiceCategory[];
  packages: ServicePackage[];
  initialGarageId?: string;
  onBookingCreated: (bookingId: string, bookingCode: string) => void;
}

export function BookingWizard({
  account,
  customerProfile,
  garages,
  vehicles,
  categories,
  packages,
  initialGarageId,
  onBookingCreated,
}: BookingWizardProps) {
  const { showToast } = useToast();
  const [step, setStep] = useState<number>(1);

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [selectedGarageId, setSelectedGarageId] = useState<string>(initialGarageId || '');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [appointmentDate, setAppointmentDate] = useState<string>(getTodayISO());
  const [appointmentTime, setAppointmentTime] = useState<string>('');
  const [problemDescription, setProblemDescription] = useState<string>('');
  const [photoInput, setPhotoInput] = useState<string>('');
  const [contactPhone, setContactPhone] = useState<string>(customerProfile?.phone || '');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [createdResult, setCreatedResult] = useState<{ bookingId: string; bookingCode: string; garageName: string } | null>(null);

  // Quick add vehicle inline
  const [showAddVehicle, setShowAddVehicle] = useState<boolean>(false);
  const [newVehicleType, setNewVehicleType] = useState<VehicleType>('Car');
  const [newReg, setNewReg] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newFuel, setNewFuel] = useState('Petrol');
  const [newYear, setNewYear] = useState(2022);
  const [newOdo, setNewOdo] = useState(15000);
  const [savingVeh, setSavingVeh] = useState(false);

  // Live slots for selected garage + date
  const [slotsMap, setSlotsMap] = useState<Record<string, AppointmentSlot>>({});

  useEffect(() => {
    if (customerProfile?.phone && !contactPhone) {
      setContactPhone(customerProfile.phone);
    }
  }, [customerProfile, contactPhone]);

  useEffect(() => {
    if (initialGarageId) {
      setSelectedGarageId(initialGarageId);
    }
  }, [initialGarageId]);

  useEffect(() => {
    if (!selectedVehicleId && vehicles.length > 0 && vehicles[0].id) {
      setSelectedVehicleId(vehicles[0].id);
    }
  }, [vehicles, selectedVehicleId]);

  useEffect(() => {
    if (!selectedGarageId || !appointmentDate) return;
    const q = query(
      collection(db, 'appointment_slots'),
      where('garageId', '==', selectedGarageId),
      where('date', '==', appointmentDate)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Record<string, AppointmentSlot> = {};
        snap.forEach((d) => {
          const data = d.data() as AppointmentSlot;
          next[d.id] = { id: d.id, ...data };
        });
        setSlotsMap(next);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'appointment_slots')
    );
    return () => unsub();
  }, [selectedGarageId, appointmentDate]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId]
  );

  const selectedGarage = useMemo(
    () => garages.find((g) => g.garageId === selectedGarageId) || null,
    [garages, selectedGarageId]
  );

  const garageCategories = useMemo(() => {
    if (!selectedGarageId || !selectedVehicle) return [];
    return categories.filter(
      (c) => c.garageId === selectedGarageId && c.vehicleType === selectedVehicle.vehicleType && c.isActive
    );
  }, [categories, selectedGarageId, selectedVehicle]);

  const garagePackages = useMemo(() => {
    if (!selectedGarageId || !selectedVehicle) return [];
    return packages.filter(
      (p) =>
        p.garageId === selectedGarageId &&
        p.vehicleType === selectedVehicle.vehicleType &&
        p.isActive &&
        (!selectedCategoryId || p.categoryId === selectedCategoryId)
    );
  }, [packages, selectedGarageId, selectedVehicle, selectedCategoryId]);

  const selectedCategory = useMemo(
    () => garageCategories.find((c) => c.id === selectedCategoryId) || null,
    [garageCategories, selectedCategoryId]
  );

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === selectedPackageId) || null,
    [packages, selectedPackageId]
  );

  const handleQuickAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingVeh(true);
    try {
      const id = await saveVehicle({
        customerId: account.uid,
        vehicleType: newVehicleType,
        registrationNumber: newReg,
        brand: newBrand,
        model: newModel,
        variant: '',
        fuelType: newFuel,
        year: newYear,
        odometer: newOdo,
        photoUrl: '',
      });
      setSelectedVehicleId(id);
      setShowAddVehicle(false);
      setNewReg('');
      setNewBrand('');
      setNewModel('');
      showToast('Vehicle registered and selected.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save vehicle.', 'error');
    } finally {
      setSavingVeh(false);
    }
  };

  const getSlotAvailability = (timeSlot: string) => {
    if (!selectedGarage) return { available: false, remaining: 0, blocked: true, capacity: 0 };
    const slotId = makeSlotId(selectedGarage.garageId, appointmentDate, timeSlot);
    const existing = slotsMap[slotId];
    const defaultCap = Math.max(2, Math.ceil((selectedGarage.dailyCapacity || 10) / 4));
    if (!existing) {
      return { available: true, remaining: defaultCap, blocked: false, capacity: defaultCap };
    }
    const remaining = Math.max(0, existing.capacity - existing.bookedCount);
    return {
      available: !existing.isBlocked && remaining > 0,
      remaining,
      blocked: existing.isBlocked,
      capacity: existing.capacity,
    };
  };

  const handleSubmit = async () => {
    if (!selectedVehicle || !selectedGarage || !selectedPackage || !appointmentDate || !appointmentTime) {
      showToast('Please complete all booking steps before submitting.', 'error');
      return;
    }
    if (problemDescription.trim().length < 3) {
      showToast('Please describe the vehicle issue or service note (min 3 characters).', 'error');
      return;
    }
    if (!contactPhone.trim()) {
      showToast('Please enter a contact phone number for garage updates.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const photoUrls = photoInput
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.startsWith('http') || s.startsWith('/'))
        .slice(0, 5);

      const res = await submitGarageBooking({
        garageId: selectedGarage.garageId,
        customerId: account.uid,
        customerName: customerProfile?.name || account.displayName,
        customerPhone: contactPhone.trim(),
        vehicle: selectedVehicle,
        categoryId: selectedCategory?.id || selectedPackage.categoryId,
        categoryName: selectedCategory?.name || selectedPackage.categoryName,
        pkg: selectedPackage,
        problemDescription: problemDescription.trim(),
        photoUrls,
        appointmentDate,
        appointmentTime,
      });

      setCreatedResult({
        bookingId: res.bookingId,
        bookingCode: res.bookingCode,
        garageName: selectedGarage.name,
      });
      showToast(`Booking ${res.bookingCode} submitted to ${selectedGarage.name}.`, 'success');
      onBookingCreated(res.bookingId, res.bookingCode);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to submit booking.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (createdResult) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-2xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">Booking Submitted Successfully</h3>
        <p className="text-sm text-slate-600">
          Your request has been routed exclusively to <span className="font-semibold text-slate-900">{createdResult.garageName}</span> with initial status <span className="font-semibold text-amber-700">Pending</span>.
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 inline-block">
          <div className="text-xs text-slate-500">Booking Reference ID</div>
          <div className="text-2xl font-mono font-bold text-[#0B132B] tabular-nums mt-0.5">{createdResult.bookingCode}</div>
        </div>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              setCreatedResult(null);
              setStep(1);
              setProblemDescription('');
              setAppointmentTime('');
            }}
            className="px-5 py-2.5 bg-[#0B132B] text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors"
          >
            Book Another Service
          </button>
        </div>
      </div>
    );
  }

  const steps = [
    { num: 1, label: 'Vehicle' },
    { num: 2, label: 'Select Garage' },
    { num: 3, label: 'Service & Package' },
    { num: 4, label: 'Date & Slot' },
    { num: 5, label: 'Review & Submit' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Step Progress Header */}
      <div className="bg-[#0B132B] px-6 py-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Book a Service Across Our Six Garages</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Every booking is routed strictly to your selected garage manager for acceptance.
            </p>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            {steps.map((s) => (
              <button
                key={s.num}
                type="button"
                onClick={() => {
                  if (s.num < step) setStep(s.num);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  step === s.num
                    ? 'bg-red-600 text-white'
                    : step > s.num
                      ? 'bg-white/15 text-white hover:bg-white/25'
                      : 'bg-white/5 text-slate-400 cursor-default'
                }`}
              >
                {s.num}. {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* STEP 1: VEHICLE */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Step 1: Select Your Registered Vehicle</h3>
                <p className="text-xs text-slate-500 mt-0.5">Choose a Car or Bike or add a new vehicle to your profile.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddVehicle((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {showAddVehicle ? 'Cancel' : 'Add Vehicle'}
              </button>
            </div>

            {showAddVehicle && (
              <form onSubmit={handleQuickAddVehicle} className="p-4 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={newVehicleType}
                    onChange={(e) => setNewVehicleType(e.target.value as VehicleType)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Car">Car</option>
                    <option value="Bike">Bike</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Registration Number</label>
                  <input
                    required
                    value={newReg}
                    onChange={(e) => setNewReg(e.target.value)}
                    placeholder="MH12AB1234"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Brand</label>
                  <input
                    required
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    placeholder={newVehicleType === 'Car' ? 'Hyundai / Maruti' : 'Royal Enfield / Honda'}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Model</label>
                  <input
                    required
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    placeholder={newVehicleType === 'Car' ? 'i20 / Swift' : 'Classic 350 / CB350'}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fuel Type</label>
                  <select
                    value={newFuel}
                    onChange={(e) => setNewFuel(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Petrol">Petrol</option>
                    <option value="Diesel">Diesel</option>
                    <option value="CNG">CNG</option>
                    <option value="Electric">Electric</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Year</label>
                    <input
                      type="number"
                      min={1980}
                      max={2030}
                      value={newYear}
                      onChange={(e) => setNewYear(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Odometer (km)</label>
                    <input
                      type="number"
                      min={0}
                      value={newOdo}
                      onChange={(e) => setNewOdo(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
                <div className="sm:col-span-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingVeh}
                    className="px-4 py-2 bg-[#0B132B] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    {savingVeh ? 'Saving...' : 'Save Vehicle'}
                  </button>
                </div>
              </form>
            )}

            {vehicles.length === 0 ? (
              <div className="p-8 border border-dashed border-slate-300 rounded-xl text-center">
                <p className="text-sm text-slate-600 mb-3">You have not registered a vehicle yet.</p>
                <button
                  type="button"
                  onClick={() => setShowAddVehicle(true)}
                  className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700"
                >
                  Register Your First Car or Bike
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {vehicles.map((v) => {
                  const active = v.id === selectedVehicleId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSelectedVehicleId(v.id || '');
                        setSelectedCategoryId('');
                        setSelectedPackageId('');
                      }}
                      className={`text-left p-4 rounded-xl border transition-colors flex items-start gap-3.5 ${
                        active ? 'border-red-600 bg-red-50/40' : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className={`p-2.5 rounded-lg ${active ? 'bg-red-600 text-white' : 'bg-slate-100 text-[#0B132B]'}`}>
                        {v.vehicleType === 'Car' ? <Car className="w-5 h-5" /> : <Bike className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-900 truncate">
                            {v.brand} {v.model}
                          </span>
                          <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">{v.registrationNumber}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {v.vehicleType} · {v.fuelType} · {v.year} · {v.odometer.toLocaleString('en-IN')} km
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={!selectedVehicle}
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40"
              >
                <span>Continue to Garage Selection</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: SELECT GARAGE */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">Step 2: Select One of Our 6 Garages</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Only the selected garage receives and manages this booking. Inactive garages cannot accept new requests.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {garages.map((g) => {
                const selected = g.garageId === selectedGarageId;
                return (
                  <button
                    key={g.garageId}
                    type="button"
                    disabled={!g.isActive}
                    onClick={() => {
                      setSelectedGarageId(g.garageId);
                      setSelectedCategoryId('');
                      setSelectedPackageId('');
                      setAppointmentTime('');
                    }}
                    className={`text-left rounded-xl border overflow-hidden transition-all flex flex-col ${
                      !g.isActive
                        ? 'opacity-55 border-slate-200 bg-slate-50 cursor-not-allowed'
                        : selected
                          ? 'border-red-600 ring-2 ring-red-600/20 bg-white'
                          : 'border-slate-200 hover:border-slate-400 bg-white'
                    }`}
                  >
                    <div className="h-32 w-full bg-slate-100 overflow-hidden relative">
                      {g.photoUrl ? (
                        <img
                          src={g.photoUrl}
                          alt={g.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-[#0B132B] flex items-center justify-center text-white text-xs font-semibold">
                          {g.code}
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span className="font-mono font-semibold text-[#0B132B]">{g.code}</span>
                          <span>{g.isActive ? 'Active' : 'Inactive'}</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mt-1">{g.name}</h4>
                        <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                          <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600" />
                          <span>{g.address}</span>
                        </p>
                      </div>
                      <div className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{g.operatingHours}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                disabled={!selectedGarage || !selectedGarage.isActive}
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40"
              >
                <span>View Services at {selectedGarage?.code || 'Garage'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SERVICE CATEGORY & PACKAGE */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Step 3: {selectedVehicle?.vehicleType} Services at {selectedGarage?.name}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                All initial package prices are marked as demo estimates. Final work requires customer approval.
              </p>
            </div>

            {garageCategories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId('')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    selectedCategoryId === ''
                      ? 'bg-[#0B132B] text-white border-[#0B132B]'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All Categories
                </button>
                {garageCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId(c.id || '');
                      setSelectedPackageId('');
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      selectedCategoryId === c.id
                        ? 'bg-[#0B132B] text-white border-[#0B132B]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {garagePackages.length === 0 ? (
              <div className="p-6 border border-dashed border-slate-300 rounded-xl text-center text-sm text-slate-600">
                No active {selectedVehicle?.vehicleType} packages configured for {selectedGarage?.name} yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {garagePackages.map((pkg) => {
                  const chosen = pkg.id === selectedPackageId;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => {
                        setSelectedPackageId(pkg.id || '');
                        setSelectedCategoryId(pkg.categoryId);
                      }}
                      className={`text-left p-4 rounded-xl border transition-all flex flex-col justify-between ${
                        chosen ? 'border-red-600 bg-red-50/30 ring-2 ring-red-600/15' : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs text-slate-500">
                              {pkg.categoryName} · {pkg.estimatedDurationMins} mins
                              {pkg.isDemoEstimate ? ' · Demo Estimate' : ''}
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 mt-1">{pkg.name}</h4>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-base font-bold text-[#0B132B] tabular-nums">{formatINR(pkg.startingPrice)}</div>
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              Labour {formatINR(pkg.labourCharge)} + Parts ~{formatINR(pkg.partsEstimate)}
                            </div>
                          </div>
                        </div>
                        <ul className="mt-3 space-y-1 text-xs text-slate-600">
                          {pkg.includedServices.slice(0, 5).map((item) => (
                            <li key={item} className="flex items-center gap-1.5">
                              <Wrench className="w-3 h-3 text-red-600 shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                disabled={!selectedPackage}
                onClick={() => setStep(4)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40"
              >
                <span>Choose Date & Time Slot</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: DATE & TIME SLOT */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">Step 4: Select Appointment Date & Slot</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Live slot capacity for {selectedGarage?.name}. Blocked or full slots cannot be selected.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Appointment Date</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="date"
                    min={getTodayISO()}
                    value={appointmentDate}
                    onChange={(e) => {
                      setAppointmentDate(e.target.value);
                      setAppointmentTime('');
                    }}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B132B]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Available Time Slots</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {DEFAULT_TIME_SLOTS.map((slot) => {
                    const info = getSlotAvailability(slot);
                    const picked = appointmentTime === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={!info.available}
                        onClick={() => setAppointmentTime(slot)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          !info.available
                            ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                            : picked
                              ? 'bg-[#0B132B] border-[#0B132B] text-white'
                              : 'bg-white border-slate-200 hover:border-slate-400 text-slate-900'
                        }`}
                      >
                        <div className="text-sm font-semibold tabular-nums">{slot}</div>
                        <div className={`text-[11px] mt-0.5 tabular-nums ${picked ? 'text-slate-300' : 'text-slate-500'}`}>
                          {info.blocked ? 'Blocked / Holiday' : info.remaining === 0 ? 'Full' : `${info.remaining} bays left`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                disabled={!appointmentDate || !appointmentTime}
                onClick={() => setStep(5)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40"
              >
                <span>Describe Issue & Review</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: PROBLEM DESCRIPTION, PHOTOS & SUBMIT */}
        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">Step 5: Describe Vehicle Issue & Confirm</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Provide symptoms, contact number, and review all booking details before submission.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contact Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B132B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Describe Vehicle Problem / Service Notes</label>
                  <textarea
                    required
                    rows={4}
                    value={problemDescription}
                    onChange={(e) => setProblemDescription(e.target.value)}
                    placeholder="e.g., Engine vibration above 60 km/h, front brake squeal, periodic 10,000 km checkup..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B132B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Optional Vehicle Photo URLs (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={photoInput}
                    onChange={(e) => setPhotoInput(e.target.value)}
                    placeholder="https://... (optional)"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-[#0B132B] pb-2 border-b border-slate-200">
                  <FileText className="w-4 h-4 text-red-600" />
                  <span>Booking Summary</span>
                </div>
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Customer</dt>
                    <dd className="font-semibold text-slate-900">{customerProfile?.name || account.displayName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Assigned Garage</dt>
                    <dd className="font-semibold text-red-700 text-right">
                      {selectedGarage?.name} ({selectedGarage?.code})
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Vehicle</dt>
                    <dd className="font-semibold text-slate-900">
                      {selectedVehicle?.vehicleType} · {selectedVehicle?.brand} {selectedVehicle?.model} ({selectedVehicle?.registrationNumber})
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Package</dt>
                    <dd className="font-semibold text-slate-900">{selectedPackage?.name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Appointment</dt>
                    <dd className="font-semibold text-slate-900 tabular-nums">
                      {appointmentDate} · {appointmentTime}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 pt-2 border-t border-slate-200">
                    <dt className="text-slate-700 font-semibold">Starting Demo Estimate</dt>
                    <dd className="text-base font-bold text-[#0B132B] tabular-nums">
                      {formatINR(selectedPackage?.startingPrice || 0)}
                    </dd>
                  </div>
                </dl>
                <div className="flex items-start gap-2 pt-2 text-[11px] text-slate-600">
                  <AlertCircle className="w-3.5 h-3.5 text-[#0B132B] shrink-0 mt-0.5" />
                  <span>Initial status will be set to Pending until {selectedGarage?.code} manager reviews and accepts your slot.</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <span>{submitting ? 'Submitting Booking...' : 'Submit Booking'}</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
