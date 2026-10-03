# -*- coding: utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import UserError

class SkylineTicket(models.Model):
    _name = 'skyline.ticket'
    _description = 'Student Event Registration & Ticket'
    _order = 'registration_date desc, id desc'

    name = fields.Char(string="Ticket Reference", required=True, copy=False)
    event_id = fields.Many2one('skyline.event', string="Event", required=True, ondelete='cascade')
    partner_id = fields.Many2one('res.partner', string="Student / Attendee", required=True, ondelete='cascade')
    
    event_name = fields.Char(related='event_id.name', string="Event Name", store=True)
    event_image = fields.Char(related='event_id.image_url', string="Event Image")
    event_location = fields.Char(related='event_id.location', string="Event Location")
    event_time = fields.Char(related='event_id.time_display', string="Event Time")
    event_date = fields.Char(related='event_id.date_display', string="Event Date")
    
    price_paid = fields.Float(string="Price Paid (₹)", default=0.0)
    is_member_rate = fields.Boolean(string="Applied Member Rate")
    registration_date = fields.Datetime(string="Registration Date", default=fields.Datetime.now, required=True)
    
    status = fields.Selection([
        ('confirmed', 'Confirmed'),
        ('checked_in', 'Checked In'),
        ('cancelled', 'Cancelled')
    ], string="Ticket Status", default='confirmed', required=True)
    
    checkin_time = fields.Datetime(string="Check-In Time")
    qr_code_token = fields.Char(string="QR Code Token")

    def action_checkin(self):
        for ticket in self:
            if ticket.status == 'checked_in':
                raise UserError(f"Ticket {ticket.name} is ALREADY CHECKED IN on {ticket.checkin_time}!")
            if ticket.status == 'cancelled':
                raise UserError(f"Cannot check in cancelled ticket {ticket.name}.")
            ticket.write({
                'status': 'checked_in',
                'checkin_time': fields.Datetime.now(),
            })
        return True

    def action_cancel(self):
        self.write({'status': 'cancelled'})
