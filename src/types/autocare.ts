export type UserRole = 'super_admin' | 'garage_manager' | 'mechanic' | 'customer';

export type VehicleType = 'Car' | 'Bike';

export type BookingStatus =
  | 'Pending'
  | 'Accepted'
  | 'Rejected'
  | 'Reschedule Requested'
  | 'Confirmed'
  | 'Mechanic Assigned'
  | 'Vehicle Received'
  | 'Inspection'
  | 'Estimate Prepared'
  | 'Awaiting Customer Approval'
  | 'Work In Progress'
  | 'Waiting for Parts'
  | 'Quality Check'
  | 'Ready for Pickup'
  | 'Completed'
  | 'Cancellation Requested'
  | 'Cancelled';

export type PaymentMethod = 'Cash' | 'UPI' | 'Card (Manual)' | 'Other';
export type PaymentStatus = 'Pending' | 'Partially Paid' | 'Paid' | 'Refunded';

export type ExpenseCategory =
  | 'Spare Parts Purchases'
  | 'Mechanic Salaries'
  | 'Rent'
  | 'Electricity'
  | 'Equipment'
  | 'Maintenance'
  | 'Other';

export interface StatusHistoryEntry {
  status: BookingStatus;
  updatedBy: string;
  updatedByRole: string;
  note: string;
  timestamp: string;
}

