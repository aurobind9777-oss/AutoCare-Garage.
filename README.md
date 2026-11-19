# AutoCare Garage — Six-Garage Car & Bike Service Platform

**AutoCare Garage** (*Your Vehicle, Our Responsibility.*) is a multi-location Car & Bike Service Booking and Garage Management platform operating across **6 independent garage hubs** (`garage-1` through `garage-6`, codes `ACG-01` – `ACG-06`), built with React, TypeScript, Tailwind CSS, Firebase Authentication, and Cloud Firestore.

---

## Core Architecture & Roles

1. **Super Admin (`aurobind9777@gmail.com`)**
   - Executive Dashboard displaying **MY 6 GARAGES** directly on the main screen with live Firestore KPIs (total/pending/accepted/rejected bookings, today's slots, completed services, mechanics count, monthly revenue), search & status filters, garage-wise comparison bars, and direct drill-down into any garage (`View Dashboard`, `Manage Garage`, `View Bookings`, `Edit Garage`).
   - Full oversight of all bookings, customers, managers/mechanics staff provisioning, vehicles, packages, job cards, inventory (with CSV export), invoices (with jsPDF download), financial reports, reviews, support tickets, platform settings, and immutable audit logs.
2. **Garage Manager**
   - Strictly isolated to their single assigned `garageId`.
   - New Booking Requests desk (`ACCEPT BOOKING`, `REJECT BOOKING` with mandatory reason, `REQUEST RESCHEDULE` with date/time suggestion), mechanic assignment & job card creation, independent appointment slots (capacity + holiday/break blocking), garage-specific services & packages, inspection approval, spare parts inventory with low-stock alerts & CSV export, PDF invoice generation, verified manual payment recording (`Cash`, `UPI`, `Card (Manual)`, `Other`), expense tracking, support tickets with private staff-only internal notes, and branch settings.
3. **Mechanic**
   - Strictly isolated to assigned job cards (`assignedMechanicId`) in their garage.
   - Multi-point vehicle inspection checklists, atomic spare parts usage deduction (negative stock prevented), workshop stage progression, and availability toggle.
4. **Customer**
   - Default signup role with verified email enforcement.
   - Car & Bike registration, Find a Garage, 5-step Six-Garage Booking Wizard routing strictly to one selected active garage with atomic slot locking, Live Service Tracking (approve/decline reschedules & extra repair estimates), Service History, downloadable PDF Invoices, Payment History, Verified Reviews (for `Completed` bookings only), and Support Tickets.

---

## Firestore Setup & Security Rules

- **Blueprint**: `firebase-blueprint.json`
- **Hardened Security Rules**: `firestore.rules` (validated with `@firebase/eslint-plugin-security-rules`)
- **Database Config**: `firebase-applet-config.json`

### Important Firebase Console Notes
1. **Google Sign-In** works out of the box with verified emails (`email_verified == true`).
2. **Email/Password Sign-In**: Enable **Email/Password** under **Firebase Console → Authentication → Sign-in method** if you want customers/staff to register with email & password. All writes enforce verified email (`request.auth.token.email_verified == true`).
3. **Authorized Domains**: Add your deployed Vercel or custom domain under **Firebase Console → Authentication → Settings → Authorized domains**.
4. **First Boot**: Sign in as `aurobind9777@gmail.com` via Google Sign-In to automatically initialize the 6 demo garage branches, demo Car & Bike service packages (labeled Demo Estimate), and starter spare parts in Firestore.

---

## Local Development & Build

```bash
npm install
npm run dev
npm run lint
npm run build
```
