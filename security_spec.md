# AutoCare Garage Security Specification (Payload-First TDD)

## 1. Core Data Invariants
1. **Six-Garage Isolation**: Every garage-scoped entity (`bookings`, `service_categories`, `service_packages`, `appointment_slots`, `job_cards`, `inspections`, `mechanic_updates`, `spare_parts`, `inventory_logs`, `invoices`, `payments`, `expenses`, `support_tickets`, `support_internal_notes`) MUST carry an immutable `garageId` matching an existing `/garages/{garageId}` document.
2. **No Self-Escalation**: Public signups in `/users/{uid}` MUST ONLY create documents with `role == 'customer'`, unless claiming a valid Super Admin-issued `/staff_invites/{inviteId}` matching `request.auth.token.email` (with `email_verified == true`).
3. **Booking Integrity**: A booking MUST be created by the owning `customerId == request.auth.uid`, MUST start in `status == 'Pending'`, MUST reference an existing active garage, and `garageId` / `customerId` / `createdAt` MUST be immutable after creation.
4. **Manager-Only Acceptance/Rejection**: Only the manager assigned to `booking.garageId` (or `super_admin`) can transition a `Pending` booking to `Accepted`, `Rejected`, or `Reschedule Requested`. Mechanics and customers CANNOT accept or reject bookings.
5. **Mechanic Job Isolation**: Mechanics can only read/update `job_cards`, `inspections`, and `mechanic_updates` where `assignedMechanicId == request.auth.uid` and `garageId` matches their assigned garage. Mechanics CANNOT modify `invoices`, `payments`, or `service_packages`.
6. **PII & Private Note Isolation**: `/customers/{customerId}` is readable/writable strictly by the owning customer or `super_admin`. `/support_internal_notes` are strictly invisible to customers.
7. **Server Timestamps & Strict Keys**: Every write validates exact required/allowed keys (`hasAll` + `hasOnly` on create; `affectedKeys().hasOnly(...)` on update) and enforces `request.time` on `createdAt`/`updatedAt`.
8. **Immutable Audit Trail**: `/audit_logs` cannot be updated or deleted by any client.

## 2. The "Dirty Dozen" Attack Payloads (Must All Return PERMISSION_DENIED)
1. **Role Self-Escalation on Create**: Customer writes `/users/{uid}` with `{ role: 'super_admin' }`.
2. **Role Self-Escalation on Update**: Customer updates own `/users/{uid}` changing `role` to `'garage_manager'`.
3. **Ghost Shadow Field Injection**: Customer creates booking with extra `{ isApproved: true }` shadow field.
4. **Spoofed Customer Booking**: User A creates a booking with `customerId: 'userB'`.
5. **Booking Created Pre-Accepted**: Customer creates a booking with `status: 'Accepted'`.
6. **Cross-Garage Manager Acceptance**: Garage 1 Manager attempts to accept or reject a booking belonging to `garage-2`.
7. **Mechanic Approving Booking**: Mechanic attempts to update `/bookings/{id}` to `status: 'Accepted'`.
8. **Customer Tampering with Invoice Total**: Customer updates `/invoices/{id}` changing `finalTotal` or `paymentStatus: 'Paid'`.
9. **PII Scraping**: Customer A attempts `get` or `list` on `/customers/customerB`.
10. **ID Poisoning (1.5KB ID)**: Attacker attempts write to `/bookings/<200-char-invalid-id!@#>` violating `isValidId()`.
11. **Terminal State Reopening**: Non-admin attempts to update a `Completed` or `Rejected` booking back to `Pending`.
12. **Audit Log Tampering**: Manager or Customer attempts to `update` or `delete` `/audit_logs/{id}`.
