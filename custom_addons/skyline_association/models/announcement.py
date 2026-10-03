# -*- coding: utf-8 -*-
from odoo import models, fields

class SkylineAnnouncement(models.Model):
    _name = 'skyline.announcement'
    _description = 'Skyline Official Announcement'
    _order = 'date desc, sequence, id desc'

    title = fields.Char(string="Headline", required=True)
    sequence = fields.Integer(string="Sequence", default=10)
    date = fields.Date(string="Date", default=fields.Date.today, required=True)
    date_display = fields.Char(string="Display Date", default="Oct 20, 2024")
    description = fields.Text(string="Content Summary", required=True)
    
    icon = fields.Char(string="FontAwesome Icon", default="bullhorn", help="Icon name without fa-")
    color = fields.Selection([
        ('rose', 'Rose / Pink'),
        ('red', 'Red'),
        ('blue', 'Blue'),
        ('amber', 'Amber / Yellow'),
        ('emerald', 'Emerald / Green'),
        ('indigo', 'Indigo / Purple')
    ], string="Accent Color", default='rose', required=True)
    
    is_published = fields.Boolean(string="Published on Student Portal", default=True)

    def action_publish(self):
        self.write({'is_published': True})

    def action_unpublish(self):
        self.write({'is_published': False})
