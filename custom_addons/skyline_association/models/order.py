# -*- coding: utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import UserError

class SkylineOrder(models.Model):
    _name = 'skyline.order'
    _description = 'Student Merchandise Order'
    _order = 'date_order desc, id desc'

    name = fields.Char(string="Order Reference", required=True, copy=False)
    partner_id = fields.Many2one('res.partner', string="Student / Customer", required=True, ondelete='cascade')
    date_order = fields.Datetime(string="Order Date", default=fields.Datetime.now, required=True)
    
    line_ids = fields.One2many('skyline.order.line', 'order_id', string="Order Items")
    amount_total = fields.Float(string="Total Amount (₹)", compute='_compute_amount_total', store=True)
    
    status = fields.Selection([
        ('cart', 'In Cart'),
        ('processing', 'Processing'),
        ('confirmed', 'Confirmed'),
        ('delivered', 'Delivered'),
        ('cancelled', 'Cancelled')
    ], string="Order Status", default='processing', required=True)
    
    payment_status = fields.Selection([
        ('paid', 'Paid'),
        ('pending', 'Pending')
    ], string="Payment Status", default='paid')

    # Quick display fields for Stitch Sidebar UI
    primary_product_name = fields.Char(string="Product Name", compute='_compute_primary_item', store=True)
    primary_variant = fields.Char(string="Variant Info", compute='_compute_primary_item', store=True)
    primary_quantity = fields.Integer(string="Item Quantity", compute='_compute_primary_item', store=True)
    primary_price = fields.Float(string="Item Price", compute='_compute_primary_item', store=True)
    primary_thumbnail = fields.Char(string="Item Thumbnail", compute='_compute_primary_item', store=True)

    @api.depends('line_ids', 'line_ids.price_subtotal')
    def _compute_amount_total(self):
        for order in self:
            order.amount_total = sum(order.line_ids.mapped('price_subtotal'))

    @api.depends('line_ids', 'line_ids.product_id', 'line_ids.quantity', 'line_ids.variant', 'line_ids.price_unit')
    def _compute_primary_item(self):
        for order in self:
            if order.line_ids:
                first = order.line_ids[0]
                order.primary_product_name = first.product_id.name
                order.primary_variant = first.variant or "Standard"
                order.primary_quantity = first.quantity
                order.primary_price = first.price_unit
                order.primary_thumbnail = first.product_id.thumbnail_url or first.product_id.image_url
            else:
                order.primary_product_name = "Merchandise Order"
                order.primary_variant = ""
                order.primary_quantity = 0
                order.primary_price = 0.0
                order.primary_thumbnail = "/skyline_association/static/src/img/merch_hoodie.png"

    def action_mark_delivered(self):
        self.write({'status': 'delivered'})

    def action_mark_confirmed(self):
        self.write({'status': 'confirmed'})


class SkylineOrderLine(models.Model):
    _name = 'skyline.order.line'
    _description = 'Merchandise Order Item Line'

    order_id = fields.Many2one('skyline.order', string="Order", required=True, ondelete='cascade')
    product_id = fields.Many2one('skyline.merch', string="Product", required=True)
    variant = fields.Char(string="Selected Size / Variant", default="Size: M")
    quantity = fields.Integer(string="Quantity", default=1)
    price_unit = fields.Float(string="Unit Price (₹)")
    price_subtotal = fields.Float(string="Subtotal (₹)", compute='_compute_subtotal', store=True)

    @api.depends('quantity', 'price_unit')
    def _compute_subtotal(self):
        for line in self:
            line.price_subtotal = line.quantity * line.price_unit
