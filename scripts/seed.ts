import 'dotenv/config';
import argon2 from 'argon2';
import { DateTime } from 'luxon';
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, migrateDb, closeDb, databasePath } from '../apps/api/src/db/index.js';

export const DEMO_PASSWORD = 'SkylineDemo!2026';
export const SEED_IDS = {
  admin: 'seed-admin',
  krish: 'seed-volunteer-1',
  student: 'seed-student-1',
  gala: 'seed-event-gala',
  techfest: 'seed-event-techfest',
  robotics: 'seed-event-robotics',
  fundraiser: 'seed-event-bake',
  stationery: 'seed-claim-stationery',
  printing: 'seed-claim-printing',
  supplies: 'seed-claim-supplies',
  unpaidMember: 'seed-member-101',
  lastItem: 'seed-variant-hoodie-XL',
  checkinTicket: 'seed-ticket-tech-2'
};

const VOLUNTEER_NAMES = [
  'Krish Mehta', 'Aanya Rao', 'Dev Shah', 'Mira Sen', 'Rohan Das',
  'Leela Nair', 'Ishan Roy', 'Tara Kapoor', 'Arjun Bose', 'Nisha Jain',
  'Kabir Sharma', 'Ananya Iyer', 'Siddharth Verma', 'Pooja Patel', 'Aditya Gupta',
  'Diya Joshi', 'Vikram Malhotra', 'Sneha Kulkarni', 'Rahul Nair', 'Tanvi Bhatia',
  'Rithvik Reddy', 'Maya Menon', 'Karan Chawla', 'Neha Deshmukh', 'Sameer Khan',
  'Riya Singhal', 'Yash Mehta', 'Shreya Pillai', 'Aman Saxena', 'Meera Nambiar',
  'Pranav Hegde', 'Anika Sengupta', 'Varun Aggarwal', 'Shruti Pandey', 'Kunal Bajaj',
  'Simran Gill', 'Nikhil Shenoy', 'Ritu Raghavan', 'Tarun Prasad', 'Divya Sundaram',
  'Harsh Vardhan', 'Swati Kulkarni', 'Gaurav Seth', 'Priya Nambisan', 'Alok Mishra',
  'Lavanya Swaminathan', 'Mayank Mittal', 'Parul Chauhan', 'Dhruv Trivedi', 'Sonia Abraham'
];

const STUDENT_NAMES = [
  'Aditi Sen', 'Manish Rao', 'Kavya Murthy', 'Aryan Kapoor', 'Sanjana Chawla',
  'Rohan Varma', 'Ananya Deshmukh', 'Karthik Pillai', 'Pooja Hegde', 'Varun Nair',
  'Ishita Ghosh', 'Naveen Kumar', 'Sneha Reddy', 'Aditya Menon', 'Meera Joshi',
  'Gautam Singhania', 'Bhavna Sharma', 'Prateek Jain', 'Rhea Chakraborty', 'Akash Sundaram',
  'Divya Nambiar', 'Siddharth Roy', 'Tara Bhattacharya', 'Harish Chandra', 'Neha Saxena',
  'Abhishek Sengupta', 'Tanya Bajaj', 'Vishal Trivedi', 'Deepika Goyal', 'Sameer Kulkarni',
  'Shalini Tiwari', 'Kunal Merchant', 'Shruti Iyer', 'Nikhil Agarwal', 'Ritu Seth',
  'Rajat Chopra', 'Pallavi Das', 'Vikas Oberoi', 'Anjali Pandey', 'Karan Mathur',
  'Swati Mahajan', 'Chirag Bhatia', 'Priyanka Kaul', 'Rohit Narang', 'Monika Suri',
  'Mayank Chadha', 'Radhika Mittal', 'Sanjay Dutt', 'Natasha Grover', 'Vivek Singhal',
  'Sunita Ahuja', 'Tarun Mehta', 'Payal Anand', 'Arunava Sen', 'Sumanth Rao',
  'Shweta Ganguly', 'Deepak Parekh', 'Simran Batra', 'Ashwin Raman', 'Lavanya Srinivas',
  'Devendra Shukla', 'Garima Mishra', 'Manoj Bajpai', 'Jyoti Bansal', 'Rakesh Jhunjhun',
  'Komal Somani', 'Anand Mahindra', 'Preeti Somani', 'Hemant Birla', 'Aarti Mittal',
  'Suresh Prabhu', 'Vandana Luthra', 'Rajesh Hamal', 'Sapna Bhavnani', 'Alok Nath',
  'Smriti Irani', 'Raghav Chadha', 'Richa Sharma', 'Uday Kotak', 'Amrita Pritam',
  'Sachin Tendulkar', 'Sania Mirza', 'Sunil Gavaskar', 'Mithali Raj', 'Rahul Dravid',
  'Mary Kom', 'Pullela Gopichand', 'Saina Nehwal', 'Anil Kumble', 'Geeta Phogat',
  'Kapil Dev', 'Babita Kumari', 'Sourav Ganguly', 'Dutee Chand', 'VVS Laxman',
  'Hima Das', 'Javagal Srinath', 'Deepa Malik', 'Harbhajan Singh', 'Avani Lekhara',
  'Zaheer Khan', 'Bhavina Patel', 'Yuvraj Singh', 'Manika Batra', 'Gautam Gambhir',
  'Mirabai Chanu', 'Virender Sehwag', 'Lovlina Borgohain', 'Ajinkya Rahane', 'P. V. Sindhu',
  'Cheteshwar Pujara', 'Sakshi Malik', 'Ravindra Jadeja', 'Saikhom Mirabai', 'Ishant Sharma',
  'Deepika Kumari', 'Umesh Yadav', 'Manu Bhaker', 'Mohammed Shami', 'Yashaswini Deswal',
  'Jasprit Bumrah', 'Elavenil Valarivan', 'Rishabh Pant', 'Apurvi Chandela', 'Shubman Gill',
  'Mehuli Ghosh', 'Prithvi Shaw', 'Anjum Moudgil', 'Mayank Agarwal', 'Heena Sidhu',
  'Hanuma Vihari', 'Rahi Sarnobat', 'Shardul Thakur', 'Manu Attri', 'Axar Patel',
  'Ashwini Ponnappa', 'Washington Sundar', 'Sikki Reddy', 'Mohammed Siraj'
];

