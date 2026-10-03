# -*- coding: utf-8 -*-
{
    'name': 'Skyline Student Association',
    'version': '1.0',
    'summary': 'Digital Operating Platform for Skyline Student Association',
    'description': """
Skyline Student Association Operating Platform:
- Member & Membership Management
- Event Ticketing, Pricing & Check-In
- Merchandise Catalog, Inventory & Orders
- Announcements
- Volunteer Tasks & Fundraisers
- Student Portal (Faithfully reproducing Stitch visual design)
    """,
    'category': 'Association',
    'author': 'Skyline Lead Engineering Team',
    'depends': ['base', 'web'],
    'data': [
        'security/security.xml',
        'security/ir.model.access.csv',
        'data/demo_data.xml',
        'views/membership_views.xml',
        'views/event_views.xml',
        'views/ticket_views.xml',
        'views/merchandise_views.xml',
        'views/order_views.xml',
        'views/announcement_views.xml',
        'views/volunteer_views.xml',
        'views/partner_views.xml',
        'views/menus.xml',
        'views/portal_templates.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
