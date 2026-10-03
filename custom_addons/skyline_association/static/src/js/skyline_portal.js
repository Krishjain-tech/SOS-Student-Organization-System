// Skyline Student Association Portal JavaScript
console.log('[Skyline] skyline_portal.js loaded');
let currentModalTicketId = null;

document.addEventListener('DOMContentLoaded', () => {
  // Ensure body scroll is not locked initially
  document.body.classList.remove('overflow-hidden');

  // Delegated click listener for modals & triggers
  document.addEventListener('click', function (event) {
    const eventsTrigger = event.target.closest('[data-action="open-all-events"]');
    if (eventsTrigger) {
      event.preventDefault();
      event.stopPropagation();
      openAllEventsModal();
      return;
    }

    const merchTrigger = event.target.closest('[data-action="open-all-merch"]');
    if (merchTrigger) {
      event.preventDefault();
      event.stopPropagation();
      openAllMerchModal();
      return;
    }

    const announcementsTrigger = event.target.closest('[data-action="open-all-announcements"]');
    if (announcementsTrigger) {
      event.preventDefault();
      event.stopPropagation();
      openAllAnnouncementsModal();
      return;
    }

    const ticketsTrigger = event.target.closest('[data-action="open-my-tickets"]');
    if (ticketsTrigger) {
      event.preventDefault();
      event.stopPropagation();
      openMyTicketsModal();
      return;
    }

    const ordersTrigger = event.target.closest('[data-action="open-my-orders"]');
    if (ordersTrigger) {
      event.preventDefault();
      event.stopPropagation();
      openMyOrdersModal('cart');
      return;
    }

    const closeEventsTrigger = event.target.closest('[data-action="close-all-events"]');
    if (closeEventsTrigger) {
      event.preventDefault();
      event.stopPropagation();
      closeAllEventsModal();
      return;
    }

    const closeMerchTrigger = event.target.closest('[data-action="close-all-merch"]');
    if (closeMerchTrigger) {
      event.preventDefault();
      event.stopPropagation();
      closeAllMerchModal();
      return;
    }

    const closeAnnouncementsTrigger = event.target.closest('[data-action="close-all-announcements"]');
    if (closeAnnouncementsTrigger) {
      event.preventDefault();
      event.stopPropagation();
      closeAllAnnouncementsModal();
      return;
    }

    const closeTicketsTrigger = event.target.closest('[data-action="close-my-tickets"]');
    if (closeTicketsTrigger) {
      event.preventDefault();
      event.stopPropagation();
      closeMyTicketsModal();
      return;
    }

    const closeOrdersTrigger = event.target.closest('[data-action="close-my-orders"]');
    if (closeOrdersTrigger) {
      event.preventDefault();
      event.stopPropagation();
      closeMyOrdersModal();
      return;
    }

    // Backdrop clicks (outside modal inner container)
    const eventDetailM = document.getElementById('eventDetailModal');
    if (eventDetailM && event.target === eventDetailM) {
      closeEventDetailModal();
      return;
    }

    const eventsModal = document.getElementById('allEventsModal');
    if (eventsModal && event.target === eventsModal) {
      closeAllEventsModal();
      return;
    }

    const merchModal = document.getElementById('allMerchModal');
    if (merchModal && event.target === merchModal) {
      closeAllMerchModal();
      return;
    }

    const annModal = document.getElementById('allAnnouncementsModal');
    if (annModal && event.target === annModal) {
      closeAllAnnouncementsModal();
      return;
    }

    const tktModal = document.getElementById('myTicketsModal');
    if (tktModal && event.target === tktModal) {
      closeMyTicketsModal();
      return;
    }

    const ordModal = document.getElementById('myOrdersModal');
    if (ordModal && event.target === ordModal) {
      closeMyOrdersModal();
      return;
    }
  });

  console.log('[Skyline] View All Events handler initialized');
  console.log('[Skyline] View All Merchandise handler initialized');

  // 1. SIDEBAR COLLAPSE / EXPAND LOGIC
  const dashboard = document.getElementById('dashboard-container');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const sidebarCollapseHeaderBtn = document.getElementById('sidebarCollapseHeaderBtn');
  const reopenSidebarBtn = document.getElementById('reopenSidebarBtn');
  const reopenSidebarContainer = document.getElementById('reopenSidebarContainer');
  const toggleText = document.getElementById('toggleText');
  const toggleIcon = document.getElementById('toggleIcon');
  const viewBadge = document.getElementById('view-state-badge');

  function toggleSidebar() {
    if (!dashboard) return;
    const isCollapsed = dashboard.classList.toggle('sidebar-collapsed');
    if (isCollapsed) {
      if (toggleText) toggleText.textContent = 'Expand Sidebar';
      if (toggleIcon) toggleIcon.className = 'fa-solid fa-bars text-[#1463D8]';
      if (viewBadge) {
        viewBadge.textContent = 'Full Width (100%)';
        viewBadge.className = 'bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold px-2 py-0.5 rounded-full';
      }
      if (reopenSidebarContainer) reopenSidebarContainer.classList.remove('hidden');
    } else {
      if (toggleText) toggleText.textContent = 'Collapse Sidebar';
      if (toggleIcon) toggleIcon.className = 'fa-solid fa-table-columns text-slate-400 group-hover:text-[#1463D8]';
      if (viewBadge) {
        viewBadge.textContent = 'Split View (75/25)';
        viewBadge.className = 'bg-blue-50 text-[#1463D8] border border-blue-200 text-[10px] font-semibold px-2 py-0.5 rounded-full';
      }
      if (reopenSidebarContainer) reopenSidebarContainer.classList.add('hidden');
    }
  }

  if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);
  if (sidebarCollapseHeaderBtn) sidebarCollapseHeaderBtn.addEventListener('click', toggleSidebar);
  if (reopenSidebarBtn) reopenSidebarBtn.addEventListener('click', toggleSidebar);

  // Keyboard shortcuts (Tab key for sidebar, Escape to close modals)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const detailModal = document.getElementById('eventDetailModal');
      if (detailModal && (detailModal.classList.contains('flex') || !detailModal.classList.contains('hidden'))) {
        closeEventDetailModal();
        return;
      }
      closeAllEventsModal();
      closeAllMerchModal();
      closeAllAnnouncementsModal();
      closeMyTicketsModal();
      closeMyOrdersModal();
      closeTicketModal();
      closeMembershipModal();
      closeOrderModal();
    }
    if (e.key === 'Tab' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      toggleSidebar();
    }
  });

  // 2. EVENTS CAROUSEL (Independent horizontal scrolling)
  const eventContainer = document.getElementById('eventsContainer');
  const eventLeft = document.getElementById('eventScrollLeft');
  const eventRight = document.getElementById('eventScrollRight');
  const eventLeftH = document.getElementById('eventScrollLeftHeader');
  const eventRightH = document.getElementById('eventScrollRightHeader');

  const scrollEvents = (amount) => {
    if (eventContainer) {
      eventContainer.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  if (eventLeft) eventLeft.addEventListener('click', () => scrollEvents(-280));
  if (eventRight) eventRight.addEventListener('click', () => scrollEvents(280));
  if (eventLeftH) eventLeftH.addEventListener('click', () => scrollEvents(-280));
  if (eventRightH) eventRightH.addEventListener('click', () => scrollEvents(280));

  // 3. MERCHANDISE CAROUSEL (Independent horizontal scrolling)
  const merchContainer = document.getElementById('merchContainer');
  const merchLeft = document.getElementById('merchScrollLeft');
  const merchRight = document.getElementById('merchScrollRight');
  const merchLeftH = document.getElementById('merchScrollLeftHeader');
  const merchRightH = document.getElementById('merchScrollRightHeader');

  const scrollMerch = (amount) => {
    if (merchContainer) {
      merchContainer.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  if (merchLeft) merchLeft.addEventListener('click', () => scrollMerch(-370));
  if (merchRight) merchRight.addEventListener('click', () => scrollMerch(370));
  if (merchLeftH) merchLeftH.addEventListener('click', () => scrollMerch(-370));
  if (merchRightH) merchRightH.addEventListener('click', () => scrollMerch(370));

  // 4. USER PROFILE DROPDOWN
  const profileBtn = document.getElementById('userProfileBtn');
  const userDropdown = document.getElementById('userDropdown');
  if (profileBtn && userDropdown) {
    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
      userDropdown.classList.add('hidden');
    });
  }

  // 5. LIVE SEARCH
  const searchInput = document.getElementById('searchInput');
  const searchDropdown = document.getElementById('searchResultsDropdown');
  const searchEventsGroup = document.getElementById('searchEventsGroup');
  const searchEventsResults = document.getElementById('searchEventsResults');
  const searchMerchGroup = document.getElementById('searchMerchGroup');
  const searchMerchResults = document.getElementById('searchMerchResults');
  const searchEmptyState = document.getElementById('searchEmptyState');

  let searchDebounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      const q = e.target.value.trim();
      if (q.length === 0) {
        if (searchDropdown) searchDropdown.classList.add('hidden');
        return;
      }
      searchDebounceTimer = setTimeout(() => {
        fetch('/skyline/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', params: { q: q } })
        })
        .then(res => res.json())
        .then(data => {
          const res = data.result || { events: [], merchandise: [] };
          if (searchEventsResults) searchEventsResults.innerHTML = '';
          if (searchMerchResults) searchMerchResults.innerHTML = '';

          if (res.events.length === 0 && res.merchandise.length === 0) {
            if (searchEmptyState) searchEmptyState.classList.remove('hidden');
            if (searchEventsGroup) searchEventsGroup.classList.add('hidden');
            if (searchMerchGroup) searchMerchGroup.classList.add('hidden');
          } else {
            if (searchEmptyState) searchEmptyState.classList.add('hidden');
            
            if (res.events.length > 0) {
              if (searchEventsGroup) searchEventsGroup.classList.remove('hidden');
              res.events.forEach(ev => {
                const d = document.createElement('div');
                d.className = 'p-1.5 hover:bg-blue-50 rounded flex items-center justify-between text-xs cursor-pointer';
                d.innerHTML = `<span class="font-semibold text-[#102A4C]">${ev.name}</span><span class="text-[10px] text-slate-400">${ev.date}</span>`;
                d.onclick = () => {
                  searchDropdown.classList.add('hidden');
                  document.getElementById('events-section').scrollIntoView({behavior: 'smooth'});
                };
                searchEventsResults.appendChild(d);
              });
            } else if (searchEventsGroup) {
              searchEventsGroup.classList.add('hidden');
            }

            if (res.merchandise.length > 0) {
              if (searchMerchGroup) searchMerchGroup.classList.remove('hidden');
              res.merchandise.forEach(m => {
                const d = document.createElement('div');
                d.className = 'p-1.5 hover:bg-blue-50 rounded flex items-center justify-between text-xs cursor-pointer';
                d.innerHTML = `<span class="font-semibold text-[#102A4C]">${m.name}</span><span class="text-[10px] font-bold text-[#1463D8]">₹${m.price}</span>`;
                d.onclick = () => {
                  searchDropdown.classList.add('hidden');
                  document.getElementById('merch-section').scrollIntoView({behavior: 'smooth'});
                };
                searchMerchResults.appendChild(d);
              });
            } else if (searchMerchGroup) {
              searchMerchGroup.classList.add('hidden');
            }
          }
          if (searchDropdown) searchDropdown.classList.remove('hidden');
        });
      }, 200);
    });

    document.addEventListener('click', (e) => {
      if (searchInput && searchDropdown && !searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
        searchDropdown.classList.add('hidden');
      }
    });
  }

  // Cart Button action: Scroll to orders
  const cartBtn = document.getElementById('cartBtn');
  if (cartBtn) {
    cartBtn.addEventListener('click', () => {
      const ordersSection = document.getElementById('orders-section');
      if (ordersSection) {
        ordersSection.scrollIntoView({ behavior: 'smooth' });
        showToast('Viewing your current orders and shopping bag', 'info');
      }
    });
  }
});

