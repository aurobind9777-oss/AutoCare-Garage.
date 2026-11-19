/**
 * Payload-First Security Test Suite for AutoCare Garage Firestore Rules.
 * Covers the "Dirty Dozen" adversarial payloads defined in security_spec.md.
 * Run against Firebase Emulator Suite (`@firebase/rules-unit-testing`) when emulator is available.
 */

export interface SecurityTestCase {
  id: string;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  actorRole: 'customer' | 'garage_manager' | 'mechanic' | 'anonymous';
  actorGarageId?: string;
  expected: 'PERMISSION_DENIED';
  payload: Record<string, unknown>;
}

export const DIRTY_DOZEN_PAYLOADS: SecurityTestCase[] = [
  {
    id: 'DD-01',
    name: 'Role Self-Escalation on Create',
    collection: 'users/attacker_uid',
    operation: 'create',
    actorRole: 'customer',
    expected: 'PERMISSION_DENIED',
    payload: {
      uid: 'attacker_uid',
      email: 'attacker@example.com',
      displayName: 'Attacker',
      role: 'super_admin',
      isActive: true,
    },
  },
  {
    id: 'DD-02',
    name: 'Role Self-Escalation on Update',
    collection: 'users/customer_uid',
    operation: 'update',
    actorRole: 'customer',
    expected: 'PERMISSION_DENIED',
    payload: {
      role: 'garage_manager',
      garageId: 'garage-1',
    },
  },
  {
    id: 'DD-03',
    name: 'Ghost Shadow Field Injection on Booking',
    collection: 'bookings/bk_shadow_1',
    operation: 'create',
    actorRole: 'customer',
    expected: 'PERMISSION_DENIED',
    payload: {
      bookingCode: 'ACG-9999',
      garageId: 'garage-1',
      customerId: 'customer_uid',
      status: 'Pending',
      isApproved: true,
    },
  },
  {
    id: 'DD-04',
    name: 'Spoofed Customer Booking',
    collection: 'bookings/bk_spoof_1',
    operation: 'create',
    actorRole: 'customer',
    expected: 'PERMISSION_DENIED',
    payload: {
      bookingCode: 'ACG-9998',
      garageId: 'garage-1',
      customerId: 'victim_uid',
      status: 'Pending',
    },
  },
  {
    id: 'DD-05',
    name: 'Booking Created Pre-Accepted',
    collection: 'bookings/bk_preaccept_1',
    operation: 'create',
    actorRole: 'customer',
    expected: 'PERMISSION_DENIED',
    payload: {
      bookingCode: 'ACG-9997',
      garageId: 'garage-1',
      customerId: 'customer_uid',
      status: 'Accepted',
    },
  },
  {
    id: 'DD-06',
    name: 'Cross-Garage Manager Acceptance',
    collection: 'bookings/bk_garage2_1',
    operation: 'update',
    actorRole: 'garage_manager',
    actorGarageId: 'garage-1',
    expected: 'PERMISSION_DENIED',
    payload: {
      garageId: 'garage-2',
      status: 'Accepted',
      acceptedBy: 'manager_garage_1',
    },
  },
  {
    id: 'DD-07',
    name: 'Mechanic Approving Booking',
    collection: 'bookings/bk_garage1_1',
    operation: 'update',
    actorRole: 'mechanic',
    actorGarageId: 'garage-1',
    expected: 'PERMISSION_DENIED',
    payload: {
      status: 'Accepted',
    },
  },
  {
    id: 'DD-08',
    name: 'Customer Tampering with Invoice Total',
    collection: 'invoices/inv_1',
    operation: 'update',
    actorRole: 'customer',
    expected: 'PERMISSION_DENIED',
    payload: {
      finalTotal: 1,
      paymentStatus: 'Paid',
    },
  },
  {
    id: 'DD-09',
    name: 'Customer PII Scraping',
    collection: 'customers/victim_uid',
    operation: 'get',
    actorRole: 'customer',
    expected: 'PERMISSION_DENIED',
    payload: {},
  },
  {
    id: 'DD-10',
    name: 'ID Poisoning with Invalid Characters',
    collection: 'bookings/invalid!@#id',
    operation: 'create',
    actorRole: 'customer',
    expected: 'PERMISSION_DENIED',
    payload: {},
  },
  {
    id: 'DD-11',
    name: 'Terminal State Reopening by Manager',
    collection: 'bookings/bk_completed_1',
    operation: 'update',
    actorRole: 'garage_manager',
    actorGarageId: 'garage-1',
    expected: 'PERMISSION_DENIED',
    payload: {
      status: 'Pending',
    },
  },
  {
    id: 'DD-12',
    name: 'Audit Log Tampering',
    collection: 'audit_logs/log_1',
    operation: 'delete',
    actorRole: 'garage_manager',
    actorGarageId: 'garage-1',
    expected: 'PERMISSION_DENIED',
    payload: {},
  },
];
