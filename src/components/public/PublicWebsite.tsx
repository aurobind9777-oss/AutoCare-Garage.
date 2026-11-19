import React, { useState, useMemo } from 'react';
import {
  MapPin,
  Phone,
  Clock,
  Car,
  Bike,
  ShieldCheck,
  Wrench,
  CalendarCheck,
  Star,
  ChevronRight,
  X,
  ArrowRight,
  HelpCircle,
  CheckCircle2,
  Menu,
} from 'lucide-react';
import { DEMO_SIX_GARAGES } from '../../data/seedCatalog';
import { formatINR } from '../../utils/exportHelpers';
import { ActiveStatusLabel } from '../common/StatusBadge';
import { GarageImage } from '../common/GarageImage';
import type { Garage, PlatformSettings, Review, ServicePackage, UserAccount } from '../../types/autocare';

interface PublicWebsiteProps {
  garages: Garage[];
  packages: ServicePackage[];
  reviews: Review[];
  settings: PlatformSettings | null;
  account: UserAccount | null;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOpenDashboard: () => void;
  onBookAtGarage: (garageId: string) => void;
}

type PublicPage = 'home' | 'find-garage' | 'services' | 'about' | 'contact' | 'privacy' | 'terms';

export function PublicWebsite({
  garages,
  packages,
  reviews,
  settings,
  account,
  onOpenAuth,
  onOpenDashboard,
  onBookAtGarage,
}: PublicWebsiteProps) {
  const [page, setPage] = useState<PublicPage>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pkgVehicleTab, setPkgVehicleTab] = useState<'Car' | 'Bike'>('Car');
  const [detailGarage, setDetailGarage] = useState<Garage | null>(null);
  const [garageFilter, setGarageFilter] = useState<'all' | 'active'>('all');
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMsg, setContactMsg] = useState('');

  const displayGarages: Garage[] = useMemo(() => {
    const source = garages.length > 0 ? garages : DEMO_SIX_GARAGES;
    if (garageFilter === 'active') return source.filter((g) => g.isActive);
    return source;
  }, [garages, garageFilter]);

  const featuredPackages = useMemo(() => {
    const list = packages.filter((p) => p.vehicleType === pkgVehicleTab && p.isActive);
    // Deduplicate by package name across the 6 garages for public pricing overview
    const seen = new Set<string>();
    return list.filter((p) => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    });
  }, [packages, pkgVehicleTab]);

  const getStartingPriceForGarage = (garageId: string): number | null => {
    const gPkgs = packages.filter((p) => p.garageId === garageId && p.isActive);
    if (gPkgs.length === 0) return null;
    return Math.min(...gPkgs.map((p) => p.startingPrice));
  };

  const scrollToPage = (target: PublicPage) => {
    setPage(target);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const brandName = settings?.businessName || 'AutoCare Garage';
  const tagline = settings?.tagline || 'Your Vehicle, Our Responsibility.';

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {/* Announcement Bar */}
      <div className="bg-[#0B132B] text-slate-200 text-xs py-2 px-4 text-center border-b border-white/10">
        <span>{tagline}</span>
        <span className="mx-2 text-slate-500">·</span>
        <span>6 Independent Car &amp; Bike Service Garages</span>
        <span className="mx-2 text-slate-500">·</span>
        <span className="text-red-400 font-medium">Real-Time Slot Booking</span>
      </div>

      {/* Top Bar Contract: 3 Zones (Brand wordmark | 4-5 concise nav links | 1 Primary CTA) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => scrollToPage('home')}
            className="text-lg font-extrabold tracking-tight text-[#0B132B] whitespace-nowrap shrink-0 font-display"
          >
            {brandName}
          </button>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => scrollToPage('home')}
              className={`hover:text-[#0B132B] transition-colors whitespace-nowrap shrink-0 ${page === 'home' ? 'text-[#0B132B] underline underline-offset-4 decoration-red-600' : ''}`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => scrollToPage('find-garage')}
              className={`hover:text-[#0B132B] transition-colors whitespace-nowrap shrink-0 ${page === 'find-garage' ? 'text-[#0B132B] underline underline-offset-4 decoration-red-600' : ''}`}
            >
              Find Garage
            </button>
            <button
              type="button"
              onClick={() => scrollToPage('services')}
              className={`hover:text-[#0B132B] transition-colors whitespace-nowrap shrink-0 ${page === 'services' ? 'text-[#0B132B] underline underline-offset-4 decoration-red-600' : ''}`}
            >
              Services
            </button>
            <button
              type="button"
              onClick={() => scrollToPage('about')}
              className={`hover:text-[#0B132B] transition-colors whitespace-nowrap shrink-0 ${page === 'about' ? 'text-[#0B132B] underline underline-offset-4 decoration-red-600' : ''}`}
            >
              About
            </button>
            <button
              type="button"
              onClick={() => scrollToPage('contact')}
              className={`hover:text-[#0B132B] transition-colors whitespace-nowrap shrink-0 ${page === 'contact' ? 'text-[#0B132B] underline underline-offset-4 decoration-red-600' : ''}`}
            >
              Contact
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            {account ? (
              <button
                type="button"
                onClick={onOpenDashboard}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap shrink-0"
              >
                Open Dashboard
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B132B] rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Sign In / Book
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 text-slate-700 hover:text-[#0B132B]"
              aria-label="Toggle navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 flex flex-col gap-2 text-sm font-medium">
            {(['home', 'find-garage', 'services', 'about', 'contact'] as PublicPage[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => scrollToPage(p)}
                className="text-left py-2 text-slate-700 hover:text-[#0B132B] capitalize"
              >
                {p.replace('-', ' ')}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* HOME PAGE */}
        {page === 'home' && (
          <>
            {/* Hero Section */}
            <section className="bg-[#0B132B] text-white">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
                <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
                  <div className="text-xs font-medium text-red-400 tracking-wide">
                    Six-Location Car &amp; Bike Service Network · India (INR ₹)
                  </div>
                  <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.08] text-balance font-display">
                    Your Vehicle, Our Responsibility.
                  </h1>
                  <p className="text-base text-slate-300 leading-relaxed max-w-xl">
                    Book precision car and two-wheeler servicing across six independent AutoCare Garage hubs. Choose your preferred garage, reserve an available bay, track mechanic inspections live, and download transparent GST invoices.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (account) {
                          onOpenDashboard();
                        } else {
                          onOpenAuth('register');
                        }
                      }}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      <span>Book a Service</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollToPage('find-garage')}
                      className="inline-flex items-center gap-2 px-5 py-3 border border-white/25 text-white hover:bg-white/10 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      <span>Explore 6 Garages</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/10 text-xs text-slate-300">
                    <div>
                      <div className="text-xl font-bold text-white tabular-nums">6 Hubs</div>
                      <div className="mt-0.5">Independent Garages</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white">Car &amp; Bike</div>
                      <div className="mt-0.5">Dedicated Service Bays</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white">Live Job Cards</div>
                      <div className="mt-0.5">Customer-Approved Extras</div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="h-full min-h-[300px] lg:min-h-[420px] rounded-xl overflow-hidden border border-white/15 bg-slate-900 relative">
                    <GarageImage
                      isHero
                      alt="AutoCare Garage multi-bay car and motorcycle service center"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Our Six Garages */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#0B132B] tracking-tight">Our Six Garages</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Each garage operates with its own dedicated manager, certified mechanics, parts inventory, and live appointment calendar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => scrollToPage('find-garage')}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700 whitespace-nowrap"
                >
                  <span>Compare All 6 Garages</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayGarages.slice(0, 6).map((g) => {
                  const minPrice = getStartingPriceForGarage(g.garageId);
                  return (
                    <div
                      key={g.garageId}
                      className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        <div className="h-44 bg-slate-100 overflow-hidden">
                          <GarageImage
                            garageId={g.garageId}
                            photoUrl={g.photoUrl}
                            alt={g.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-5 space-y-2.5">
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span className="font-mono font-semibold text-[#0B132B]">{g.code}</span>
                            <ActiveStatusLabel isActive={g.isActive} />
                          </div>
                          <h3 className="text-base font-bold text-slate-900">{g.name}</h3>
                          <p className="text-xs text-slate-600 flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                            <span>{g.address}</span>
                          </p>
                          <div className="text-xs text-slate-500 flex items-center gap-4 pt-1">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              {g.operatingHours}
                            </span>
                          </div>
                          {minPrice !== null && (
                            <div className="text-xs text-slate-600 pt-1">
                              Starting from <span className="font-bold text-[#0B132B] tabular-nums">{formatINR(minPrice)}</span> (demo estimate)
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setDetailGarage(g)}
                          className="text-xs font-semibold text-[#0B132B] hover:underline"
                        >
                          View Details
                        </button>
                        <button
                          type="button"
                          disabled={!g.isActive}
                          onClick={() => onBookAtGarage(g.garageId)}
                          className="px-3.5 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
                        >
                          {g.isActive ? 'Book Now' : 'Unavailable'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Car & Bike Service Packages */}
            <section className="bg-slate-50 border-y border-slate-200 py-16">
              <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-[#0B132B] tracking-tight">
                      Car &amp; Bike Service Packages
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">
                      Transparent labour and spare-parts estimates in INR (₹). Initial figures are demo estimates adjustable per garage.
                    </p>
                  </div>
                  <div className="inline-flex p-1 bg-white border border-slate-200 rounded-lg self-start">
                    <button
                      type="button"
                      onClick={() => setPkgVehicleTab('Car')}
                      className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        pkgVehicleTab === 'Car' ? 'bg-[#0B132B] text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Car className="w-3.5 h-3.5" />
                      <span>Car Packages</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPkgVehicleTab('Bike')}
                      className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        pkgVehicleTab === 'Bike' ? 'bg-[#0B132B] text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Bike className="w-3.5 h-3.5" />
                      <span>Bike Packages</span>
                    </button>
                  </div>
                </div>

                {featuredPackages.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
                    Sign in as Super Admin to initialize the six-garage demo service catalog in Firestore, or select a garage in Find Garage.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {featuredPackages.map((pkg) => (
                      <div key={pkg.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{pkg.categoryName}</span>
                            <span className="tabular-nums">{pkg.estimatedDurationMins} mins</span>
                          </div>
                          <h3 className="text-base font-bold text-slate-900 mt-1">{pkg.name}</h3>
                          <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-2xl font-extrabold text-[#0B132B] tabular-nums">{formatINR(pkg.startingPrice)}</span>
                            <span className="text-xs text-slate-500">Demo Estimate</span>
                          </div>
                          <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                            {pkg.includedServices.map((s) => (
                              <li key={s} className="flex items-start gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <button
                          type="button"
                          onClick={() => onBookAtGarage(pkg.garageId)}
                          className="mt-5 w-full py-2 text-xs font-semibold bg-[#0B132B] text-white rounded-lg hover:bg-slate-800 transition-colors"
                        >
                          Book This Package
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* How It Works & Why Choose AutoCare */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-6 space-y-6">
                <h2 className="text-2xl font-bold text-[#0B132B] tracking-tight">How Multi-Garage Booking Works</h2>
                <div className="space-y-4">
                  {[
                    ['01. Register Your Vehicle', 'Save your Car or Bike registration, fuel type, and odometer reading once in your customer profile.'],
                    ['02. Pick Your Preferred Garage', 'Compare capacity, hours, and pricing across all 6 garages and submit directly to one location.'],
                    ['03. Manager Acceptance & Slot Lock', 'Only your selected garage manager reviews and accepts or suggests a reschedule for your slot.'],
                    ['04. Live Mechanic Job Card & Invoice', 'Track inspection checklists, approve recommended extras, and download your itemized GST PDF invoice.'],
                  ].map(([title, desc]) => (
                    <div key={title} className="p-4 border border-slate-200 rounded-xl">
                      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-6 space-y-6">
                <h2 className="text-2xl font-bold text-[#0B132B] tracking-tight">Why Choose AutoCare Garage</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { icon: ShieldCheck, title: 'Zero Unapproved Extras', text: 'Additional repair work never proceeds without recorded customer approval.' },
                    { icon: CalendarCheck, title: 'No Double Booking', text: 'Atomic slot capacity checks prevent overbooking during peak hours.' },
                    { icon: Wrench, title: 'Garage-Isolated Stock', text: 'Each hub maintains verified spare parts inventory and usage logs.' },
                    { icon: Star, title: 'Verified Service Reviews', text: 'Only customers with Completed bookings can publish verified garage ratings.' },
                  ].map((item) => (
                    <div key={item.title} className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <item.icon className="w-5 h-5 text-red-600" />
                      <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                      <p className="text-xs text-slate-600 leading-relaxed">{item.text}</p>
                    </div>
                  ))}
                </div>

                {/* Verified Customer Testimonials */}
                <div className="pt-2">
                  <h3 className="text-sm font-bold text-[#0B132B] mb-3">Verified Customer Reviews</h3>
                  {reviews.length === 0 ? (
                    <div className="p-5 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                      Verified customer reviews will appear here automatically as services are completed across our six garages.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {reviews.slice(0, 3).map((r) => (
                        <div key={r.id} className="p-4 border border-slate-200 rounded-xl bg-white">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-900">{r.customerName}</span>
                            <span className="font-mono font-bold text-amber-600">{r.rating} / 5 ★</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1.5">{r.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* FAQs */}
            <section className="bg-slate-50 border-t border-slate-200 py-14">
              <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
                <h2 className="text-2xl font-bold text-[#0B132B] text-center">Frequently Asked Questions</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    ['Does my booking go to all 6 garages?', 'No. Your request is routed strictly to the single garage you choose, and only that garage manager can accept or reject it.'],
                    ['Are displayed prices final?', 'Initial package prices are demo estimates. After inspection, any extra work requires your explicit approval in your dashboard.'],
                    ['How do I pay for my service?', 'Payments are verified and recorded manually at the garage desk via Cash, UPI, or Card, updating your invoice status in real time.'],
                    ['Can I service both cars and bikes?', 'Yes. Register multiple cars and two-wheelers under one customer account and pick packages tailored to each vehicle type.'],
                  ].map(([q, a]) => (
                    <div key={q} className="bg-white border border-slate-200 rounded-xl p-5">
                      <h3 className="text-sm font-bold text-slate-900 flex items-start gap-2">
                        <HelpCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <span>{q}</span>
                      </h3>
                      <p className="text-xs text-slate-600 mt-2 leading-relaxed">{a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {/* FIND YOUR GARAGE PAGE */}
        {page === 'find-garage' && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-extrabold text-[#0B132B] tracking-tight">Find Your Garage</h1>
                <p className="text-sm text-slate-600 mt-1">
                  Compare all six AutoCare Garage locations. Only Active garages can accept new bookings.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
                <button
                  type="button"
                  onClick={() => setGarageFilter('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${garageFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                >
                  All 6 Garages
                </button>
                <button
                  type="button"
                  onClick={() => setGarageFilter('active')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${garageFilter === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                >
                  Active Only
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayGarages.map((g) => {
                const minPrice = getStartingPriceForGarage(g.garageId);
                return (
                  <div key={g.garageId} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
                    <div>
                      <div className="h-48 bg-slate-100 overflow-hidden">
                        <GarageImage
                          garageId={g.garageId}
                          photoUrl={g.photoUrl}
                          alt={g.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-5 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-[#0B132B]">{g.code} · {g.city}</span>
                          <ActiveStatusLabel isActive={g.isActive} />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900">{g.name}</h2>
                        <p className="text-xs text-slate-600 flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                          <span>{g.address}</span>
                        </p>
                        <p className="text-xs text-slate-600 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-[#0B132B] shrink-0" />
                          <span>{g.phone}</span>
                        </p>
                        <p className="text-xs text-slate-600 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#0B132B] shrink-0" />
                          <span>{g.operatingHours}</span>
                        </p>
                        <div className="text-xs text-slate-600 pt-1">
                          Vehicles: {(g.supportedVehicles || ['Car', 'Bike']).join(' & ')}
                          {minPrice !== null && (
                            <>
                              {' '}· Starts at <span className="font-bold text-[#0B132B] tabular-nums">{formatINR(minPrice)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setDetailGarage(g)}
                        className="text-xs font-semibold text-[#0B132B] hover:underline"
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        disabled={!g.isActive}
                        onClick={() => onBookAtGarage(g.garageId)}
                        className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40"
                      >
                        Book Now
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* SERVICES PAGE */}
        {page === 'services' && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-10">
            <div>
              <h1 className="text-3xl font-extrabold text-[#0B132B] tracking-tight">Car &amp; Bike Services</h1>
              <p className="text-sm text-slate-600 mt-1">
                Standardized multi-point service checklists executed across all six AutoCare Garage locations.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2 text-lg font-bold text-[#0B132B]">
                  <Car className="w-5 h-5 text-red-600" />
                  <h2>Car Services</h2>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                  {[
                    'Basic Car Service',
                    'Standard Car Service',
                    'Premium Car Service',
                    'Engine Inspection',
                    'Oil Change',
                    'Brake Inspection & Repair',
                    'Battery Inspection',
                    'Tyre Replacement',
                    'Wheel Alignment & Balancing',
                    'AC Servicing',
                    'Washing & Detailing',
                    'Electrical Repairs',
                    'Periodic Maintenance',
                    'Vehicle Diagnostics',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-1.5 py-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2 text-lg font-bold text-[#0B132B]">
                  <Bike className="w-5 h-5 text-red-600" />
                  <h2>Bike Services</h2>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                  {[
                    'Basic Bike Service',
                    'Standard Bike Service',
                    'Premium Bike Service',
                    'Engine Oil Change',
                    'Brake Service',
                    'Battery Inspection',
                    'Tyre Replacement',
                    'Bike Washing',
                    'General Repairs',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-1.5 py-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* ABOUT PAGE */}
        {page === 'about' && (
          <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
            <h1 className="text-3xl font-extrabold text-[#0B132B] tracking-tight">About {brandName}</h1>
            <p className="text-sm text-slate-700 leading-relaxed">
              {brandName} is a unified six-garage automotive and motorcycle service platform built around transparency, strict branch accountability, and customer-first workflows.
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              Each of our six service locations runs an independent operational desk with dedicated mechanics, localized spare parts inventory, live bay scheduling, and verified financial reporting — overseen centrally for consistent service standards.
            </p>
          </section>
        )}

        {/* CONTACT PAGE */}
        {page === 'contact' && (
          <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8">
            <div>
              <h1 className="text-3xl font-extrabold text-[#0B132B] tracking-tight">Contact {brandName}</h1>
              <p className="text-sm text-slate-600 mt-1">
                Reach our central support desk or select one of our six branches directly.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="border border-slate-200 rounded-xl p-6 space-y-3 text-sm">
                <h2 className="font-bold text-[#0B132B]">Central Helpdesk (Demo)</h2>
                <p className="text-xs text-slate-600">Email: {settings?.supportEmail || 'support@autocare-demo.local'}</p>
                <p className="text-xs text-slate-600">Phone: {settings?.supportPhone || '+91 00000 00000 (Demo)'}</p>
                <p className="text-xs text-slate-500 pt-2">
                  For booking-specific queries, sign in to your Customer Dashboard and open a Support Ticket routed directly to your garage manager.
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setContactSubmitted(true);
                }}
                className="border border-slate-200 rounded-xl p-6 space-y-3"
              >
                <h2 className="text-sm font-bold text-[#0B132B]">Send an Inquiry</h2>
                {contactSubmitted ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                    Thank you, {contactName}. Your inquiry has been noted. For faster service support, sign in and raise a ticket in your Customer Dashboard.
                  </div>
                ) : (
                  <>
                    <input
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Your Name"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <input
                      required
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="Your Email"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <textarea
                      required
                      rows={3}
                      value={contactMsg}
                      onChange={(e) => setContactMsg(e.target.value)}
                      placeholder="How can we help?"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#0B132B] text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
                    >
                      Submit Inquiry
                    </button>
                  </>
                )}
              </form>
            </div>
          </section>
        )}

        {/* PRIVACY & TERMS */}
        {page === 'privacy' && (
          <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-4">
            <h1 className="text-2xl font-bold text-[#0B132B]">Privacy Policy</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              AutoCare Garage isolates customer profile data, vehicle records, booking histories, and billing invoices using strict role-based security rules. Garage managers and mechanics access only the operational records assigned to their specific branch and job cards.
            </p>
          </section>
        )}

        {page === 'terms' && (
          <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-4">
            <h1 className="text-2xl font-bold text-[#0B132B]">Terms &amp; Conditions</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Service packages displayed on AutoCare Garage represent initial estimates. Final invoicing occurs after mechanic inspection and explicit customer approval for any recommended additional repairs. Payments are verified manually by authorized garage staff.
            </p>
          </section>
        )}
      </main>

      {/* Garage Detail Modal */}
      {detailGarage && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full overflow-hidden shadow-xl">
            <div className="h-48 bg-slate-100 relative">
              <GarageImage
                garageId={detailGarage.garageId}
                photoUrl={detailGarage.photoUrl}
                alt={detailGarage.name}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setDetailGarage(null)}
                className="absolute top-3 right-3 p-1.5 bg-white/90 rounded-lg text-slate-800 hover:bg-white"
                aria-label="Close garage details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#0B132B]">{detailGarage.code} · {detailGarage.garageId}</span>
                <ActiveStatusLabel isActive={detailGarage.isActive} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">{detailGarage.name}</h3>
              <div className="space-y-1.5 text-xs text-slate-600">
                <p><strong className="text-slate-900">Address:</strong> {detailGarage.address}</p>
                <p><strong className="text-slate-900">Contact:</strong> {detailGarage.phone} · {detailGarage.email}</p>
                <p><strong className="text-slate-900">Hours:</strong> {detailGarage.operatingHours}</p>
                <p><strong className="text-slate-900">Daily Bay Capacity:</strong> {detailGarage.dailyCapacity} vehicles</p>
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDetailGarage(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={!detailGarage.isActive}
                  onClick={() => {
                    const id = detailGarage.garageId;
                    setDetailGarage(null);
                    onBookAtGarage(id);
                  }}
                  className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40"
                >
                  Book at {detailGarage.code}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quiet Footer */}
      <footer className="bg-[#0B132B] text-slate-300 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-xs">
          <div>
            <div className="text-base font-bold text-white font-display">{brandName}</div>
            <p className="text-slate-400 mt-1">{tagline} · Six-Location Service Platform</p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <button type="button" onClick={() => scrollToPage('find-garage')} className="hover:text-white">Find Garage</button>
            <button type="button" onClick={() => scrollToPage('services')} className="hover:text-white">Services</button>
            <button type="button" onClick={() => scrollToPage('privacy')} className="hover:text-white">Privacy Policy</button>
            <button type="button" onClick={() => scrollToPage('terms')} className="hover:text-white">Terms &amp; Conditions</button>
            <button type="button" onClick={() => scrollToPage('contact')} className="hover:text-white">Contact</button>
          </div>
          <div className="text-slate-500">
            © {new Date().getFullYear()} {brandName}. Currency: INR (₹).
          </div>
        </div>
      </footer>
    </div>
  );
}
