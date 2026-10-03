# -*- coding: utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import UserError

# Centralized 20% member discount configuration
MEMBER_DISCOUNT_PERCENT = 20.0
MEMBER_DISCOUNT_FACTOR = 0.80

def calculate_member_discount_price(base_price):
    """Centralized single source of truth for Skyline 20% member pricing.
    
    Rule: Skyline Student Association members receive EXACTLY 20% OFF the base / non-member price.
    Formula: member_price = round(base_price * 0.80, 2)
    """
    if not base_price:
        return 0.0
    return round(float(base_price) * MEMBER_DISCOUNT_FACTOR, 2)


class SkylineEvent(models.Model):
    _name = 'skyline.event'
    _description = 'Skyline Association Event'
    _order = 'date_start asc, sequence, id'

    name = fields.Char(string="Event Name", required=True)
    sequence = fields.Integer(string="Sequence", default=10)
    tag = fields.Char(string="Badge Tag", help="e.g. Featured, Prizes")
    date_display = fields.Char(string="Display Date", default="15 Nov 2024")
    month_short = fields.Char(string="Month Short", default="Nov")
    day_num = fields.Char(string="Day Number", default="15")
    
    date_start = fields.Datetime(string="Start Date/Time", default=fields.Datetime.now)
    date_end = fields.Datetime(string="End Date/Time")
    time_display = fields.Char(string="Time", default="6:00 PM - 10:00 PM")
    location = fields.Char(string="Location", default="Main Auditorium")
    description = fields.Text(string="Description")
    features = fields.Char(string="What to Expect", help="Comma-separated features e.g. 🎵 Live Music, 🤝 Student Networking")
    floating_badge = fields.Char(string="Floating Badge", help="e.g. Annual Premiere Event")
    
    image_url = fields.Char(string="Image URL", default="/skyline_association/static/src/img/event_spring_gala.png")
    
    capacity = fields.Integer(string="Max Capacity", default=150)
    non_member_price = fields.Float(string="Base / Non-member Price (₹)", default=450.0)
    member_price = fields.Float(
        string="Member Price (₹)",
        compute='_compute_member_price',
        store=True,
        readonly=True,
        help="Automatically calculated as exactly 20% off base / non-member price"
    )
    is_free = fields.Boolean(string="Is Free Event", default=False)
    
    ticket_ids = fields.One2many('skyline.ticket', 'event_id', string="Registrations / Tickets")
    tickets_sold = fields.Integer(string="Tickets Sold", compute='_compute_ticket_stats', store=True)
    remaining_seats = fields.Integer(string="Remaining Seats", compute='_compute_ticket_stats', store=True)
    is_sold_out = fields.Boolean(string="Sold Out", compute='_compute_ticket_stats', store=True)
    
    status = fields.Selection([
        ('upcoming', 'Upcoming'),
        ('ongoing', 'Ongoing'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled')
    ], string="Status", default='upcoming')

    @api.depends('non_member_price', 'is_free')
    def _compute_member_price(self):
        for event in self:
            if event.is_free:
                event.member_price = 0.0
            else:
                event.member_price = calculate_member_discount_price(event.non_member_price)

    @api.depends('capacity', 'ticket_ids', 'ticket_ids.status')
    def _compute_ticket_stats(self):
        for event in self:
            valid_tickets = event.ticket_ids.filtered(lambda t: t.status in ('confirmed', 'checked_in'))
            sold = len(valid_tickets)
            event.tickets_sold = sold
            event.remaining_seats = max(0, event.capacity - sold)
            event.is_sold_out = (event.capacity > 0 and sold >= event.capacity)

    def calculate_ticket_price(self, is_member=False):
        """Calculates ticket price using the centralized 20% member discount rule."""
        self.ensure_one()
        if self.is_free:
            return 0.0
        if is_member:
            return calculate_member_discount_price(self.non_member_price)
        return round(float(self.non_member_price), 2)

    def book_ticket_for_partner(self, partner_id):
        self.ensure_one()
        partner = self.env['res.partner'].browse(partner_id)
        if not partner.exists():
            raise UserError("Invalid student/partner.")

        # Check capacity server-side
        valid_tickets = self.ticket_ids.filtered(lambda t: t.status in ('confirmed', 'checked_in'))
        if self.capacity > 0 and len(valid_tickets) >= self.capacity:
            raise UserError(f"Sorry, '{self.name}' is already at full capacity.")

        # Determine price based on active membership status verified on server
        is_member = (partner.membership_status == 'active')
        price = self.calculate_ticket_price(is_member=is_member)

        # Generate ticket reference
        count = self.env['skyline.ticket'].search_count([]) + 1
        ticket_ref = f"SKY-TKT-{count:04d}"

        ticket = self.env['skyline.ticket'].create({
            'name': ticket_ref,
            'event_id': self.id,
            'partner_id': partner.id,
            'price_paid': price,
            'is_member_rate': is_member,
            'status': 'confirmed',
            'qr_code_token': f"SKYLINE-EVT-{self.id}-TKT-{ticket_ref}",
        })
        return ticket
