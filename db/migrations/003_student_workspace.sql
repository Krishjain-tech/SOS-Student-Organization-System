-- Migration 003: Student Workspace Integration
-- Adds support for 'student' role and image URLs for events and products

-- Update user_roles table to allow 'student' role
CREATE TABLE user_roles_new (
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN('admin','volunteer','student')),
  PRIMARY KEY(user_id,role)
);

INSERT INTO user_roles_new SELECT user_id, role FROM user_roles;
DROP TABLE user_roles;
ALTER TABLE user_roles_new RENAME TO user_roles;

-- Add image_url to events for unified visual presentation
ALTER TABLE events ADD COLUMN image_url TEXT NOT NULL DEFAULT '';

-- Add image_url to products for catalog presentation
ALTER TABLE products ADD COLUMN image_url TEXT NOT NULL DEFAULT '';

