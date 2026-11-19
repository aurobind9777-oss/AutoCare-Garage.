import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, SUPER_ADMIN_EMAIL } from '../lib/firebase';
import {
  buildDemoCatalogForGarage,
  DEFAULT_PLATFORM_SETTINGS,
  DEMO_SIX_GARAGES,
} from '../data/seedCatalog';
import type {
  AppNotification,
  AppointmentSlot,
  Booking,
  BookingStatus,
  ChecklistItem,
  CustomerProfile,
  Expense,
  ExpenseCategory,
  Garage,
  GarageMechanic,
  Inspection,
  Invoice,
  JobCard,
  PartUsageItem,
  PaymentMethod,
  PaymentStatus,
  PlatformSettings,
  ServiceCategory,
  ServicePackage,
  SparePart,
  StaffInvite,
  StatusHistoryEntry,
  SupportTicket,
  TicketReply,
  UserRole,
  Vehicle,
} from '../types/autocare';

function cleanId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function makeSlotId(garageId: string, date: string, timeSlot: string): string {
  const safeTime = timeSlot.replace(/[^a-zA-Z0-9]/g, '_');
  return `${garageId}_${date}_${safeTime}`;
}

export function makeInviteId(email: string): string {
  return `inv_${email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

export async function writeAuditLog(params: {
  actorId: string;
  actorRole: string;
  actorEmail?: string;
  action: string;
  targetCollection: string;
  targetId: string;
  garageId?: string;
  details: string;
}): Promise<void> {
  try {
    const id = cleanId('aud');
    await setDoc(doc(db, 'audit_logs', id), {
      actorId: params.actorId,
      actorRole: params.actorRole,
      actorEmail: (params.actorEmail || '').slice(0, 160),
      action: params.action.slice(0, 120),
      targetCollection: params.targetCollection.slice(0, 64),
      targetId: params.targetId.slice(0, 128),
      garageId: (params.garageId || '').slice(0, 64),
      details: params.details.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Audit log write warning:', err);
  }
}

export async function createNotification(params: {
  recipientId: string;
  recipientRole: UserRole;
  garageId?: string;
  title: string;
  message: string;
  type: string;
  relatedBookingId?: string;
}): Promise<void> {
  if (!params.recipientId) return;
  try {
    const id = cleanId('ntf');
    await setDoc(doc(db, 'notifications', id), {
      recipientId: params.recipientId,
      recipientRole: params.recipientRole,
      garageId: (params.garageId || '').slice(0, 64),
      title: params.title.slice(0, 140),
      message: params.message.slice(0, 500),
      type: params.type.slice(0, 48),
      relatedBookingId: (params.relatedBookingId || '').slice(0, 128),
      isRead: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Notification dispatch warning:', err);
  }
}

let seedInFlightPromise: Promise<boolean> | null = null;

export async function seedInitialPlatformData(adminUid: string, adminEmail: string): Promise<boolean> {
  if (seedInFlightPromise) {
    return seedInFlightPromise;
  }
  seedInFlightPromise = (async () => {
    try {
      const existingGarages = await getDocs(collection(db, 'garages'));
      if (existingGarages.size >= 6) {
        return false;
      }

      const existingIds = new Set(existingGarages.docs.map((d) => d.id));
      const garagesToSeed = DEMO_SIX_GARAGES.filter((g) => !existingIds.has(g.garageId));

      // Batch 1: Platform settings + parent garage documents MUST be committed first
      // so firestore.rules exists(/databases/.../garages/{garageId}) passes for child docs.
      const batch1 = writeBatch(db);
      batch1.set(
        doc(db, 'platform_settings', 'global'),
        {
          ...DEFAULT_PLATFORM_SETTINGS,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      for (const garage of garagesToSeed) {
        batch1.set(doc(db, 'garages', garage.garageId), {
          ...garage,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch1.commit();

      // Batch 2: Service categories, service packages, and starter spare parts
      if (garagesToSeed.length > 0) {
        const batch2 = writeBatch(db);
        for (const garage of garagesToSeed) {
          const { categories, packages } = buildDemoCatalogForGarage(garage.garageId, garage.managerUid || '');
          for (const cat of categories) {
            batch2.set(doc(db, 'service_categories', cat.id), {
              ...cat.data,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          for (const pkg of packages) {
            batch2.set(doc(db, 'service_packages', pkg.id), {
              ...pkg.data,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          const starterParts = [
            {
              suffix: 'oil_5w30',
              name: 'Synthetic Engine Oil 5W-30 (1L)',
              sku: `${garage.code}-OIL-5W30`,
              category: 'Lubricants',
              brand: 'AutoCare OEM',
              purchasePrice: 420,
              sellingPrice: 650,
              quantity: 24,
              minStockLevel: 6,
              supplier: 'Demo Lubricants Supply',
            },
            {
              suffix: 'brake_pad',
              name: 'Ceramic Front Brake Pad Set',
              sku: `${garage.code}-BRK-01`,
              category: 'Brakes',
              brand: 'Brembo Demo',
              purchasePrice: 950,
              sellingPrice: 1450,
              quantity: 12,
              minStockLevel: 4,
              supplier: 'Demo Friction Parts Co.',
            },
            {
              suffix: 'bike_chain',
              name: 'Two-Wheeler Chain & Sprocket Lube Kit',
              sku: `${garage.code}-BK-CHN`,
              category: 'Bike Drivetrain',
              brand: 'MotoSpec Demo',
              purchasePrice: 220,
              sellingPrice: 380,
              quantity: 18,
              minStockLevel: 5,
              supplier: 'Demo Two-Wheeler Spares',
            },
          ];

          for (const sp of starterParts) {
            batch2.set(doc(db, 'spare_parts', `${garage.garageId}_${sp.suffix}`), {
              garageId: garage.garageId,
              garageManagerId: garage.managerUid || '',
              authorizedMechanicIds: [],
              name: sp.name,
              sku: sp.sku,
              category: sp.category,
              brand: sp.brand,
              purchasePrice: sp.purchasePrice,
              sellingPrice: sp.sellingPrice,
              quantity: sp.quantity,
              minStockLevel: sp.minStockLevel,
              supplier: sp.supplier,
              isActive: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
        await batch2.commit();
      }

      await writeAuditLog({
        actorId: adminUid,
        actorRole: 'super_admin',
        actorEmail: adminEmail,
        action: 'SEED_SIX_GARAGES',
        targetCollection: 'garages',
        targetId: 'all_six',
        details: 'Initialized 6 AutoCare Garage locations, demo service packages, and starter spare parts.',
      });
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'garages');
    } finally {
      seedInFlightPromise = null;
    }
  })();

  return seedInFlightPromise;
}

export async function updateGarage(
  garageId: string,
  updates: Partial<Garage>,
  actor: { uid: string; role: UserRole; email?: string }
): Promise<void> {
  try {
    const ref = doc(db, 'garages', garageId);
    await updateDoc(ref, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      actorId: actor.uid,
      actorRole: actor.role,
      actorEmail: actor.email,
      action: 'UPDATE_GARAGE',
      targetCollection: 'garages',
      targetId: garageId,
      garageId,
      details: `Updated garage ${garageId}: ${Object.keys(updates).join(', ')}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `garages/${garageId}`);
  }
}