// TOAST NOTIFICATIONS
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast-notification px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 animate-slide-down pointer-events-auto ${
    type === 'success' ? 'bg-white text-emerald-700 border-emerald-200 shadow-emerald-500/10' :
    type === 'error' ? 'bg-white text-rose-700 border-rose-200 shadow-rose-500/10' :
    'bg-white text-[#1463D8] border-blue-200 shadow-blue-500/10'
  }`;
  const icon = type === 'success' ? 'fa-circle-check text-emerald-500' :
               type === 'error' ? 'fa-triangle-exclamation text-rose-500' :
               'fa-circle-info text-[#1463D8]';
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// BOOK TICKET (Live backend action)
function bookTicket(btn) {
  const eventId = btn.getAttribute('data-event-id');
  const eventName = btn.getAttribute('data-event-name');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> Booking...';

  fetch('/skyline/api/book_ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', params: { event_id: eventId } })
  })
  .then(res => res.json())
  .then(data => {
    btn.disabled = false;
    btn.textContent = 'Get Tickets';
    const result = data.result;
    if (result && result.success) {
      showToast(result.message, 'success');
      const t = result.ticket;

      // Prepend to My Tickets in sidebar (strictly top 2)
      const ticketsList = document.getElementById('myTicketsList');
      if (ticketsList) {
        const emptyState = ticketsList.querySelector('.text-center');
        if (emptyState) emptyState.remove();

        const newTicketDiv = document.createElement('div');
        newTicketDiv.id = 'ticketItem_' + t.id;
        newTicketDiv.className = 'p-2.5 rounded-lg border border-[#DCE6F2] hover:border-slate-300 transition animate-slide-down';
        newTicketDiv.innerHTML = `
          <div class="flex gap-2.5">
            <img src="${t.image}" alt="${t.event_name}" class="w-14 h-14 rounded-md object-cover shrink-0"/>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-1">
                <h3 class="text-xs font-bold text-[#102A4C] truncate">${t.event_name}</h3>
                <span id="ticketBadge_${t.id}" class="bg-emerald-50 text-emerald-600 text-[10px] font-semibold px-1.5 py-0.2 rounded border border-emerald-200">Confirmed</span>
              </div>
              <div class="text-[10px] text-slate-400 mt-1 space-y-0.5">
                <div class="flex items-center gap-1 truncate"><i class="fa-regular fa-calendar text-[9px]"></i> ${t.date}, ${t.time}</div>
                <div class="flex items-center gap-1 truncate"><i class="fa-solid fa-location-dot text-[9px]"></i> ${t.location}</div>
              </div>
            </div>
          </div>
          <button data-ticket-id="${t.id}" data-ticket-name="${t.name}" data-event-name="${t.event_name}" data-event-date="${t.date}" data-event-time="${t.time}" data-event-loc="${t.location}" data-status="confirmed" data-price="${t.price_paid}" data-qr="${t.qr_token}" onclick="openTicketModal(this);" class="mt-2.5 w-full py-1 text-xs font-medium text-[#1463D8] bg-blue-50/60 hover:bg-blue-100 rounded flex items-center justify-center gap-1 transition cursor-pointer">
            <i class="fa-solid fa-ticket text-[10px]"></i> View Ticket
          </button>
        `;
        ticketsList.insertBefore(newTicketDiv, ticketsList.firstChild);
        while (ticketsList.children.length > 2) {
          ticketsList.lastElementChild.remove();
        }
      }

      // Update registrations metric
      const regCount = document.getElementById('metricRegistrationsCount');
      if (regCount) regCount.textContent = parseInt(regCount.textContent || 0) + 1;

      // If sold out, update button
      if (result.is_sold_out) {
        btn.disabled = true;
        btn.textContent = 'Sold Out';
        btn.className = 'w-full py-1.5 bg-slate-200 text-slate-400 text-xs font-semibold rounded-md cursor-not-allowed';
      }
    } else {
      showToast((result && result.message) || 'Failed to book ticket', 'error');
    }
  })
  .catch(err => {
    btn.disabled = false;
    btn.textContent = 'Get Tickets';
    showToast('Booking request error', 'error');
  });
}

// ADD TO CART (Live backend action)
function addToCart(btn) {
  const prodId = btn.getAttribute('data-product-id');
  const card = btn.closest('.merch-card') || btn.parentElement;
  const select = card ? card.querySelector('select') : document.getElementById('sizeSelect_' + prodId);
  const variant = select ? select.value : 'Size: M';
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> Adding...';

  fetch('/skyline/api/add_to_cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', params: { product_id: prodId, variant: variant, quantity: 1 } })
  })
  .then(res => res.json())
  .then(data => {
    btn.disabled = false;
    btn.textContent = 'Add to Cart';
    const result = data.result;
    if (result && result.success) {
      showToast(result.message, 'success');
      
      // Update cart count badge
      const badge = document.getElementById('cartCountBadge');
      if (badge) badge.textContent = result.cart_count;
      const modalBadge = document.getElementById('modalCartCountBadge');
      if (modalBadge) modalBadge.textContent = result.cart_count;

      // Refresh cart items in My Orders modal
      fetchAndRenderCart();

      if (result.remaining_stock <= 0) {
        btn.disabled = true;
        btn.textContent = 'Out of Stock';
        btn.className = 'w-full py-1.5 bg-slate-200 text-slate-400 text-xs font-semibold rounded-md cursor-not-allowed';
      }
    } else {
      showToast((result && result.message) || 'Failed to add item', 'error');
    }
  })
  .catch(err => {
    btn.disabled = false;
    btn.textContent = 'Add to Cart';
    showToast('Cart request error', 'error');
  });
}

// TICKET MODAL & CHECK-IN
function openTicketModal(btn) {
  currentModalTicketId = btn.getAttribute('data-ticket-id');
  const ticketName = btn.getAttribute('data-ticket-name');
  const eventName = btn.getAttribute('data-event-name');
  const date = btn.getAttribute('data-event-date');
  const time = btn.getAttribute('data-event-time');
  const loc = btn.getAttribute('data-event-loc');
  const status = btn.getAttribute('data-status');
  const qr = btn.getAttribute('data-qr') || 'SKYLINE-PASS';

  document.getElementById('modalEventName').textContent = eventName;
  document.getElementById('modalTicketRef').textContent = ticketName;
  document.getElementById('modalEventDateTime').textContent = `${date}, ${time}`;
  document.getElementById('modalEventLocation').textContent = loc;
  document.getElementById('modalQrToken').textContent = qr;

  const statusBadge = document.getElementById('modalTicketStatusBadge');
  const checkinBtn = document.getElementById('modalCheckinBtn');

  if (status === 'checked_in') {
    statusBadge.textContent = 'Checked In';
    statusBadge.className = 'bg-blue-50 text-[#1463D8] text-[10px] font-semibold px-2 py-0.5 rounded border border-blue-200';
    checkinBtn.disabled = true;
    checkinBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Already Checked In';
    checkinBtn.className = 'w-full py-2 bg-slate-100 text-slate-400 text-xs font-semibold rounded-lg cursor-not-allowed flex items-center justify-center gap-1.5';
  } else {
    statusBadge.textContent = 'Confirmed';
    statusBadge.className = 'bg-emerald-50 text-emerald-600 text-[10px] font-semibold px-2 py-0.5 rounded border border-emerald-200';
    checkinBtn.disabled = false;
    checkinBtn.innerHTML = '<i class="fa-solid fa-check"></i> Check In Attendee Now';
    checkinBtn.className = 'w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5';
  }

  document.getElementById('ticketModal').classList.remove('hidden');
}

function closeTicketModal() {
  const m = document.getElementById('ticketModal');
  if (m) m.classList.add('hidden');
}

function confirmCheckinFromModal() {
  if (!currentModalTicketId) return;
  const btn = document.getElementById('modalCheckinBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking in...';

  fetch('/skyline/api/checkin_ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', params: { ticket_id: currentModalTicketId } })
  })
  .then(res => res.json())
  .then(data => {
    const res = data.result;
    if (res && res.success) {
      showToast(res.message, 'success');
      document.getElementById('modalTicketStatusBadge').textContent = 'Checked In';
      document.getElementById('modalTicketStatusBadge').className = 'bg-blue-50 text-[#1463D8] text-[10px] font-semibold px-2 py-0.5 rounded border border-blue-200';
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Checked In (' + res.checkin_time + ')';
      btn.className = 'w-full py-2 bg-slate-100 text-slate-400 text-xs font-semibold rounded-lg cursor-not-allowed flex items-center justify-center gap-1.5';

      // Update sidebar badge
      const badge = document.getElementById('ticketBadge_' + currentModalTicketId);
      if (badge) {
        badge.textContent = 'Checked In';
        badge.className = 'bg-blue-50 text-[#1463D8] text-[10px] font-semibold px-1.5 py-0.2 rounded border border-blue-200';
      }
    } else {
      showToast((res && res.message) || 'Check-in failed', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Check In Attendee Now';
    }
  })
  .catch(err => {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Check In Attendee Now';
    showToast('Check-in network error', 'error');
  });
}

// MEMBERSHIP MODAL IMPLEMENTATION
function openMembershipModal() {
  const m = document.getElementById('membershipModal');
  if (!m) return;

  const mainView = document.getElementById('membershipMainView');
  const checkoutView = document.getElementById('membershipCheckoutView');
  const activeView = document.getElementById('membershipActiveView');
  const successView = document.getElementById('membershipSuccessView');

  // Reset secondary views
  if (checkoutView) checkoutView.classList.add('hidden');
  if (successView) {
    successView.classList.add('hidden');
    successView.classList.remove('flex');
  }

  const isMember = (typeof window.SKYLINE_IS_MEMBER !== 'undefined') ? Boolean(window.SKYLINE_IS_MEMBER) : false;

  if (isMember) {
    // Show dedicated active member view (Section 12)
    if (activeView) activeView.classList.remove('hidden');
    if (mainView) mainView.classList.add('hidden');
    const activeExpEl = document.getElementById('activeModalExpiry');
    if (activeExpEl) {
      activeExpEl.textContent = window.SKYLINE_MEMBERSHIP_EXPIRY_LONG || window.SKYLINE_MEMBERSHIP_EXPIRY || '03 October 2027';
    }
  } else {
    // Show non-member discovery & purchase CTA view
    if (activeView) activeView.classList.add('hidden');
    if (mainView) mainView.classList.remove('hidden');
  }

  m.classList.remove('hidden');
  m.classList.add('flex');
  updateBodyScrollLock();
}

function closeMembershipModal() {
  const m = document.getElementById('membershipModal');
  if (m) {
    m.classList.add('hidden');
    m.classList.remove('flex');
  }
  updateBodyScrollLock();
}

function goToMembershipCheckout() {
  const mainView = document.getElementById('membershipMainView');
  const checkoutView = document.getElementById('membershipCheckoutView');
  const activeView = document.getElementById('membershipActiveView');
  const successView = document.getElementById('membershipSuccessView');

  if (mainView) mainView.classList.add('hidden');
  if (activeView) activeView.classList.add('hidden');
  if (successView) {
    successView.classList.add('hidden');
    successView.classList.remove('flex');
  }
  if (checkoutView) checkoutView.classList.remove('hidden');
}

function backToMembershipPlan() {
  const mainView = document.getElementById('membershipMainView');
  const checkoutView = document.getElementById('membershipCheckoutView');
  if (checkoutView) checkoutView.classList.add('hidden');
  if (mainView) mainView.classList.remove('hidden');
}

function executeMembershipPayment(btn) {
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>Processing Payment...</span>';
  }

  const selectedMethodRadio = document.querySelector('input[name="membership_payment_method"]:checked');
  const paymentMethod = selectedMethodRadio ? selectedMethodRadio.value : 'upi';

  fetch('/skyline/api/buy_membership', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', params: { payment_method: paymentMethod } })
  })
  .then(res => res.json())
  .then(resp => {
    const data = resp.result || resp;
    if (data.not_logged_in) {
      showToast(data.message || 'Please log in to purchase a membership.', 'info');
      setTimeout(() => {
        window.location.href = data.redirect_url || '/web/login?redirect=/';
      }, 700);
      return;
    }

    if (data.already_active) {
      showToast(data.message || 'You already have an active Skyline Plus membership.', 'info');
      window.SKYLINE_IS_MEMBER = true;
      window.SKYLINE_MEMBERSHIP_STATUS = 'active';
      if (data.expiry) window.SKYLINE_MEMBERSHIP_EXPIRY_LONG = data.expiry;
      if (data.expiry_short) window.SKYLINE_MEMBERSHIP_EXPIRY = data.expiry_short;
      openMembershipModal();
      return;
    }

    if (data.success) {
      window.SKYLINE_IS_MEMBER = true;
      window.SKYLINE_MEMBERSHIP_STATUS = 'active';
      const expiryLong = data.expiry || (data.membership && data.membership.end_date) || '';
      const expiryShort = data.expiry_short || (data.membership && data.membership.end_date_short) || expiryLong;
      window.SKYLINE_MEMBERSHIP_EXPIRY_LONG = expiryLong;
      window.SKYLINE_MEMBERSHIP_EXPIRY = expiryShort;

      const checkoutView = document.getElementById('membershipCheckoutView');
      const mainView = document.getElementById('membershipMainView');
      const successView = document.getElementById('membershipSuccessView');
      if (checkoutView) checkoutView.classList.add('hidden');
      if (mainView) mainView.classList.add('hidden');
      if (successView) {
        successView.classList.remove('hidden');
        successView.classList.add('flex');
      }

      const planEl = document.getElementById('successPlanName');
      if (planEl) planEl.textContent = (data.membership && data.membership.plan_name) || 'Skyline Plus';
      const refEl = document.getElementById('successMembershipRef');
      if (refEl) refEl.textContent = (data.membership && data.membership.name) || 'MEM-2026-0001';
      const amtEl = document.getElementById('successAmountPaid');
      if (amtEl) amtEl.textContent = '₹' + ((data.membership && data.membership.fee_paid) ? parseInt(data.membership.fee_paid) : 1000).toLocaleString('en-IN');
      const methodEl = document.getElementById('successPaymentMethod');
      if (methodEl) methodEl.textContent = (data.membership && data.membership.payment_method) || 'UPI / Instant QR';
      const expEl = document.getElementById('successValidUntil');
      if (expEl) expEl.textContent = expiryLong;

      const activeModalExp = document.getElementById('activeModalExpiry');
      if (activeModalExp && expiryLong) activeModalExp.textContent = expiryLong;

      updateHomepageMembershipUI(expiryLong, expiryShort);
      showToast('Welcome to Skyline Plus! Your annual membership is now active.', 'success');
    } else {
      showToast(data.message || 'Membership purchase failed. Please try again.', 'error');
    }
  })
  .catch(err => {
    console.error('Membership purchase error:', err);
    showToast('Network error processing membership transaction.', 'error');
  })
  .finally(() => {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-lock text-xs"></i> <span>Complete Payment — ₹1,000</span>';
    }
  });
}

function continueAfterMembershipSuccess() {
  closeMembershipModal();
  showToast('Updating Skyline portal privileges...', 'info');
  setTimeout(() => {
    window.location.reload();
  }, 400);
}

function updateHomepageMembershipUI(expiryLong, expiryShort) {
  // 1. Dashboard membership section
  const detailsBtn = document.getElementById('membershipDetailsBtn');
  if (detailsBtn) detailsBtn.textContent = 'View Membership';

  const desc = document.getElementById('dashMembershipDesc');
  if (desc) desc.textContent = 'Your membership is active.';

  const title = document.getElementById('dashMembershipTitle');
  if (title) title.textContent = '✓ Skyline Plus';

  const badge = document.getElementById('dashMembershipBadge');
  if (badge) {
    badge.textContent = 'Active';
    badge.className = 'text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700';
  }

  const sub = document.getElementById('dashMembershipSub');
  if (sub) {
    sub.textContent = 'Valid until: ' + (expiryLong || expiryShort);
  }

  const discountRate = document.getElementById('dashDiscountRate');
  if (discountRate) {
    discountRate.textContent = '20%';
  }

  // 2. Header Status
  const headerStatus = document.getElementById('headerUserStatus');
  if (headerStatus) {
    headerStatus.textContent = 'Skyline Plus Member';
  }

  const dropdownBadge = document.getElementById('dropdownMembershipBadge');
  if (dropdownBadge) {
    dropdownBadge.textContent = 'Skyline Plus Member';
    dropdownBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200';
  }

  // 3. Update events in memory if event modal is currently opened
  if (window.SKYLINE_EVENTS_DATA && currentEventModalId) {
    const event = window.SKYLINE_EVENTS_DATA[currentEventModalId];
    if (event) {
      renderEventDetailModal(event);
    }
  }
}

// Payment method radio visual selector handler
document.addEventListener('change', function(e) {
  if (e.target && e.target.name === 'membership_payment_method') {
    const labels = document.querySelectorAll('#membershipPaymentMethods label');
    labels.forEach(lbl => {
      const radio = lbl.querySelector('input[type="radio"]');
      if (radio && radio.checked) {
        lbl.className = 'flex items-center gap-3 p-3 border-2 border-[#1463D8] bg-blue-50/50 rounded-xl cursor-pointer hover:border-[#1463D8] transition';
      } else {
        lbl.className = 'flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:border-slate-300 transition';
      }
    });
  }
});


// ORDER MODAL
function openOrderModalFromCard(el) {
  const ref = el.getAttribute('data-order-name');
  const name = el.getAttribute('data-prod-name');
  const variant = el.getAttribute('data-variant');
  const qty = el.getAttribute('data-qty');
  const price = el.getAttribute('data-price');
  const status = el.getAttribute('data-status');
  openOrderModal(ref, name, variant, qty, price, status);
}

function openOrderModal(ref, name, variant, qty, price, status) {
  document.getElementById('modalOrderRef').textContent = ref;
  document.getElementById('modalOrderProduct').textContent = name;
  document.getElementById('modalOrderVariant').textContent = variant;
  document.getElementById('modalOrderQty').textContent = qty;
  document.getElementById('modalOrderPrice').textContent = '₹' + price;
  document.getElementById('modalOrderStatusBadge').textContent = status;
  document.getElementById('orderModal').classList.remove('hidden');
}

function closeOrderModal() {
  const m = document.getElementById('orderModal');
  if (m) m.classList.add('hidden');
}

// MODAL HELPER: Body scroll lock management
function updateBodyScrollLock() {
  const openModals = document.querySelectorAll(
    '#eventDetailModal.flex, #allEventsModal.flex, #allMerchModal.flex, #allAnnouncementsModal.flex, #myTicketsModal.flex, #myOrdersModal.flex, #ticketModal:not(.hidden), #membershipModal:not(.hidden), #orderModal:not(.hidden)'
  );
  if (openModals.length > 0) {
    document.body.classList.add('overflow-hidden');
  } else {
    document.body.classList.remove('overflow-hidden');
  }
}

// ==========================================
// DYNAMIC EVENT DETAIL MODAL IMPLEMENTATION
// ==========================================
let currentEventModalId = null;
let currentEventModalData = null;
let selectedTicketTier = 'member';
let previousModalBeforeEventDetail = null;

function getSkylineEventsData() {
  if (window.SKYLINE_EVENTS_DATA && Object.keys(window.SKYLINE_EVENTS_DATA).length > 0) {
    return window.SKYLINE_EVENTS_DATA;
  }
  const scriptElem = document.getElementById('skyline-events-data');
  if (scriptElem && scriptElem.textContent) {
    try {
      window.SKYLINE_EVENTS_DATA = JSON.parse(scriptElem.textContent);
      return window.SKYLINE_EVENTS_DATA;
    } catch (e) {
      console.error('[Skyline] Failed to parse events data', e);
    }
  }
  return {};
}

function formatCurrencyPrice(amount) {
  if (amount === null || amount === undefined || amount === '') return '0';
  const num = typeof amount === 'number' ? amount : (parseFloat(amount) || 0);
  if (Math.abs(num - Math.round(num)) < 0.005) {
    return Math.round(num).toString();
  }
  return num.toFixed(2);
}

function openEventDetailModal(eventId) {
  if (!eventId) return;
  currentEventModalId = String(eventId);

  // Check if allEventsModal is currently open
  const allEventsM = document.getElementById('allEventsModal');
  if (allEventsM && (allEventsM.classList.contains('flex') || !allEventsM.classList.contains('hidden'))) {
    previousModalBeforeEventDetail = 'allEventsModal';
  } else {
    previousModalBeforeEventDetail = null;
  }

  const eventsMap = getSkylineEventsData();
  const event = eventsMap[currentEventModalId];

  if (event) {
    renderEventDetailModal(event);
    showEventDetailModalView();
  } else {
    // Live API fetch fallback
    fetch('/skyline/api/get_event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', params: { event_id: currentEventModalId } })
    })
    .then(r => r.json())
    .then(data => {
      if (data.result && data.result.success && data.result.event) {
        window.SKYLINE_EVENTS_DATA = window.SKYLINE_EVENTS_DATA || {};
        window.SKYLINE_EVENTS_DATA[currentEventModalId] = data.result.event;
        if (data.result.user && typeof data.result.user.is_member !== 'undefined') {
          window.SKYLINE_IS_MEMBER = data.result.user.is_member;
        }
        renderEventDetailModal(data.result.event);
        showEventDetailModalView();
      } else {
        showToast((data.result && data.result.message) || 'Unable to load event details. Please try again.', 'error');
      }
    })
    .catch(err => {
      console.error('[Skyline] get_event error:', err);
      showToast('Unable to load event details. Please try again.', 'error');
    });
  }
}

function renderEventDetailModal(event) {
  currentEventModalData = event;
  const isUserMember = (typeof window.SKYLINE_IS_MEMBER !== 'undefined') ? window.SKYLINE_IS_MEMBER : true;

  // 1. Image
  const imgElem = document.getElementById('eventModalImage');
  if (imgElem) {
    imgElem.src = event.image_url || '/skyline_association/static/src/img/event_spring_gala.png';
    imgElem.alt = event.name || 'Event Cover';
  }

  // 2. Floating Badge (left column bottom special tag)
  const floatingBadge = document.getElementById('eventModalFloatingBadge');
  const floatingText = document.getElementById('eventModalFloatingBadgeText');
  if (floatingBadge && floatingText) {
    if (event.floating_badge && event.floating_badge.trim()) {
      floatingText.textContent = event.floating_badge.trim();
      floatingBadge.classList.remove('hidden');
      floatingBadge.classList.add('flex');
    } else {
      floatingBadge.classList.add('hidden');
      floatingBadge.classList.remove('flex');
    }
  }

  // 3. Tag badge (top left pill)
  const tagBadge = document.getElementById('eventModalTagBadge');
  if (tagBadge) {
    if (event.tag && event.tag.trim()) {
      tagBadge.textContent = event.tag.toLowerCase().includes('event') ? event.tag : `${event.tag} Event`;
      tagBadge.classList.remove('hidden');
    } else {
      tagBadge.classList.add('hidden');
    }
  }

  // 4. Availability Badge
  const availBadge = document.getElementById('eventModalAvailabilityBadge');
  const availDot = document.getElementById('eventModalAvailabilityDot');
  const availText = document.getElementById('eventModalAvailabilityText');
  if (availBadge && availDot && availText) {
    if (event.is_sold_out) {
      availBadge.className = 'bg-rose-50 text-rose-700 border border-rose-200 font-semibold px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5';
      availDot.className = 'w-1.5 h-1.5 rounded-full bg-rose-500';
      availText.textContent = 'Sold Out';
    } else if (event.remaining_seats > 0 && event.remaining_seats <= 25) {
      availBadge.className = 'bg-amber-50 text-amber-700 border border-amber-200 font-semibold px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5';
      availDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse';
      availText.textContent = `${event.remaining_seats} seats left`;
    } else {
      availBadge.className = 'bg-emerald-50 text-emerald-700 border border-emerald-100 font-semibold px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5';
      availDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
      availText.textContent = event.remaining_seats > 0 ? `${event.remaining_seats} seats left` : 'Tickets Available';
    }
  }

  // 5. Title & Short Description
  const titleElem = document.getElementById('eventModalTitle');
  if (titleElem) titleElem.textContent = event.name || 'Campus Event';

  const subtitleElem = document.getElementById('eventModalSubtitle');
  if (subtitleElem) {
    const desc = event.description || '';
    let shortDesc = desc;
    const newlineIdx = desc.indexOf('\n');
    if (newlineIdx > 10 && newlineIdx < 160) {
      shortDesc = desc.substring(0, newlineIdx).trim();
    } else {
      const periodIdx = desc.indexOf('. ');
      if (periodIdx > 15 && periodIdx < 130) {
        shortDesc = desc.substring(0, periodIdx + 1);
      } else if (desc.length > 110) {
        shortDesc = desc.substring(0, 107) + '...';
      }
    }
    subtitleElem.textContent = shortDesc || 'Join us for this exciting Skyline Student Association event.';
  }

  // 6. Date, Time, Venue
  const dateElem = document.getElementById('eventModalDate');
  if (dateElem) {
    dateElem.textContent = event.date_display || (event.day_num ? `${event.day_num} ${event.month_short}` : 'TBA');
  }

  const timeElem = document.getElementById('eventModalTime');
  if (timeElem) {
    timeElem.textContent = event.time_display || 'TBA';
  }

  const venueElem = document.getElementById('eventModalVenue');
  if (venueElem) {
    venueElem.textContent = event.location || 'Skyline Campus';
    venueElem.title = event.location || 'Skyline Campus';
  }

  // 7. What to Expect (Features / Tags - only legit non-empty tags)
  const expectContainer = document.getElementById('eventModalExpectContainer');
  const expectPills = document.getElementById('eventModalExpectPills');
  if (expectContainer && expectPills) {
    if (event.features && Array.isArray(event.features) && event.features.length > 0) {
      expectPills.innerHTML = event.features.map(f => `
        <span class="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200/60 flex items-center gap-1">
          ${f}
        </span>
      `).join('');
      expectContainer.classList.remove('hidden');
    } else {
      expectPills.innerHTML = '';
      expectContainer.classList.add('hidden');
    }
  }

  // 8. About This Event (Full Description)
  const descElem = document.getElementById('eventModalDescription');
  if (descElem) {
    descElem.textContent = event.description || 'Join us for this university event hosted by the Skyline Student Association.';
  }

  // 9. Pricing & Ticket Selection
  const ticketSelector = document.getElementById('eventModalTicketSelector');
  const priceLabel = document.getElementById('eventModalPriceLabel');
  const mainPrice = document.getElementById('eventModalMainPrice');
  const discountBadge = document.getElementById('eventModalDiscountBadge');
  const divider = document.getElementById('eventModalDivider');
  const secPriceContainer = document.getElementById('eventModalSecPriceContainer');
  const actionBtn = document.getElementById('eventModalActionBtn');
  const actionBtnText = document.getElementById('eventModalActionBtnText');

  if (actionBtn && actionBtnText) {
    actionBtn.disabled = false;
    actionBtn.onclick = () => bookTicketFromModal(actionBtn);
  }

  if (event.is_free) {
    if (ticketSelector) ticketSelector.classList.add('hidden');
    if (priceLabel) priceLabel.textContent = 'Admission';
    if (mainPrice) mainPrice.textContent = 'FREE';
    if (discountBadge) discountBadge.classList.add('hidden');
    if (divider) {
      divider.classList.add('hidden');
      divider.style.display = 'none';
    }
    if (secPriceContainer) {
      secPriceContainer.classList.add('hidden');
      secPriceContainer.style.display = 'none';
    }

    if (event.is_sold_out) {
      if (actionBtn) {
        actionBtn.disabled = true;
        actionBtn.className = 'w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-200 text-slate-400 font-semibold text-sm px-7 py-3 rounded-xl cursor-not-allowed';
      }
      if (actionBtnText) actionBtnText.textContent = 'Sold Out';
    } else {
      if (actionBtn) {
        actionBtn.className = 'w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#1268F3] hover:bg-blue-700 text-white font-semibold text-sm px-7 py-3 rounded-xl shadow-md hover:shadow-lg transition-all focus:ring-4 focus:ring-blue-100 cursor-pointer active:scale-95';
      }
      if (actionBtnText) actionBtnText.textContent = 'Register →';
    }
  } else {
    if (ticketSelector) ticketSelector.classList.remove('hidden');
    if (divider) {
      divider.classList.remove('hidden');
      divider.style.display = '';
    }
    if (secPriceContainer) {
      secPriceContainer.classList.remove('hidden');
      secPriceContainer.style.display = '';
    }

    const memberP = formatCurrencyPrice(event.member_price);
    const nonMemberP = formatCurrencyPrice(event.non_member_price);

    const tierMemberPriceDisplay = document.getElementById('tierMemberPriceDisplay');
    const tierNonMemberPriceDisplay = document.getElementById('tierNonMemberPriceDisplay');
    if (tierMemberPriceDisplay) tierMemberPriceDisplay.textContent = `₹${memberP}`;
    if (tierNonMemberPriceDisplay) tierNonMemberPriceDisplay.textContent = `₹${nonMemberP}`;

    selectedTicketTier = isUserMember ? 'member' : 'non_member';
    applyEventTicketTier(selectedTicketTier, event, isUserMember);

    if (event.is_sold_out) {
      if (actionBtn) {
        actionBtn.disabled = true;
        actionBtn.className = 'w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-200 text-slate-400 font-semibold text-sm px-7 py-3 rounded-xl cursor-not-allowed';
      }
      if (actionBtnText) actionBtnText.textContent = 'Sold Out';
    } else {
      if (actionBtn) {
        actionBtn.className = 'w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#1268F3] hover:bg-blue-700 text-white font-semibold text-sm px-7 py-3 rounded-xl shadow-md hover:shadow-lg transition-all focus:ring-4 focus:ring-blue-100 cursor-pointer active:scale-95';
      }
      if (actionBtnText) actionBtnText.textContent = 'Get Tickets →';
    }
  }
}

function selectEventTicketTier(tier) {
  selectedTicketTier = tier;
  if (!currentEventModalData) return;
  const isUserMember = (typeof window.SKYLINE_IS_MEMBER !== 'undefined') ? window.SKYLINE_IS_MEMBER : true;
  applyEventTicketTier(tier, currentEventModalData, isUserMember);
}

function applyEventTicketTier(tier, event, isUserMember) {
  const tierMemberBtn = document.getElementById('tierMemberBtn');
  const tierNonMemberBtn = document.getElementById('tierNonMemberBtn');
  const priceLabel = document.getElementById('eventModalPriceLabel');
  const mainPrice = document.getElementById('eventModalMainPrice');
  const discountBadge = document.getElementById('eventModalDiscountBadge');
  const secPrice = document.getElementById('eventModalSecPrice');
  const secPriceContainer = document.getElementById('eventModalSecPriceContainer');

  const memberP = formatCurrencyPrice(event.member_price);
  const nonMemberP = formatCurrencyPrice(event.non_member_price);

  if (tier === 'member') {
    if (tierMemberBtn) {
      tierMemberBtn.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-[#1268F3] bg-blue-50/70 text-xs font-semibold text-[#0B2457] transition cursor-pointer shadow-2xs';
    }
    if (tierNonMemberBtn) {
      tierNonMemberBtn.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white text-xs font-medium text-slate-600 transition cursor-pointer';
    }
    if (priceLabel) priceLabel.textContent = 'Skyline Members';
    if (mainPrice) mainPrice.textContent = `₹${memberP}`;
    if (discountBadge) {
      discountBadge.classList.remove('hidden');
    }
    if (secPrice) secPrice.textContent = `₹${nonMemberP}`;
    if (secPriceContainer) {
      const label = secPriceContainer.querySelector('span');
      if (label) label.textContent = 'Non-Members';
    }
  } else {
    if (tierNonMemberBtn) {
      tierNonMemberBtn.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-[#1268F3] bg-blue-50/70 text-xs font-semibold text-[#0B2457] transition cursor-pointer shadow-2xs';
    }
    if (tierMemberBtn) {
      tierMemberBtn.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white text-xs font-medium text-slate-600 transition cursor-pointer';
    }
    if (priceLabel) priceLabel.textContent = 'Non-Members';
    if (mainPrice) mainPrice.textContent = `₹${nonMemberP}`;
    if (discountBadge) discountBadge.classList.add('hidden');
    if (secPrice) secPrice.textContent = `₹${memberP}`;
    if (secPriceContainer) {
      const label = secPriceContainer.querySelector('span');
      if (label) label.textContent = 'Member Rate';
    }
  }
}

function showEventDetailModalView() {
  const modal = document.getElementById('eventDetailModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    updateBodyScrollLock();
  }
}

function closeEventDetailModal() {
  const modal = document.getElementById('eventDetailModal');
  if (modal) {
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  }
  if (previousModalBeforeEventDetail === 'allEventsModal') {
    previousModalBeforeEventDetail = null;
    document.body.classList.add('overflow-hidden');
  } else {
    updateBodyScrollLock();
  }
}

function toggleEventFavorite(btn) {
  if (!btn) return;
  const isFav = btn.getAttribute('data-fav') === 'true';
  if (isFav) {
    btn.setAttribute('data-fav', 'false');
    btn.className = 'p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-rose-500 transition cursor-pointer';
    showToast('Removed from saved events', 'info');
  } else {
    btn.setAttribute('data-fav', 'true');
    btn.className = 'p-1.5 rounded-full hover:bg-rose-50 text-rose-500 transition cursor-pointer';
    showToast('Saved to your favorite events!', 'success');
  }
}

function bookTicketFromModal(btn) {
  if (!currentEventModalId) return;
  const eventId = currentEventModalId;

  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>Securing Ticket...</span>';

  fetch('/skyline/api/book_ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', params: { event_id: eventId } })
  })
  .then(res => res.json())
  .then(data => {
    const result = data.result;
    if (result && result.success) {
      showToast(result.message, 'success');
      btn.className = 'w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold text-sm px-7 py-3 rounded-xl shadow-md transition-all cursor-default';
      btn.innerHTML = '<i class="fa-solid fa-check text-xs"></i> <span>Confirmed!</span>';

      const t = result.ticket;

      // Update sidebar My Tickets list (top 2 preview)
      const ticketsList = document.getElementById('myTicketsList');
      if (ticketsList && t) {
        const emptyState = ticketsList.querySelector('.text-center');
        if (emptyState) emptyState.remove();

        const newTicketDiv = document.createElement('div');
        newTicketDiv.id = 'ticketItem_' + t.id;
        newTicketDiv.className = 'p-2.5 rounded-lg border border-[#DCE6F2] hover:border-slate-300 transition animate-slide-down';
        newTicketDiv.innerHTML = `
          <div class="flex gap-2.5">
            <img src="${t.image}" alt="${t.event_name}" class="w-14 h-14 rounded-md object-cover shrink-0"/>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-1">
                <h3 class="text-xs font-bold text-[#102A4C] truncate">${t.event_name}</h3>
                <span id="ticketBadge_${t.id}" class="bg-emerald-50 text-emerald-600 text-[10px] font-semibold px-1.5 py-0.2 rounded border border-emerald-200">Confirmed</span>
              </div>
              <div class="text-[10px] text-slate-400 mt-1 space-y-0.5">
                <div class="flex items-center gap-1 truncate"><i class="fa-regular fa-calendar text-[9px]"></i> ${t.date}, ${t.time}</div>
                <div class="flex items-center gap-1 truncate"><i class="fa-solid fa-location-dot text-[9px]"></i> ${t.location}</div>
              </div>
            </div>
          </div>
          <button data-ticket-id="${t.id}" data-ticket-name="${t.name}" data-event-name="${t.event_name}" data-event-date="${t.date}" data-event-time="${t.time}" data-event-loc="${t.location}" data-status="confirmed" data-price="${t.price_paid}" data-qr="${t.qr_token}" onclick="openTicketModal(this);" class="mt-2.5 w-full py-1 text-xs font-medium text-[#1463D8] bg-blue-50/60 hover:bg-blue-100 rounded flex items-center justify-center gap-1 transition cursor-pointer">
            <i class="fa-solid fa-ticket text-[10px]"></i> View Ticket
          </button>
        `;
        ticketsList.insertBefore(newTicketDiv, ticketsList.firstChild);
        while (ticketsList.children.length > 2) {
          ticketsList.lastElementChild.remove();
        }
      }

      // Update registrations metric
      const regCount = document.getElementById('metricRegistrationsCount');
      if (regCount) regCount.textContent = parseInt(regCount.textContent || 0) + 1;

      // Update remaining seats in local cache and DOM
      if (currentEventModalData) {
        if (typeof result.remaining_seats !== 'undefined') {
          currentEventModalData.remaining_seats = result.remaining_seats;
        }
        if (typeof result.is_sold_out !== 'undefined') {
          currentEventModalData.is_sold_out = result.is_sold_out;
        }
      }

      // If sold out, update badge
      if (result.is_sold_out) {
        const availBadge = document.getElementById('eventModalAvailabilityBadge');
        const availDot = document.getElementById('eventModalAvailabilityDot');
        const availText = document.getElementById('eventModalAvailabilityText');
        if (availBadge && availDot && availText) {
          availBadge.className = 'bg-rose-50 text-rose-700 border border-rose-200 font-semibold px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5';
          availDot.className = 'w-1.5 h-1.5 rounded-full bg-rose-500';
          availText.textContent = 'Sold Out';
        }
      }
    } else {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      showToast((result && result.message) || 'Booking failed.', 'error');
    }
  })
  .catch(err => {
    console.error('[Skyline] book_ticket error:', err);
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    showToast('Booking request error.', 'error');
  });
}

// ALL EVENTS MODAL
function openAllEventsModal() {
  closeAllMerchModal();
  closeAllAnnouncementsModal();
  closeMyTicketsModal();
  closeMyOrdersModal();
  const m = document.getElementById('allEventsModal');
  if (m) {
    m.classList.remove('hidden');
    m.classList.add('flex');
    updateBodyScrollLock();
  }
}

function closeAllEventsModal() {
  const m = document.getElementById('allEventsModal');
  if (m) {
    m.classList.remove('flex');
    m.classList.add('hidden');
    updateBodyScrollLock();
  }
}

// ALL MERCHANDISE MODAL
function openAllMerchModal() {
  closeAllEventsModal();
  closeAllAnnouncementsModal();
  closeMyTicketsModal();
  closeMyOrdersModal();
  const m = document.getElementById('allMerchModal');
  if (m) {
    m.classList.remove('hidden');
    m.classList.add('flex');
    updateBodyScrollLock();
  }
}

function closeAllMerchModal() {
  const m = document.getElementById('allMerchModal');
  if (m) {
    m.classList.remove('flex');
    m.classList.add('hidden');
    updateBodyScrollLock();
  }
}

// ALL ANNOUNCEMENTS MODAL
function openAllAnnouncementsModal() {
  closeAllEventsModal();
  closeAllMerchModal();
  closeMyTicketsModal();
  closeMyOrdersModal();
  const m = document.getElementById('allAnnouncementsModal');
  if (m) {
    m.classList.remove('hidden');
    m.classList.add('flex');
    updateBodyScrollLock();
  }
}

function closeAllAnnouncementsModal() {
  const m = document.getElementById('allAnnouncementsModal');
  if (m) {
    m.classList.remove('flex');
    m.classList.add('hidden');
    updateBodyScrollLock();
  }
}

// MY TICKETS MODAL
function openMyTicketsModal() {
  closeAllEventsModal();
  closeAllMerchModal();
  closeAllAnnouncementsModal();
  closeMyOrdersModal();
  const m = document.getElementById('myTicketsModal');
  if (m) {
    m.classList.remove('hidden');
    m.classList.add('flex');
    updateBodyScrollLock();
  }
}

function closeMyTicketsModal() {
  const m = document.getElementById('myTicketsModal');
  if (m) {
    m.classList.remove('flex');
    m.classList.add('hidden');
    updateBodyScrollLock();
  }
}

// MY ORDERS MODAL (Cart + Checkout + Order History)
function openMyOrdersModal(defaultTab = 'cart') {
  closeAllEventsModal();
  closeAllMerchModal();
  closeAllAnnouncementsModal();
  closeMyTicketsModal();
  const m = document.getElementById('myOrdersModal');
  if (m) {
    m.classList.remove('hidden');
    m.classList.add('flex');
    updateBodyScrollLock();
    switchOrdersModalTab(defaultTab);
    fetchAndRenderCart();
    fetchOrderHistory();
  }
}

function closeMyOrdersModal() {
  const m = document.getElementById('myOrdersModal');
  if (m) {
    m.classList.remove('flex');
    m.classList.add('hidden');
    updateBodyScrollLock();
  }
}

// TAB SWITCHING IN MY ORDERS MODAL
function switchOrdersModalTab(tab) {
  const tabCartBtn = document.getElementById('tabCartBtn');
  const tabHistoryBtn = document.getElementById('tabHistoryBtn');
  const panelCart = document.getElementById('panelCart');
  const panelHistory = document.getElementById('panelHistory');

  if (tab === 'cart') {
    if (tabCartBtn) {
      tabCartBtn.className = 'py-3 text-xs font-bold border-b-2 border-[#1463D8] text-[#1463D8] flex items-center gap-2 cursor-pointer transition';
    }
    if (tabHistoryBtn) {
      tabHistoryBtn.className = 'py-3 text-xs font-semibold border-b-2 border-transparent text-slate-500 hover:text-[#102A4C] flex items-center gap-2 cursor-pointer transition';
    }
    if (panelCart) panelCart.classList.remove('hidden');
    if (panelHistory) panelHistory.classList.add('hidden');
  } else if (tab === 'history') {
    if (tabHistoryBtn) {
      tabHistoryBtn.className = 'py-3 text-xs font-bold border-b-2 border-[#1463D8] text-[#1463D8] flex items-center gap-2 cursor-pointer transition';
    }
    if (tabCartBtn) {
      tabCartBtn.className = 'py-3 text-xs font-semibold border-b-2 border-transparent text-slate-500 hover:text-[#102A4C] flex items-center gap-2 cursor-pointer transition';
    }
    if (panelHistory) panelHistory.classList.remove('hidden');
    if (panelCart) panelCart.classList.add('hidden');
    fetchOrderHistory();
  }
}

// CART NAVIGATION VIEWS
function showCheckoutView() {
  const cartItemsView = document.getElementById('cartItemsView');
  const cartCheckoutView = document.getElementById('cartCheckoutView');
  const cartConfirmationView = document.getElementById('cartConfirmationView');
  if (cartItemsView) cartItemsView.classList.add('hidden');
  if (cartConfirmationView) cartConfirmationView.classList.add('hidden');
  if (cartCheckoutView) cartCheckoutView.classList.remove('hidden');
}

function showCartItemsView() {
  const cartItemsView = document.getElementById('cartItemsView');
  const cartCheckoutView = document.getElementById('cartCheckoutView');
  const cartConfirmationView = document.getElementById('cartConfirmationView');
  if (cartCheckoutView) cartCheckoutView.classList.add('hidden');
  if (cartConfirmationView) cartConfirmationView.classList.add('hidden');
  if (cartItemsView) cartItemsView.classList.remove('hidden');
}

// CART RENDERING & OPERATIONS
function renderCartData(data) {
  if (!data) return;
  const count = data.cart_count || 0;
  const subtotal = Math.round(data.subtotal || 0);
  const total = Math.round(data.total || 0);

  // Update badges
  const headerBadge = document.getElementById('cartCountBadge');
  if (headerBadge) headerBadge.textContent = count;
  const modalBadge = document.getElementById('modalCartCountBadge');
  if (modalBadge) modalBadge.textContent = count;

  // Update summary totals
  const subtotalEl = document.getElementById('cartSummarySubtotal');
  if (subtotalEl) subtotalEl.textContent = subtotal;
  const totalEl = document.getElementById('cartSummaryTotal');
  if (totalEl) totalEl.textContent = total;
  const checkoutTotalEl = document.getElementById('checkoutAmountTotal');
  if (checkoutTotalEl) checkoutTotalEl.textContent = total;

  const emptyState = document.getElementById('cartEmptyState');
  const tableContainer = document.getElementById('cartTableContainer');
  const linesList = document.getElementById('cartLinesList');

  if (count <= 0 || !data.lines || data.lines.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (tableContainer) tableContainer.classList.add('hidden');
    showCartItemsView();
  } else {
    if (emptyState) emptyState.classList.add('hidden');
    if (tableContainer) tableContainer.classList.remove('hidden');
    if (linesList) {
      linesList.innerHTML = data.lines.map(line => `
        <div id="cartLineItem_${line.id}" class="p-3.5 flex flex-col sm:grid sm:grid-cols-12 items-center gap-3">
          <div class="col-span-6 flex items-center gap-3 w-full">
            <div class="w-14 h-14 rounded-lg bg-slate-50 border border-slate-100 p-1 flex items-center justify-center shrink-0">
              <img src="${line.image_url}" alt="${line.product_name}" class="w-full h-full object-contain rounded"/>
            </div>
            <div class="min-w-0">
              <h4 class="text-xs font-bold text-[#102A4C] truncate">${line.product_name}</h4>
              <span class="text-[11px] text-slate-400 block">${line.variant}</span>
              <span class="text-xs font-bold text-[#102A4C] sm:hidden block mt-0.5">₹${Math.round(line.price_unit)}</span>
            </div>
          </div>
          <div class="col-span-3 flex items-center justify-center gap-1.5 w-full sm:w-auto">
            <button type="button" onclick="updateCartQty(${line.id}, -1);" class="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition cursor-pointer">-</button>
            <span id="cartLineQty_${line.id}" class="w-8 text-center font-bold text-xs text-[#102A4C]">${line.quantity}</span>
            <button type="button" onclick="updateCartQty(${line.id}, 1);" class="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition cursor-pointer">+</button>
          </div>
          <div class="col-span-2 text-right hidden sm:block">
            <span class="text-xs font-bold text-[#102A4C]">₹<span id="cartLineSubtotal_${line.id}">${Math.round(line.price_subtotal)}</span></span>
          </div>
          <div class="col-span-1 text-center">
            <button type="button" onclick="removeCartItem(${line.id});" class="text-slate-400 hover:text-rose-500 transition p-1.5 cursor-pointer" title="Remove Item">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>
        </div>
      `).join('');
    }
  }
}

function fetchAndRenderCart() {
  fetch('/skyline/api/get_cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', params: {} })
  })
  .then(res => res.json())
  .then(data => {
    if (data && data.result) {
      renderCartData(data.result);
    }
  })
  .catch(err => console.error('[Skyline] get_cart error:', err));
}

function updateCartQty(lineId, delta) {
  fetch('/skyline/api/update_cart_qty', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', params: { line_id: lineId, delta: delta } })
  })
  .then(res => res.json())
  .then(data => {
    if (data && data.result) {
      renderCartData(data.result);
    }
  })
  .catch(err => {
    console.error('[Skyline] update_cart_qty error:', err);
    showToast('Failed to update quantity', 'error');
  });
}

function removeCartItem(lineId) {
  fetch('/skyline/api/remove_cart_item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', params: { line_id: lineId } })
  })
  .then(res => res.json())
  .then(data => {
    if (data && data.result) {
      renderCartData(data.result);
      showToast('Item removed from cart', 'info');
    }
  })
  .catch(err => {
    console.error('[Skyline] remove_cart_item error:', err);
    showToast('Failed to remove item', 'error');
  });
}

function executeCartCheckout() {
  const btn = document.getElementById('btnPayConfirm');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> Processing Payment...';
  }
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'upi';

  fetch('/skyline/api/checkout_cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', params: { payment_method: paymentMethod } })
  })
  .then(res => res.json())
  .then(data => {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-lock text-xs"></i> Pay &amp; Confirm Order';
    }
    const res = data.result;
    if (res && res.success) {
      showToast(res.message || 'Order placed successfully!', 'success');
      const orderRef = document.getElementById('confirmedOrderRef');
      if (orderRef && res.order) orderRef.textContent = res.order.name;

      // Show confirmation screen
      const cartCheckoutView = document.getElementById('cartCheckoutView');
      const cartConfirmationView = document.getElementById('cartConfirmationView');
      if (cartCheckoutView) cartCheckoutView.classList.add('hidden');
      if (cartConfirmationView) cartConfirmationView.classList.remove('hidden');

      // Reset cart badge to 0
      const badge = document.getElementById('cartCountBadge');
      if (badge) badge.textContent = '0';
      const modalBadge = document.getElementById('modalCartCountBadge');
      if (modalBadge) modalBadge.textContent = '0';

      // Refresh order history in modal
      fetchOrderHistory();

      // Prepend to My Orders preview in sidebar (strictly top 2)
      const ordersList = document.getElementById('myOrdersList');
      if (ordersList && res.order) {
        const emptyState = ordersList.querySelector('.text-center');
        if (emptyState) emptyState.remove();

        const newOrderDiv = document.createElement('div');
        newOrderDiv.className = 'py-2.5 flex items-center justify-between gap-3 group cursor-pointer animate-slide-down';
        newOrderDiv.setAttribute('data-order-name', res.order.name);
        newOrderDiv.setAttribute('onclick', 'openMyOrdersModal("history");');
        newOrderDiv.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center p-1 shrink-0">
              <img src="${res.order.primary_thumbnail || '/skyline_association/static/src/img/merch_hoodie.png'}" alt="${res.order.primary_product_name || 'Merchandise'}" class="h-full object-contain"/>
            </div>
            <div>
              <h3 class="text-xs font-bold text-[#102A4C] group-hover:text-[#1463D8] transition">${res.order.primary_product_name || res.order.name}</h3>
              <span class="block text-[10px] text-slate-400">${res.order.primary_variant || 'Standard'} | Qty: ${res.order.primary_quantity || 1}</span>
              <span class="text-xs font-bold text-[#102A4C] block mt-0.5">₹${Math.round(res.order.amount_total || 0)}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded border bg-blue-50 text-[#1463D8] border border-blue-100">
              Confirmed
            </span>
            <i class="fa-solid fa-chevron-right text-[10px] text-slate-300 group-hover:text-slate-500"></i>
          </div>
        `;
        ordersList.insertBefore(newOrderDiv, ordersList.firstChild);
        while (ordersList.children.length > 2) {
          ordersList.lastElementChild.remove();
        }
      }
    } else {
      showToast((res && res.message) || 'Checkout failed', 'error');
    }
  })
  .catch(err => {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-lock text-xs"></i> Pay &amp; Confirm Order';
    }
    console.error('[Skyline] checkout error:', err);
    showToast('Checkout request failed', 'error');
  });
}

