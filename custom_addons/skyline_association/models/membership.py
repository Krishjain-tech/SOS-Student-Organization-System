# -*- coding: utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import UserError
from dateutil.relativedelta import relativedelta

class SkylineMembership(models.Model):
    _name = 'skyline.membership'
    _description = 'Student Association Membership'
    _order = 'create_date desc'

    name = fields.Char(string="Reference", required=True, copy=False, default=lambda self: self.env['ir.sequence'].next_by_code('skyline.membership') or 'New Membership')
    partner_id = fields.Many2one('res.partner', string="Student / Member", required=True, ondelete='cascade')
    plan_name = fields.Char(string="Plan Name", default="Skyline Plus")
    start_date = fields.Date(string="Start Date", default=fields.Date.today, required=True)
    end_date = fields.Date(string="Valid Till", default=lambda self: fields.Date.today() + relativedelta(years=1), required=True)
    discount_percent = fields.Float(string="Discount Rate (%)", default=20.0)
    fee_paid = fields.Float(string="Fee Paid (₹)", default=1000.0)
    
    status = fields.Selection([
        ('active', 'Active'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled')
    ], string="Status", default='active', required=True)
    
    payment_status = fields.Selection([
        ('paid', 'Paid'),
        ('pending', 'Pending Payment'),
        ('waived', 'Waived')
    ], string="Payment Status", default='paid', required=True)
    
    payment_method = fields.Selection([
        ('upi', 'UPI / QR'),
        ('card', 'Credit / Debit Card'),
        ('netbanking', 'Net Banking'),
        ('student_account', 'Student Campus Card Account')
    ], string="Payment Method", default='upi', required=True)
    
    benefits_description = fields.Text(string="Benefits", default="20% off eligible Skyline events and workshops, member discounts on eligible official Skyline merchandise, priority access, and student community perks.")

    def action_activate(self):
        self.write({'status': 'active', 'payment_status': 'paid'})

    def action_expire(self):
        self.write({'status': 'expired'})

    @api.model
    def purchase_membership_for_partner(self, partner_id, payment_method='upi'):
        partner = self.env['res.partner'].browse(partner_id)
        if not partner.exists():
            raise UserError("Student not found.")
        
        today = fields.Date.today()
        # Compute current status
        partner._compute_membership_info()
        if partner.membership_status == 'active':
            expiry_str = partner.membership_expiry.strftime('%d %b %Y') if partner.membership_expiry else 'N/A'
            return {
                'success': False,
                'already_active': True,
                'message': f"You already have an active Skyline Plus membership valid until {expiry_str}.",
                'expiry': expiry_str,
            }

        # Calculate exact 1 year duration
        end_date = today + relativedelta(years=1)
        
        # Sequence or reference
        ref = self.env['ir.sequence'].next_by_code('skyline.membership')
        if not ref:
            count = self.search_count([]) + 1
            ref = f"MEM-{today.year}-{count:04d}"

        membership = self.create({
            'name': ref,
            'partner_id': partner.id,
            'plan_name': 'Skyline Plus',
            'start_date': today,
            'end_date': end_date,
            'discount_percent': 20.0,
            'fee_paid': 1000.0,
            'status': 'active',
            'payment_status': 'paid',
            'payment_method': payment_method,
            'benefits_description': '20% off eligible Skyline events and workshops, member discounts on eligible official Skyline merchandise, priority access, and student community perks.'
        })

        partner._compute_membership_info()

        method_labels = {
            'upi': 'UPI / Instant QR',
            'card': 'Credit / Debit Card',
            'netbanking': 'Net Banking',
            'student_account': 'Student Campus Card'
        }

        return {
            'success': True,
            'membership_id': membership.id,
            'name': membership.name,
            'plan_name': membership.plan_name,
            'fee_paid': membership.fee_paid,
            'payment_method': method_labels.get(payment_method, payment_method.upper()),
            'start_date': membership.start_date.strftime('%d %b %Y'),
            'end_date': membership.end_date.strftime('%d %B %Y'),
            'end_date_short': membership.end_date.strftime('%d %b %Y'),
            'message': "Welcome to Skyline Plus! Your annual membership is now active."
        }

