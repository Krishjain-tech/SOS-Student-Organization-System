# -*- coding: utf-8 -*-
from odoo import models, fields, api

class SkylineMerchandise(models.Model):
    _name = 'skyline.merch'
    _description = 'Skyline Official Merchandise'
    _order = 'sequence, id'

    name = fields.Char(string="Product Name", required=True)
    sequence = fields.Integer(string="Sequence", default=10)
    price = fields.Float(string="Price (₹)", required=True, default=500.0)
    image_url = fields.Char(string="Image URL", default="/skyline_association/static/src/img/merch_hoodie.png")
    thumbnail_url = fields.Char(string="Thumbnail URL")
    description = fields.Text(string="Description")
    
    has_sizes = fields.Boolean(string="Has Size Variants", default=True)
    size_options = fields.Char(string="Available Variants (comma separated)", default="Size: M,Size: S,Size: L,Size: XL")
    default_size = fields.Char(string="Default Variant", default="Size: M")
    
    stock_qty = fields.Integer(string="In Stock Quantity", default=25)
    is_available = fields.Boolean(string="Available in Stock", compute='_compute_availability', store=True)
    
    category = fields.Selection([
        ('apparel', 'Apparel'),
        ('accessories', 'Accessories'),
        ('lifestyle', 'Lifestyle')
    ], string="Category", default='apparel')

    @api.depends('stock_qty')
    def _compute_availability(self):
        for item in self:
            item.is_available = (item.stock_qty > 0)

    def get_variant_list(self):
        self.ensure_one()
        if not self.has_sizes:
            return [self.default_size or "One Size"]
        return [s.strip() for s in (self.size_options or "").split(',') if s.strip()]