export async function updatePlatformSettings(
  settings: Omit<PlatformSettings, 'updatedAt'>,
  actor: { uid: string; email?: string }
): Promise<void> {
  try {
    await setDoc(doc(db, 'platform_settings', 'global'), {
      ...settings,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      actorId: actor.uid,
      actorRole: 'super_admin',
      actorEmail: actor.email,
      action: 'UPDATE_PLATFORM_SETTINGS',
      targetCollection: 'platform_settings',
      targetId: 'global',
      details: `Updated platform settings (${settings.businessName}, tax ${settings.defaultTaxRate}%)`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'platform_settings/global');
  }
}

export async function createStaffInvite(
  invite: Omit<StaffInvite, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
  actorEmail?: string
): Promise<string> {
  const emailLower = invite.email.trim().toLowerCase();
  const id = makeInviteId(emailLower);
  try {
    await setDoc(doc(db, 'staff_invites', id), {
      email: emailLower,
      role: invite.role,
      garageId: invite.garageId,
      name: invite.name.trim().slice(0, 120),
      phone: (invite.phone || '').trim().slice(0, 30),
      specialization: (invite.specialization || '').trim().slice(0, 120),
      status: 'pending',
      createdBy: invite.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      actorId: invite.createdBy,
      actorRole: 'super_admin',
      actorEmail,
      action: 'CREATE_STAFF_INVITE',
      targetCollection: 'staff_invites',
      targetId: id,
      garageId: invite.garageId,
      details: `Authorized ${emailLower} as ${invite.role} for ${invite.garageId}`,
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `staff_invites/${id}`);
  }
}

export async function assignExistingStaffDirectly(params: {
  targetUid: string;
  email: string;
  name: string;
  role: 'garage_manager' | 'mechanic';
  garageId: string;
  phone?: string;
  specialization?: string;
  actorUid: string;
  actorEmail?: string;
}): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const garageRef = doc(db, 'garages', params.garageId);
      const garageSnap = await tx.get(garageRef);
      if (!garageSnap.exists()) {
        throw new Error(`Garage ${params.garageId} does not exist.`);
      }
      const garage = garageSnap.data() as Garage;

      tx.update(doc(db, 'users', params.targetUid), {
        role: params.role,
        garageId: params.garageId,
        isActive: true,
        updatedAt: serverTimestamp(),
      });

      if (params.role === 'garage_manager') {
        tx.set(doc(db, 'garage_managers', params.targetUid), {
          uid: params.targetUid,
          garageId: params.garageId,
          name: params.name.slice(0, 120),
          email: params.email.toLowerCase().slice(0, 160),
          phone: (params.phone || '').slice(0, 30),
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        tx.update(garageRef, {
          managerUid: params.targetUid,
          managerName: params.name.slice(0, 120),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(doc(db, 'garage_mechanics', params.targetUid), {
          uid: params.targetUid,
          garageId: params.garageId,
          garageManagerId: garage.managerUid || '',
          name: params.name.slice(0, 120),
          email: params.email.toLowerCase().slice(0, 160),
          phone: (params.phone || '').slice(0, 30),
          specialization: (params.specialization || 'General Service').slice(0, 120),
          isAvailable: true,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });

    if (params.role === 'garage_manager') {
      const managerOwnedCols = [
        'spare_parts',
        'garage_mechanics',
        'bookings',
        'job_cards',
        'inspections',
        'invoices',
        'payments',
        'expenses',
        'support_tickets',
        'support_internal_notes',
        'inventory_logs',
        'appointment_slots',
        'service_categories',
        'service_packages',
      ];
      const backfillBatch = writeBatch(db);
      for (const colName of managerOwnedCols) {
        const snap = await getDocs(query(collection(db, colName), where('garageId', '==', params.garageId)));
        snap.docs.forEach((d) => {
          backfillBatch.update(d.ref, { garageManagerId: params.targetUid });
        });
      }
      await backfillBatch.commit();
    }

    await writeAuditLog({
      actorId: params.actorUid,
      actorRole: 'super_admin',
      actorEmail: params.actorEmail,
      action: 'ASSIGN_STAFF_ROLE',
      targetCollection: 'users',
      targetId: params.targetUid,
      garageId: params.garageId,
      details: `Assigned ${params.email} as ${params.role} for ${params.garageId}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${params.targetUid}`);
  }
}

export async function revokeStaffInvite(inviteId: string, actorUid: string, actorEmail?: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'staff_invites', inviteId), {
      status: 'revoked',
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      actorId: actorUid,
      actorRole: 'super_admin',
      actorEmail,
      action: 'REVOKE_STAFF_INVITE',
      targetCollection: 'staff_invites',
      targetId: inviteId,
      details: `Revoked staff invite ${inviteId}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `staff_invites/${inviteId}`);
  }
}

export async function saveCustomerProfile(uid: string, profile: Partial<CustomerProfile>): Promise<void> {
  try {
    const ref = doc(db, 'customers', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        name: (profile.name || '').slice(0, 120),
        email: (profile.email || '').slice(0, 160),
        phone: (profile.phone || '').slice(0, 30),
        address: (profile.address || '').slice(0, 300),
        city: (profile.city || '').slice(0, 80),
        pincode: (profile.pincode || '').slice(0, 16),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid,
        name: (profile.name || 'Customer').slice(0, 120),
        email: (profile.email || '').slice(0, 160),
        phone: (profile.phone || '').slice(0, 30),
        address: (profile.address || '').slice(0, 300),
        city: (profile.city || '').slice(0, 80),
        pincode: (profile.pincode || '').slice(0, 16),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `customers/${uid}`);
  }
}

export async function saveVehicle(vehicle: Omit<Vehicle, 'createdAt' | 'updatedAt'>): Promise<string> {
  const id = vehicle.id || cleanId('veh');
  try {
    const ref = doc(db, 'vehicles', id);
    const payload = {
      customerId: vehicle.customerId,
      vehicleType: vehicle.vehicleType,
      registrationNumber: vehicle.registrationNumber.trim().toUpperCase().slice(0, 32),
      brand: vehicle.brand.trim().slice(0, 64),
      model: vehicle.model.trim().slice(0, 64),
      variant: (vehicle.variant || '').trim().slice(0, 64),
      fuelType: vehicle.fuelType.trim().slice(0, 32),
      year: Number(vehicle.year),
      odometer: Number(vehicle.odometer),
      photoUrl: (vehicle.photoUrl || '').trim().slice(0, 500),
      updatedAt: serverTimestamp(),
    };
    if (vehicle.id) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `vehicles/${id}`);
  }
}

export async function removeVehicle(vehicleId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'vehicles', vehicleId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `vehicles/${vehicleId}`);
  }
}

export async function submitGarageBooking(params: {
  garageId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  vehicle: Vehicle;
  categoryId: string;
  categoryName: string;
  pkg: ServicePackage;
  problemDescription: string;
  photoUrls?: string[];
  appointmentDate: string;
  appointmentTime: string;
}): Promise<{ bookingId: string; bookingCode: string }> {
  const bookingId = cleanId('bk');
  const bookingCode = `ACG-${Math.floor(100000 + Math.random() * 900000)}`;
  const slotId = makeSlotId(params.garageId, params.appointmentDate, params.appointmentTime);

  let notifyTarget = '';
  let notifyRole: UserRole = 'garage_manager';
  let garageName = params.garageId;

  try {
    await runTransaction(db, async (tx) => {
      const garageRef = doc(db, 'garages', params.garageId);
      const garageSnap = await tx.get(garageRef);
      if (!garageSnap.exists()) {
        throw new Error('Selected garage does not exist.');
      }
      const garage = garageSnap.data() as Garage;
      if (!garage.isActive) {
        throw new Error(`${garage.name} is currently inactive and cannot accept new bookings.`);
      }
      garageName = garage.name;
      notifyTarget = garage.managerUid || '';

      const slotRef = doc(db, 'appointment_slots', slotId);
      const slotSnap = await tx.get(slotRef);
      const defaultPerSlotCap = Math.max(2, Math.ceil((garage.dailyCapacity || 10) / 4));

      if (slotSnap.exists()) {
        const slot = slotSnap.data() as AppointmentSlot;
        if (slot.isBlocked) {
          throw new Error(`The ${params.appointmentTime} slot on ${params.appointmentDate} is blocked/unavailable.`);
        }
        if (slot.bookedCount >= slot.capacity) {
          throw new Error(`The ${params.appointmentTime} slot on ${params.appointmentDate} is fully booked.`);
        }
        tx.update(slotRef, {
          bookedCount: slot.bookedCount + 1,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(slotRef, {
          garageId: params.garageId,
          garageManagerId: garage.managerUid || '',
          date: params.appointmentDate,
          timeSlot: params.appointmentTime,
          capacity: defaultPerSlotCap,
          bookedCount: 1,
          isBlocked: false,
          note: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const initialHistory: StatusHistoryEntry[] = [
        {
          status: 'Pending',
          updatedBy: params.customerId,
          updatedByRole: 'customer',
          note: `Booking submitted to ${garage.name}`,
          timestamp: nowISO(),
        },
      ];

      tx.set(doc(db, 'bookings', bookingId), {
        bookingCode,
        garageId: params.garageId,
        garageName: garage.name.slice(0, 120),
        garageManagerId: garage.managerUid || '',
        customerId: params.customerId,
        customerName: params.customerName.slice(0, 120),
        customerPhone: params.customerPhone.slice(0, 30),
        vehicleId: params.vehicle.id || 'veh_inline',
        vehicleType: params.vehicle.vehicleType,
        registrationNumber: params.vehicle.registrationNumber.slice(0, 32),
        vehicleBrand: params.vehicle.brand.slice(0, 64),
        vehicleModel: params.vehicle.model.slice(0, 64),
        categoryId: params.categoryId,
        categoryName: params.categoryName.slice(0, 100),
        packageId: params.pkg.id || 'pkg_custom',
        packageName: params.pkg.name.slice(0, 120),
        estimatedPrice: Number(params.pkg.startingPrice || 0),
        problemDescription: params.problemDescription.trim().slice(0, 1000),
        photoUrls: (params.photoUrls || []).slice(0, 5),
        appointmentDate: params.appointmentDate,
        appointmentTime: params.appointmentTime,
        slotId,
        status: 'Pending',
        statusHistory: initialHistory,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    if (notifyTarget) {
      await createNotification({
        recipientId: notifyTarget,
        recipientRole: notifyRole,
        garageId: params.garageId,
        title: `New Booking Request (${bookingCode})`,
        message: `${params.customerName} requested ${params.pkg.name} for ${params.vehicle.brand} ${params.vehicle.model} on ${params.appointmentDate} at ${params.appointmentTime}.`,
        type: 'NEW_BOOKING',
        relatedBookingId: bookingId,
      });
    }

    await writeAuditLog({
      actorId: params.customerId,
      actorRole: 'customer',
      action: 'SUBMIT_BOOKING',
      targetCollection: 'bookings',
      targetId: bookingId,
      garageId: params.garageId,
      details: `Booking ${bookingCode} routed exclusively to ${garageName} (${params.garageId})`,
    });

    return { bookingId, bookingCode };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `bookings/${bookingId}`);
  }
}

export async function acceptGarageBooking(
  bookingId: string,
  actorUid: string,
  actorRole: UserRole,
  expectedGarageId?: string
): Promise<void> {
  try {
    let customerId = '';
    let garageId = '';
    let bookingCode = '';
    let garageName = '';

    await runTransaction(db, async (tx) => {
      const bookingRef = doc(db, 'bookings', bookingId);
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists()) throw new Error('Booking not found.');
      const booking = bookingSnap.data() as Booking;

      if (expectedGarageId && booking.garageId !== expectedGarageId) {
        throw new Error('Cross-garage violation: booking does not belong to your garage.');
      }
      if (booking.status !== 'Pending') {
        throw new Error(`Booking cannot be accepted because current status is ${booking.status}.`);
      }

      const garageSnap = await tx.get(doc(db, 'garages', booking.garageId));
      if (!garageSnap.exists()) throw new Error('Garage record missing.');
      const garage = garageSnap.data() as Garage;

      if (actorRole !== 'super_admin' && garage.managerUid !== actorUid) {
        throw new Error('Unauthorized: only the assigned garage manager or Super Admin can accept this booking.');
      }

      const slotSnap = await tx.get(doc(db, 'appointment_slots', booking.slotId));
      if (slotSnap.exists()) {
        const slot = slotSnap.data() as AppointmentSlot;
        if (slot.isBlocked) {
          throw new Error('Selected slot was blocked. Request a reschedule instead.');
        }
      }

      customerId = booking.customerId;
      garageId = booking.garageId;
      bookingCode = booking.bookingCode;
      garageName = booking.garageName;

      const updatedHistory: StatusHistoryEntry[] = [
        ...(booking.statusHistory || []),
        {
          status: 'Accepted',
          updatedBy: actorUid,
          updatedByRole: actorRole,
          note: `Accepted by ${garage.name} management`,
          timestamp: nowISO(),
        },
      ];

      tx.update(bookingRef, {
        status: 'Accepted',
        acceptedBy: actorUid,
        statusHistory: updatedHistory.slice(-40),
        updatedAt: serverTimestamp(),
      });
    });

    await createNotification({
      recipientId: customerId,
      recipientRole: 'customer',
      garageId,
      title: `Booking Accepted (${bookingCode})`,
      message: `Your booking at ${garageName} has been accepted. A mechanic will be assigned shortly.`,
      type: 'BOOKING_ACCEPTED',
      relatedBookingId: bookingId,
    });

    await writeAuditLog({
      actorId: actorUid,
      actorRole,
      action: 'ACCEPT_BOOKING',
      targetCollection: 'bookings',
      targetId: bookingId,
      garageId,
      details: `Accepted booking ${bookingCode} at ${garageId}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
  }
}

export async function rejectGarageBooking(
  bookingId: string,
  reason: string,
  actorUid: string,
  actorRole: UserRole,
  expectedGarageId?: string
): Promise<void> {
  if (!reason.trim() || reason.trim().length < 3) {
    throw new Error('A clear rejection reason (at least 3 characters) is required.');
  }
  try {
    let customerId = '';
    let garageId = '';
    let bookingCode = '';
    let garageName = '';

    await runTransaction(db, async (tx) => {
      const bookingRef = doc(db, 'bookings', bookingId);
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists()) throw new Error('Booking not found.');
      const booking = bookingSnap.data() as Booking;

      if (expectedGarageId && booking.garageId !== expectedGarageId) {
        throw new Error('Cross-garage violation: booking does not belong to your garage.');
      }
      if (booking.status !== 'Pending') {
        throw new Error(`Only Pending bookings can be rejected (current: ${booking.status}).`);
      }

      const garageSnap = await tx.get(doc(db, 'garages', booking.garageId));
      if (!garageSnap.exists()) throw new Error('Garage record missing.');
      const garage = garageSnap.data() as Garage;

      if (actorRole !== 'super_admin' && garage.managerUid !== actorUid) {
        throw new Error('Unauthorized: only the assigned garage manager can reject this booking.');
      }

      // Release reserved appointment slot
      const slotRef = doc(db, 'appointment_slots', booking.slotId);
      const slotSnap = await tx.get(slotRef);
      if (slotSnap.exists()) {
        const slot = slotSnap.data() as AppointmentSlot;
        if (slot.bookedCount > 0) {
          tx.update(slotRef, {
            bookedCount: slot.bookedCount - 1,
            updatedAt: serverTimestamp(),
          });
        }
      }

      customerId = booking.customerId;
      garageId = booking.garageId;
      bookingCode = booking.bookingCode;
      garageName = booking.garageName;

      const updatedHistory: StatusHistoryEntry[] = [
        ...(booking.statusHistory || []),
        {
          status: 'Rejected',
          updatedBy: actorUid,
          updatedByRole: actorRole,
          note: `Rejected: ${reason.trim()}`,
          timestamp: nowISO(),
        },
      ];

      tx.update(bookingRef, {
        status: 'Rejected',
        rejectionReason: reason.trim().slice(0, 500),
        rejectedBy: actorUid,
        statusHistory: updatedHistory.slice(-40),
        updatedAt: serverTimestamp(),
      });
    });

    await createNotification({
      recipientId: customerId,
      recipientRole: 'customer',
      garageId,
      title: `Booking Rejected (${bookingCode})`,
      message: `${garageName} could not accommodate this booking. Reason: ${reason.trim()}`,
      type: 'BOOKING_REJECTED',
      relatedBookingId: bookingId,
    });

    await writeAuditLog({
      actorId: actorUid,
      actorRole,
      action: 'REJECT_BOOKING',
      targetCollection: 'bookings',
      targetId: bookingId,
      garageId,
      details: `Rejected booking ${bookingCode}. Reason: ${reason.trim()}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
  }
}

export async function requestBookingReschedule(
  bookingId: string,
  suggestedDate: string,
  suggestedTime: string,
  note: string,
  actorUid: string,
  actorRole: UserRole
): Promise<void> {
  try {
    const bookingRef = doc(db, 'bookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);
    if (!bookingSnap.exists()) throw new Error('Booking not found.');
    const booking = bookingSnap.data() as Booking;

    // Check target slot availability before suggesting
    const targetSlotId = makeSlotId(booking.garageId, suggestedDate, suggestedTime);
    const targetSlotSnap = await getDoc(doc(db, 'appointment_slots', targetSlotId));
    if (targetSlotSnap.exists()) {
      const s = targetSlotSnap.data() as AppointmentSlot;
      if (s.isBlocked || s.bookedCount >= s.capacity) {
        throw new Error('The suggested slot is full or blocked. Please choose another time.');
      }
    }

    const updatedHistory: StatusHistoryEntry[] = [
      ...(booking.statusHistory || []),
      {
        status: 'Reschedule Requested',
        updatedBy: actorUid,
        updatedByRole: actorRole,
        note: `Suggested ${suggestedDate} at ${suggestedTime}. ${note}`.trim(),
        timestamp: nowISO(),
      },
    ];

    await updateDoc(bookingRef, {
      status: 'Reschedule Requested',
      rescheduleSuggestedDate: suggestedDate,
      rescheduleSuggestedTime: suggestedTime,
      rescheduleNote: note.trim().slice(0, 300),
      statusHistory: updatedHistory.slice(-40),
      updatedAt: serverTimestamp(),
    });

    await createNotification({
      recipientId: booking.customerId,
      recipientRole: 'customer',
      garageId: booking.garageId,
      title: `Reschedule Suggested (${booking.bookingCode})`,
      message: `${booking.garageName} suggested ${suggestedDate} at ${suggestedTime}. Open My Bookings to accept or decline.`,
      type: 'RESCHEDULE_SUGGESTED',
      relatedBookingId: bookingId,
    });

    await writeAuditLog({
      actorId: actorUid,
      actorRole,
      action: 'REQUEST_RESCHEDULE',
      targetCollection: 'bookings',
      targetId: bookingId,
      garageId: booking.garageId,
      details: `Suggested reschedule to ${suggestedDate} ${suggestedTime}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
  }
}

export async function respondToReschedule(
  bookingId: string,
  accept: boolean,
  customerUid: string
): Promise<void> {
  try {
    let garageId = '';
    let garageManagerId = '';
    let bookingCode = '';

    await runTransaction(db, async (tx) => {
      const bookingRef = doc(db, 'bookings', bookingId);
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists()) throw new Error('Booking not found.');
      const booking = bookingSnap.data() as Booking;

      if (booking.customerId !== customerUid) throw new Error('Unauthorized.');
      if (booking.status !== 'Reschedule Requested') {
        throw new Error('No active reschedule suggestion on this booking.');
      }

      garageId = booking.garageId;
      garageManagerId = booking.garageManagerId || '';
      bookingCode = booking.bookingCode;

      // Release old slot
      const oldSlotRef = doc(db, 'appointment_slots', booking.slotId);
      const oldSlotSnap = await tx.get(oldSlotRef);
      if (oldSlotSnap.exists()) {
        const oldSlot = oldSlotSnap.data() as AppointmentSlot;
        if (oldSlot.bookedCount > 0) {
          tx.update(oldSlotRef, { bookedCount: oldSlot.bookedCount - 1, updatedAt: serverTimestamp() });
        }
      }

      if (accept && booking.rescheduleSuggestedDate && booking.rescheduleSuggestedTime) {
        const newDate = booking.rescheduleSuggestedDate;
        const newTime = booking.rescheduleSuggestedTime;
        const newSlotId = makeSlotId(booking.garageId, newDate, newTime);
        const newSlotRef = doc(db, 'appointment_slots', newSlotId);
        const newSlotSnap = await tx.get(newSlotRef);
        const garageSnap = await tx.get(doc(db, 'garages', booking.garageId));
        const garage = garageSnap.data() as Garage;
        const defaultCap = Math.max(2, Math.ceil((garage?.dailyCapacity || 10) / 4));

        if (newSlotSnap.exists()) {
          const ns = newSlotSnap.data() as AppointmentSlot;
          if (ns.isBlocked || ns.bookedCount >= ns.capacity) {
            throw new Error('Suggested slot is no longer available.');
          }
          tx.update(newSlotRef, { bookedCount: ns.bookedCount + 1, updatedAt: serverTimestamp() });
        } else {
          tx.set(newSlotRef, {
            garageId: booking.garageId,
            garageManagerId: booking.garageManagerId || '',
            date: newDate,
            timeSlot: newTime,
            capacity: defaultCap,
            bookedCount: 1,
            isBlocked: false,
            note: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const updatedHistory: StatusHistoryEntry[] = [
          ...(booking.statusHistory || []),
          {
            status: 'Confirmed',
            updatedBy: customerUid,
            updatedByRole: 'customer',
            note: `Customer accepted rescheduled time: ${newDate} at ${newTime}`,
            timestamp: nowISO(),
          },
        ];

        tx.update(bookingRef, {
          status: 'Confirmed',
          appointmentDate: newDate,
          appointmentTime: newTime,
          slotId: newSlotId,
          statusHistory: updatedHistory.slice(-40),
          updatedAt: serverTimestamp(),
        });
      } else {
        const updatedHistory: StatusHistoryEntry[] = [
          ...(booking.statusHistory || []),
          {
            status: 'Cancelled',
            updatedBy: customerUid,
            updatedByRole: 'customer',
            note: 'Customer declined reschedule suggestion and cancelled booking',
            timestamp: nowISO(),
          },
        ];
        tx.update(bookingRef, {
          status: 'Cancelled',
          statusHistory: updatedHistory.slice(-40),
          updatedAt: serverTimestamp(),
        });
      }
    });

    if (garageManagerId) {
      await createNotification({
        recipientId: garageManagerId,
        recipientRole: 'garage_manager',
        garageId,
        title: `Reschedule Response (${bookingCode})`,
        message: accept
          ? `Customer confirmed the rescheduled slot for booking ${bookingCode}.`
          : `Customer declined the reschedule suggestion for ${bookingCode}.`,
        type: 'RESCHEDULE_RESPONSE',
        relatedBookingId: bookingId,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
  }
}

export async function cancelCustomerBooking(bookingId: string, customerUid: string): Promise<void> {
  try {
    let garageId = '';
    let garageManagerId = '';
    let bookingCode = '';

    await runTransaction(db, async (tx) => {
      const bookingRef = doc(db, 'bookings', bookingId);
      const snap = await tx.get(bookingRef);
      if (!snap.exists()) throw new Error('Booking not found.');
      const booking = snap.data() as Booking;
      if (booking.customerId !== customerUid) throw new Error('Unauthorized.');
      if (['Completed', 'Rejected', 'Cancelled'].includes(booking.status)) {
        throw new Error('Booking cannot be cancelled in its current state.');
      }

      garageId = booking.garageId;
      garageManagerId = booking.garageManagerId || '';
      bookingCode = booking.bookingCode;

      const isEarly = ['Pending', 'Accepted', 'Confirmed', 'Reschedule Requested'].includes(booking.status);
      const nextStatus: BookingStatus = isEarly ? 'Cancelled' : 'Cancellation Requested';

      if (isEarly) {
        const slotRef = doc(db, 'appointment_slots', booking.slotId);
        const slotSnap = await tx.get(slotRef);
        if (slotSnap.exists() && (slotSnap.data() as AppointmentSlot).bookedCount > 0) {
          tx.update(slotRef, {
            bookedCount: (slotSnap.data() as AppointmentSlot).bookedCount - 1,
            updatedAt: serverTimestamp(),
          });
        }
      }

      tx.update(bookingRef, {
        status: nextStatus,
        statusHistory: [
          ...(booking.statusHistory || []),
          {
            status: nextStatus,
            updatedBy: customerUid,
            updatedByRole: 'customer',
            note: isEarly ? 'Cancelled by customer' : 'Customer requested cancellation while in workshop',
            timestamp: nowISO(),
          },
        ].slice(-40),
        updatedAt: serverTimestamp(),
      });
    });

    if (garageManagerId) {
      await createNotification({
        recipientId: garageManagerId,
        recipientRole: 'garage_manager',
        garageId,
        title: `Booking Cancellation (${bookingCode})`,
        message: `Customer updated booking ${bookingCode} cancellation status.`,
        type: 'BOOKING_CANCELLED',
        relatedBookingId: bookingId,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
  }
}

export async function assignMechanicAndCreateJobCard(
  bookingId: string,
  mechanic: GarageMechanic,
  actorUid: string,
  actorRole: UserRole
): Promise<string> {
  const jobCardId = cleanId('jc');
  const jobCardCode = `JC-${Math.floor(10000 + Math.random() * 90000)}`;

  try {
    let customerId = '';
    let garageId = '';
    let bookingCode = '';

    await runTransaction(db, async (tx) => {
      const bookingRef = doc(db, 'bookings', bookingId);
      const bSnap = await tx.get(bookingRef);
      if (!bSnap.exists()) throw new Error('Booking not found.');
      const booking = bSnap.data() as Booking;

      if (mechanic.garageId !== booking.garageId) {
        throw new Error('Cross-garage error: Mechanic does not belong to this booking garage.');
      }

      customerId = booking.customerId;
      garageId = booking.garageId;
      bookingCode = booking.bookingCode;

      tx.update(bookingRef, {
        status: 'Mechanic Assigned',
        assignedMechanicId: mechanic.uid,
        assignedMechanicName: mechanic.name.slice(0, 120),
        statusHistory: [
          ...(booking.statusHistory || []),
          {
            status: 'Mechanic Assigned',
            updatedBy: actorUid,
            updatedByRole: actorRole,
            note: `Assigned mechanic ${mechanic.name}`,
            timestamp: nowISO(),
          },
        ].slice(-40),
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'job_cards', jobCardId), {
        jobCardCode,
        bookingId,
        garageId: booking.garageId,
        garageManagerId: booking.garageManagerId || '',
        customerId: booking.customerId,
        assignedMechanicId: mechanic.uid,
        assignedMechanicName: mechanic.name.slice(0, 120),
        vehicleSummary: `${booking.vehicleType} · ${booking.vehicleBrand} ${booking.vehicleModel} (${booking.registrationNumber})`.slice(0, 180),
        customerComplaint: booking.problemDescription.slice(0, 1000),
        inspectionResults: '',
        recommendedWork: '',
        customerApprovedExtraWork: false,
        labourCharges: Number(booking.estimatedPrice || 0),
        partsCharges: 0,
        estimatedCompletion: `${booking.appointmentDate} Evening`,
        actualCompletion: '',
        status: 'Mechanic Assigned',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await createNotification({
      recipientId: mechanic.uid,
      recipientRole: 'mechanic',
      garageId,
      title: `New Job Assigned (${jobCardCode})`,
      message: `You have been assigned to booking ${bookingCode}.`,
      type: 'MECHANIC_ASSIGNED',
      relatedBookingId: bookingId,
    });

    await createNotification({
      recipientId: customerId,
      recipientRole: 'customer',
      garageId,
      title: `Mechanic Assigned (${bookingCode})`,
      message: `${mechanic.name} has been assigned to service your vehicle.`,
      type: 'MECHANIC_ASSIGNED',
      relatedBookingId: bookingId,
    });

    await writeAuditLog({
      actorId: actorUid,
      actorRole,
      action: 'ASSIGN_MECHANIC',
      targetCollection: 'job_cards',
      targetId: jobCardId,
      garageId,
      details: `Assigned ${mechanic.name} to booking ${bookingCode}`,
    });

    return jobCardId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `job_cards/${jobCardId}`);
  }
}

export async function advanceWorkshopStage(params: {
  bookingId: string;
  jobCardId?: string;
  newStatus: BookingStatus;
  notes: string;
  labourNotes?: string;
  partsUsed?: PartUsageItem[];
  inspectionResults?: string;
  recommendedWork?: string;
  actorUid: string;
  actorRole: UserRole;
}): Promise<void> {
  try {
    let customerId = '';
    let garageId = '';
    let garageManagerId = '';
    let bookingCode = '';
    let assignedMechanicId = '';

    await runTransaction(db, async (tx) => {
      const bookingRef = doc(db, 'bookings', params.bookingId);
      const bSnap = await tx.get(bookingRef);
      if (!bSnap.exists()) throw new Error('Booking not found.');
      const booking = bSnap.data() as Booking;

      customerId = booking.customerId;
      garageId = booking.garageId;
      garageManagerId = booking.garageManagerId || '';
      bookingCode = booking.bookingCode;
      assignedMechanicId = booking.assignedMechanicId || params.actorUid;

      tx.update(bookingRef, {
        status: params.newStatus,
        statusHistory: [
          ...(booking.statusHistory || []),
          {
            status: params.newStatus,
            updatedBy: params.actorUid,
            updatedByRole: params.actorRole,
            note: params.notes.trim().slice(0, 240) || `Status updated to ${params.newStatus}`,
            timestamp: nowISO(),
          },
        ].slice(-40),
        updatedAt: serverTimestamp(),
      });

      if (params.jobCardId) {
        const jcRef = doc(db, 'job_cards', params.jobCardId);
        const jcSnap = await tx.get(jcRef);
        if (jcSnap.exists()) {
          const jc = jcSnap.data() as JobCard;
          const addedPartsCost = (params.partsUsed || []).reduce(
            (sum, p) => sum + Number(p.unitPrice) * Number(p.quantity),
            0
          );
          const jcUpdates: Record<string, unknown> = {
            status: params.newStatus,
            updatedAt: serverTimestamp(),
          };
          if (params.inspectionResults !== undefined) {
            jcUpdates.inspectionResults = params.inspectionResults.slice(0, 1500);
          }
          if (params.recommendedWork !== undefined) {
            jcUpdates.recommendedWork = params.recommendedWork.slice(0, 1500);
          }
          if (addedPartsCost > 0) {
            jcUpdates.partsCharges = Number(jc.partsCharges || 0) + addedPartsCost;
          }
          if (params.newStatus === 'Completed') {
            jcUpdates.actualCompletion = nowISO();
          }
          tx.update(jcRef, jcUpdates);
        }
      }
    });

    if (params.jobCardId) {
      await setDoc(doc(db, 'mechanic_updates', cleanId('mup')), {
        jobCardId: params.jobCardId,
        bookingId: params.bookingId,
        garageId,
        garageManagerId,
        assignedMechanicId,
        customerId,
        status: params.newStatus,
        notes: params.notes.trim().slice(0, 1000) || `Updated to ${params.newStatus}`,
        partsUsed: params.partsUsed || [],
        labourNotes: (params.labourNotes || '').slice(0, 500),
        createdAt: serverTimestamp(),
      });
    }

    await createNotification({
      recipientId: customerId,
      recipientRole: 'customer',
      garageId,
      title: `Service Update: ${params.newStatus} (${bookingCode})`,
      message: params.notes.trim() || `Your vehicle status is now ${params.newStatus}.`,
      type: 'WORKSHOP_UPDATE',
      relatedBookingId: params.bookingId,
    });

    if (params.actorRole === 'mechanic' && garageManagerId) {
      await createNotification({
        recipientId: garageManagerId,
        recipientRole: 'garage_manager',
        garageId,
        title: `Mechanic Update: ${params.newStatus} (${bookingCode})`,
        message: params.notes.trim() || `Mechanic updated job ${bookingCode} to ${params.newStatus}.`,
        type: 'MECHANIC_PROGRESS',
        relatedBookingId: params.bookingId,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${params.bookingId}`);
  }
}

export async function approveCustomerRecommendedWork(
  bookingId: string,
  jobCardId: string,
  customerUid: string
): Promise<void> {
  try {
    let garageId = '';
    let garageManagerId = '';
    let bookingCode = '';

    await runTransaction(db, async (tx) => {
      const bRef = doc(db, 'bookings', bookingId);
      const bSnap = await tx.get(bRef);
      if (!bSnap.exists()) throw new Error('Booking not found.');
      const booking = bSnap.data() as Booking;
      if (booking.customerId !== customerUid) throw new Error('Unauthorized.');

      garageId = booking.garageId;
      garageManagerId = booking.garageManagerId || '';
      bookingCode = booking.bookingCode;

      tx.update(bRef, {
        status: 'Work In Progress',
        statusHistory: [
          ...(booking.statusHistory || []),
          {
            status: 'Work In Progress',
            updatedBy: customerUid,
            updatedByRole: 'customer',
            note: 'Customer approved recommended additional work',
            timestamp: nowISO(),
          },
        ].slice(-40),
        updatedAt: serverTimestamp(),
      });

      tx.update(doc(db, 'job_cards', jobCardId), {
        customerApprovedExtraWork: true,
        updatedAt: serverTimestamp(),
      });
    });

    if (garageManagerId) {
      await createNotification({
        recipientId: garageManagerId,
        recipientRole: 'garage_manager',
        garageId,
        title: `Extra Work Approved (${bookingCode})`,
        message: `Customer approved the recommended estimate for ${bookingCode}.`,
        type: 'CUSTOMER_APPROVED_WORK',
        relatedBookingId: bookingId,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
  }
}

export async function saveInspection(params: {
  id?: string;
  jobCardId: string;
  bookingId: string;
  garageId: string;
  garageManagerId?: string;
  assignedMechanicId: string;
  customerId: string;
  notes: string;
  checklist: ChecklistItem[];
  photoUrls?: string[];
  submittedForApproval: boolean;
  managerApproved: boolean;
}): Promise<string> {
  const id = params.id || cleanId('ins');
  try {
    const ref = doc(db, 'inspections', id);
    const payload = {
      jobCardId: params.jobCardId,
      bookingId: params.bookingId,
      garageId: params.garageId,
      garageManagerId: params.garageManagerId || '',
      assignedMechanicId: params.assignedMechanicId,
      customerId: params.customerId,
      notes: params.notes.slice(0, 2000),
      checklist: params.checklist.slice(0, 30),
      photoUrls: (params.photoUrls || []).slice(0, 10),
      submittedForApproval: params.submittedForApproval,
      managerApproved: params.managerApproved,
      updatedAt: serverTimestamp(),
    };
    if (params.id) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `inspections/${id}`);
  }
}

export async function upsertAppointmentSlot(slot: Omit<AppointmentSlot, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
  const id = makeSlotId(slot.garageId, slot.date, slot.timeSlot);
  try {
    const ref = doc(db, 'appointment_slots', id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const existing = snap.data() as AppointmentSlot;
      await updateDoc(ref, {
        capacity: Math.max(existing.bookedCount, Number(slot.capacity)),
        isBlocked: slot.isBlocked,
        note: (slot.note || '').slice(0, 200),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...slot,
        bookedCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `appointment_slots/${id}`);
  }
}

export async function saveServiceCategory(cat: Omit<ServiceCategory, 'createdAt' | 'updatedAt'>): Promise<string> {
  const id = cat.id || cleanId('cat');
  try {
    const ref = doc(db, 'service_categories', id);
    const payload = {
      garageId: cat.garageId,
      garageManagerId: cat.garageManagerId || '',
      name: cat.name.trim().slice(0, 100),
      vehicleType: cat.vehicleType,
      description: (cat.description || '').slice(0, 300),
      isActive: cat.isActive,
      updatedAt: serverTimestamp(),
    };
    if (cat.id) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `service_categories/${id}`);
  }
}

export async function saveServicePackage(pkg: Omit<ServicePackage, 'createdAt' | 'updatedAt'>): Promise<string> {
  const id = pkg.id || cleanId('pkg');
  try {
    const ref = doc(db, 'service_packages', id);
    const payload = {
      garageId: pkg.garageId,
      garageManagerId: pkg.garageManagerId || '',
      categoryId: pkg.categoryId,
      categoryName: pkg.categoryName.slice(0, 100),
      name: pkg.name.trim().slice(0, 120),
      vehicleType: pkg.vehicleType,
      includedServices: pkg.includedServices.slice(0, 20),
      labourCharge: Number(pkg.labourCharge),
      partsEstimate: Number(pkg.partsEstimate),
      startingPrice: Number(pkg.startingPrice),
      estimatedDurationMins: Number(pkg.estimatedDurationMins),
      description: (pkg.description || '').slice(0, 500),
      isDemoEstimate: Boolean(pkg.isDemoEstimate),
      isActive: pkg.isActive,
      updatedAt: serverTimestamp(),
    };
    if (pkg.id) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `service_packages/${id}`);
  }
}

export async function saveSparePart(part: Omit<SparePart, 'createdAt' | 'updatedAt'>): Promise<string> {
  const id = part.id || cleanId('prt');
  try {
    const ref = doc(db, 'spare_parts', id);
    const payload = {
      garageId: part.garageId,
      garageManagerId: part.garageManagerId || '',
      authorizedMechanicIds: (part.authorizedMechanicIds || []).slice(0, 25),
      name: part.name.trim().slice(0, 120),
      sku: part.sku.trim().toUpperCase().slice(0, 48),
      category: part.category.trim().slice(0, 64),
      brand: part.brand.trim().slice(0, 64),
      purchasePrice: Number(part.purchasePrice),
      sellingPrice: Number(part.sellingPrice),
      quantity: Math.max(0, Number(part.quantity)),
      minStockLevel: Math.max(0, Number(part.minStockLevel)),
      supplier: (part.supplier || '').slice(0, 120),
      isActive: part.isActive,
      updatedAt: serverTimestamp(),
    };
    if (part.id) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `spare_parts/${id}`);
  }
}

export async function adjustSparePartStock(params: {
  partId: string;
  delta: number;
  type: 'purchase' | 'usage' | 'adjustment';
  notes: string;
  actorUid: string;
  bookingId?: string;
}): Promise<{ newQty: number; part: SparePart }> {
  try {
    let resultPart!: SparePart;
    let newQty = 0;

    await runTransaction(db, async (tx) => {
      const partRef = doc(db, 'spare_parts', params.partId);
      const snap = await tx.get(partRef);
      if (!snap.exists()) throw new Error('Spare part not found.');
      const part = { id: snap.id, ...(snap.data() as SparePart) };

      const nextQty = Number(part.quantity) + Number(params.delta);
      if (nextQty < 0) {
        throw new Error(`Insufficient stock for ${part.name}. Available: ${part.quantity}, requested deduction: ${Math.abs(params.delta)}.`);
      }

      newQty = nextQty;
      resultPart = { ...part, quantity: nextQty };

      tx.update(partRef, {
        quantity: nextQty,
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'inventory_logs', cleanId('ilog')), {
        partId: params.partId,
        partName: part.name.slice(0, 120),
        garageId: part.garageId,
        garageManagerId: part.garageManagerId || '',
        type: params.type,
        quantityDelta: Number(params.delta),
        previousQty: Number(part.quantity),
        newQty: nextQty,
        bookingId: (params.bookingId || '').slice(0, 128),
        notes: params.notes.slice(0, 300),
        performedBy: params.actorUid,
        createdAt: serverTimestamp(),
      });
    });

    if (newQty <= resultPart.minStockLevel && resultPart.garageManagerId) {
      await createNotification({
        recipientId: resultPart.garageManagerId,
        recipientRole: 'garage_manager',
        garageId: resultPart.garageId,
        title: `Low Stock Alert: ${resultPart.name}`,
        message: `${resultPart.name} (${resultPart.sku}) stock dropped to ${newQty} (min: ${resultPart.minStockLevel}).`,
        type: 'LOW_STOCK',
      });
    }

    return { newQty, part: resultPart };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `spare_parts/${params.partId}`);
  }
}

export async function generateInvoice(params: {
  booking: Booking;
  jobCard?: JobCard;
  garage: Garage;
  serviceDescription: string;
  labourCharges: number;
  partsCharges: number;
  discount: number;
  taxRate: number;
  actorUid: string;
  actorRole: UserRole;
}): Promise<string> {
  const id = cleanId('inv');
  const invoiceNumber = `INV-${params.garage.code}-${Math.floor(10000 + Math.random() * 90000)}`;
  const subtotal = Math.max(0, Number(params.labourCharges) + Number(params.partsCharges) - Number(params.discount));
  const taxAmount = Math.round((subtotal * Number(params.taxRate)) / 100);
  const finalTotal = subtotal + taxAmount;

  try {
    await setDoc(doc(db, 'invoices', id), {
      invoiceNumber,
      garageId: params.garage.garageId,
      garageName: params.garage.name.slice(0, 120),
      garageAddress: params.garage.address.slice(0, 300),
      garagePhone: params.garage.phone.slice(0, 30),
      garageManagerId: params.garage.managerUid || '',
      customerId: params.booking.customerId,
      customerName: params.booking.customerName.slice(0, 120),
      customerPhone: params.booking.customerPhone.slice(0, 30),
      vehicleSummary: `${params.booking.vehicleType} · ${params.booking.vehicleBrand} ${params.booking.vehicleModel} (${params.booking.registrationNumber})`.slice(0, 180),
      bookingId: params.booking.id || '',
      jobCardId: params.jobCard?.id || '',
      serviceDescription: params.serviceDescription.slice(0, 500),
      labourCharges: Number(params.labourCharges),
      partsCharges: Number(params.partsCharges),
      discount: Number(params.discount),
      taxRate: Number(params.taxRate),
      taxAmount,
      finalTotal,
      paidAmount: 0,
      paymentStatus: 'Pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await createNotification({
      recipientId: params.booking.customerId,
      recipientRole: 'customer',
      garageId: params.garage.garageId,
      title: `Invoice Generated (${invoiceNumber})`,
      message: `Invoice ${invoiceNumber} for ₹${finalTotal.toLocaleString('en-IN')} is ready in My Invoices.`,
      type: 'INVOICE_GENERATED',
      relatedBookingId: params.booking.id,
    });

    await writeAuditLog({
      actorId: params.actorUid,
      actorRole: params.actorRole,
      action: 'GENERATE_INVOICE',
      targetCollection: 'invoices',
      targetId: id,
      garageId: params.garage.garageId,
      details: `Generated ${invoiceNumber} for booking ${params.booking.bookingCode} total INR ${finalTotal}`,
    });

    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `invoices/${id}`);
  }
}

export async function recordVerifiedPayment(params: {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  referenceNote: string;
  actorUid: string;
  actorRole: UserRole;
}): Promise<void> {
  if (params.amount <= 0) throw new Error('Payment amount must be greater than zero.');

  try {
    let customerId = '';
    let garageId = '';
    let invoiceNumber = '';
    let bookingId = '';
    let nextStatus: PaymentStatus = 'Partially Paid';

    await runTransaction(db, async (tx) => {
      const invRef = doc(db, 'invoices', params.invoiceId);
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists()) throw new Error('Invoice not found.');
      const inv = invSnap.data() as Invoice;

      customerId = inv.customerId;
      garageId = inv.garageId;
      invoiceNumber = inv.invoiceNumber;
      bookingId = inv.bookingId;

      const newPaid = Number(inv.paidAmount || 0) + Number(params.amount);
      if (newPaid > inv.finalTotal) {
        throw new Error(`Payment exceeds balance due (remaining: ₹${Math.max(0, inv.finalTotal - inv.paidAmount)}).`);
      }

      nextStatus = newPaid >= inv.finalTotal ? 'Paid' : 'Partially Paid';

      tx.update(invRef, {
        paidAmount: newPaid,
        paymentStatus: nextStatus,
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'payments', cleanId('pay')), {
        invoiceId: params.invoiceId,
        invoiceNumber: inv.invoiceNumber,
        bookingId: inv.bookingId,
        garageId: inv.garageId,
        garageManagerId: inv.garageManagerId || '',
        customerId: inv.customerId,
        amount: Number(params.amount),
        method: params.method,
        referenceNote: params.referenceNote.slice(0, 200),
        status: nextStatus,
        verifiedBy: params.actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await createNotification({
      recipientId: customerId,
      recipientRole: 'customer',
      garageId,
      title: `Payment Recorded (${invoiceNumber})`,
      message: `Verified payment of ₹${params.amount.toLocaleString('en-IN')} via ${params.method}. Invoice status: ${nextStatus}.`,
      type: 'PAYMENT_RECORDED',
      relatedBookingId: bookingId,
    });

    await writeAuditLog({
      actorId: params.actorUid,
      actorRole: params.actorRole,
      action: 'RECORD_PAYMENT',
      targetCollection: 'invoices',
      targetId: params.invoiceId,
      garageId,
      details: `Recorded verified ${params.method} payment of INR ${params.amount} on ${invoiceNumber}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `payments`);
  }
}

export async function recordExpense(params: {
  garageId: string;
  garageManagerId?: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expenseDate: string;
  recordedBy: string;
}): Promise<string> {
  const id = cleanId('exp');
  try {
    await setDoc(doc(db, 'expenses', id), {
      garageId: params.garageId,
      garageManagerId: params.garageManagerId || '',
      category: params.category,
      description: params.description.trim().slice(0, 300),
      amount: Number(params.amount),
      expenseDate: params.expenseDate,
      recordedBy: params.recordedBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `expenses/${id}`);
  }
}

export async function submitVerifiedReview(params: {
  garageId: string;
  garageManagerId?: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  rating: number;
  comment: string;
}): Promise<string> {
  const id = `rev_${params.bookingId}`;
  try {
    await setDoc(doc(db, 'reviews', id), {
      garageId: params.garageId,
      garageManagerId: params.garageManagerId || '',
      bookingId: params.bookingId,
      customerId: params.customerId,
      customerName: params.customerName.slice(0, 120),
      rating: Math.min(5, Math.max(1, Math.round(params.rating))),
      comment: params.comment.trim().slice(0, 1000),
      verified: true,
      createdAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reviews/${id}`);
  }
}

export async function createSupportTicket(params: {
  customerId: string;
  customerName: string;
  garageId: string;
  garageManagerId?: string;
  bookingId?: string;
  subject: string;
  message: string;
  priority: 'Low' | 'Medium' | 'High';
}): Promise<string> {
  const id = cleanId('tkt');
  const ticketCode = `TKT-${Math.floor(10000 + Math.random() * 90000)}`;
  try {
    await setDoc(doc(db, 'support_tickets', id), {
      ticketCode,
      customerId: params.customerId,
      customerName: params.customerName.slice(0, 120),
      garageId: params.garageId,
      garageManagerId: params.garageManagerId || '',
      bookingId: (params.bookingId || '').slice(0, 128),
      subject: params.subject.trim().slice(0, 180),
      message: params.message.trim().slice(0, 1500),
      priority: params.priority,
      status: 'Open',
      replies: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (params.garageManagerId) {
      await createNotification({
        recipientId: params.garageManagerId,
        recipientRole: 'garage_manager',
        garageId: params.garageId,
        title: `New Support Ticket (${ticketCode})`,
        message: `${params.customerName}: ${params.subject}`,
        type: 'NEW_TICKET',
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `support_tickets/${id}`);
  }
}

export async function replyToSupportTicket(
  ticketId: string,
  ticket: SupportTicket,
  reply: TicketReply,
  newStatus?: SupportTicket['status']
): Promise<void> {
  try {
    await updateDoc(doc(db, 'support_tickets', ticketId), {
      replies: [...(ticket.replies || []), reply].slice(-30),
      status: newStatus || ticket.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `support_tickets/${ticketId}`);
  }
}

export async function addSupportInternalNote(params: {
  ticketId: string;
  garageId: string;
  garageManagerId?: string;
  authorId: string;
  note: string;
}): Promise<void> {
  const id = cleanId('snote');
  try {
    await setDoc(doc(db, 'support_internal_notes', id), {
      ticketId: params.ticketId,
      garageId: params.garageId,
      garageManagerId: params.garageManagerId || '',
      authorId: params.authorId,
      note: params.note.trim().slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `support_internal_notes/${id}`);
  }
}

export async function markNotificationRead(notifId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notifId), { isRead: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notifId}`);
  }
}

export async function toggleMechanicAvailability(mechanicUid: string, isAvailable: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'garage_mechanics', mechanicUid), {
      isAvailable,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `garage_mechanics/${mechanicUid}`);
  }
}

export { SUPER_ADMIN_EMAIL };