function fixturePdf(description: string, amount: number, reference: string): Buffer {
  const escaped = (text: string) => text.replace(/[\\()]/g, '\\$&');
  const content = `BT /F1 18 Tf 54 760 Td (FICTIONAL DEMO RECEIPT) Tj /F1 11 Tf 0 -34 Td (Skyline sample supplier - example.com) Tj 0 -25 Td (${escaped(description)}) Tj 0 -25 Td (Amount: INR ${(amount / 100).toFixed(2)}) Tj 0 -25 Td (Reference: ${escaped(reference)}) Tj 0 -40 Td (Synthetic test fixture. No real purchase or payment.) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  for (let index = 0; index < objects.length; index++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export async function seedDemo() {
  migrateDb(); const db = getDb();
  if ((db.prepare('SELECT demo_mode FROM organization_settings WHERE id=1').get() as any).demo_mode !== 1 || process.env.NODE_ENV === 'production' || process.env.DEMO_MODE === 'false') throw new Error('Demo seed is disabled for non-demo or production databases.');
  if (db.prepare("SELECT 1 FROM audit_logs WHERE action='seed.demo'").get()) return { seeded: false, reason: 'Demo already seeded; no records changed.' };
  if ((db.prepare('SELECT COUNT(*) count FROM users').get() as any).count > 0) throw new Error('Refusing to mix demo seed with an existing unmarked database.');
  const ref = process.env.SEED_REFERENCE_DATE ? DateTime.fromISO(process.env.SEED_REFERENCE_DATE, { zone: 'Asia/Kolkata' }) : DateTime.now().setZone('Asia/Kolkata').startOf('day');
  if (!ref.isValid || !/^\d{4}-\d{2}-\d{2}$/.test(ref.toISODate()!)) throw new Error('SEED_REFERENCE_DATE must be a valid YYYY-MM-DD.');
  const timestamp = (days: number, hour = 12) => ref.plus({ days }).set({ hour, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO()!;
  const date = (days: number) => ref.plus({ days }).toISODate()!;
  const created = timestamp(-40); const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id }); const receiptDir = resolve(process.env.UPLOAD_DIR || './data/receipts'); mkdirSync(receiptDir, { recursive: true }); const written: string[] = [];
  function payment(sourceType: string, sourceId: string, amount: number, direction: string, category: string, description: string, event: string | null, days: number, claim: string | null = null) {
    const paymentId = `seed-payment-${sourceId}`;
    db.prepare('INSERT INTO payments(id,source_type,source_id,amount_paise,method,reference,settlement_kind,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(paymentId, sourceType, sourceId, amount, sourceType === 'dues' ? 'upi' : 'cash', `FICTIONAL-${sourceId}`, 'mock', SEED_IDS.admin, timestamp(days));
    if (amount > 0) {
      db.prepare('INSERT INTO ledger_entries(id,direction,amount_paise,category,description,event_id,payment_id,claim_id,actor_id,occurred_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(`seed-ledger-${sourceId}`, direction, amount, category, description, event, paymentId, claim, SEED_IDS.admin, timestamp(days), timestamp(days));
    }
    return paymentId;
  }
  try { db.transaction(() => {
    // 1. Admin user
    db.prepare('INSERT INTO users(id,email,name,password_hash,created_at,updated_at,email_verified_at) VALUES(?,?,?,?,?,?,?)').run(SEED_IDS.admin, 'admin@skyline.example.com', 'Alex Morgan', passwordHash, created, created, created);
    db.prepare('INSERT INTO user_roles VALUES(?,?)').run(SEED_IDS.admin, 'admin');

    // 2. 50 Volunteers
    for (let i = 1; i <= 50; i++) {
      const user = `seed-volunteer-${i}`;
      const email = i === 1 ? 'krish@skyline.example.com' : `volunteer${i}@example.com`;
      db.prepare('INSERT INTO users(id,email,name,password_hash,created_at,updated_at,email_verified_at) VALUES(?,?,?,?,?,?,?)').run(user, email, VOLUNTEER_NAMES[i - 1], passwordHash, created, created, created);
      db.prepare('INSERT INTO user_roles VALUES(?,?)').run(user, 'volunteer');
    }

    // 3. Student demo user
    db.prepare('INSERT INTO users(id,email,name,phone,password_hash,created_at,updated_at,email_verified_at) VALUES(?,?,?,?,?,?,?,?)').run(SEED_IDS.student, 'student@skyline.example.com', 'Aarav Patel', '+91 98765 43210', passwordHash, created, created, created);
    db.prepare('INSERT INTO user_roles VALUES(?,?)').run(SEED_IDS.student, 'student');

    // 4. 150 Member records (1..10 volunteers, 11 student, 12..150 general members)
    const allMemberNames: string[] = [];
    const allMemberEmails: string[] = [];
    for (let i = 1; i <= 150; i++) {
      const member = `seed-member-${i}`;
      const term = `seed-term-${i}`;
      const paid = (i <= 30) || (i >= 51 && i <= 120);
      const expired = (i >= 41 && i <= 50) || (i >= 121);
      const expiringSoon = (i >= 26 && i <= 30) || (i >= 115 && i <= 120);
      const start = expired ? -370 : -120;
      const end = expired ? -5 : expiringSoon ? 10 : 180;
      const linkedUser = i <= 10 ? `seed-volunteer-${i}` : i === 11 ? SEED_IDS.student : null;
      const name = i <= 10 ? VOLUNTEER_NAMES[i - 1] : i === 11 ? 'Aarav Patel' : STUDENT_NAMES[i - 12];
      const email = i === 1 ? 'krish@skyline.example.com' : i <= 10 ? `volunteer${i}@example.com` : i === 11 ? 'student@skyline.example.com' : `member${i}@example.com`;
      allMemberNames.push(name);
      allMemberEmails.push(email);

      db.prepare('INSERT INTO member_records(id,user_id,name,email,student_number,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(member, linkedUser, name, email, `DEMO-${String(i).padStart(3, '0')}`, created, created);
      db.prepare('INSERT INTO membership_terms(id,member_id,starts_on,ends_on,dues_paise,status,created_at) VALUES(?,?,?,?,?,?,?)').run(term, member, date(start), date(end), 150000, paid ? 'PAID' : 'UNPAID', created);
      if (paid) {
        const duesId = `seed-dues-${i}`;
        db.prepare('INSERT INTO dues_payments(id,term_id,amount_paise,created_at) VALUES(?,?,?,?)').run(duesId, term, 150000, timestamp(-35));
        const paymentId = payment('dues', duesId, 150000, 'IN', 'membership', `Annual dues - ${name}`, null, -35);
        db.prepare('UPDATE dues_payments SET payment_id=? WHERE id=?').run(paymentId, duesId);
      }
    }

    // 5. Events
    const events = [
      [SEED_IDS.gala, 'Spring Gala', 'EVENT', 14, 200, 50000, 70000, 4000000, 8, '/images/event_spring_gala.png'],
      [SEED_IDS.techfest, 'TechFest', 'EVENT', 0, 100, 80000, 100000, 5000000, 6, '/images/event_tech_talk.png'],
      [SEED_IDS.robotics, 'Robotics Workshop', 'EVENT', -10, 40, 40000, 50000, 1200000, 4, '/images/event_cultural_fest.png'],
      [SEED_IDS.fundraiser, 'Bake Sale Fundraiser', 'FUNDRAISER', 5, 200, 0, 0, 500000, 5, '/images/event_sports_night.png']
    ];
    for (const [eventId, title, type, days, capacity, memberPrice, price, budget, requirement, imageUrl] of events) {
      db.prepare("INSERT INTO events(id,title,type,description,image_url,start_at,end_at,location,capacity,member_price_paise,nonmember_price_paise,budget_paise,volunteer_requirement,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'PUBLISHED',?,?)").run(eventId, title, type, `Fictional ${title} administrative demo`, imageUrl, timestamp(Number(days), 18), timestamp(Number(days), 22), 'Skyline Campus Hall', capacity, memberPrice, price, budget, requirement, created, created);
    }

    // 6. Availability Requests & Responses
    for (const eventId of [SEED_IDS.gala, SEED_IDS.techfest, SEED_IDS.fundraiser]) {
      db.prepare('INSERT INTO availability_requests(id,event_id,requested_by,deadline_at,created_at) VALUES(?,?,?,?,?)').run(`seed-request-${eventId}`, eventId, SEED_IDS.admin, timestamp(3), created);
    }
    for (let i = 1; i <= 20; i++) {
      db.prepare('INSERT INTO volunteer_availability(id,event_id,user_id,response,updated_at) VALUES(?,?,?,?,?)').run(`seed-avail-gala-${i}`, SEED_IDS.gala, `seed-volunteer-${i}`, i % 5 === 0 ? 'UNAVAILABLE' : 'AVAILABLE', timestamp(-1));
    }
    for (let i = 1; i <= 15; i++) {
      db.prepare('INSERT INTO volunteer_availability(id,event_id,user_id,response,updated_at) VALUES(?,?,?,?,?)').run(`seed-avail-tech-${i}`, SEED_IDS.techfest, `seed-volunteer-${i}`, i % 4 === 0 ? 'UNAVAILABLE' : 'AVAILABLE', timestamp(-1));
    }
    for (let i = 15; i <= 30; i++) {
      db.prepare('INSERT INTO volunteer_availability(id,event_id,user_id,response,updated_at) VALUES(?,?,?,?,?)').run(`seed-avail-bake-${i}`, SEED_IDS.fundraiser, `seed-volunteer-${i}`, i % 6 === 0 ? 'UNAVAILABLE' : 'AVAILABLE', timestamp(-1));
    }

    // 7. Event Assignments
    const galaAssignments = [
      [1, 'Logistics', 0], [2, 'Registration', 1], [3, 'Registration', 0], [4, 'Stage Coordinator', 0],
      [5, 'Usher Lead', 0], [6, 'Hospitality', 0], [7, 'Safety Officer', 0], [8, 'Decor Lead', 0]
    ] as const;
    for (const [vId, role, checkin] of galaAssignments) {
      db.prepare('INSERT INTO event_assignments(id,event_id,user_id,role_label,can_check_in,assigned_by,created_at) VALUES(?,?,?,?,?,?,?)').run(`seed-assign-gala-${vId}`, SEED_IDS.gala, `seed-volunteer-${vId}`, role, checkin, SEED_IDS.admin, created);
    }

    const techAssignments = [
      [1, 'Tech Lead', 1], [9, 'Registration Desk', 1], [10, 'Stage Manager', 0],
      [11, 'Logistics Lead', 0], [12, 'AV Support', 0], [13, 'Crowd Management', 0]
    ] as const;
    for (const [vId, role, checkin] of techAssignments) {
      db.prepare('INSERT INTO event_assignments(id,event_id,user_id,role_label,can_check_in,assigned_by,created_at) VALUES(?,?,?,?,?,?,?)').run(`seed-assign-tech-${vId}`, SEED_IDS.techfest, `seed-volunteer-${vId}`, role, checkin, SEED_IDS.admin, created);
    }

    const roboticsAssignments = [
      [14, 'Workshop Coordinator', 1], [15, 'Equipment Handler', 0], [16, 'Kit Manager', 0], [17, 'Lab Assistant', 0]
    ] as const;
    for (const [vId, role, checkin] of roboticsAssignments) {
      db.prepare('INSERT INTO event_assignments(id,event_id,user_id,role_label,can_check_in,assigned_by,created_at) VALUES(?,?,?,?,?,?,?)').run(`seed-assign-robotics-${vId}`, SEED_IDS.robotics, `seed-volunteer-${vId}`, role, checkin, SEED_IDS.admin, created);
    }

    const bakeAssignments = [
      [18, 'Stall Manager', 1], [19, 'Cashier & POS', 0], [20, 'Packaging & Delivery', 0], [21, 'Queue Marshall', 0], [22, 'Signage & Info Desk', 0]
    ] as const;
    for (const [vId, role, checkin] of bakeAssignments) {
      db.prepare('INSERT INTO event_assignments(id,event_id,user_id,role_label,can_check_in,assigned_by,created_at) VALUES(?,?,?,?,?,?,?)').run(`seed-assign-bake-${vId}`, SEED_IDS.fundraiser, `seed-volunteer-${vId}`, role, checkin, SEED_IDS.admin, created);
    }

    // 8. 18 Tasks across events and volunteers
    const tasks = [
      ['supplies', 'Prepare welcome kits', 1, SEED_IDS.gala, 0, 'ASSIGNED', 150000],
      ['printing', 'Print event badges', 1, SEED_IDS.techfest, 0, 'IN_PROGRESS', 100000],
      ['stationery', 'Arrange stationery', 1, SEED_IDS.gala, -1, 'ASSIGNED', 150000],
      ['completed', 'Count supply boxes', 1, SEED_IDS.techfest, -2, 'COMPLETED', 50000],
      ['cancelled', 'Book old room', 1, SEED_IDS.robotics, -5, 'CANCELLED', 0],
      ['stage', 'Check stage equipment', 2, SEED_IDS.gala, 4, 'ASSIGNED', 200000],
      ['promotion', 'Send volunteer briefing', 3, SEED_IDS.gala, 2, 'IN_PROGRESS', 0],
      ['robotics', 'Prepare workshop tables', 4, SEED_IDS.robotics, -11, 'COMPLETED', 100000],
      ['catering', 'Coordinate snacks and coffee', 5, SEED_IDS.gala, 3, 'ASSIGNED', 250000],
      ['badges', 'Assemble name tags and lanyards', 6, SEED_IDS.techfest, -1, 'COMPLETED', 120000],
      ['av', 'Test microphone and projection systems', 7, SEED_IDS.techfest, 0, 'IN_PROGRESS', 80000],
      ['signage', 'Place banner stands at entrance', 8, SEED_IDS.gala, 1, 'ASSIGNED', 60000],
      ['bake-prep', 'Organize food safety compliance', 18, SEED_IDS.fundraiser, 2, 'IN_PROGRESS', 50000],
      ['kits', 'Inventory sensor kits', 14, SEED_IDS.robotics, -8, 'COMPLETED', 150000],
      ['photography', 'Schedule event photographers', 9, SEED_IDS.gala, 5, 'ASSIGNED', 100000],
      ['parking', 'Coordinate campus parking permits', 10, SEED_IDS.techfest, 1, 'ASSIGNED', 40000],
      ['cleanup', 'Manage post-workshop cleanup', 16, SEED_IDS.robotics, -9, 'COMPLETED', 30000],
      ['survey', 'Draft post-event feedback survey', 11, SEED_IDS.techfest, 2, 'ASSIGNED', 0]
    ];
    for (const [suffix, title, user, event, days, status, budget] of tasks) {
      db.prepare('INSERT INTO tasks(id,title,instructions,assignee_id,event_id,due_at,budget_paise,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(`seed-task-${suffix}`, title, 'Coordinate with the event lead. Record expenses with fictional receipts.', `seed-volunteer-${user}`, event, timestamp(Number(days), 20), budget, status, SEED_IDS.admin, created, created);
    }

    // 9. Tickets: 140 distinct ticketed members, 10 unticketed (141..150)
    // A) TechFest (75 tickets, members 1..75)
    for (let i = 1; i <= 75; i++) {
      const ticketId = `seed-ticket-tech-${i}`;
      const status = i === 1 ? 'USED' : i === 3 ? 'CANCELLED' : 'VALID';
      db.prepare('INSERT INTO tickets(id,event_id,member_id,owner_user_id,buyer_name,buyer_email,code,price_paise,status,checked_in_at,checked_in_by,refund_status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        ticketId, SEED_IDS.techfest, `seed-member-${i}`, i === 11 ? SEED_IDS.student : null,
        i === 11 ? 'Aarav Patel' : allMemberNames[i - 1], allMemberEmails[i - 1],
        `SKY-TECH-${String(i).padStart(3, '0')}`, 80000, status,
        status === 'USED' ? timestamp(-14) : null, status === 'USED' ? SEED_IDS.admin : null,
        status === 'CANCELLED' ? 'UNRESOLVED' : 'NONE', timestamp(-15)
      );
      const paymentId = payment('ticket', ticketId, 80000, 'IN', 'tickets', `TechFest ticket ${i}`, SEED_IDS.techfest, -15);
      db.prepare('UPDATE tickets SET payment_id=? WHERE id=?').run(paymentId, ticketId);
    }
    db.prepare('UPDATE events SET seats_sold=? WHERE id=?').run(75, SEED_IDS.techfest);

    // B) Spring Gala (90 tickets, members 31..120)
    for (let j = 1; j <= 90; j++) {
      const memberIdx = 30 + j; // 31..120
      const ticketId = `seed-ticket-gala-${j}`;
      db.prepare('INSERT INTO tickets(id,event_id,member_id,owner_user_id,buyer_name,buyer_email,code,price_paise,status,checked_in_at,checked_in_by,refund_status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        ticketId, SEED_IDS.gala, `seed-member-${memberIdx}`, null,
        allMemberNames[memberIdx - 1], allMemberEmails[memberIdx - 1],
        `SKY-GALA-${String(j).padStart(3, '0')}`, 50000, 'VALID',
        null, null, 'NONE', timestamp(-14)
      );
      const paymentId = payment('ticket', ticketId, 50000, 'IN', 'tickets', `Spring Gala ticket ${j}`, SEED_IDS.gala, -14);
      db.prepare('UPDATE tickets SET payment_id=? WHERE id=?').run(paymentId, ticketId);
    }
    db.prepare('UPDATE events SET seats_sold=? WHERE id=?').run(90, SEED_IDS.gala);

    // C) Robotics Workshop (25 tickets, members 70..94)
    for (let j = 1; j <= 25; j++) {
      const memberIdx = 69 + j; // 70..94
      const ticketId = `seed-ticket-robotics-${j}`;
      db.prepare('INSERT INTO tickets(id,event_id,member_id,owner_user_id,buyer_name,buyer_email,code,price_paise,status,checked_in_at,checked_in_by,refund_status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        ticketId, SEED_IDS.robotics, `seed-member-${memberIdx}`, null,
        allMemberNames[memberIdx - 1], allMemberEmails[memberIdx - 1],
        `SKY-ROBOTICS-${String(j).padStart(3, '0')}`, 40000, 'VALID',
        null, null, 'NONE', timestamp(-12)
      );
      const paymentId = payment('ticket', ticketId, 40000, 'IN', 'tickets', `Robotics Workshop ticket ${j}`, SEED_IDS.robotics, -12);
      db.prepare('UPDATE tickets SET payment_id=? WHERE id=?').run(paymentId, ticketId);
    }
    db.prepare('UPDATE events SET seats_sold=? WHERE id=?').run(25, SEED_IDS.robotics);

    // D) Bake Sale Fundraiser (46 tickets, members 95..140, free event: ₹0)
    for (let j = 1; j <= 46; j++) {
      const memberIdx = 94 + j; // 95..140
      const ticketId = `seed-ticket-bake-${j}`;
      db.prepare('INSERT INTO tickets(id,event_id,member_id,owner_user_id,buyer_name,buyer_email,code,price_paise,status,checked_in_at,checked_in_by,refund_status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        ticketId, SEED_IDS.fundraiser, `seed-member-${memberIdx}`, null,
        allMemberNames[memberIdx - 1], allMemberEmails[memberIdx - 1],
        `SKY-BAKE-${String(j).padStart(3, '0')}`, 0, 'VALID',
        null, null, 'NONE', timestamp(-10)
      );
      const paymentId = payment('ticket', ticketId, 0, 'IN', 'tickets', `Bake Sale Fundraiser ticket ${j}`, SEED_IDS.fundraiser, -10);
      db.prepare('UPDATE tickets SET payment_id=? WHERE id=?').run(paymentId, ticketId);
    }
    db.prepare('UPDATE events SET seats_sold=? WHERE id=?').run(46, SEED_IDS.fundraiser);

    // 10. Merchandise Products & Variants
    const initialProducts: Array<[string, string, string, number, number, string, number, Array<{ size: string; stock: number; id?: string }>]> = [
      ['hoodie', 'Skyline Hoodie', 'Fictional Skyline merchandise', 100000, 90000, '/images/merch_hoodie.png', 1, ['S', 'M', 'L', 'XL'].map(size => ({ size, stock: 30, id: `seed-variant-hoodie-${size}` }))],
      ['shirt', 'Skyline T-shirt', 'Fictional Skyline merchandise', 50000, 45000, '/images/merch_tshirt.png', 1, ['S', 'M', 'L', 'XL'].map(size => ({ size, stock: 30, id: `seed-variant-shirt-${size}` }))],
      ['cap', 'Skyline Classic Cap', 'Structured cotton twill cap with embroidered club crest', 35000, 30000, '/images/merch_cap.png', 1, [{ size: 'Navy', stock: 25 }, { size: 'White', stock: 20 }, { size: 'Black', stock: 18 }, { size: 'Maroon', stock: 15 }]],
      ['bag', 'Skyline Canvas Tote Bag', 'Heavyweight organic cotton canvas tote with reinforced handles', 40000, 35000, '/images/merch_tote.png', 0, [{ size: 'Natural', stock: 35 }, { size: 'Navy Blue', stock: 28 }, { size: 'Olive', stock: 22 }, { size: 'Black', stock: 20 }]],
      ['backpack', 'Skyline Campus Backpack', 'Water-resistant daily campus backpack with padded laptop sleeve', 120000, 105000, '/images/merch_tote.png', 0, [{ size: 'Midnight Black', stock: 15 }, { size: 'Slate Grey', stock: 12 }, { size: 'Navy', stock: 10 }]],
      ['bottle', 'Skyline Thermal Water Bottle', 'Double-wall vacuum-insulated stainless steel flask keeps drinks cold 24h / hot 12h', 65000, 55000, '/images/merch_bottle.png', 1, [{ size: '500ml Matte Blue', stock: 30 }, { size: '500ml Silver', stock: 25 }, { size: '750ml Matte Black', stock: 20 }, { size: '750ml Olive', stock: 18 }]],
    ];
    for (const [product, name, desc, price, memberPrice, imageUrl, active, variants] of initialProducts) {
      db.prepare('INSERT INTO products(id,name,description,image_url,price_paise,member_price_paise,active,created_at) VALUES(?,?,?,?,?,?,?,?)').run(`seed-product-${product}`, name, desc, imageUrl, price, memberPrice, active, created);
      for (const v of variants) {
        const variantId = v.id || `seed-variant-${product}-${v.size.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        db.prepare('INSERT INTO product_variants(id,product_id,size,stock) VALUES(?,?,?,?)').run(variantId, `seed-product-${product}`, v.size, v.stock);
        db.prepare('INSERT INTO stock_movements(id,variant_id,quantity,reason,actor_id,created_at) VALUES(?,?,?,?,?,?)').run(`seed-stock-${variantId}`, variantId, v.stock, 'Fictional opening stock', SEED_IDS.admin, created);
      }
    }

    // 11. Merchandise Orders & Stock Deductions (21 orders, total 3,100,000 paise)
    for (let i = 1; i <= 21; i++) {
      const product = i <= 10 ? 'hoodie' : 'shirt';
      const price = product === 'hoodie' ? 100000 : 50000;
      const variant = `seed-variant-${product}-${['S', 'M', 'L', 'XL'][(i - 1) % 4]}`;
      const order = `seed-order-${i}`;
      db.prepare('INSERT INTO orders(id,buyer_name,total_paise,collected,created_at) VALUES(?,?,?,?,?)').run(order, `Fictional Counter Buyer ${i}`, 2 * price, i % 3 === 0 ? 0 : 1, timestamp(-8));
      db.prepare('INSERT INTO order_items(id,order_id,variant_id,quantity,unit_price_paise) VALUES(?,?,?,?,?)').run(`seed-line-${i}`, order, variant, 2, price);
      db.prepare('UPDATE product_variants SET stock=stock-2 WHERE id=?').run(variant);
      db.prepare('INSERT INTO stock_movements(id,variant_id,quantity,reason,order_id,actor_id,created_at) VALUES(?,?,?,?,?,?,?)').run(`seed-stock-sale-${i}`, variant, -2, 'Fictional counter sale', order, SEED_IDS.admin, timestamp(-8));
      const paymentId = payment('order', order, 2 * price, 'IN', 'merchandise', 'Fictional merchandise sale', null, -8);
      db.prepare('UPDATE orders SET payment_id=? WHERE id=?').run(paymentId, order);
    }
    for (const [variant, target] of [['seed-variant-hoodie-XL', 1], ['seed-variant-shirt-M', 2], ['seed-variant-shirt-XL', 0]] as const) {
      const stock = (db.prepare('SELECT stock FROM product_variants WHERE id=?').get(variant) as any).stock;
      db.prepare('UPDATE product_variants SET stock=? WHERE id=?').run(target, variant);
      db.prepare('INSERT INTO stock_movements(id,variant_id,quantity,reason,actor_id,created_at) VALUES(?,?,?,?,?,?)').run(`seed-stock-adjust-${variant}`, variant, target - stock, 'Fictional stock count correction', SEED_IDS.admin, timestamp(-7));
    }

    // 12. Direct Financial Records (5 fundraiser donations = 1,250,000 paise; 3 direct expenses = 4,600,000 paise)
    const direct = [
      ['fundraiser-1', 250000, 'IN', 'fundraiser'],
      ['fundraiser-2', 250000, 'IN', 'fundraiser'],
      ['fundraiser-3', 250000, 'IN', 'fundraiser'],
      ['fundraiser-4', 250000, 'IN', 'fundraiser'],
      ['fundraiser-5', 250000, 'IN', 'fundraiser'],
      ['venue', 2000000, 'OUT', 'venue'],
      ['catering', 1600000, 'OUT', 'catering'],
      ['equipment', 1000000, 'OUT', 'equipment']
    ];
    for (const [suffix, amount, direction, category] of direct) {
      const record = `seed-direct-${suffix}`;
      const event = direction === 'IN' ? SEED_IDS.fundraiser : SEED_IDS.techfest;
      const description = `Fictional ${suffix} ${direction === 'IN' ? 'receipt' : 'payment'}`;
      db.prepare('INSERT INTO direct_financial_records(id,direction,amount_paise,category,description,event_id,actor_id,occurred_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(record, direction, amount, category, description, event, SEED_IDS.admin, timestamp(-3), timestamp(-3));
      payment('direct', record, Number(amount), String(direction), String(category), description, event, -3);
    }

    // 13. Expense Claims & Realistic Receipt PDFs
    const claims = [
      ['stationery', 1, 'Stationery', 118700, 'SUBMITTED', ''],
      ['printing', 1, 'Printing', 65000, 'APPROVED_UNPAID', 'Approved; awaiting recorded payment.'],
      ['supplies', 1, 'Supplies', 42000, 'PAID', 'Fictional reimbursement settled.'],
      ['travel', 2, 'Volunteer travel', 775000, 'APPROVED_UNPAID', 'Approved; awaiting recorded payment.'],
      ['signage', 3, 'Event signage', 198000, 'PAID', 'Approved.'],
      ['decor', 4, 'Stage decorations', 600000, 'PAID', 'Approved.'],
      ['materials', 5, 'Workshop materials', 800000, 'PAID', 'Approved.'],
      ['draft', 1, 'Refreshments draft', 32000, 'DRAFT', ''],
      ['correction', 2, 'Taxi fare', 75000, 'CHANGES_REQUESTED', 'Please clarify the event link and attach the itemized receipt.'],
      ['rejected', 3, 'Personal supplies', 21000, 'REJECTED', 'Outside the approved event purpose.'],
      ['pending', 6, 'Volunteer badges', 200000, 'SUBMITTED', '']
    ];
    for (const [suffix, user, description, amount, status, note] of claims) {
      const claim = `seed-claim-${suffix}`;
      const task = ['stationery', 'printing', 'supplies'].includes(String(suffix)) ? `seed-task-${suffix}` : null;
      const claimEvent = suffix === 'printing' ? SEED_IDS.techfest : SEED_IDS.gala;
      db.prepare('INSERT INTO expense_claims(id,user_id,event_id,task_id,description,category,amount_paise,status,review_note,created_at,updated_at,submitted_at,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(claim, `seed-volunteer-${user}`, claimEvent, task, description, 'supplies', amount, status, note, timestamp(-4), timestamp(-2), status === 'DRAFT' ? null : timestamp(-3), ['APPROVED_UNPAID', 'PAID'].includes(String(status)) ? timestamp(-2) : null);
      const fixture = fixturePdf(String(description), Number(amount), claim);
      const storedName = `${claim}-fictional.pdf`;
      const fullPath = resolve(receiptDir, storedName);
      writeFileSync(fullPath, fixture);
      written.push(fullPath);
      db.prepare('INSERT INTO receipt_files(id,claim_id,stored_name,original_name,mime_type,size_bytes,created_at) VALUES(?,?,?,?,?,?,?)').run(`seed-receipt-${suffix}`, claim, storedName, `FICTIONAL-${suffix}-receipt.pdf`, 'application/pdf', fixture.length, timestamp(-4));
      if (status === 'PAID') {
        const paymentId = payment('claim', claim, Number(amount), 'OUT', 'supplies', String(description), SEED_IDS.gala, -2, claim);
        db.prepare('UPDATE expense_claims SET payment_id=?,paid_at=? WHERE id=?').run(paymentId, timestamp(-2), claim);
      }
    }

    // 14. Announcements & Notifications for 50 Volunteers
    for (const [suffix, title, audience, status] of [['welcome', 'Volunteer briefing for Spring Gala', 'volunteers', 'PUBLISHED'], ['renewal', 'Membership renewal desk', 'all', 'PUBLISHED'], ['draft', 'Bake sale preparation note', 'volunteers', 'DRAFT']] as const) {
      const announcement = `seed-announcement-${suffix}`;
      db.prepare('INSERT INTO announcements(id,title,body,audience,status,published_at,created_at,actor_id) VALUES(?,?,?,?,?,?,?,?)').run(announcement, title, 'Fictional Skyline notice: coordinate with leadership and check your assigned tasks.', audience, status, status === 'PUBLISHED' ? timestamp(-1) : null, timestamp(-2), SEED_IDS.admin);
      if (status === 'PUBLISHED') {
        for (let i = 1; i <= 50; i++) {
          db.prepare('INSERT INTO notifications(id,user_id,announcement_id,read_at,created_at) VALUES(?,?,?,?,?)').run(`seed-notification-${suffix}-${i}`, `seed-volunteer-${i}`, announcement, i === 2 ? timestamp(-1) : null, timestamp(-1));
        }
      }
    }

    // 15. Mock Outbox
    for (const [suffix, status, attempts, failure] of [['queued', 'QUEUED', 0, 0], ['delivered', 'DELIVERED', 1, 0], ['failed', 'FAILED', 1, 1]] as const) {
      db.prepare('INSERT INTO mock_email_outbox(id,recipient_email,subject,body,status,attempts,simulate_failure,dedupe_key,error,created_at,delivered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(`seed-outbox-${suffix}`, `fictional-${suffix}@example.com`, 'MOCK DELIVERY - volunteer briefing', 'FICTIONAL preview only. No real email is sent.', status, attempts, failure, `seed-message-${suffix}`, failure ? 'Simulated failure' : null, timestamp(-1), status === 'DELIVERED' ? timestamp(-1) : null);
    }

    // 16. Audit Log Seed Marker
    db.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)').run('seed-demo-marker', SEED_IDS.admin, 'seed.demo', 'database', 'demo', JSON.stringify({ reference_date: date(0), fictional: true }), timestamp(0));
  }).immediate(); } catch (error) { for (const path of written) if (existsSync(path)) unlinkSync(path); throw error; }
  return { seeded: true, reference_date: date(0), admin_email: 'admin@skyline.example.com', volunteer_email: 'krish@skyline.example.com', student_email: 'student@skyline.example.com' };
}

