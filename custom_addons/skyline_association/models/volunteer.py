# -*- coding: utf-8 -*-
from odoo import models, fields

class SkylineVolunteerTask(models.Model):
    _name = 'skyline.volunteer.task'
    _description = 'Skyline Volunteer Opportunity & Task'
    _order = 'date desc, id desc'

    name = fields.Char(string="Task Title", required=True)
    event_id = fields.Many2one('skyline.event', string="Associated Event")
    assigned_partner_id = fields.Many2one('res.partner', string="Volunteer Student")
    date = fields.Date(string="Date", default=fields.Date.today)
    hours_logged = fields.Float(string="Hours Contributed", default=2.0)
    
    status = fields.Selection([
        ('open', 'Open for Signups'),
        ('assigned', 'Assigned'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled')
    ], string="Task Status", default='open', required=True)
    
    expense_amount = fields.Float(string="Reimbursable Expense (₹)", default=0.0)
    expense_reimbursed = fields.Boolean(string="Reimbursed", default=False)
    notes = fields.Text(string="Task Details")


class SkylineFundraiser(models.Model):
    _name = 'skyline.fundraiser'
    _description = 'Skyline Community Fundraiser'
    _order = 'start_date desc, id desc'

    name = fields.Char(string="Campaign Title", required=True)
    goal_amount = fields.Float(string="Fundraising Goal (₹)", default=50000.0)
    raised_amount = fields.Float(string="Amount Raised (₹)", default=18500.0)
    start_date = fields.Date(string="Start Date", default=fields.Date.today)
    end_date = fields.Date(string="End Date")
    status = fields.Selection([
        ('draft', 'Draft'),
        ('active', 'Active Campaign'),
        ('completed', 'Goal Achieved'),
        ('closed', 'Closed')
    ], string="Campaign Status", default='active')
    description = fields.Text(string="Campaign Mission")
