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
  ChevronDown,
  ArrowRight,
  Clock,
  MapPin,
  X,
  Check,
  QrCode,
  LogOut,
  Sparkles,
  ShoppingBag,
  ShieldCheck,
  Tag,
  Users,
  ArrowLeftRight
} from 'lucide-react';
import { api, queryClient, type User } from '../lib/api';
import { useAuth } from '../App';
import { startRazorpayPayment } from '../lib/razorpay';

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

function getProductImage(name: string = '', fallbackUrl: string = ''): string {
  const n = (name || '').toLowerCase();
  if (n.includes('backpack') || n.includes('bag')) return '/images/bag.jpeg';
  if (n.includes('bottle')) return '/images/bottle.jpeg';
  if (n.includes('cap')) return '/images/cap.jpeg';
  if (n.includes('hoodie')) return '/images/hoodie.jpeg';
  if (n.includes('t-shirt') || n.includes('shirt')) return '/images/t_shirt.jpeg';
  return fallbackUrl || '/images/hoodie.jpeg';
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);

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

  // Carousel refs for horizontal scrolling
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const merchScrollRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleScroll = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    if (ref.current) {
      const offset = direction === 'left' ? -300 : 300;
      ref.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  const logout = async () => {
    try {
      await api('/auth/logout', 'POST', {});
      queryClient.clear();
      nav('/login', { replace: true });
      setUser(null);
    } catch {
      nav('/login', { replace: true });
      setUser(null);
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
      const activeEv = portalData?.events.find(e => e.id === eventId);
      const isFree = activeEv && (isMember ? activeEv.member_price_paise === 0 : activeEv.nonmember_price_paise === 0);

      if (isFree) {
        const res = await api<any>('/student/tickets/book', 'POST', {
          event_id: eventId,
          tier: selectedTicketTier
        });
        showToast('Ticket confirmed! Added to My Tickets.');
        setEventDetailModalId(null);
        await refetch();
        if (res?.data) {
          setTicketModalData(res.data);
        }
        return;
      }

      // Paid ticket: Razorpay Test Mode checkout
      const orderRes = await api<any>('/payments/razorpay/order', 'POST', {
        purpose: 'event_ticket',
        eventId
      });
      const orderData = orderRes.data || orderRes;

      await startRazorpayPayment({
        key_id: orderData.key_id,
        order_id: orderData.order_id,
        intent_id: orderData.intent_id,
        amount_paise: orderData.amount_paise,
        name: 'Skyline Student Association',
        description: `${activeEv?.title || 'Event'} Ticket`,
        prefill: {
          name: user?.name,
          email: user?.email,
          contact: user?.phone
        },
        onSuccess: async (verifyRes: any) => {
          showToast('Payment verified! Ticket confirmed.');
          setEventDetailModalId(null);
          await refetch();
          if (verifyRes?.data?.ticket) {
            setTicketModalData(verifyRes.data.ticket);
          }
        },
        onError: (errMsg: string) => {
          showToast(errMsg || 'Ticket payment was not completed.');
        }
      });
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

  // Execute cart checkout with Razorpay
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setCheckoutLoading(true);
    try {
      const items = cart.map(item => ({
        variantId: item.variant_id,
        quantity: item.quantity
      }));
      const orderRes = await api<any>('/payments/razorpay/order', 'POST', {
        purpose: 'merchandise',
        items
      });
      const orderData = orderRes.data || orderRes;

      await startRazorpayPayment({
        key_id: orderData.key_id,
        order_id: orderData.order_id,
        intent_id: orderData.intent_id,
        amount_paise: orderData.amount_paise,
        name: 'Skyline Student Association',
        description: 'Campus Merchandise Order',
        prefill: {
          name: user?.name,
          email: user?.email,
          contact: user?.phone
        },
        onSuccess: async () => {
          setCart([]);
          showToast('Order confirmed! Receipt recorded.');
          setMyOrdersModalOpen(false);
          await refetch();
        },
        onError: (errMsg: string) => {
          showToast(errMsg || 'Merchandise checkout was unsuccessful.');
        }
      });
    } catch (err: any) {
      showToast(err.message || 'Checkout was unsuccessful. Please check available stock.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Purchase/renew membership with Razorpay
  const handleJoinMembership = async () => {
    setBookingLoading(true);
    try {
      const orderRes = await api<any>('/payments/razorpay/order', 'POST', {
        purpose: 'membership'
      });
      const orderData = orderRes.data || orderRes;

      await startRazorpayPayment({
        key_id: orderData.key_id,
        order_id: orderData.order_id,
        intent_id: orderData.intent_id,
        amount_paise: orderData.amount_paise,
        name: 'Skyline Student Association',
        description: 'Annual Student Membership',
        prefill: {
          name: user?.name,
          email: user?.email,
          contact: user?.phone
        },
        onSuccess: async () => {
          setMembershipStep('success');
          showToast('Membership activated! Welcome to Skyline Association.');
          await refetch();
        },
        onError: (errMsg: string) => {
          showToast(errMsg || 'Membership activation unsuccessful.');
        }
      });
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
    <div id="dashboard-top" className={`min-h-screen bg-[#F7FAFE] text-slate-700 antialiased font-sans ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={{ fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
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
      <header className="sticky top-0 z-50 bg-white border-b border-[#DCE6F2] shadow-sm">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
          {/* Brand Logo */}
          <Link to="/student" className="flex items-center gap-3 shrink-0 cursor-pointer">
            <img src="/logo.png" alt="Skyline" className="w-auto object-contain h-10 sm:h-12" />
            <div className="leading-none hidden sm:block border-l border-[#DCE6F2] pl-3">
              <span className="block text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
                Student Association
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-7 font-medium text-sm text-slate-600">
            <a
              href="#dashboard-top"
              className="relative py-5 text-[#1463D8] font-semibold after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-[#1463D8]"
            >
              Home
            </a>
            <button
              onClick={() => {
                const el = document.getElementById('events-section');
                el ? el.scrollIntoView({ behavior: 'smooth' }) : setAllEventsModalOpen(true);
              }}
              className="py-5 hover:text-[#1463D8] transition-colors"
            >
              Events
            </button>
            <button
              onClick={() => {
                const el = document.getElementById('merchandise-section');
                el ? el.scrollIntoView({ behavior: 'smooth' }) : setAllMerchModalOpen(true);
              }}
              className="py-5 hover:text-[#1463D8] transition-colors"
            >
              Merchandise
            </button>
            <button
              onClick={() => {
                const el = document.getElementById('announcements-section');
                el ? el.scrollIntoView({ behavior: 'smooth' }) : setAllAnnouncementsModalOpen(true);
              }}
              className="py-5 hover:text-[#1463D8] transition-colors"
            >
              Announcements
            </button>
            <a
              href="#about-section"
              className="py-5 hover:text-[#1463D8] transition-colors"
            >
              About
            </a>
          </nav>

          {/* Search Field & Profile Controls */}
          <div className="flex items-center gap-4 shrink-0">
            {/* Search Input */}
            <div className="relative hidden sm:block w-64 md:w-72">
              <input
                type="text"
                placeholder="Search events, merchandise..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-[#DCE6F2] rounded-full focus:outline-none focus:ring-2 focus:ring-[#1463D8]/30 focus:border-[#1463D8] transition placeholder:text-slate-400 text-slate-700"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Cart Button */}
            <button
              onClick={() => {
                setOrdersModalTab('cart');
                setMyOrdersModalOpen(true);
              }}
              aria-label="Open cart"
              className="relative p-2 text-slate-600 hover:text-[#1463D8] hover:bg-slate-50 rounded-full transition"
            >
              <ShoppingCart className="w-5 h-5 text-slate-700" />
              <span className="absolute top-0 right-0 w-4 h-4 bg-[#1463D8] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                {totalCartCount}
              </span>
            </button>

            {/* User Profile Pill & Dropdown */}
            <div className="relative">
              <div
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 pl-2 border-l border-[#DCE6F2] cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-full bg-[#102A4C] text-white text-xs font-semibold flex items-center justify-center ring-2 ring-transparent group-hover:ring-[#1463D8] transition">
                  {user?.name ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('') : 'AP'}
                </div>
                <div className="hidden lg:block text-left leading-tight">
                  <span className="text-xs font-semibold text-[#102A4C] block">{user?.name || 'Aarav Patel'}</span>
                  <span className="text-[10px] text-slate-400 block">{isMember ? 'Skyline Plus Member' : 'Standard Student'}</span>
                </div>
                <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition ml-0.5" />
              </div>

              {/* Profile Dropdown */}
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-[#DCE6F2] shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-[#102A4C]">{user?.name || 'Aarav Patel'}</p>
                    <p className="text-[11px] text-slate-400 truncate">{user?.email || 'student@skyline.edu'}</p>
                    <div className="mt-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isMember ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {isMember ? 'Skyline Plus Member' : 'Standard Student'}
                      </span>
                    </div>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        setMembershipStep('plan');
                        setMembershipModalOpen(true);
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span>View Membership</span>
                      <Crown className="w-3.5 h-3.5 text-amber-500" />
                    </button>
                    {user?.roles && user.roles.length > 1 && (
                      <Link
                        to="/select-workspace"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center justify-between font-semibold"
                      >
                        <span>Switch workspace</span>
                        <ArrowLeftRight className="w-3.5 h-3.5 text-[#1463D8]" />
                      </Link>
                    )}
                    <button
                      onClick={logout}
                      className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center justify-between font-semibold"
                      aria-label="Sign out"
                    >
                      <span>Sign out</span>
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Direct Sign out button for test accessibility */}
            <button
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 2. PAGE CONTENT                                           */}
      {/* ======================================================== */}
      <main className="max-w-[1440px] mx-auto px-6 py-6 space-y-6">
        {/* HERO BANNER */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-white via-[#F7FAFE] to-[#EFF6FE] border border-[#DCE6F2] shadow-sm flex flex-col lg:flex-row items-stretch min-h-[350px] lg:min-h-[370px]">
          {/* Hero Details Left Content (42-44%) */}
          <div className="relative z-10 w-full lg:w-[44%] xl:w-[42%] p-7 sm:p-9 lg:p-10 xl:p-12 flex flex-col justify-center shrink-0">
            <span className="inline-block text-[11px] font-extrabold uppercase tracking-widest text-[#1463D8] mb-2 sm:mb-2.5">
              Skyline Student Association
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-[40px] xl:text-[44px] font-extrabold text-[#102A4C] tracking-tight leading-[1.12] mb-3 sm:mb-4">
              Students. Events.<br className="hidden sm:inline" />
              <span className="text-[#1463D8]">Community.</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed max-w-md font-normal">
              Join a vibrant community, attend exciting events, grab exclusive merchandise, and be part of something bigger.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  const el = document.getElementById('events-section');
                  el ? el.scrollIntoView({ behavior: 'smooth' }) : setAllEventsModalOpen(true);
                }}
                className="px-5 py-2.5 bg-[#1463D8] hover:bg-[#1052B5] text-white text-xs font-semibold rounded-lg shadow-md shadow-blue-500/20 inline-flex items-center gap-2 transition transform active:scale-95 cursor-pointer"
              >
                Explore Events <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setMembershipStep('plan');
                  setMembershipModalOpen(true);
                }}
                className="px-5 py-2.5 bg-white hover:bg-slate-50 text-[#1463D8] border border-[#1463D8] text-xs font-semibold rounded-lg shadow-sm transition cursor-pointer"
              >
                View Membership
              </button>
            </div>
          </div>

          {/* Hero Right Visual Campus Imagery (56-58%) */}
          <div className="relative w-full lg:w-[56%] xl:w-[58%] min-h-[250px] sm:min-h-[300px] lg:min-h-[370px] overflow-hidden select-none flex items-center justify-end">
            <img
              alt="Students walking on university campus"
              className="w-full h-full object-cover object-right lg:object-center pointer-events-none"
              src="/images/hero_campus_banner.png"
            />
            {/* "More Than Just a Campus" handwritten script overlay in top right */}
            <div
              className="absolute top-6 right-8 sm:right-12 text-white font-serif italic text-xl sm:text-2xl font-black drop-shadow-lg tracking-wide select-none pointer-events-none"
              style={{ transform: 'rotate(-4deg)', textShadow: '0 2px 8px rgba(0,0,0,0.45)' }}
            >
              More Than Just<br />a Campus
            </div>
            {/* Interactive Quick Access Hotspots Panel in bottom right */}
            <div className="absolute right-4 bottom-4 z-20 bg-[#102A4C]/85 backdrop-blur-md rounded-2xl p-3 border border-white/10 shadow-xl min-w-[140px] space-y-1.5 text-white">
              <button
                onClick={() => {
                  const el = document.getElementById('events-section');
                  el ? el.scrollIntoView({ behavior: 'smooth' }) : setAllEventsModalOpen(true);
                }}
                className="w-full flex items-center gap-2 text-xs font-semibold hover:text-blue-300 transition text-left py-1"
              >
                <CalendarDays className="w-3.5 h-3.5 text-blue-300" />
                <span>Events</span>
              </button>
              <button
                onClick={() => {
                  const el = document.getElementById('merchandise-section');
                  el ? el.scrollIntoView({ behavior: 'smooth' }) : setAllMerchModalOpen(true);
                }}
                className="w-full flex items-center gap-2 text-xs font-semibold hover:text-blue-300 transition text-left py-1"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-blue-300" />
                <span>Merchandise</span>
              </button>
              <a
                href="#about-section"
                className="w-full flex items-center gap-2 text-xs font-semibold hover:text-blue-300 transition text-left py-1"
              >
                <Users className="w-3.5 h-3.5 text-blue-300" />
                <span>Community</span>
              </a>
            </div>
          </div>
        </section>

        {/* MEMBERSHIP HIGHLIGHT & QUICK METRICS */}
        <section id="membership-section" className="rounded-xl border border-[#DCE6F2] bg-gradient-to-r from-[#F0F6FD] via-[#F4F8FE] to-[#EEF5FE] p-4 lg:p-5 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Membership Promo Left */}
          <div className="w-full lg:w-1/3 pr-2">
            <h2 className="text-base font-bold text-[#102A4C]">Your Membership</h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-3">
              {isMember ? 'Your membership is active.' : 'Unlock exclusive benefits and be a part of Skyline.'}
            </p>
            <button
              onClick={() => {
                setMembershipStep('plan');
                setMembershipModalOpen(true);
              }}
              className="px-4 py-1.5 bg-[#1463D8] hover:bg-[#1052B5] text-white text-xs font-semibold rounded-md shadow-sm transition"
            >
              View Membership
            </button>
          </div>

          {/* Quick Metrics Right (3 cards) */}
          <div className="w-full lg:w-2/3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Card 1: Membership Status */}
            <div className="bg-white border border-[#DCE6F2] rounded-lg p-3 flex items-center gap-3 shadow-xs">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#1463D8] flex items-center justify-center shrink-0 text-base">
                <Crown className="w-5 h-5 text-[#1463D8]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#102A4C]">
                    {isMember ? '✓ Skyline Plus' : 'Skyline Plus'}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    isMember ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {isMember ? 'Active' : 'Join Now'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isMember
                    ? `Valid until: ${portalData?.membership.ends_on ? formatDate(portalData.membership.ends_on).full : '03 October 2027'}`
                    : 'Not a member yet'}
                </p>
                <span className="text-[10px] text-slate-500 font-medium block">
                  {isMember ? 'Active Member' : 'Standard Student'}
                </span>
              </div>
            </div>

            {/* Card 2: Member Benefits */}
            <div className="bg-white border border-[#DCE6F2] rounded-lg p-3 flex items-center gap-3 shadow-xs">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#1463D8] flex items-center justify-center shrink-0 text-base font-bold">
                %
              </div>
              <div>
                <span className="text-xs text-slate-400 block font-medium">Member Benefits</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-sm font-bold text-[#102A4C]">20%</span>
                  <span className="text-[11px] text-slate-500">20% off eligible events</span>
                </div>
              </div>
            </div>

            {/* Card 3: Registrations */}
            <div className="bg-white border border-[#DCE6F2] rounded-lg p-3 flex items-center gap-3 shadow-xs">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#1463D8] flex items-center justify-center shrink-0 text-base">
                <Ticket className="w-5 h-5 text-[#1463D8]" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block font-medium">My Registrations</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-sm font-bold text-[#102A4C]">{portalData?.tickets ? portalData.tickets.length : 23}</span>
                  <span className="text-[11px] text-slate-500">{portalData?.orders ? `${portalData.orders.length} in delivery` : '10 in delivery'}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* DASHBOARD CONTROLS BAR: Collapse/Expand Sidebar Toggle */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dashboard View</span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                sidebarCollapsed
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-blue-50 text-[#1463D8] border border-blue-200'
              }`}
            >
              {sidebarCollapsed ? 'Full Width (100%)' : 'Split View (75/25)'}
            </span>
          </div>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-white border border-[#DCE6F2] hover:border-[#1463D8] hover:text-[#1463D8] text-slate-700 rounded-lg shadow-2xs transition group"
            title="Toggle personal sidebar visibility"
          >
            <span className="text-slate-400 group-hover:text-[#1463D8]">▤</span>
            <span>{sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}</span>
            <span className="bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-[#1463D8] text-[10px] px-1.5 py-0.5 rounded font-mono transition">
              Tab
            </span>
          </button>
        </div>

        {/* ======================================================== */}
        {/* 3. TWO-COLUMN SPLIT GRID                                  */}
        {/* ======================================================== */}
        <div className="flex flex-col lg:flex-row gap-6 items-start transition-all duration-300" id="dashboard-container">
          {/* MAIN COLUMN (Upcoming Events & Merchandise & About) */}
          <div className={`space-y-7 transition-all duration-300 min-w-0 ${sidebarCollapsed ? 'w-full' : 'w-full lg:w-[75%]'}`} id="main-content-col">
            {/* UPCOMING EVENTS */}
            <section id="events-section">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-[#102A4C] tracking-tight">Upcoming Events</h2>
                  <span className="text-xs text-slate-400 hidden sm:inline">• Browse & book tickets</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-1.5">
                    <button
                      onClick={() => handleScroll(eventsScrollRef, 'left')}
                      className="w-7 h-7 rounded-full bg-white border border-[#DCE6F2] hover:border-[#1463D8] hover:text-[#1463D8] text-slate-600 flex items-center justify-center transition shadow-2xs"
                      aria-label="Scroll events left"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleScroll(eventsScrollRef, 'right')}
                      className="w-7 h-7 rounded-full bg-white border border-[#DCE6F2] hover:border-[#1463D8] hover:text-[#1463D8] text-slate-600 flex items-center justify-center transition shadow-2xs"
                      aria-label="Scroll events right"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => setAllEventsModalOpen(true)}
                    className="text-xs font-semibold text-[#1463D8] hover:text-[#1052B5] flex items-center gap-1"
                  >
                    View All Events <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Event Cards Horizontal Scroll */}
              <div className="relative group/events">
                <button
                  onClick={() => handleScroll(eventsScrollRef, 'left')}
                  className="absolute -left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-[#DCE6F2] shadow-md text-slate-600 hover:text-[#1463D8] flex items-center justify-center z-10 transition opacity-90 hover:opacity-100 hover:scale-105"
                  aria-label="Previous Events"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div
                  ref={eventsScrollRef}
                  className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth py-1 px-0.5"
                  id="eventsContainer"
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
                        className="w-[245px] shrink-0 bg-white border border-[#DCE6F2] rounded-xl overflow-hidden shadow-xs flex flex-col justify-between hover:shadow-md transition cursor-pointer event-card-trigger group"
                      >
                        <div>
                          <div className="relative h-28 w-full overflow-hidden bg-slate-100">
                            <img
                              src={event.image_url || getEventFallbackImage(event.type, event.title)}
                              alt={event.title}
                              className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                            />
                            {/* Date Badge */}
                            <div className="absolute top-2.5 left-2.5 bg-white/95 rounded-md px-2 py-0.5 text-center shadow-xs">
                              <span className="text-[9px] font-bold text-slate-500 uppercase block leading-tight">{dateInfo.month}</span>
                              <span className="text-sm font-extrabold text-[#1463D8] leading-none">{dateInfo.day}</span>
                            </div>
                          </div>
                          <div className="p-3.5 space-y-2">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-xs text-[#102A4C] truncate group-hover:text-[#1463D8] transition-colors">
                                {event.title}
                              </h3>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                event.title.toLowerCase().includes('gala') ? 'bg-blue-100 text-[#1463D8]' : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                {event.title.toLowerCase().includes('gala') ? 'Featured' : event.type}
                              </span>
                            </div>
                            <div className="space-y-1 text-[11px] text-slate-500">
                              <div className="flex items-center gap-1.5 truncate">
                                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{event.location}</span>
                              </div>
                              <div className="flex items-center gap-1.5 truncate">
                                <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{dateInfo.time}</span>
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                              {event.description}
                            </p>
                          </div>
                        </div>

                        <div className="p-3.5 pt-0 mt-auto">
                          <div className="flex items-baseline gap-1.5 mb-2.5">
                            {event.member_price_paise === 0 && event.nonmember_price_paise === 0 ? (
                              <span className="text-xs font-bold text-emerald-600 uppercase">FREE</span>
                            ) : (
                              <>
                                <span className="text-xs font-bold text-[#102A4C]">{formatPaise(event.member_price_paise)}</span>
                                <span className="text-[10px] text-slate-400">Member</span>
                                <span className="text-slate-300">|</span>
                                <span className="text-xs font-bold text-slate-500">{formatPaise(event.nonmember_price_paise)}</span>
                                <span className="text-[10px] text-slate-400">Non-member</span>
                              </>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTicketTier(isMember ? 'member' : 'standard');
                              setEventDetailModalId(event.id);
                            }}
                            disabled={isSoldOut}
                            className={`w-full py-1.5 text-xs font-semibold rounded-md shadow-xs transition flex items-center justify-center gap-1 ${
                              isSoldOut
                                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                : event.member_price_paise === 0
                                ? 'bg-[#1463D8] hover:bg-[#1052B5] text-white'
                                : 'bg-[#1463D8] hover:bg-[#1052B5] text-white'
                            }`}
                          >
                            {isSoldOut ? 'Sold Out' : event.member_price_paise === 0 ? 'Register ->' : 'Get Tickets ->'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => handleScroll(eventsScrollRef, 'right')}
                  className="absolute -right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-[#DCE6F2] shadow-md text-slate-600 hover:text-[#1463D8] flex items-center justify-center z-10 transition opacity-90 hover:opacity-100 hover:scale-105"
                  aria-label="Next Events"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </section>

            {/* FEATURED MERCHANDISE */}
            <section id="merchandise-section">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-[#102A4C] tracking-tight">Featured Merchandise</h2>
                  <span className="text-xs text-slate-400 hidden sm:inline">• Official campus collection</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-1.5">
                    <button
                      onClick={() => handleScroll(merchScrollRef, 'left')}
                      className="w-7 h-7 rounded-full bg-white border border-[#DCE6F2] hover:border-[#1463D8] hover:text-[#1463D8] text-slate-600 flex items-center justify-center transition shadow-2xs"
                      aria-label="Previous Merchandise"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleScroll(merchScrollRef, 'right')}
                      className="w-7 h-7 rounded-full bg-white border border-[#DCE6F2] hover:border-[#1463D8] hover:text-[#1463D8] text-slate-600 flex items-center justify-center transition shadow-2xs"
                      aria-label="Next Merchandise"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => setAllMerchModalOpen(true)}
                    className="text-xs font-semibold text-[#1463D8] hover:text-[#1052B5] flex items-center gap-1"
                  >
                    View All Merchandise <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Merchandise Cards Horizontal Scroll */}
              <div className="relative group/merch">
                <button
                  onClick={() => handleScroll(merchScrollRef, 'left')}
                  className="absolute -left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white border border-[#DCE6F2] shadow-md text-[#102A4C] hover:text-[#1463D8] hover:bg-slate-50 flex items-center justify-center z-10 transition opacity-95 hover:opacity-100 hover:scale-105"
                  aria-label="Previous Merchandise"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div
                  ref={merchScrollRef}
                  className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth py-1.5 px-0.5"
                  id="merchContainer"
                >
                  {(portalData?.merchandise || []).map(product => {
                    const selectedVariantId = selectedVariants[product.id] || product.variants[0]?.id;
                    const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);

                    return (
                      <div
                        key={product.id}
                        className="merch-card w-[340px] sm:w-[360px] h-[175px] shrink-0 bg-white border border-[#DCE6F2] rounded-xl p-3 shadow-xs hover:shadow-md transition flex items-center gap-3"
                      >
                        {/* Left: Large Image Area (~44%) */}
                        <div className="w-[44%] h-full bg-[#F8FAFC] border border-slate-100 rounded-lg flex items-center justify-center p-1.5 overflow-hidden shrink-0">
                          <img
                            src={getProductImage(product.name, product.image_url)}
                            alt={product.name}
                            className="w-full h-full object-contain rounded"
                          />
                        </div>

                        {/* Right: Product Information (~56%) */}
                        <div className="w-[56%] h-full flex flex-col justify-between py-0.5">
                          <div>
                            <h3 className="font-bold text-sm sm:text-base text-[#102A4C] leading-snug line-clamp-1" title={product.name}>
                              {product.name}
                            </h3>
                            <div className="text-base sm:text-lg font-extrabold text-[#102A4C] mt-0.5">
                              {formatPaise(isMember ? product.member_price_paise : product.price_paise)}
                            </div>
                          </div>

                          <div className="space-y-1.5 mt-auto">
                            <select
                              value={selectedVariantId || ''}
                              onChange={e => setSelectedVariants(prev => ({ ...prev, [product.id]: e.target.value }))}
                              className="w-full text-xs py-1 px-2 rounded-md border border-[#DCE6F2] bg-white text-slate-700 focus:ring-1 focus:ring-[#1463D8] focus:border-[#1463D8] outline-none"
                            >
                              {product.variants.length > 0 ? (
                                product.variants.map(v => (
                                  <option key={v.id} value={v.id}>
                                    {v.size === 'ONE_SIZE' || v.size === 'One Size' ? 'One Size' : `Size: ${v.size}`}
                                  </option>
                                ))
                              ) : (
                                <option value="">One Size</option>
                              )}
                            </select>

                            <button
                              onClick={() => addToCart(product)}
                              disabled={totalStock === 0}
                              className={`w-full h-9 text-xs font-semibold rounded-lg shadow-xs transition active:scale-95 flex items-center justify-center ${
                                totalStock === 0
                                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                  : 'bg-[#1463D8] hover:bg-[#1052B5] text-white'
                              }`}
                            >
                              {totalStock === 0 ? 'Out of Stock' : 'Add to Cart'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => handleScroll(merchScrollRef, 'right')}
                  className="absolute -right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white border border-[#DCE6F2] shadow-md text-[#102A4C] hover:text-[#1463D8] hover:bg-slate-50 flex items-center justify-center z-10 transition opacity-95 hover:opacity-100 hover:scale-105"
                  aria-label="Next Merchandise"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </section>

            {/* ABOUT SKYLINE STUDENT ASSOCIATION */}
            <section id="about-section" className="bg-white border border-[#DCE6F2] rounded-xl p-6 shadow-sm">
              <div className="flex flex-col lg:flex-row items-center gap-6">
                {/* Left Side Content (~58%) */}
                <div className="w-full lg:w-[58%] flex flex-col items-start">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#1463D8] mb-1">About Skyline</span>
                  <h2 className="text-xl sm:text-2xl font-bold text-[#102A4C] leading-snug">About Skyline Student Association</h2>
                  <div className="w-10 h-0.5 bg-[#1463D8] rounded-full my-2.5"></div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
                    Skyline Student Association is a student-run community dedicated to creating meaningful experiences beyond the classroom. We organize events, manage membership programs, offer official merchandise, and create opportunities for students to connect, contribute, and grow.
                  </p>
                  <button
                    onClick={() => setAllAnnouncementsModalOpen(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1463D8] hover:bg-[#1052B5] text-white text-xs font-medium rounded-lg shadow-sm transition"
                  >
                    Learn More <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Right Side 2x2 Feature Grid (~42%) */}
                <div className="w-full lg:w-[42%] grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#1463D8] flex items-center justify-center shrink-0 text-xs">
                      <CalendarDays className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-[#102A4C] truncate">Events</h3>
                      <p className="text-[11px] text-slate-500 leading-tight mt-0.5">Engaging events throughout the year</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#1463D8] flex items-center justify-center shrink-0 text-xs">
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-[#102A4C] truncate">Merchandise</h3>
                      <p className="text-[11px] text-slate-500 leading-tight mt-0.5">Official Skyline merch for students</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#1463D8] flex items-center justify-center shrink-0 text-xs">
                      <Users className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-[#102A4C] truncate">Community</h3>
                      <p className="text-[11px] text-slate-500 leading-tight mt-0.5">Connect, create and belong</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#1463D8] flex items-center justify-center shrink-0 text-xs">
                      <Crown className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-[#102A4C] truncate">Opportunities</h3>
                      <p className="text-[11px] text-slate-500 leading-tight mt-0.5">Volunteer, lead and grow</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: Collapsible Sidebar (25% default width) */}
          {!sidebarCollapsed && (
            <aside className="w-full lg:w-[25%] shrink-0 space-y-6 transition-all duration-300" id="sidebar-col">
              {/* Sidebar Header / Personal Desk Quick Action */}
              <div
                onClick={() => setMyTicketsModalOpen(true)}
                className="bg-gradient-to-r from-blue-50/70 to-indigo-50/50 border border-[#DCE6F2] rounded-xl p-3 flex items-center justify-between shadow-2xs hover:bg-blue-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#1463D8] text-white flex items-center justify-center text-[10px]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-[#102A4C]">Personal Desk</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </div>

              {/* CARD 1: Announcements */}
              <div id="announcements-section" className="bg-white border border-[#DCE6F2] rounded-xl p-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-[#102A4C]">Announcements</h2>
                  <button
                    onClick={() => setAllAnnouncementsModalOpen(true)}
                    className="text-xs font-semibold text-[#1463D8] hover:text-[#1052B5] flex items-center gap-1 cursor-pointer"
                  >
                    View All <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {(!portalData?.announcements || portalData.announcements.length === 0) ? (
                    <div className="text-center py-4 text-xs text-slate-400">
                      <Bell className="w-6 h-6 mb-1 mx-auto text-slate-300" />
                      No new announcements.
                    </div>
                  ) : (
                    portalData.announcements.slice(0, 3).map((item, idx) => (
                      <div
                        key={item.id}
                        onClick={() => setAllAnnouncementsModalOpen(true)}
                        className="py-3 flex items-start gap-3 cursor-pointer group"
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs ${
                          idx % 2 === 0 ? 'bg-rose-50 text-rose-500' : 'bg-red-50 text-red-500'
                        }`}>
                          <Bell className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xs font-bold text-[#102A4C] group-hover:text-[#1463D8] transition truncate">
                            {item.title}
                          </h3>
                          <span className="block text-[10px] text-slate-400 mt-0.5">
                            {formatDate(item.published_at || item.created_at).full}
                          </span>
                          <p className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2">
                            {item.body}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* CARD 2: My Tickets */}
              <div id="tickets-section" className="bg-white border border-[#DCE6F2] rounded-xl p-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-[#102A4C]">My Tickets</h2>
                  <button
                    onClick={() => setMyTicketsModalOpen(true)}
                    className="text-xs font-semibold text-[#1463D8] hover:text-[#1052B5] flex items-center gap-1 cursor-pointer"
                  >
                    View All <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div id="myTicketsList" className="space-y-3">
                  {(!portalData?.tickets || portalData.tickets.length === 0) ? (
                    <div className="text-center py-4 text-xs text-slate-400">
                      <Ticket className="w-6 h-6 mb-1 mx-auto text-slate-300" />
                      You don't have any upcoming tickets.
                    </div>
                  ) : (
                    portalData.tickets.slice(0, 2).map(ticket => (
                      <div key={ticket.id} className="p-2.5 rounded-lg border border-[#DCE6F2] hover:border-slate-300 transition">
                        <div className="flex gap-2.5">
                          <img
                            src={ticket.event_image || '/images/thumb_spring_gala.png'}
                            alt={ticket.event_title}
                            className="w-14 h-14 rounded-md object-cover shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <h3 className="text-xs font-bold text-[#102A4C] truncate">{ticket.event_title}</h3>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">
                                Confirmed
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1 space-y-0.5">
                              <div className="flex items-center gap-1 truncate">
                                <Clock className="w-2.5 h-2.5" />
                                <span>{formatDate(ticket.event_start).full}</span>
                              </div>
                              <div className="flex items-center gap-1 truncate">
                                <MapPin className="w-2.5 h-2.5" />
                                <span>{ticket.event_location}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setTicketModalData(ticket)}
                          className="mt-2.5 w-full py-1 text-xs font-medium text-[#1463D8] bg-blue-50/60 hover:bg-blue-100 rounded flex items-center justify-center gap-1 transition cursor-pointer"
                        >
                          <Ticket className="w-3 h-3" /> View Ticket
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* CARD 3: My Orders */}
              <div id="orders-section" className="bg-white border border-[#DCE6F2] rounded-xl p-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-[#102A4C]">My Orders</h2>
                  <button
                    onClick={() => {
                      setOrdersModalTab('history');
                      setMyOrdersModalOpen(true);
                    }}
                    className="text-xs font-semibold text-[#1463D8] hover:text-[#1052B5] flex items-center gap-1 cursor-pointer"
                  >
                    View All <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div id="myOrdersList" className="divide-y divide-slate-100">
                  {(!portalData?.orders || portalData.orders.length === 0) ? (
                    <div className="text-center py-4 text-xs text-slate-400">
                      <ShoppingBag className="w-6 h-6 mb-1 mx-auto text-slate-300" />
                      No orders yet.
                    </div>
                  ) : (
                    portalData.orders.slice(0, 2).map(order => (
                      <div
                        key={order.id}
                        onClick={() => {
                          setOrdersModalTab('history');
                          setMyOrdersModalOpen(true);
                        }}
                        className="py-2.5 flex items-center justify-between gap-3 group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center p-1 shrink-0">
                            <img
                              src="/images/thumb_hoodie.png"
                              alt="Skyline Product"
                              className="h-full object-contain"
                            />
                          </div>
                          <div>
                            <h3 className="text-xs font-bold text-[#102A4C] group-hover:text-[#1463D8] transition">
                              {order.items[0]?.product_name || 'Skyline Hoodie'}
                            </h3>
                            <span className="block text-[10px] text-slate-400">
                              Size: {order.items[0]?.size || 'M'} | Qty: {order.items[0]?.quantity || 1}
                            </span>
                            <span className="text-xs font-bold text-[#102A4C] block mt-0.5">
                              {formatPaise(order.total_paise)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="bg-emerald-50 text-emerald-600 text-[10px] font-semibold px-2 py-0.5 rounded border border-emerald-100">
                            Confirmed
                          </span>
                          <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </aside>
          )}
        </div>
      </main>

      {/* Floating Re-open Button (Visible when sidebar collapsed) */}
      {sidebarCollapsed && (
        <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="flex items-center gap-2 bg-[#1463D8] hover:bg-[#1052B5] text-white py-2.5 px-3 rounded-l-xl shadow-xl transition transform active:scale-95"
            title="Show Personal Dashboard"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold tracking-wide">Personal Sidebar</span>
          </button>
        </div>
      )}

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
                      <img src={getProductImage(prod.name, prod.image_url)} alt={prod.name} className="h-full object-contain" />
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
        <div className="max-w-[1440px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Skyline" className="h-6 w-auto object-contain inline-block" />
            <span className="font-semibold text-slate-700">Skyline Student Association</span>
            <span>• © 2024 All Rights Reserved</span>
          </div>
          <div className="flex items-center gap-6">
            <a className="hover:text-[#1463D8]" href="#privacy" onClick={(e) => e.preventDefault()}>Privacy Policy</a>
            <a className="hover:text-[#1463D8]" href="#terms" onClick={(e) => e.preventDefault()}>Terms of Service</a>
            <a className="hover:text-[#1463D8]" href="#support" onClick={(e) => e.preventDefault()}>Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