export function resetDemo() {
  migrateDb(); const db = getDb();
  const demo = (db.prepare('SELECT demo_mode FROM organization_settings WHERE id=1').get() as any).demo_mode;
  if (process.env.NODE_ENV === 'production' || process.env.DEMO_MODE === 'false' || demo !== 1 || !db.prepare("SELECT 1 FROM audit_logs WHERE action='seed.demo'").get()) throw new Error('Reset requires an explicitly seeded, isolated demo database. Stop the server first.');
  const filename = resolve(databasePath()); if (!/\.(sqlite|sqlite3|db)$/.test(filename) || filename === resolve('.')) throw new Error('Reset target must be an explicit SQLite database file.');
  const receipts = db.prepare('SELECT stored_name FROM receipt_files').all() as any[];
  closeDb();
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(filename + suffix)) unlinkSync(filename + suffix);
  const receiptDir = resolve(process.env.UPLOAD_DIR || './data/receipts'); for (const receipt of receipts) if (basename(receipt.stored_name) === receipt.stored_name) { const file = resolve(receiptDir, receipt.stored_name); if (existsSync(file)) unlinkSync(file); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--reset-demo')) resetDemo();
  seedDemo().then(result => { console.log(JSON.stringify(result, null, 2)); closeDb(); }).catch(error => { console.error(error.message); closeDb(); process.exitCode = 1; });
}