export interface UserAccount {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  garageId?: string;
  claimedInviteId?: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CustomerProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  pincode?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Garage {
  garageId: string;
  code: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  operatingHours: string;
  dailyCapacity: number;
  slotDurationMins: number;
  photoUrl?: string;
  managerUid?: string;
  managerName?: string;
  isActive: boolean;
  isDemoInfo?: boolean;
  supportedVehicles?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StaffInvite {
  id?: string;
  email: string;
  role: 'garage_manager' | 'mechanic';
  garageId: string;
  name: string;
  phone?: string;
  specialization?: string;
  status: 'pending' | 'claimed' | 'revoked';
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GarageManager {
  uid: string;
  garageId: string;
  name: string;
  email: string;
  phone?: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GarageMechanic {
  uid: string;
  garageId: string;
  garageManagerId?: string;
  name: string;
  email: string;
  phone?: string;
  specialization?: string;
  isAvailable: boolean;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Vehicle {
  id?: string;
  customerId: string;
  vehicleType: VehicleType;
  registrationNumber: string;
  brand: string;
  model: string;
  variant?: string;
  fuelType: string;
  year: number;
  odometer: number;
  photoUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ServiceCategory {
  id?: string;
  garageId: string;
  garageManagerId?: string;
  name: string;
  vehicleType: VehicleType;
  description?: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ServicePackage {
  id?: string;
  garageId: string;
  garageManagerId?: string;
  categoryId: string;
  categoryName: string;
  name: string;
  vehicleType: VehicleType;
  includedServices: string[];
  labourCharge: number;
  partsEstimate: number;
  startingPrice: number;
  estimatedDurationMins: number;
  description?: string;
  isDemoEstimate?: boolean;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AppointmentSlot {
  id?: string;
  garageId: string;
  garageManagerId?: string;
  date: string;
  timeSlot: string;
  capacity: number;
  bookedCount: number;
  isBlocked: boolean;
  note?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Booking {
  id?: string;
  bookingCode: string;
  garageId: string;
  garageName: string;
  garageManagerId?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  vehicleId: string;
  vehicleType: VehicleType;
  registrationNumber: string;
  vehicleBrand: string;
  vehicleModel: string;
  categoryId: string;
  categoryName: string;
  packageId: string;
  packageName: string;
  estimatedPrice: number;
  problemDescription: string;
  photoUrls?: string[];
  appointmentDate: string;
  appointmentTime: string;
  slotId: string;
  status: BookingStatus;
  statusHistory: StatusHistoryEntry[];
  rejectionReason?: string;
  rescheduleSuggestedDate?: string;
  rescheduleSuggestedTime?: string;
  rescheduleNote?: string;
  assignedMechanicId?: string;
  assignedMechanicName?: string;
  acceptedBy?: string;
  rejectedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface JobCard {
  id?: string;
  jobCardCode: string;
  bookingId: string;
  garageId: string;
  garageManagerId?: string;
  customerId: string;
  assignedMechanicId: string;
  assignedMechanicName: string;
  vehicleSummary: string;
  customerComplaint?: string;
  inspectionResults?: string;
  recommendedWork?: string;
  customerApprovedExtraWork: boolean;
  labourCharges: number;
  partsCharges: number;
  estimatedCompletion?: string;
  actualCompletion?: string;
  status: BookingStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChecklistItem {
  item: string;
  condition: 'OK' | 'Needs Attention' | 'Critical';
  note?: string;
}

export interface Inspection {
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
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PartUsageItem {
  partId: string;
  partName: string;
  quantity: number;
  unitPrice: number;
}

export interface MechanicUpdate {
  id?: string;
  jobCardId: string;
  bookingId: string;
  garageId: string;
  garageManagerId?: string;
  assignedMechanicId: string;
  customerId: string;
  status: string;
  notes: string;
  partsUsed?: PartUsageItem[];
  labourNotes?: string;
  createdAt?: unknown;
}

export interface SparePart {
  id?: string;
  garageId: string;
  garageManagerId?: string;
  authorizedMechanicIds?: string[];
  name: string;
  sku: string;
  category: string;
  brand: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  minStockLevel: number;
  supplier?: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InventoryLog {
  id?: string;
  partId: string;
  partName: string;
  garageId: string;
  garageManagerId?: string;
  type: 'purchase' | 'usage' | 'adjustment';
  quantityDelta: number;
  previousQty: number;
  newQty: number;
  bookingId?: string;
  notes?: string;
  performedBy: string;
  createdAt?: unknown;
}

export interface Invoice {
  id?: string;
  invoiceNumber: string;
  garageId: string;
  garageName: string;
  garageAddress?: string;
  garagePhone?: string;
  garageManagerId?: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  vehicleSummary: string;
  bookingId: string;
  jobCardId?: string;
  serviceDescription: string;
  labourCharges: number;
  partsCharges: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  finalTotal: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Payment {
  id?: string;
  invoiceId: string;
  invoiceNumber: string;
  bookingId: string;
  garageId: string;
  garageManagerId?: string;
  customerId: string;
  amount: number;
  method: PaymentMethod;
  referenceNote?: string;
  status: PaymentStatus;
  verifiedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Expense {
  id?: string;
  garageId: string;
  garageManagerId?: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expenseDate: string;
  recordedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Review {
  id?: string;
  garageId: string;
  garageManagerId?: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  rating: number;
  comment: string;
  verified: boolean;
  createdAt?: unknown;
}

export interface TicketReply {
  authorId: string;
  authorName: string;
  authorRole: string;
  message: string;
  timestamp: string;
}

export interface SupportTicket {
  id?: string;
  ticketCode: string;
  customerId: string;
  customerName: string;
  garageId: string;
  garageManagerId?: string;
  bookingId?: string;
  subject: string;
  message: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  replies: TicketReply[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SupportInternalNote {
  id?: string;
  ticketId: string;
  garageId: string;
  garageManagerId?: string;
  authorId: string;
  note: string;
  createdAt?: unknown;
}

export interface AppNotification {
  id?: string;
  recipientId: string;
  recipientRole: UserRole;
  garageId?: string;
  title: string;
  message: string;
  type: string;
  relatedBookingId?: string;
  isRead: boolean;
  createdAt?: unknown;
}

export interface AuditLog {
  id?: string;
  actorId: string;
  actorRole: string;
  actorEmail?: string;
  action: string;
  targetCollection: string;
  targetId: string;
  garageId?: string;
  details: string;
  createdAt?: unknown;
}

export interface PlatformSettings {
  businessName: string;
  tagline: string;
  currency: string;
  defaultTaxRate: number;
  supportEmail?: string;
  supportPhone?: string;
  updatedAt?: unknown;
}
