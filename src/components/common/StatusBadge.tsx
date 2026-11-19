import {
  CheckCircle2,
  Clock,
  XCircle,
  Wrench,
  AlertCircle,
  CalendarClock,
  ShieldCheck,
} from 'lucide-react';
import type { BookingStatus, PaymentStatus } from '../../types/autocare';

export function BookingStatusBadge({ status }: { status: BookingStatus | string }) {
  const s = status;
  if (['Completed', 'Accepted', 'Confirmed', 'Ready for Pickup'].includes(s)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{s}</span>
      </span>
    );
  }
  if (['Rejected', 'Cancelled'].includes(s)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{s}</span>
      </span>
    );
  }
  if (['Reschedule Requested', 'Awaiting Customer Approval', 'Waiting for Parts', 'Cancellation Requested'].includes(s)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
        <CalendarClock className="w-3.5 h-3.5 shrink-0" />
        <span>{s}</span>
      </span>
    );
  }
  if (['Mechanic Assigned', 'Vehicle Received', 'Inspection', 'Estimate Prepared', 'Work In Progress', 'Quality Check'].includes(s)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B132B] whitespace-nowrap">
        <Wrench className="w-3.5 h-3.5 shrink-0" />
        <span>{s}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>{s}</span>
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus | string }) {
  if (status === 'Paid') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        <span>Paid</span>
      </span>
    );
  }
  if (status === 'Partially Paid') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>Partially Paid</span>
      </span>
    );
  }
  if (status === 'Refunded') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span>Refunded</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      <span>Pending</span>
    </span>
  );
}

export function ActiveStatusLabel({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
      <span>Active</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
      <XCircle className="w-3.5 h-3.5 shrink-0" />
      <span>Inactive</span>
    </span>
  );
}
