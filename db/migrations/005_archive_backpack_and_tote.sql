-- Migration 005: Archive Skyline Campus Backpack and Skyline Canvas Tote Bag from active catalog
-- Preserves all historical records, order items, stock movements, and ledger foreign keys
UPDATE products
SET active = 0
WHERE id IN ('seed-product-backpack', 'seed-product-bag')
   OR name IN ('Skyline Campus Backpack', 'Skyline Canvas Tote Bag');

