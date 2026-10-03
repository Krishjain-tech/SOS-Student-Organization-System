import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  Ticket,
  Shirt,
  Bell,
  Search,
  ShoppingCart,
  Crown,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Clock,
  MapPin,
  X,
  Check,
  QrCode,
  LogOut,
  Sparkles,
  ShoppingBag,
  ExternalLink,
  ShieldCheck,
  Tag
} from 'lucide-react';
import { api, queryClient, type User } from '../lib/api';
import { useAuth } from '../App';

interface PortalData {
  user: User;
  membership: {
    is_member: boolean;
    status: string;
    tier: string;
    starts_on: string | null;
    ends_on: string | null;
    dues_paise: number;
    student_number: string;
    perks: string[];
  };
  events: Array<{
    id: string;
    title: string;
    type: string;
    description: string;
    image_url: string;
    start_at: string;
    end_at: string;
    location: string;
    capacity: number;
    seats_sold: number;
    member_price_paise: number;
    nonmember_price_paise: number;
    status: string;
  }>;
  merchandise: Array<{
    id: string;
    name: string;
    description: string;
    price_paise: number;
    member_price_paise: number;
    image_url: string;
    active: number;
    variants: Array<{
      id: string;
      size: string;
      stock: number;
    }>;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    audience: string;
    published_at: string;
    created_at: string;
  }>;
  tickets: Array<{
    id: string;
    event_id: string;
    buyer_name: string;
    buyer_email: string;
    code: string;
    price_paise: number;
    status: string;
    checked_in_at: string | null;
    created_at: string;
    event_title: string;
    event_start: string;
    event_location: string;
    event_image: string;
  }>;
  orders: Array<{
    id: string;
    buyer_name: string;
    total_paise: number;
    collected: number;
    created_at: string;
    items: Array<{
      id: string;
      quantity: number;
      unit_price_paise: number;
      size: string;
      product_name: string;
    }>;
  }>;
}

interface CartItem {
  variant_id: string;
  product_id: string;
  product_name: string;
  size: string;
  unit_price_paise: number;
  quantity: number;
  image_url: string;
}

function formatPaise(paise: number): string {
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}

function formatDate(iso: string): { month: string; day: string; full: string; time: string } {
  const d = new Date(iso);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[d.getMonth()] || 'OCT';
  const day = String(d.getDate()).padStart(2, '0');
  const full = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return { month, day, full, time };
}

function getEventFallbackImage(type: string = '', title: string = ''): string {
  const t = (type || '').toLowerCase();
  const name = (title || '').toLowerCase();
  if (name.includes('gala') || t.includes('gala')) return '/images/event_spring_gala.png';
  if (name.includes('tech') || name.includes('talk') || name.includes('hackathon')) return '/images/event_tech_talk.png';
  if (name.includes('sport') || name.includes('fundraiser') || name.includes('bake')) return '/images/event_sports_night.png';
  if (name.includes('cultural') || name.includes('fest') || name.includes('robotics') || name.includes('workshop')) return '/images/event_cultural_fest.png';
  return '/images/hero_campus_banner.png';
}