// ORDER HISTORY FETCHING & DETAILS
function fetchOrderHistory() {
  fetch('/skyline/api/get_orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', params: {} })
  })
  .then(res => res.json())
  .then(data => {
    const res = data.result;
    if (res && res.success && res.orders) {
      const historyBadge = document.getElementById('modalHistoryCountBadge');
      if (historyBadge) historyBadge.textContent = res.orders.length;

      const container = document.getElementById('orderHistoryCardsList');
      if (!container) return;

      if (res.orders.length === 0) {
        container.innerHTML = `
          <div class="text-center py-12">
            <div class="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3 text-2xl">
              <i class="fa-solid fa-box-open"></i>
            </div>
            <h4 class="text-base font-bold text-[#102A4C]">You haven't placed any merchandise orders yet</h4>
            <p class="text-xs text-slate-400 mt-1">Browse official Skyline merchandise and gear up!</p>
            <button onclick="closeMyOrdersModal(); openAllMerchModal();" class="mt-4 px-4 py-2 bg-[#1463D8] hover:bg-[#1052B5] text-white text-xs font-semibold rounded-lg shadow-sm transition cursor-pointer">
              Browse Merchandise
            </button>
          </div>
        `;
        return;
      }

      container.innerHTML = res.orders.map(order => {
        const badgeClass = (order.status === 'confirmed' || order.status === 'delivered')
          ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
          : (order.status === 'processing'
            ? 'bg-blue-50 text-[#1463D8] border-blue-200'
            : 'bg-rose-50 text-rose-600 border-rose-200');

        const itemsHtml = order.lines.map(l => `
          <div class="flex items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-md bg-slate-50 border border-slate-100 p-0.5 flex items-center justify-center shrink-0">
                <img src="${l.image_url}" alt="${l.product_name}" class="w-full h-full object-contain rounded"/>
              </div>
              <div>
                <h5 class="font-bold text-[#102A4C]">${l.product_name}</h5>
                <span class="text-[11px] text-slate-400">${l.variant} • Qty: ${l.quantity}</span>
              </div>
            </div>
            <span class="font-bold text-[#102A4C]">₹${Math.round(l.price_subtotal)}</span>
          </div>
        `).join('');

        return `
          <div data-order-status="${order.status}" class="order-history-card bg-white border border-[#DCE6F2] rounded-xl p-4 shadow-xs hover:shadow-sm transition space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono font-bold text-[#102A4C]">${order.name}</span>
                <span class="text-slate-300">•</span>
                <span class="text-xs text-slate-400">${order.date}</span>
              </div>
              <div>
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded border ${badgeClass}">
                  ${order.status_label}
                </span>
              </div>
            </div>
            <div class="space-y-2">
              ${itemsHtml}
            </div>
            <div class="pt-2.5 border-t border-slate-100 flex items-center justify-between">
              <div class="text-xs">
                <span class="text-slate-400">Total: </span>
                <span class="font-extrabold text-[#102A4C]">₹${Math.round(order.amount_total)}</span>
              </div>
              <button type="button" onclick="toggleOrderHistoryDetails(${order.id});" class="text-xs font-semibold text-[#1463D8] hover:text-[#1052B5] flex items-center gap-1 cursor-pointer">
                <span>View Details</span>
                <i id="orderDetailChevron_${order.id}" class="fa-solid fa-chevron-down text-[10px] transition-transform"></i>
              </button>
            </div>
            <div id="orderDetailDrawer_${order.id}" class="hidden bg-slate-50 rounded-lg p-3 text-xs space-y-2 border border-slate-200/60 mt-2">
              <div class="flex justify-between">
                <span class="text-slate-500">Payment Status:</span>
                <span class="font-bold text-emerald-600">${order.payment_status}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Delivery Method:</span>
                <span class="font-medium text-[#102A4C]">Campus Pickup (Student Union Desk)</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Subtotal:</span>
                <span class="font-medium text-slate-700">₹${Math.round(order.amount_total)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Shipping &amp; Taxes:</span>
                <span class="font-medium text-slate-700">₹0 (Free Campus Pickup)</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  })
  .catch(err => console.error('[Skyline] get_orders error:', err));
}

function toggleOrderHistoryDetails(orderId) {
  const drawer = document.getElementById('orderDetailDrawer_' + orderId);
  const chevron = document.getElementById('orderDetailChevron_' + orderId);
  if (drawer) {
    const isHidden = drawer.classList.toggle('hidden');
    if (chevron) {
      chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
    }
  }
}

function filterOrderHistory(status, btn) {
  const buttons = document.querySelectorAll('.order-filter-btn');
  buttons.forEach(b => {
    b.className = 'order-filter-btn px-3 py-1 bg-white hover:bg-slate-100 border border-[#DCE6F2] text-slate-600 text-xs font-medium rounded-full transition cursor-pointer';
  });
  if (btn) {
    btn.className = 'order-filter-btn px-3 py-1 bg-[#1463D8] text-white text-xs font-semibold rounded-full shadow-2xs transition cursor-pointer';
  }

  const cards = document.querySelectorAll('.order-history-card');
  cards.forEach(card => {
    const cardStatus = card.getAttribute('data-order-status');
    if (status === 'all' || cardStatus === status) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  });
}

// Global window exposure
window.openEventDetailModal = openEventDetailModal;
window.closeEventDetailModal = closeEventDetailModal;
window.selectEventTicketTier = selectEventTicketTier;
window.toggleEventFavorite = toggleEventFavorite;
window.bookTicketFromModal = bookTicketFromModal;
window.openAllEventsModal = openAllEventsModal;
window.closeAllEventsModal = closeAllEventsModal;
window.openAllMerchModal = openAllMerchModal;
window.closeAllMerchModal = closeAllMerchModal;
window.openAllAnnouncementsModal = openAllAnnouncementsModal;
window.closeAllAnnouncementsModal = closeAllAnnouncementsModal;
window.openMyTicketsModal = openMyTicketsModal;
window.closeMyTicketsModal = closeMyTicketsModal;
window.openMyOrdersModal = openMyOrdersModal;
window.closeMyOrdersModal = closeMyOrdersModal;
window.switchOrdersModalTab = switchOrdersModalTab;
window.showCheckoutView = showCheckoutView;
window.showCartItemsView = showCartItemsView;
window.updateCartQty = updateCartQty;
window.removeCartItem = removeCartItem;
window.executeCartCheckout = executeCartCheckout;
window.toggleOrderHistoryDetails = toggleOrderHistoryDetails;
window.filterOrderHistory = filterOrderHistory;
window.closeTicketModal = closeTicketModal;
window.openMembershipModal = openMembershipModal;
window.closeMembershipModal = closeMembershipModal;
window.goToMembershipCheckout = goToMembershipCheckout;
window.backToMembershipPlan = backToMembershipPlan;
window.executeMembershipPayment = executeMembershipPayment;
window.continueAfterMembershipSuccess = continueAfterMembershipSuccess;
window.closeOrderModal = closeOrderModal;

// MEMBERSHIP TOGGLE FOR DEMO
function toggleMembershipDemo() {
  fetch('/skyline/api/switch_user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', params: { role: 'toggle' } })
  })
  .then(() => {
    showToast('Reloading membership profile...', 'info');
    setTimeout(() => window.location.reload(), 600);
  });
}
window.toggleMembershipDemo = toggleMembershipDemo;

// UNIVERSAL MEMBERSHIP CTA DELEGATION
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-action="open-membership-modal"], .membership-modal-trigger');
  if (trigger) {
    e.preventDefault();
    openMembershipModal();
    return;
  }
  const btn = e.target.closest('button, a');
  if (btn && btn.id !== 'buyMembershipBtn' && !btn.closest('#membershipModal')) {
    const txt = (btn.textContent || '').trim();
    if (['View Membership', 'Become a Member', 'Buy Membership', 'Join Skyline'].includes(txt)) {
      e.preventDefault();
      openMembershipModal();
    }
  }
});

