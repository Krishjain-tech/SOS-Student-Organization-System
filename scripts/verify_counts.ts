import { getDb, closeDb } from '../apps/api/src/db/index.js';

const db = getDb();
const scalar = (sql: string): any => ((db.prepare(sql).get() as Record<string, any>) || {})['n'];

const totalUsers = scalar('SELECT COUNT(*) n FROM users');
const totalVolunteers = scalar("SELECT COUNT(*) n FROM user_roles WHERE role='volunteer'");
const totalMembers = scalar('SELECT COUNT(*) n FROM member_records');
const totalTicketedMembers = scalar('SELECT COUNT(DISTINCT member_id) n FROM tickets WHERE member_id IS NOT NULL');
const unticketedMembers = db.prepare('SELECT id, name FROM member_records WHERE id NOT IN (SELECT DISTINCT member_id FROM tickets WHERE member_id IS NOT NULL) ORDER BY id').all() as Array<{ id: string; name: string }>;

console.log('=== DEMO DATABASE COUNTS ===');
console.log('Total Users:', totalUsers);
console.log('Total Volunteers:', totalVolunteers);
console.log('Total Members:', totalMembers);
console.log('Total Distinct Ticketed Members:', totalTicketedMembers);
console.log('Unticketed Members Count:', unticketedMembers.length);
console.log('Unticketed Members:', unticketedMembers.map((m: { id: string; name: string }) => `${m.id} (${m.name})`));

const events = db.prepare('SELECT id, title, capacity, seats_sold, (SELECT COUNT(*) FROM tickets WHERE event_id=events.id) issued FROM events').all() as Array<{ id: string; title: string; capacity: number; seats_sold: number; issued: number }>;
console.log('\n=== EVENT CAPACITIES & TICKETS ===');
events.forEach((e: { id: string; title: string; capacity: number; seats_sold: number; issued: number }) => console.log(`${e.title} -> Capacity: ${e.capacity}, Seats Sold: ${e.seats_sold}, Issued: ${e.issued}`));

const products = db.prepare('SELECT id, name, active FROM products').all() as Array<{ id: string; name: string; active: number }>;
console.log('\n=== MERCHANDISE PRODUCTS ===');
products.forEach((p: { id: string; name: string; active: number }) => console.log(`${p.name} -> Active: ${p.active}`));

closeDb();
 