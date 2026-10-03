# -*- coding: utf-8 -*-
import json
import logging
from odoo import http, fields
from odoo.http import request

_logger = logging.getLogger(__name__)

class SkylinePortalController(http.Controller):

    def _get_current_partner(self):
        """Returns the logged-in student partner, or falls back to demo student Aarav Patel."""
        user = request.env.user
        if user and user != request.env.ref('base.public_user', raise_if_not_found=False):
            return user.partner_id
        # Fallback to Aarav Patel for instant demoability
        aarav = request.env['res.partner'].sudo().search([('name', '=', 'Aarav Patel')], limit=1)
        if aarav:
            return aarav
        return request.env['res.partner'].sudo().search([('is_student', '=', True)], limit=1)

    def _get_or_create_cart(self, partner):
        if not partner:
            return False
        cart = request.env['skyline.order'].sudo().search([
            ('partner_id', '=', partner.id),
            ('status', '=', 'cart')
        ], limit=1)
        if not cart:
            cart = request.env['skyline.order'].sudo().create({
                'name': f"CART-{partner.id}",
                'partner_id': partner.id,
                'status': 'cart',
                'payment_status': 'pending',
            })
        return cart

    def _get_portal_context(self, active_tab='home'):
        partner = self._get_current_partner()
        
        # Membership metrics accurately computed from database
        if partner:
            partner._compute_membership_info()
            membership_status = partner.membership_status or 'none'
            is_member = (membership_status == 'active')
            is_expired = (membership_status == 'expired')
            today = fields.Date.today()
            if partner.membership_expiry:
                membership_expiry_str = partner.membership_expiry.strftime('%d %b %Y')
                membership_expiry_long = partner.membership_expiry.strftime('%d %B %Y')
                days_left = (partner.membership_expiry - today).days
                is_expiring_soon = is_member and (0 <= days_left <= 30)
            else:
                membership_expiry_str = ""
                membership_expiry_long = ""
                is_expiring_soon = False
            discount_str = f"{int(partner.member_discount)}%" if is_member else "0%"
        else:
            membership_status = 'none'
            is_member = False
            is_expired = False
            is_expiring_soon = False
            membership_expiry_str = ""
            membership_expiry_long = ""
            discount_str = "0%"
        
        # Events
        events = request.env['skyline.event'].sudo().search([], order='sequence, id')
        
        # Merchandise
        merch_items = request.env['skyline.merch'].sudo().search([], order='sequence, id')
        
        # Announcements: all published for modal, top 2 newest for dashboard preview
        all_announcements = request.env['skyline.announcement'].sudo().search([('is_published', '=', True)], order='date desc, sequence, id desc')
        preview_announcements = all_announcements[:2]
        
        # Tickets for current student: all for modal, top 2 active/upcoming for dashboard preview
        all_tickets = request.env['skyline.ticket'].sudo().search([('partner_id', '=', partner.id)], order='registration_date desc, id desc') if partner else request.env['skyline.ticket'].sudo()
        active_tickets = all_tickets.filtered(lambda t: t.status != 'cancelled') if partner else []
        preview_tickets = active_tickets[:2] if len(active_tickets) >= 2 else (all_tickets[:2] if all_tickets else [])
        
        # Orders for current student (Order History, excluding cart): all for modal, top 2 newest for dashboard preview
        all_orders = request.env['skyline.order'].sudo().search([('partner_id', '=', partner.id), ('status', '!=', 'cart')], order='date_order desc, id desc') if partner else request.env['skyline.order'].sudo()
        preview_orders = all_orders[:2]
        
        # Cart for current student
        cart_order = request.env['skyline.order'].sudo().search([('partner_id', '=', partner.id), ('status', '=', 'cart')], limit=1) if partner else False
        cart_count = sum(cart_order.line_ids.mapped('quantity')) if cart_order else 0
        
        # Registrations count summary: e.g. "3" and "1 in delivery"
        total_registrations = len(all_tickets)
        processing_orders = len([o for o in all_orders if o.status in ('processing', 'confirmed')])
        delivery_text = f"{processing_orders} in delivery" if processing_orders else "All delivered"

        events_dict = {}
        for ev in events:
            feat_list = [f.strip() for f in (ev.features or '').split(',') if f.strip()]
            events_dict[str(ev.id)] = {
                'id': ev.id,
                'name': ev.name,
                'tag': ev.tag or '',
                'floating_badge': getattr(ev, 'floating_badge', '') or '',
                'date_display': ev.date_display or '',
                'month_short': ev.month_short or '',
                'day_num': ev.day_num or '',
                'time_display': ev.time_display or '',
                'location': ev.location or '',
                'description': ev.description or '',
                'image_url': ev.image_url or '/skyline_association/static/src/img/event_spring_gala.png',
                'capacity': ev.capacity,
                'tickets_sold': ev.tickets_sold,
                'remaining_seats': ev.remaining_seats,
                'is_sold_out': ev.is_sold_out,
                'member_price': ev.member_price,
                'non_member_price': ev.non_member_price,
                'is_free': ev.is_free,
                'status': ev.status,
                'features': feat_list,
            }
        events_json = json.dumps(events_dict)

        return {
            'partner': partner,
            'is_member': is_member,
            'membership_status': membership_status,
            'is_expired': is_expired,
            'is_expiring_soon': is_expiring_soon,
            'membership_expiry': membership_expiry_str,
            'membership_expiry_long': membership_expiry_long,
            'discount_str': discount_str,
            'total_registrations': total_registrations or 3,
            'delivery_text': delivery_text,
            'events': events,
            'events_json': events_json,
            'merch_items': merch_items,
            # Full lists for View All modals and metric badges
            'announcements': all_announcements,
            'all_announcements': all_announcements,
            'tickets': all_tickets,
            'all_tickets': all_tickets,
            'orders': all_orders,
            'all_orders': all_orders,
            # Top 2 preview lists strictly for dashboard sidebar
            'preview_announcements': preview_announcements,
            'preview_tickets': preview_tickets,
            'preview_orders': preview_orders,
            'cart_order': cart_order,
            'cart_count': cart_count,
            'active_tab': active_tab,
        }

    @http.route(['/', '/skyline', '/skyline/home'], type='http', auth='public', website=True, csrf=False)
    def skyline_home(self, **kwargs):
        ctx = self._get_portal_context(active_tab='home')
        return request.render('skyline_association.portal_homepage_template', ctx)

    @http.route(['/events', '/skyline/events'], type='http', auth='public', website=True, csrf=False)
    def skyline_events(self, **kwargs):
        ctx = self._get_portal_context(active_tab='events')
        return request.render('skyline_association.portal_homepage_template', ctx)

    @http.route(['/merchandise', '/skyline/merchandise'], type='http', auth='public', website=True, csrf=False)
    def skyline_merchandise(self, **kwargs):
        ctx = self._get_portal_context(active_tab='merchandise')
        return request.render('skyline_association.portal_homepage_template', ctx)

    @http.route(['/announcements', '/skyline/announcements'], type='http', auth='public', website=True, csrf=False)
    def skyline_announcements(self, **kwargs):
        ctx = self._get_portal_context(active_tab='announcements')
        return request.render('skyline_association.portal_homepage_template', ctx)

    @http.route(['/about', '/skyline/about'], type='http', auth='public', website=True, csrf=False)
    def skyline_about(self, **kwargs):
        ctx = self._get_portal_context(active_tab='about')
        return request.render('skyline_association.portal_homepage_template', ctx)

    # ========================================================
    # API ENDPOINTS
    # ========================================================

    @http.route('/skyline/api/get_event', type='json', auth='public', methods=['POST'], csrf=False)
    def api_get_event(self, event_id, **kwargs):
        event = request.env['skyline.event'].sudo().browse(int(event_id))
        if not event.exists():
            return {'success': False, 'message': 'Event not found.'}
        
        partner = self._get_current_partner()
        is_member = (partner.membership_status == 'active') if partner else False
        feat_list = [f.strip() for f in (event.features or '').split(',') if f.strip()]
        
        return {
            'success': True,
            'event': {
                'id': event.id,
                'name': event.name,
                'tag': event.tag or '',
                'floating_badge': getattr(event, 'floating_badge', '') or '',
                'date_display': event.date_display or '',
                'month_short': event.month_short or '',
                'day_num': event.day_num or '',
                'time_display': event.time_display or '',
                'location': event.location or '',
                'description': event.description or '',
                'image_url': event.image_url or '/skyline_association/static/src/img/event_spring_gala.png',
                'capacity': event.capacity,
                'tickets_sold': event.tickets_sold,
                'remaining_seats': event.remaining_seats,
                'is_sold_out': event.is_sold_out,
                'member_price': event.member_price,
                'non_member_price': event.non_member_price,
                'is_free': event.is_free,
                'status': event.status,
                'features': feat_list,
            },
            'user': {
                'is_member': is_member,
                'name': partner.name if partner else '',
            }
        }

    @http.route('/skyline/api/book_ticket', type='json', auth='public', methods=['POST'], csrf=False)
    def api_book_ticket(self, event_id, **kwargs):
        partner = self._get_current_partner()
        if not partner:
            return {'success': False, 'message': 'Student identity not found. Please log in.'}

        event = request.env['skyline.event'].sudo().browse(int(event_id))
        if not event.exists():
            return {'success': False, 'message': 'Event does not exist.'}

        try:
            ticket = event.book_ticket_for_partner(partner.id)
            return {
                'success': True,
                'message': f"Ticket for '{event.name}' confirmed successfully!",
                'ticket': {
                    'id': ticket.id,
                    'name': ticket.name,
                    'event_name': event.name,
                    'price_paid': ticket.price_paid,
                    'is_member_rate': ticket.is_member_rate,
                    'date': event.date_display,
                    'time': event.time_display,
                    'location': event.location,
                    'status': ticket.status,
                    'image': event.image_url,
                    'qr_token': ticket.qr_code_token,
                },
                'remaining_seats': event.remaining_seats,
                'is_sold_out': event.is_sold_out
            }
        except Exception as e:
            return {'success': False, 'message': str(e)}

    @http.route('/skyline/api/checkin_ticket', type='json', auth='public', methods=['POST'], csrf=False)
    def api_checkin_ticket(self, ticket_id, **kwargs):
        ticket = request.env['skyline.ticket'].sudo().browse(int(ticket_id))
        if not ticket.exists():
            return {'success': False, 'message': 'Ticket record not found.'}
        try:
            ticket.action_checkin()
            return {
                'success': True,
                'message': f"Ticket {ticket.name} checked in successfully!",
                'ticket_id': ticket.id,
                'status': 'checked_in',
                'checkin_time': ticket.checkin_time.strftime('%I:%M %p') if ticket.checkin_time else 'Just now'
            }
        except Exception as e:
            return {'success': False, 'message': str(e)}

    @http.route('/skyline/api/add_to_cart', type='json', auth='public', methods=['POST'], csrf=False)
    def api_add_to_cart(self, product_id, variant='Size: M', quantity=1, **kwargs):
        partner = self._get_current_partner()
        if not partner:
            return {'success': False, 'message': 'Student identity not found.'}

        product = request.env['skyline.merch'].sudo().browse(int(product_id))
        if not product.exists():
            return {'success': False, 'message': 'Product not found.'}

        if product.stock_qty < quantity:
            return {'success': False, 'message': f"Sorry, '{product.name}' is out of stock!"}

        cart = self._get_or_create_cart(partner)
        existing_line = cart.line_ids.filtered(lambda l: l.product_id.id == product.id and l.variant == variant)
        if existing_line:
            existing_line[0].quantity += quantity
        else:
            request.env['skyline.order.line'].sudo().create({
                'order_id': cart.id,
                'product_id': product.id,
                'variant': variant,
                'quantity': quantity,
                'price_unit': product.price,
            })

        cart_count = sum(cart.line_ids.mapped('quantity'))
        
        return {
            'success': True,
            'message': f"Added {product.name} ({variant}) to your cart!",
            'cart_count': cart_count,
            'cart_total': cart.amount_total,
            'remaining_stock': product.stock_qty
        }

    @http.route('/skyline/api/get_cart', type='json', auth='public', methods=['POST'], csrf=False)
    def api_get_cart(self, **kwargs):
        partner = self._get_current_partner()
        if not partner:
            return {'success': False, 'message': 'Not logged in', 'lines': [], 'cart_count': 0, 'total': 0.0}
        
        cart = request.env['skyline.order'].sudo().search([
            ('partner_id', '=', partner.id),
            ('status', '=', 'cart')
        ], limit=1)

        if not cart or not cart.line_ids:
            return {
                'success': True,
                'lines': [],
                'subtotal': 0.0,
                'taxes': 0.0,
                'shipping': 0.0,
                'total': 0.0,
                'cart_count': 0
            }

        lines = []
        for line in cart.line_ids:
            lines.append({
                'id': line.id,
                'product_id': line.product_id.id,
                'product_name': line.product_id.name,
                'image_url': line.product_id.thumbnail_url or line.product_id.image_url,
                'variant': line.variant or 'Standard',
                'quantity': line.quantity,
                'price_unit': line.price_unit,
                'price_subtotal': line.price_subtotal,
            })

        return {
            'success': True,
            'lines': lines,
            'subtotal': cart.amount_total,
            'taxes': 0.0,
            'shipping': 0.0,
            'total': cart.amount_total,
            'cart_count': sum(cart.line_ids.mapped('quantity'))
        }

    @http.route('/skyline/api/update_cart_qty', type='json', auth='public', methods=['POST'], csrf=False)
    def api_update_cart_qty(self, line_id, delta=None, quantity=None, **kwargs):
        partner = self._get_current_partner()
        line = request.env['skyline.order.line'].sudo().browse(int(line_id))
        if not line.exists() or line.order_id.partner_id.id != partner.id or line.order_id.status != 'cart':
            return {'success': False, 'message': 'Cart line not found or unauthorized.'}

        new_qty = (line.quantity + int(delta)) if delta is not None else int(quantity)
        if new_qty <= 0:
            line.unlink()
        else:
            line.quantity = new_qty

        return self.api_get_cart()

    @http.route('/skyline/api/remove_cart_item', type='json', auth='public', methods=['POST'], csrf=False)
    def api_remove_cart_item(self, line_id, **kwargs):
        partner = self._get_current_partner()
        line = request.env['skyline.order.line'].sudo().browse(int(line_id))
        if not line.exists() or line.order_id.partner_id.id != partner.id or line.order_id.status != 'cart':
            return {'success': False, 'message': 'Cart line not found or unauthorized.'}

        line.unlink()
        return self.api_get_cart()

    @http.route('/skyline/api/checkout_cart', type='json', auth='public', methods=['POST'], csrf=False)
    def api_checkout_cart(self, payment_method='upi', **kwargs):
        partner = self._get_current_partner()
        if not partner:
            return {'success': False, 'message': 'Student identity not found.'}

        cart = request.env['skyline.order'].sudo().search([
            ('partner_id', '=', partner.id),
            ('status', '=', 'cart')
        ], limit=1)
        if not cart or not cart.line_ids:
            return {'success': False, 'message': 'Your cart is empty.'}

        # Deduct stock
        for line in cart.line_ids:
            if line.product_id.stock_qty < line.quantity:
                return {'success': False, 'message': f"Insufficient stock for {line.product_id.name}"}
            line.product_id.stock_qty = max(0, line.product_id.stock_qty - line.quantity)

        # Generate official sequence
        order_count = request.env['skyline.order'].sudo().search_count([('status', '!=', 'cart')]) + 1
        order_ref = f"SKY-ORD-{order_count:04d}"

        cart.write({
            'name': order_ref,
            'status': 'confirmed',
            'payment_status': 'paid',
            'date_order': fields.Datetime.now(),
        })

        return {
            'success': True,
            'message': 'Order placed successfully!',
            'order': {
                'id': cart.id,
                'name': cart.name,
                'date': cart.date_order.strftime('%d %b %Y'),
                'total': cart.amount_total,
                'status': 'Order Confirmed',
                'payment_method': payment_method.upper(),
                'item_count': sum(cart.line_ids.mapped('quantity')),
            }
        }

    @http.route('/skyline/api/get_orders', type='json', auth='public', methods=['POST'], csrf=False)
    def api_get_orders(self, **kwargs):
        partner = self._get_current_partner()
        if not partner:
            return {'success': False, 'orders': []}

        orders = request.env['skyline.order'].sudo().search([
            ('partner_id', '=', partner.id),
            ('status', '!=', 'cart')
        ], order='date_order desc, id desc')

        status_map = {
            'processing': 'Order Placed',
            'confirmed': 'Order Confirmed',
            'delivered': 'Delivered',
            'cancelled': 'Cancelled',
        }

        orders_data = []
        for o in orders:
            lines = [{
                'id': l.id,
                'product_name': l.product_id.name,
                'image_url': l.product_id.thumbnail_url or l.product_id.image_url,
                'variant': l.variant or 'Standard',
                'quantity': l.quantity,
                'price_unit': l.price_unit,
                'price_subtotal': l.price_subtotal,
            } for l in o.line_ids]

            orders_data.append({
                'id': o.id,
                'name': o.name,
                'date': o.date_order.strftime('%d %b %Y') if o.date_order else 'Recent',
                'status': o.status,
                'status_label': status_map.get(o.status, o.status.capitalize()),
                'payment_status': o.payment_status.capitalize() if o.payment_status else 'Paid',
                'amount_total': o.amount_total,
                'lines': lines,
                'primary_product_name': o.primary_product_name,
                'primary_variant': o.primary_variant,
                'primary_quantity': o.primary_quantity,
                'primary_price': o.primary_price,
                'primary_thumbnail': o.primary_thumbnail,
            })

        return {'success': True, 'orders': orders_data}

    @http.route('/skyline/api/search', type='json', auth='public', methods=['POST'], csrf=False)
    def api_search(self, q='', **kwargs):
        query = (q or '').strip().lower()
        if not query:
            return {'events': [], 'merchandise': []}

        # Search events
        events = request.env['skyline.event'].sudo().search([
            '|', '|',
            ('name', 'ilike', query),
            ('description', 'ilike', query),
            ('location', 'ilike', query)
        ], limit=5)

        # Search merchandise
        merch = request.env['skyline.merch'].sudo().search([
            '|',
            ('name', 'ilike', query),
            ('description', 'ilike', query)
        ], limit=5)

        return {
            'events': [{
                'id': e.id,
                'name': e.name,
                'date': e.date_display,
                'location': e.location,
                'member_price': e.member_price,
                'non_member_price': e.non_member_price,
                'image': e.image_url
            } for e in events],
            'merchandise': [{
                'id': m.id,
                'name': m.name,
                'price': m.price,
                'stock': m.stock_qty,
                'image': m.image_url
            } for m in merch]
        }

    @http.route('/skyline/api/switch_user', type='json', auth='public', methods=['POST'], csrf=False)
    def api_switch_user(self, role='toggle', **kwargs):
        """Allows demo switcher between Active Member and Non-Member."""
        partner = request.env['res.partner'].sudo().search([('name', '=', 'Aarav Patel')], limit=1)
        if not partner:
            partner = request.env['res.partner'].sudo().search([('is_student', '=', True)], limit=1)
        if not partner:
            return {'success': False, 'message': 'Student partner not found'}

        # Ensure membership info is computed
        partner._compute_membership_info()
        current_active = (partner.membership_status == 'active')

        target_role = role
        if role == 'toggle':
            target_role = 'non_member' if current_active else 'member'

        if target_role == 'member':
            today = fields.Date.today()
            active_m = partner.membership_ids.filtered(lambda m: m.status == 'active' and (not m.end_date or m.end_date >= today))
            if not active_m:
                # Reactivate or create new active membership
                if partner.membership_ids:
                    partner.membership_ids[0].sudo().write({
                        'status': 'active',
                        'end_date': fields.Date.from_string('2027-12-31'),
                        'discount_percent': 20.0,
                        'payment_status': 'paid'
                    })
                else:
                    request.env['skyline.membership'].sudo().create({
                        'name': 'MEM-2024-001',
                        'partner_id': partner.id,
                        'status': 'active',
                        'end_date': fields.Date.from_string('2027-12-31'),
                        'discount_percent': 20.0,
                        'payment_status': 'paid'
                    })
            else:
                active_m.write({'discount_percent': 20.0, 'status': 'active', 'end_date': fields.Date.from_string('2027-12-31')})
            partner._compute_membership_info()
        elif target_role == 'non_member':
            partner.membership_ids.sudo().write({'status': 'expired'})
            partner._compute_membership_info()

        return {
            'success': True,
            'role': target_role,
            'is_member': (partner.membership_status == 'active'),
            'membership_status': partner.membership_status,
            'discount': partner.member_discount
        }

    @http.route('/skyline/api/buy_membership', type='json', auth='public', methods=['POST'], csrf=False)
    def api_buy_membership(self, payment_method='upi', **kwargs):
        partner = self._get_current_partner()
        if not partner:
            return {
                'success': False,
                'not_logged_in': True,
                'message': 'Please log in to purchase a Skyline Plus membership.',
                'redirect_url': '/web/login'
            }

        # Check if already active
        partner._compute_membership_info()
        if partner.membership_status == 'active':
            expiry_str = partner.membership_expiry.strftime('%d %B %Y') if partner.membership_expiry else 'N/A'
            expiry_short = partner.membership_expiry.strftime('%d %b %Y') if partner.membership_expiry else 'N/A'
            return {
                'success': False,
                'already_active': True,
                'message': f"You already have an active Skyline Plus membership valid until {expiry_str}.",
                'expiry': expiry_str,
                'expiry_short': expiry_short,
                'partner_name': partner.name
            }

        try:
            res = request.env['skyline.membership'].sudo().purchase_membership_for_partner(partner.id, payment_method=payment_method)
            if res.get('success'):
                partner._compute_membership_info()
                return {
                    'success': True,
                    'membership': res,
                    'partner_name': partner.name,
                    'is_member': True,
                    'membership_status': partner.membership_status,
                    'expiry': res.get('end_date'),
                    'expiry_short': res.get('end_date_short')
                }
            return res
        except Exception as e:
            return {'success': False, 'message': str(e)}

    @http.route('/skyline/api/get_membership_info', type='json', auth='public', methods=['POST'], csrf=False)
    def api_get_membership_info(self, **kwargs):
        partner = self._get_current_partner()
        if not partner:
            return {
                'success': True,
                'is_logged_in': False,
                'is_member': False,
                'membership_status': 'none',
                'plan_name': 'Skyline Plus',
                'price': 1000.0,
                'price_display': '₹1,000',
                'duration': '1 Year',
                'expiry': ''
            }
        
        partner._compute_membership_info()
        is_member = (partner.membership_status == 'active')
        expiry_short = partner.membership_expiry.strftime('%d %b %Y') if partner.membership_expiry else ''
        expiry_long = partner.membership_expiry.strftime('%d %B %Y') if partner.membership_expiry else ''
        
        return {
            'success': True,
            'is_logged_in': True,
            'partner_name': partner.name,
            'is_member': is_member,
            'membership_status': partner.membership_status,
            'plan_name': 'Skyline Plus',
            'price': 1000.0,
            'price_display': '₹1,000',
            'duration': '1 Year',
            'expiry': expiry_long or expiry_short,
            'expiry_short': expiry_short,
            'expiry_long': expiry_long
        }
