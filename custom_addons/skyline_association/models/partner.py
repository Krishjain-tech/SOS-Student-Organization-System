# -*- coding: utf-8 -*-
from odoo import models, fields, api

class ResPartner(models.Model):
    _inherit = 'res.partner'

    is_student = fields.Boolean(string="Is Student", default=True)
    student_id_number = fields.Char(string="Student ID Number")
    
    membership_ids = fields.One2many('skyline.membership', 'partner_id', string="Memberships")
    active_membership_id = fields.Many2one('skyline.membership', string="Active Membership", compute='_compute_membership_info', store=True)
    membership_status = fields.Selection([
        ('active', 'Active Member'),
        ('expired', 'Expired'),
        ('none', 'Not a Member'),
    ], string="Membership Status", compute='_compute_membership_info', store=True)
    
    member_discount = fields.Float(string="Member Discount (%)", compute='_compute_membership_info', store=True)
    membership_expiry = fields.Date(string="Valid Till", compute='_compute_membership_info', store=True)
    
    ticket_ids = fields.One2many('skyline.ticket', 'partner_id', string="Event Tickets")
    order_ids = fields.One2many('skyline.order', 'partner_id', string="Merchandise Orders")

    @api.depends('membership_ids', 'membership_ids.status', 'membership_ids.end_date')
    def _compute_membership_info(self):
        today = fields.Date.today()
        for partner in self:
            active_m = partner.membership_ids.filtered(
                lambda m: m.status == 'active' and (not m.end_date or m.end_date >= today)
            )
            if active_m:
                latest = active_m[0]
                partner.active_membership_id = latest.id
                partner.membership_status = 'active'
                partner.member_discount = latest.discount_percent
                partner.membership_expiry = latest.end_date
            else:
                expired_m = partner.membership_ids.filtered(lambda m: m.status == 'expired' or (m.end_date and m.end_date < today))
                partner.active_membership_id = False
                partner.membership_status = 'expired' if expired_m else 'none'
                partner.member_discount = 0.0
                partner.membership_expiry = expired_m[0].end_date if expired_m else False