export function StudentPortal() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();

  // Queries
  const { data: portalData, refetch, isLoading } = useQuery<PortalData>({
    queryKey: ['student-portal-data'],
    queryFn: async () => {
      const res = await api<PortalData>('/student/portal-data');
      return res;
    },
    refetchInterval: 20000
  });

  // State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [eventCategoryFilter, setEventCategoryFilter] = useState('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});

  // Modals state
  const [eventDetailModalId, setEventDetailModalId] = useState<string | null>(null);
  const [selectedTicketTier, setSelectedTicketTier] = useState<'member' | 'standard'>('member');
  const [ticketModalData, setTicketModalData] = useState<PortalData['tickets'][0] | null>(null);
  const [membershipModalOpen, setMembershipModalOpen] = useState(false);
  const [membershipStep, setMembershipStep] = useState<'plan' | 'checkout' | 'success'>('plan');
  const [myTicketsModalOpen, setMyTicketsModalOpen] = useState(false);
  const [myOrdersModalOpen, setMyOrdersModalOpen] = useState(false);
  const [ordersModalTab, setOrdersModalTab] = useState<'cart' | 'history'>('cart');
  const [allEventsModalOpen, setAllEventsModalOpen] = useState(false);
  const [allMerchModalOpen, setAllMerchModalOpen] = useState(false);
  const [allAnnouncementsModalOpen, setAllAnnouncementsModalOpen] = useState(false);

  // Action loading state
  const [bookingLoading, setBookingLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkinLoading, setCheckinLoading] = useState(false);

  // Carousel refs for smooth horizontal scrolling
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const merchScrollRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleScroll = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    if (ref.current) {
      const offset = direction === 'left' ? -320 : 320;
      ref.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  const logout = async () => {
    try {
      await api('/auth/logout', 'POST', {});
      queryClient.clear();
      setUser(null);
      nav('/student/login');
    } catch {
      nav('/student/login');
    }
  };

  const activeEvent = portalData?.events.find(e => e.id === eventDetailModalId);
  const isMember = portalData?.membership.is_member ?? false;

  // Add merchandise to cart
  const addToCart = (product: PortalData['merchandise'][0]) => {
    const selectedVariantId = selectedVariants[product.id] || product.variants[0]?.id;
    const variant = product.variants.find(v => v.id === selectedVariantId) || product.variants[0];
    if (!variant || variant.stock <= 0) {
      showToast('This variant is currently out of stock.');
      return;
    }

    const unitPrice = isMember ? product.member_price_paise : product.price_paise;
    setCart(prev => {
      const existing = prev.find(item => item.variant_id === variant.id);
      if (existing) {
        if (existing.quantity >= variant.stock) {
          showToast(`Maximum available stock reached for ${product.name}.`);
          return prev;
        }
        return prev.map(item => item.variant_id === variant.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, {
        variant_id: variant.id,
        product_id: product.id,
        product_name: product.name,
        size: variant.size,
        unit_price_paise: unitPrice,
        quantity: 1,
        image_url: product.image_url
      }];
    });

    showToast(`Added ${product.name} (${variant.size}) to your bag!`);
  };

  // Book ticket from modal
  const handleBookTicket = async (eventId: string) => {
    setBookingLoading(true);
    try {
      const res = await api<any>('/student/tickets/book', 'POST', {
        event_id: eventId,
        tier: selectedTicketTier
      });
      showToast('Ticket confirmed! Added to My Tickets.');
      setEventDetailModalId(null);
      await refetch();
      // Optionally open the newly booked ticket
      if (res?.data) {
        setTicketModalData(res.data);
      }
    } catch (err: any) {
      showToast(err.message || 'Unable to book ticket. Please try again.');
    } finally {
      setBookingLoading(false);
    }
  };

  // Perform ticket checkin
  const handleCheckin = async (ticketId: string) => {
    setCheckinLoading(true);
    try {
      await api(`/student/tickets/${ticketId}/checkin`, 'POST', {});
      showToast('Ticket checked in successfully!');
      if (ticketModalData && ticketModalData.id === ticketId) {
        setTicketModalData({ ...ticketModalData, status: 'USED', checked_in_at: new Date().toISOString() });
      }
      await refetch();
    } catch (err: any) {
      showToast(err.message || 'Check-in unsuccessful.');
    } finally {
      setCheckinLoading(false);
    }
  };

  // Execute cart checkout
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setCheckoutLoading(true);
    try {
      await api('/student/orders/checkout', 'POST', {
        items: cart.map(item => ({ variant_id: item.variant_id, quantity: item.quantity })),
        method: 'upi'
      });
      setCart([]);
      showToast('Order confirmed! Receipt recorded.');
      setMyOrdersModalOpen(false);
      await refetch();
    } catch (err: any) {
      showToast(err.message || 'Checkout was unsuccessful. Please check available stock.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Purchase/renew membership
  const handleJoinMembership = async () => {
    setBookingLoading(true);
    try {
      await api('/student/membership/join', 'POST', { plan: 'annual', method: 'upi' });
      setMembershipStep('success');
      showToast('Membership activated! Welcome to Skyline Association.');
      await refetch();
    } catch (err: any) {
      showToast(err.message || 'Membership activation unsuccessful.');
    } finally {
      setBookingLoading(false);
    }
  };

  // Filter events
  const filteredEvents = (portalData?.events || []).filter(e => {
    const matchesSearch = !searchQuery || e.title.toLowerCase().includes(searchQuery.toLowerCase()) || e.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = eventCategoryFilter === 'all' || e.type.toLowerCase() === eventCategoryFilter.toLowerCase();
    return matchesSearch && matchesCat;
  });

  const cartTotalPaise = cart.reduce((sum, item) => sum + item.unit_price_paise * item.quantity, 0);
  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className={`min-h-screen bg-[#F7FAFE] text-slate-800 font-sans ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[10000] bg-[#102A4C] text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-blue-400/30 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Sparkles className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span className="text-sm font-medium">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-slate-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. MAIN HEADER                                            */}
      {/* ======================================================== */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#DCE6F2] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link to="/student" className="flex items-center gap-3 group flex-shrink-0">
            <div className="h-10 w-auto flex items-center">
              <img src="/logo.png" alt="Skyline" className="h-9 w-auto object-contain" />
            </div>
            <span className="hidden sm:inline-block font-extrabold text-lg text-[#102A4C] tracking-tight group-hover:text-[#1463D8] transition">
              Student Workspace
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            <button
              onClick={() => setAllEventsModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-[#102A4C] hover:text-[#1463D8] hover:bg-blue-50 rounded-lg transition"
            >
              Events
            </button>
            <button
              onClick={() => setAllMerchModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-[#102A4C] hover:text-[#1463D8] hover:bg-blue-50 rounded-lg transition"
            >
              Merchandise
            </button>
            <button
              onClick={() => setAllAnnouncementsModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-[#102A4C] hover:text-[#1463D8] hover:bg-blue-50 rounded-lg transition"
            >
              Announcements
            </button>
            <a
              href="#about-section"
              className="px-3 py-1.5 text-xs font-semibold text-[#102A4C] hover:text-[#1463D8] hover:bg-blue-50 rounded-lg transition"
            >
              About
            </a>
          </nav>

          {/* Search Field & Right Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Search Input */}
            <div className="relative hidden sm:block w-44 md:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search events, merch…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100/80 hover:bg-slate-100 focus:bg-white border border-transparent focus:border-[#1463D8] rounded-lg transition outline-none"
              />
            </div>

            {/* Membership Status Badge */}
            <button
              onClick={() => {
                setMembershipStep('plan');
                setMembershipModalOpen(true);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition shadow-xs ${
                isMember
                  ? 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                  : 'bg-blue-50 text-[#1463D8] border border-blue-200 hover:bg-blue-100'
              }`}
            >
              <Crown className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">{isMember ? 'Member' : 'Join Membership'}</span>
            </button>

            {/* Cart Button */}
            <button
              onClick={() => {
                setOrdersModalTab('cart');
                setMyOrdersModalOpen(true);
              }}
              className="relative p-2 text-[#102A4C] hover:text-[#1463D8] hover:bg-blue-50 rounded-lg transition"
              aria-label="Open cart"
            >
              <ShoppingCart className="w-5 h-5" />
              {totalCartCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-[#1463D8] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {totalCartCount}
                </span>
              )}
            </button>

            {/* User Profile Pill & Sign out */}
            <div className="flex items-center gap-2 pl-1 border-l border-slate-200">
              <div className="flex items-center gap-2 bg-slate-100 px-2.5 py-1 rounded-full">
                <div className="w-6 h-6 bg-[#1463D8] text-white text-[11px] font-bold rounded-full flex items-center justify-center">
                  {user?.name?.split(' ').map((s: string) => s[0]).slice(0, 2).join('') || 'ST'}
                </div>
                <span className="hidden lg:inline text-xs font-semibold text-[#102A4C] max-w-[100px] truncate">
                  {user?.name || 'Student'}
                </span>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg transition"
                aria-label="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 2. PAGE CONTENT                                           */}
      {/* ======================================================== */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* HERO BANNER */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#102A4C] via-[#0B1E36] to-[#1052B5] text-white shadow-xl min-h-[220px] flex items-center">
          {/* Background Photo Overlay */}
          <div className="absolute inset-0 opacity-25 mix-blend-overlay">
            <img
              src="/images/hero_campus_banner.png"
              alt="Campus"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="relative z-10 px-6 sm:px-10 py-8 max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase text-blue-200 border border-white/10">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Official Student Organization System
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Welcome back, {user?.name || 'Student'}!
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">
              Your unified campus portal for premier student events, official merchandise, tickets, and active organization membership.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-2">
              <button
                onClick={() => setAllEventsModalOpen(true)}
                className="bg-[#1463D8] hover:bg-[#1052B5] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-md inline-flex items-center gap-1.5"
              >
                <CalendarDays className="w-4 h-4" />
                Explore Events
              </button>
              <button
                onClick={() => setMyTicketsModalOpen(true)}
                className="bg-white/15 hover:bg-white/25 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition backdrop-blur-md border border-white/20 inline-flex items-center gap-1.5"
              >
                <Ticket className="w-4 h-4" />
                My Tickets
              </button>
              {!isMember && (
                <button
                  onClick={() => {
                    setMembershipStep('plan');
                    setMembershipModalOpen(true);
                  }}
                  className="bg-amber-400 hover:bg-amber-300 text-amber-950 text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-md inline-flex items-center gap-1.5"
                >
                  <Crown className="w-4 h-4" />
                  Join Membership
                </button>
              )}
            </div>
          </div>
        </div>

        {/* MEMBERSHIP HIGHLIGHT & QUICK METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Membership card */}
          <div className="md:col-span-2 bg-white rounded-2xl p-5 border border-[#DCE6F2] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#1463D8]">Membership Status</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isMember ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {isMember ? 'Active Member' : 'Standard Student'}
                </span>
              </div>
              <h2 className="text-base font-bold text-[#102A4C]">
                {isMember ? 'Annual Premium Membership' : 'Unlock 15% Off All Campus Events'}
              </h2>
              <p className="text-xs text-slate-500">
                {isMember
                  ? `Valid until ${formatDate(portalData?.membership.ends_on || '').full} · Member ID: ${portalData?.membership.student_number}`
                  : 'Join today for ₹500/year to get instant event discounts, early ticket booking, and exclusive club voting rights.'}
              </p>
            </div>
            <button
              onClick={() => {
                setMembershipStep('plan');
                setMembershipModalOpen(true);
              }}
              className="flex-shrink-0 bg-blue-50 hover:bg-blue-100 text-[#1463D8] text-xs font-bold px-4 py-2.5 rounded-xl border border-blue-200 transition inline-flex items-center gap-1.5"
            >
              {isMember ? 'View Benefits' : 'Upgrade to Member'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="bg-white rounded-2xl p-5 border border-[#DCE6F2] shadow-xs flex items-center justify-around text-center">
            <div>
              <span className="block text-2xl font-black text-[#102A4C]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {portalData?.tickets.length ?? 0}
              </span>
              <span className="text-[11px] font-semibold text-slate-500">Tickets Booked</span>
            </div>
            <div className="w-px h-10 bg-slate-200" />
            <div>
              <span className="block text-2xl font-black text-[#102A4C]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {portalData?.orders.length ?? 0}
              </span>
              <span className="text-[11px] font-semibold text-slate-500">Merch Orders</span>
            </div>
            <div className="w-px h-10 bg-slate-200" />
            <div>
              <span className="block text-2xl font-black text-emerald-600" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {isMember ? '15%' : '0%'}
              </span>
              <span className="text-[11px] font-semibold text-slate-500">Club Discount</span>
            </div>
          </div>
        </div>

        {/* DASHBOARD CONTROLS BAR: Collapse / Expand Sidebar */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Browse Association Hub</span>
          </div>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-xs font-semibold text-[#1463D8] hover:text-[#1052B5] bg-white border border-[#DCE6F2] px-3 py-1.5 rounded-lg shadow-xs hover:bg-slate-50 transition inline-flex items-center gap-1.5"
          >
            {sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          </button>
        </div>

        {/* ======================================================== */}
        {/* 3. TWO-COLUMN SPLIT GRID                                  */}
        {/* ======================================================== */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* MAIN COLUMN (Upcoming Events & Merchandise & About) */}
          <div id="main-content-col" className="w-full lg:w-3/4 space-y-8 min-w-0">
            {/* UPCOMING EVENTS */}
            <section className="bg-white rounded-2xl p-6 border border-[#DCE6F2] shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#102A4C] tracking-tight">Upcoming Events</h2>
                  <p className="text-xs text-slate-500">Discover and book tickets for association activities</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleScroll(eventsScrollRef, 'left')}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition"
                    aria-label="Scroll events left"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleScroll(eventsScrollRef, 'right')}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition"
                    aria-label="Scroll events right"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setAllEventsModalOpen(true)}
                    className="text-xs font-semibold text-[#1463D8] hover:underline ml-2"
                  >
                    View all
                  </button>
                </div>
              </div>

              {/* Event Cards Horizontal Scroll */}
              <div
                ref={eventsScrollRef}
                className="flex gap-4 overflow-x-auto no-scrollbar pb-2 pt-1 scroll-smooth"
              >
                {filteredEvents.map(event => {
                  const dateInfo = formatDate(event.start_at);
                  const isSoldOut = event.seats_sold >= event.capacity;
                  return (
                    <div
                      key={event.id}
                      onClick={() => {
                        setSelectedTicketTier(isMember ? 'member' : 'standard');
                        setEventDetailModalId(event.id);
                      }}
                      className="min-w-[270px] max-w-[290px] flex-shrink-0 bg-[#F7FAFE] border border-[#DCE6F2] rounded-xl overflow-hidden hover:shadow-md transition flex flex-col group cursor-pointer"
                    >
                      {/* Image Banner */}
                      <div className="relative h-36 bg-slate-800 overflow-hidden">
                        <img
                          src={event.image_url || getEventFallbackImage(event.type, event.title)}
                          alt={event.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        {/* Date badge */}
                        <div className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-md rounded-lg p-1.5 text-center shadow-md min-w-[42px]">
                          <span className="block text-[9px] font-extrabold uppercase text-[#1463D8]">{dateInfo.month}</span>
                          <span className="block text-sm font-black text-[#102A4C]">{dateInfo.day}</span>
                        </div>
                        {/* Status/Tag */}
                        <div className="absolute top-2.5 right-2.5 bg-[#102A4C]/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-xs">
                          {event.type}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                        <div>
                          <h3 className="font-bold text-sm text-[#102A4C] line-clamp-1 group-hover:text-[#1463D8] transition">
                            {event.title}
                          </h3>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span>{dateInfo.time}</span>
                            <span>•</span>
                            <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="truncate">{event.location}</span>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2 mt-2 leading-relaxed">
                            {event.description}
                          </p>
                        </div>

                        {/* Price & Action */}
                        <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase font-bold">Ticket</span>
                            <div className="flex items-baseline gap-1">
                              <span className="text-sm font-extrabold text-[#102A4C]">
                                {formatPaise(event.member_price_paise)}
                              </span>
                              <span className="text-[10px] text-slate-400">/ member</span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTicketTier(isMember ? 'member' : 'standard');
                              setEventDetailModalId(event.id);
                            }}
                            disabled={isSoldOut}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                              isSoldOut
                                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                : 'bg-[#1463D8] hover:bg-[#1052B5] text-white shadow-xs'
                            }`}
                          >
                            {isSoldOut ? 'Sold Out' : 'Book Ticket'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* FEATURED MERCHANDISE */}
            <section className="bg-white rounded-2xl p-6 border border-[#DCE6F2] shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#102A4C] tracking-tight">Featured Merchandise</h2>
                  <p className="text-xs text-slate-500">Wear the club pride with campus gear and accessories</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleScroll(merchScrollRef, 'left')}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition"
                    aria-label="Scroll merch left"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleScroll(merchScrollRef, 'right')}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition"
                    aria-label="Scroll merch right"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setAllMerchModalOpen(true)}
                    className="text-xs font-semibold text-[#1463D8] hover:underline ml-2"
                  >
                    View all
                  </button>
                </div>
              </div>

              {/* Merchandise Cards Horizontal Scroll */}
              <div
                ref={merchScrollRef}
                className="flex gap-4 overflow-x-auto no-scrollbar pb-2 pt-1 scroll-smooth"
              >
                {(portalData?.merchandise || []).map(product => {
                  const selectedVariant = selectedVariants[product.id] || product.variants[0]?.id;
                  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);

                  return (
                    <div
                      key={product.id}
                      className="min-w-[230px] max-w-[250px] flex-shrink-0 bg-[#F7FAFE] border border-[#DCE6F2] rounded-xl overflow-hidden hover:shadow-md transition flex flex-col group"
                    >
                      {/* Image Banner */}
                      <div className="h-40 bg-white p-3 flex items-center justify-center relative overflow-hidden">
                        <img
                          src={product.image_url || '/images/merch_hoodie.png'}
                          alt={product.name}
                          className="h-full w-auto object-contain group-hover:scale-105 transition duration-300"
                        />
                        {totalStock < 10 && totalStock > 0 && (
                          <span className="absolute top-2 right-2 bg-amber-100 text-amber-800 text-[9px] font-extrabold px-2 py-0.5 rounded-full">
                            Low Stock
                          </span>
                        )}
                        {totalStock === 0 && (
                          <span className="absolute top-2 right-2 bg-rose-100 text-rose-800 text-[9px] font-extrabold px-2 py-0.5 rounded-full">
                            Sold Out
                          </span>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                        <div>
                          <h3 className="font-bold text-xs text-[#102A4C] line-clamp-1">{product.name}</h3>
                          <div className="flex items-baseline gap-1.5 mt-1">
                            <span className="text-sm font-extrabold text-[#102A4C]">
                              {formatPaise(isMember ? product.member_price_paise : product.price_paise)}
                            </span>
                            {isMember && product.member_price_paise < product.price_paise && (
                              <span className="text-[10px] text-slate-400 line-through">
                                {formatPaise(product.price_paise)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Variant Chips */}
                        {product.variants.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase">Option / Size</span>
                            <div className="flex flex-wrap gap-1">
                              {product.variants.map(v => (
                                <button
                                  key={v.id}
                                  onClick={() => setSelectedVariants(prev => ({ ...prev, [product.id]: v.id }))}
                                  className={`text-[10px] font-bold px-2 py-1 rounded-md border transition ${
                                    selectedVariant === v.id
                                      ? 'bg-[#1463D8] text-white border-[#1463D8]'
                                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  {v.size}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => addToCart(product)}
                          disabled={totalStock === 0}
                          className={`w-full py-2 text-xs font-bold rounded-lg transition inline-flex items-center justify-center gap-1.5 ${
                            totalStock === 0
                              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                              : 'bg-white hover:bg-blue-50 text-[#1463D8] border border-[#1463D8] shadow-xs'
                          }`}
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>Add to Bag</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ABOUT SKYLINE STUDENT ASSOCIATION */}
            <section id="about-section" className="bg-white rounded-2xl p-6 sm:p-8 border border-[#DCE6F2] shadow-xs space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-7 space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#1463D8]">Community & Vision</span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-[#102A4C] leading-snug" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                    About Skyline Student Association
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Skyline Student Association is the premier student-led body empowering campus life through cutting-edge technology symposiums, cultural celebrations, competitive sports meets, and professional development.
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Every event is planned with transparency, high student engagement, and member-first benefits.
                  </p>
                </div>
                <div className="md:col-span-5 grid grid-cols-2 gap-3">
                  <div className="bg-[#F7FAFE] p-3.5 rounded-xl border border-[#DCE6F2]">
                    <CalendarDays className="w-5 h-5 text-[#1463D8] mb-1.5" />
                    <h3 className="text-xs font-bold text-[#102A4C]">20+ Events</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">Year-round campus activities</p>
                  </div>
                  <div className="bg-[#F7FAFE] p-3.5 rounded-xl border border-[#DCE6F2]">
                    <Shirt className="w-5 h-5 text-[#1463D8] mb-1.5" />
                    <h3 className="text-xs font-bold text-[#102A4C]">Official Gear</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">Custom apparel & kits</p>
                  </div>
                  <div className="bg-[#F7FAFE] p-3.5 rounded-xl border border-[#DCE6F2]">
                    <Crown className="w-5 h-5 text-amber-500 mb-1.5" />
                    <h3 className="text-xs font-bold text-[#102A4C]">500+ Members</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">Active student network</p>
                  </div>
                  <div className="bg-[#F7FAFE] p-3.5 rounded-xl border border-[#DCE6F2]">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 mb-1.5" />
                    <h3 className="text-xs font-bold text-[#102A4C]">Verified Ledger</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">100% transparent audits</p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN (Collapsible Sidebar) */}
          <aside id="sidebar-col" className="w-full lg:w-1/4 space-y-5 flex-shrink-0">
            {/* Quick Action Panel */}
            <div className="bg-white rounded-2xl p-5 border border-[#DCE6F2] shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-[#102A4C]">Quick Access</span>
                <span className="text-[10px] text-slate-400">Student Portal</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMyTicketsModalOpen(true)}
                  className="p-3 bg-[#F7FAFE] hover:bg-blue-50 border border-[#DCE6F2] rounded-xl text-left transition"
                >
                  <Ticket className="w-4 h-4 text-[#1463D8] mb-1" />
                  <span className="block text-xs font-bold text-[#102A4C]">My Tickets</span>
                  <span className="block text-[10px] text-slate-400">{portalData?.tickets.length ?? 0} booked</span>
                </button>
                <button
                  onClick={() => {
                    setOrdersModalTab('history');
                    setMyOrdersModalOpen(true);
                  }}
                  className="p-3 bg-[#F7FAFE] hover:bg-blue-50 border border-[#DCE6F2] rounded-xl text-left transition"
                >
                  <ShoppingBag className="w-4 h-4 text-[#1463D8] mb-1" />
                  <span className="block text-xs font-bold text-[#102A4C]">My Orders</span>
                  <span className="block text-[10px] text-slate-400">{portalData?.orders.length ?? 0} orders</span>
                </button>
              </div>
            </div>

            {/* Announcements Card */}
            <div className="bg-white rounded-2xl p-5 border border-[#DCE6F2] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#102A4C]">Announcements</h3>
                <button
                  onClick={() => setAllAnnouncementsModalOpen(true)}
                  className="text-[11px] font-semibold text-[#1463D8] hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="space-y-3">
                {(portalData?.announcements || []).slice(0, 3).map(a => (
                  <div
                    key={a.id}
                    onClick={() => setAllAnnouncementsModalOpen(true)}
                    className="p-3 bg-[#F7FAFE] hover:bg-slate-100/80 rounded-xl border border-[#DCE6F2] transition cursor-pointer space-y-1"
                  >
                    <span className="text-[10px] text-slate-400 block">{formatDate(a.published_at || a.created_at).full}</span>
                    <h4 className="text-xs font-bold text-[#102A4C] line-clamp-1">{a.title}</h4>
                    <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{a.body}</p>
                  </div>
                ))}
                {(!portalData?.announcements || portalData.announcements.length === 0) && (
                  <p className="text-xs text-slate-400 text-center py-4">No new notices at this time.</p>
                )}
              </div>
            </div>

            {/* My Tickets Preview Card */}
            <div className="bg-white rounded-2xl p-5 border border-[#DCE6F2] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#102A4C]">My Tickets</h3>
                <button
                  onClick={() => setMyTicketsModalOpen(true)}
                  className="text-[11px] font-semibold text-[#1463D8] hover:underline"
                >
                  View all ({portalData?.tickets.length ?? 0})
                </button>
              </div>
              <div className="space-y-2.5">
                {(portalData?.tickets || []).slice(0, 2).map(t => (
                  <div
                    key={t.id}
                    onClick={() => setTicketModalData(t)}
                    className="p-3 bg-[#F7FAFE] hover:bg-blue-50/50 rounded-xl border border-[#DCE6F2] transition cursor-pointer flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-[#102A4C] truncate">{t.event_title}</h4>
                      <p className="text-[10px] text-slate-500">{formatDate(t.event_start).full}</p>
                      <span className="text-[9px] font-mono text-[#1463D8]">{t.code}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      t.status === 'VALID' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {t.status}
                    </span>
                  </div>
                ))}
                {(!portalData?.tickets || portalData.tickets.length === 0) && (
                  <p className="text-xs text-slate-400 text-center py-4">No tickets booked yet.</p>
                )}
              </div>
            </div>

            {/* My Orders Preview Card */}
            <div className="bg-white rounded-2xl p-5 border border-[#DCE6F2] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#102A4C]">My Orders</h3>
                <button
                  onClick={() => {
                    setOrdersModalTab('history');
                    setMyOrdersModalOpen(true);
                  }}
                  className="text-[11px] font-semibold text-[#1463D8] hover:underline"
                >
                  View all ({portalData?.orders.length ?? 0})
                </button>
              </div>
              <div className="space-y-2.5">
                {(portalData?.orders || []).slice(0, 2).map(o => (
                  <div
                    key={o.id}
                    onClick={() => {
                      setOrdersModalTab('history');
                      setMyOrdersModalOpen(true);
                    }}
                    className="p-3 bg-[#F7FAFE] hover:bg-slate-100/80 rounded-xl border border-[#DCE6F2] transition cursor-pointer flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-[#102A4C] truncate">
                        {o.items.map(i => `${i.product_name} (${i.size})`).join(', ') || 'Merchandise Order'}
                      </h4>
                      <span className="text-[10px] text-slate-400">{formatDate(o.created_at).full}</span>
                    </div>
                    <span className="text-xs font-bold text-[#102A4C] flex-shrink-0">
                      {formatPaise(o.total_paise)}
                    </span>
                  </div>
                ))}
                {(!portalData?.orders || portalData.orders.length === 0) && (
                  <p className="text-xs text-slate-400 text-center py-4">No merchandise orders yet.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* ======================================================== */}
      {/* 4. MODALS & DIALOGS                                       */}
      {/* ======================================================== */}

      {/* MODAL 1: EVENT DETAIL & BOOKING */}
      {activeEvent && (
        <div className="fixed inset-0 z-50 bg-[#0B1E36]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Banner */}
            <div className="relative h-48 bg-slate-900">
              <img
                src={activeEvent.image_url || getEventFallbackImage(activeEvent.type, activeEvent.title)}
                alt={activeEvent.title}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setEventDetailModalId(null)}
                className="absolute top-3 right-3 bg-black/60 hover:bg-black text-white p-1.5 rounded-full transition"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-3 left-4 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-[#102A4C]">
                {activeEvent.type}
              </div>
            </div>

            {/* Details */}
            <div className="p-6 space-y-4">
              <div>
                <h2 className="text-xl font-extrabold text-[#102A4C]">{activeEvent.title}</h2>
                <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-2">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5 text-[#1463D8]" />
                    {formatDate(activeEvent.start_at).full}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#1463D8]" />
                    {formatDate(activeEvent.start_at).time}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#1463D8]" />
                    {activeEvent.location}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {activeEvent.description}
              </p>

              {/* Ticket Tier Selection */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-[#102A4C] block">Select Admission Tier</span>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setSelectedTicketTier('member')}
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      selectedTicketTier === 'member'
                        ? 'border-[#1463D8] bg-blue-50/70 text-[#102A4C]'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Member Rate</span>
                      <Crown className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    <span className="block text-base font-extrabold mt-1">
                      {formatPaise(activeEvent.member_price_paise)}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {isMember ? 'Included in your perk' : 'Requires active membership'}
                    </span>
                  </div>

                  <div
                    onClick={() => setSelectedTicketTier('standard')}
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      selectedTicketTier === 'standard'
                        ? 'border-[#1463D8] bg-blue-50/70 text-[#102A4C]'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-xs font-bold block">Standard Rate</span>
                    <span className="block text-base font-extrabold mt-1">
                      {formatPaise(activeEvent.nonmember_price_paise)}
                    </span>
                    <span className="text-[10px] text-slate-500 block">Open to all students</span>
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="pt-3 flex gap-2">
                <button
                  onClick={() => setEventDetailModalId(null)}
                  className="w-1/3 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleBookTicket(activeEvent.id)}
                  disabled={bookingLoading || activeEvent.seats_sold >= activeEvent.capacity}
                  className="w-2/3 py-2.5 text-xs font-bold text-white bg-[#1463D8] hover:bg-[#1052B5] rounded-xl transition shadow-md disabled:opacity-50"
                >
                  {bookingLoading ? 'Securing Ticket…' : `Confirm Ticket (${formatPaise(selectedTicketTier === 'member' ? activeEvent.member_price_paise : activeEvent.nonmember_price_paise)})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: TICKET DETAIL & CHECK-IN */}
      {ticketModalData && (
        <div className="fixed inset-0 z-50 bg-[#0B1E36]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1463D8]">Campus Ticket</span>
              <button onClick={() => setTicketModalData(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base font-extrabold text-[#102A4C]">{ticketModalData.event_title}</h3>
              <p className="text-xs text-slate-500">{formatDate(ticketModalData.event_start).full}</p>
              <div className="inline-block p-4 bg-slate-50 border border-slate-200 rounded-2xl my-2">
                <QrCode className="w-28 h-28 mx-auto text-[#102A4C]" />
                <span className="block text-xs font-mono font-bold mt-2 text-[#1463D8]">
                  {ticketModalData.code}
                </span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  ticketModalData.status === 'VALID' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                }`}>
                  Status: {ticketModalData.status}
                </span>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              {ticketModalData.status === 'VALID' && (
                <button
                  onClick={() => handleCheckin(ticketModalData.id)}
                  disabled={checkinLoading}
                  className="w-full py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-md disabled:opacity-50"
                >
                  {checkinLoading ? 'Verifying…' : 'Simulate Check-in'}
                </button>
              )}
              <button
                onClick={() => setTicketModalData(null)}
                className="w-full py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: MEMBERSHIP JOIN & PERKS */}
      {membershipModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0B1E36]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#102A4C]">Skyline Membership</span>
              </div>
              <button onClick={() => setMembershipModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {membershipStep === 'plan' && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase text-[#1463D8]">Annual Student Plan</span>
                    <span className="text-base font-black text-[#102A4C]">₹500 / year</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Access premium club benefits, lower event ticket fees, and voting privileges for the whole academic term.
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-[#102A4C] block">Member Perks:</span>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>15% discount on Spring Gala, TechFest & all major events</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>Priority registration window 48h before general admission</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>Member-exclusive pricing on limited Skyline merchandise</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>Official student leadership and association election voting</span>
                    </li>
                  </ul>
                </div>

                {isMember ? (
                  <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl font-semibold text-center border border-emerald-200">
                    Your membership is active until {formatDate(portalData?.membership.ends_on || '').full}.
                  </div>
                ) : (
                  <button
                    onClick={() => setMembershipStep('checkout')}
                    className="w-full py-3 text-xs font-bold text-white bg-[#1463D8] hover:bg-[#1052B5] rounded-xl transition shadow-md"
                  >
                    Proceed to Membership Checkout
                  </button>
                )}
              </div>
            )}

            {membershipStep === 'checkout' && (
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                    <span>Plan:</span>
                    <span>Annual Membership (1 Year)</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                    <span>Student:</span>
                    <span>{user?.name}</span>
                  </div>
                  <div className="flex justify-between text-sm font-extrabold text-[#102A4C] pt-2 border-t border-slate-200">
                    <span>Total Amount:</span>
                    <span>₹500.00</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold text-[#102A4C]">Payment Method:</span>
                  <div className="p-3 border border-[#1463D8] bg-blue-50/50 rounded-xl flex items-center justify-between">
                    <span className="text-xs font-semibold">Campus UPI / Student Card</span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Instant</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setMembershipStep('plan')}
                    className="w-1/3 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleJoinMembership}
                    disabled={bookingLoading}
                    className="w-2/3 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-md disabled:opacity-50"
                  >
                    {bookingLoading ? 'Processing…' : 'Pay ₹500 & Activate'}
                  </button>
                </div>
              </div>
            )}

            {membershipStep === 'success' && (
              <div className="text-center py-4 space-y-3">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <h3 className="text-base font-extrabold text-[#102A4C]">Membership Activated!</h3>
                <p className="text-xs text-slate-600">
                  Welcome aboard! Your 15% discount has been applied to all events and merchandise.
                </p>
                <button
                  onClick={() => setMembershipModalOpen(false)}
                  className="w-full py-2.5 text-xs font-bold text-white bg-[#1463D8] hover:bg-[#1052B5] rounded-xl transition"
                >
                  Continue to Workspace
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 4: MY ORDERS & CART MODAL */}
      {myOrdersModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0B1E36]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex gap-4">
                <button
                  onClick={() => setOrdersModalTab('cart')}
                  className={`text-xs font-bold pb-1 border-b-2 transition ${
                    ordersModalTab === 'cart'
                      ? 'border-[#1463D8] text-[#1463D8]'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Shopping Bag ({totalCartCount})
                </button>
                <button
                  onClick={() => setOrdersModalTab('history')}
                  className={`text-xs font-bold pb-1 border-b-2 transition ${
                    ordersModalTab === 'history'
                      ? 'border-[#1463D8] text-[#1463D8]'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Order History ({portalData?.orders.length ?? 0})
                </button>
              </div>
              <button onClick={() => setMyOrdersModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {ordersModalTab === 'cart' ? (
                cart.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-500">Your bag is empty.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map(item => (
                      <div key={item.variant_id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-[#102A4C]">{item.product_name}</h4>
                          <span className="text-[10px] text-slate-400">Size: {item.size} · {formatPaise(item.unit_price_paise)} each</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (item.quantity > 1) {
                                setCart(prev => prev.map(i => i.variant_id === item.variant_id ? { ...i, quantity: i.quantity - 1 } : i));
                              } else {
                                setCart(prev => prev.filter(i => i.variant_id !== item.variant_id));
                              }
                            }}
                            className="w-6 h-6 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 flex items-center justify-center hover:bg-slate-100"
                          >
                            -
                          </button>
                          <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                          <button
                            onClick={() => {
                              setCart(prev => prev.map(i => i.variant_id === item.variant_id ? { ...i, quantity: i.quantity + 1 } : i));
                            }}
                            className="w-6 h-6 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 flex items-center justify-center hover:bg-slate-100"
                          >
                            +
                          </button>
                          <button
                            onClick={() => setCart(prev => prev.filter(i => i.variant_id !== item.variant_id))}
                            className="text-slate-400 hover:text-rose-600 ml-2"
                            aria-label="Remove item"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                /* Order History */
                (portalData?.orders || []).length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">No prior orders found.</p>
                ) : (
                  <div className="space-y-3">
                    {(portalData?.orders || []).map(order => (
                      <div key={order.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[#102A4C]">{formatDate(order.created_at).full}</span>
                          <span className="font-extrabold text-[#1463D8]">{formatPaise(order.total_paise)}</span>
                        </div>
                        <ul className="text-[11px] text-slate-600 pl-3 list-disc space-y-0.5">
                          {order.items.map(i => (
                            <li key={i.id}>
                              {i.product_name} ({i.size}) × {i.quantity} — {formatPaise(i.unit_price_paise * i.quantity)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Bottom summary if in Cart */}
            {ordersModalTab === 'cart' && cart.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex justify-between text-xs font-bold text-[#102A4C]">
                  <span>Total Amount</span>
                  <span>{formatPaise(cartTotalPaise)}</span>
                </div>
                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  className="w-full py-2.5 text-xs font-bold text-white bg-[#1463D8] hover:bg-[#1052B5] rounded-xl transition shadow-md disabled:opacity-50"
                >
                  {checkoutLoading ? 'Processing Checkout…' : `Confirm & Place Order (${formatPaise(cartTotalPaise)})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 5: MY TICKETS MODAL */}
      {myTicketsModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0B1E36]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-[#102A4C]">My Booked Tickets</span>
              <button onClick={() => setMyTicketsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {(portalData?.tickets || []).length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <Ticket className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-500">You haven't booked any event tickets yet.</p>
                </div>
              ) : (
                (portalData?.tickets || []).map(t => (
                  <div
                    key={t.id}
                    onClick={() => {
                      setMyTicketsModalOpen(false);
                      setTicketModalData(t);
                    }}
                    className="p-4 bg-slate-50 hover:bg-blue-50/50 rounded-xl border border-slate-200 transition cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-[#102A4C]">{t.event_title}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1">
                        <span>{formatDate(t.event_start).full}</span>
                        <span>•</span>
                        <span>{t.event_location}</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#1463D8] font-bold block mt-1">
                        {t.code}
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full block mb-1 ${
                        t.status === 'VALID' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {t.status}
                      </span>
                      <span className="text-[10px] text-[#1463D8] font-semibold">View pass →</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: ALL EVENTS MODAL */}
      {allEventsModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0B1E36]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-[#102A4C]">All Upcoming Events</span>
              <button onClick={() => setAllEventsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(portalData?.events || []).map(event => {
                  const dateInfo = formatDate(event.start_at);
                  return (
                    <div
                      key={event.id}
                      onClick={() => {
                        setAllEventsModalOpen(false);
                        setSelectedTicketTier(isMember ? 'member' : 'standard');
                        setEventDetailModalId(event.id);
                      }}
                      className="bg-[#F7FAFE] border border-[#DCE6F2] rounded-xl p-3 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold text-[#1463D8]">{dateInfo.month} {dateInfo.day}</span>
                          <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">{event.type}</span>
                        </div>
                        <h4 className="text-xs font-bold text-[#102A4C]">{event.title}</h4>
                        <p className="text-[11px] text-slate-500 truncate">{event.location}</p>
                      </div>
                      <div className="pt-2 mt-2 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-xs font-extrabold text-[#102A4C]">
                          {formatPaise(event.member_price_paise)} <span className="text-[10px] text-slate-400 font-normal">/ member</span>
                        </span>
                        <span className="text-[10px] text-[#1463D8] font-bold">Book →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: ALL MERCHANDISE MODAL */}
      {allMerchModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0B1E36]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-[#102A4C]">Official Merchandise Catalog</span>
              <button onClick={() => setAllMerchModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {(portalData?.merchandise || []).map(prod => (
                  <div key={prod.id} className="bg-[#F7FAFE] border border-[#DCE6F2] rounded-xl p-3 flex flex-col justify-between space-y-2">
                    <div className="h-32 bg-white rounded-lg flex items-center justify-center p-2">
                      <img src={prod.image_url || '/images/merch_hoodie.png'} alt={prod.name} className="h-full object-contain" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#102A4C]">{prod.name}</h4>
                      <span className="text-xs font-extrabold text-[#102A4C] block mt-0.5">
                        {formatPaise(isMember ? prod.member_price_paise : prod.price_paise)}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        addToCart(prod);
                      }}
                      className="w-full py-1.5 bg-[#1463D8] hover:bg-[#1052B5] text-white text-[11px] font-bold rounded-lg transition"
                    >
                      Add to Bag
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: ALL ANNOUNCEMENTS MODAL */}
      {allAnnouncementsModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0B1E36]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-[#102A4C]">All Association Notices</span>
              <button onClick={() => setAllAnnouncementsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {(portalData?.announcements || []).map(a => (
                <div key={a.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <span className="text-[10px] text-slate-400 block font-semibold">{formatDate(a.published_at || a.created_at).full}</span>
                  <h4 className="text-sm font-bold text-[#102A4C]">{a.title}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. MINIMAL FOOTER                                         */}
      {/* ======================================================== */}
      <footer className="mt-12 border-t border-[#DCE6F2] bg-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Skyline" className="h-6 w-auto object-contain" />
            <span>Skyline Student Association · Connected Campus Hub</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Currency: INR (₹) · Asia/Kolkata</span>
            <button
              onClick={logout}
              className="text-xs text-slate-500 hover:text-rose-600 transition inline-flex items-center gap-1 font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
