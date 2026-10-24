/**
 * CivicFix - Database Layer
 * SQLite storage using Node's built-in node:sqlite DatabaseSync
 * Includes schema setup, migrations, and pre-seeded realistic hackathon demo data
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DB_PATH = path.join(__dirname, 'civicfix.db');

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    initSchema(dbInstance);
  }
  return dbInstance;
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function initSchema(db) {
  // 1. Departments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      description TEXT,
      sla_days INTEGER DEFAULT 7,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Users table (Citizens, Staff, Admin)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('citizen', 'staff', 'admin')),
      department_id INTEGER,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );
  `);

  // 3. Issues table
  db.exec(`
    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Low', 'Medium', 'High', 'Urgent')),
      status TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Reopened')),
      address TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      photo_url TEXT,
      resolution_photo_url TEXT,
      resolution_notes TEXT,
      citizen_name TEXT DEFAULT 'Anonymous Citizen',
      citizen_phone TEXT,
      citizen_email TEXT,
      citizen_id INTEGER,
      department_id INTEGER,
      support_count INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (department_id) REFERENCES departments(id),
      FOREIGN KEY (citizen_id) REFERENCES users(id)
    );
  `);

  // 4. Status History table (Audit trail)
  db.exec(`
    CREATE TABLE IF NOT EXISTS status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      changed_by_name TEXT NOT NULL,
      changed_by_role TEXT NOT NULL DEFAULT 'staff',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
    );
  `);

  // 5. Issue Supports table (Citizen upvotes / consolidation)
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_supports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL,
      supporter_name TEXT,
      supporter_contact TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
    );
  `);

  // Seed default data if empty
  seedInitialData(db);
}

function seedInitialData(db) {
  const deptCount = db.prepare('SELECT COUNT(*) as count FROM departments').get().count;
  if (deptCount === 0) {
    console.log('🌱 Seeding initial departments and users...');
    
    // Insert Departments
    const insertDept = db.prepare(`
      INSERT INTO departments (name, code, email, description, sla_days) 
      VALUES (?, ?, ?, ?, ?)
    `);

    insertDept.run('Roads & Bridges Department', 'ROADS', 'roads@civicfix.gov', 'Potholes, asphalt repair, speed bumps, and bridges', 5);
    insertDept.run('Sanitation & Solid Waste Management', 'WASTE', 'sanitation@civicfix.gov', 'Garbage collection, overflowing dumpsters, street sweep', 3);
    insertDept.run('Electrical & Street Lighting', 'ELEC', 'lighting@civicfix.gov', 'Streetlights, electrical poles, hanging cables', 4);
    insertDept.run('Water Supply & Sewerage Board', 'WATER', 'water@civicfix.gov', 'Pipe leaks, drainage overflows, manhole repairs', 4);
    insertDept.run('Public Parks & Urban Forestry', 'PARKS', 'parks@civicfix.gov', 'Park maintenance, fallen trees, footpath upkeep', 7);

    // Insert Users
    const insertUser = db.prepare(`
      INSERT INTO users (email, password_hash, full_name, role, department_id, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Admin
    insertUser.run('admin@civicfix.gov', hashPassword('admin123'), 'Municipal Commissioner Rao', 'admin', null, '+91 98765 00001');
    
    // Department Staff
    insertUser.run('staff.roads@civicfix.gov', hashPassword('staff123'), 'Inspector Rajesh Sharma (Roads)', 'staff', 1, '+91 98765 00002');
    insertUser.run('staff.waste@civicfix.gov', hashPassword('staff123'), 'Officer Anita Verma (Sanitation)', 'staff', 2, '+91 98765 00003');
    insertUser.run('staff.lighting@civicfix.gov', hashPassword('staff123'), 'Engineer Vikram Patil (Electrical)', 'staff', 3, '+91 98765 00004');
    insertUser.run('staff.water@civicfix.gov', hashPassword('staff123'), 'Engineer Suresh Kumar (Water)', 'staff', 4, '+91 98765 00005');
    
    // Sample Citizen
    insertUser.run('citizen@example.com', hashPassword('citizen123'), 'Priya Sharma (Resident)', 'citizen', null, '+91 98765 11111');
  }

  const issueCount = db.prepare('SELECT COUNT(*) as count FROM issues').get().count;
  if (issueCount === 0) {
    console.log('🌱 Seeding realistic demo issues across categories...');
    seedSampleIssues(db);
  }
}

function seedSampleIssues(db) {
  const insertIssue = db.prepare(`
    INSERT INTO issues (
      tracking_id, title, description, category, priority, status, 
      address, latitude, longitude, photo_url, resolution_photo_url, 
      resolution_notes, citizen_name, citizen_phone, citizen_email, 
      department_id, support_count, created_at, updated_at, resolved_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, 
      ?, ?, ?, ?, ?, 
      ?, ?, ?, ?, 
      ?, ?, ?, ?, ?
    )
  `);

  const insertHistory = db.prepare(`
    INSERT INTO status_history (issue_id, old_status, new_status, changed_by_name, changed_by_role, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Sample Issue 1: Pothole (MG Road) - Demonstrates In Progress
  const res1 = insertIssue.run(
    'CF-2026-10492',
    'Dangerous deep pothole near City Center Mall Entrance',
    'A crater-sized pothole on the right lane directly opposite Gate 2. Causes heavy traffic jams and two two-wheelers skidded yesterday evening.',
    'Potholes & Road Damage',
    'High',
    'In Progress',
    'MG Road, Opp. City Center Mall Gate 2, Central District',
    12.9716, 77.5946,
    'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&auto=format&fit=crop&q=80',
    null,
    null,
    'Arjun Mehta',
    '+91 98450 12345',
    'arjun.m@example.com',
    1, // Roads
    18,
    '2026-10-18 09:30:00',
    '2026-10-21 14:15:00',
    null
  );
  insertHistory.run(res1.lastInsertRowid, null, 'Submitted', 'Arjun Mehta', 'citizen', 'Complaint registered via CivicFix citizen web app.', '2026-10-18 09:30:00');
  insertHistory.run(res1.lastInsertRowid, 'Submitted', 'Under Review', 'System Auto-Router', 'system', 'Complaint verified and initial coordinates confirmed.', '2026-10-18 11:00:00');
  insertHistory.run(res1.lastInsertRowid, 'Under Review', 'Assigned', 'Municipal Desk', 'admin', 'Assigned to Roads & Bridges Department.', '2026-10-19 10:20:00');
  insertHistory.run(res1.lastInsertRowid, 'Assigned', 'In Progress', 'Inspector Rajesh Sharma (Roads)', 'staff', 'Road repair inspection team deployed with cold-mix asphalt.', '2026-10-21 14:15:00');

  // Sample Issue 2: Duplicate Demo Target (Near MG Road Mall)
  // Used to test duplicate detection!
  const res2 = insertIssue.run(
    'CF-2026-10515',
    'Large asphalt crater on main MG Road near Mall signal',
    'Severe road breakage right before the traffic light at the mall intersection. Very hazardous for bikes.',
    'Potholes & Road Damage',
    'High',
    'Under Review',
    'MG Road & 4th Cross Signal, Central District',
    12.9719, 77.5948,
    'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?w=600&auto=format&fit=crop&q=80',
    null,
    null,
    'Kavita Sen',
    '+91 97123 45678',
    'kavita.sen@example.com',
    1,
    7,
    '2026-10-22 11:45:00',
    '2026-10-22 11:45:00',
    null
  );
  insertHistory.run(res2.lastInsertRowid, null, 'Submitted', 'Kavita Sen', 'citizen', 'Complaint filed by citizen.', '2026-10-22 11:45:00');
  insertHistory.run(res2.lastInsertRowid, 'Submitted', 'Under Review', 'Municipal Desk', 'admin', 'Under officer review.', '2026-10-22 14:00:00');

  // Sample Issue 3: Streetlight Failure (Resolved)
  const res3 = insertIssue.run(
    'CF-2026-10280',
    'Multiple non-functional streetlights on Sector 4 Avenue',
    'Three consecutive LED street poles (Poles #41, 42, 43) have been completely dark for over a week, posing safety concerns for pedestrians at night.',
    'Broken Streetlights & Electrical',
    'Medium',
    'Resolved',
    'Sector 4 Main Avenue, Near Community Park, South Zone',
    12.9279, 77.6271,
    'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&auto=format&fit=crop&q=80',
    'Replaced faulty photocell sensors and 3 burnt LED driver units on poles 41-43. All lights tested functional.',
    'Siddharth Roy',
    '+91 98860 99887',
    'siddharth.r@example.com',
    3, // Electrical
    24,
    '2026-10-10 19:10:00',
    '2026-10-13 16:45:00',
    '2026-10-13 16:45:00'
  );
  insertHistory.run(res3.lastInsertRowid, null, 'Submitted', 'Siddharth Roy', 'citizen', 'Complaint registered.', '2026-10-10 19:10:00');
  insertHistory.run(res3.lastInsertRowid, 'Submitted', 'Assigned', 'Municipal Desk', 'admin', 'Routed to Electrical Department.', '2026-10-11 09:15:00');
  insertHistory.run(res3.lastInsertRowid, 'Assigned', 'In Progress', 'Engineer Vikram Patil', 'staff', 'Lineman unit dispatched for replacement parts.', '2026-10-12 11:30:00');
  insertHistory.run(res3.lastInsertRowid, 'In Progress', 'Resolved', 'Engineer Vikram Patil', 'staff', 'Replaced faulty photocell sensors and 3 burnt LED driver units on poles 41-43. All lights tested functional.', '2026-10-13 16:45:00');

  // Sample Issue 4: Overflowing Garbage Bin (Sanitation) - Urgent
  const res4 = insertIssue.run(
    'CF-2026-10588',
    'Overflowing community garbage dump and foul stench',
    'The large green dumpster on 8th Main Market has not been cleared for 4 days. Waste is spilling onto the roadway and stray dogs are scattering litter.',
    'Overflowing Garbage & Sanitation',
    'Urgent',
    'Assigned',
    '8th Main Vegetable Market Road, Jayanagar Block 3',
    12.9304, 77.5838,
    'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600&auto=format&fit=crop&q=80',
    null,
    null,
    'Meera Nambiar',
    '+91 98111 22334',
    'meera.n@example.com',
    2, // Sanitation
    32,
    '2026-10-23 08:20:00',
    '2026-10-23 10:00:00',
    null
  );
  insertHistory.run(res4.lastInsertRowid, null, 'Submitted', 'Meera Nambiar', 'citizen', 'Urgent sanitation complaint filed.', '2026-10-23 08:20:00');
  insertHistory.run(res4.lastInsertRowid, 'Submitted', 'Assigned', 'Municipal Desk', 'admin', 'Assigned to Sanitation & Solid Waste Management with Urgent priority.', '2026-10-23 10:00:00');

  // Sample Issue 5: Water Pipeline Leak (Water Dept) - Overdue
  const res5 = insertIssue.run(
    'CF-2026-10112',
    'Potable drinking water pipeline burst flooding roadway',
    'Clean drinking water is continuously spewing out from a crack in the main underground pipe, causing severe water wastage and flooding the sidewalk.',
    'Drainage & Water Supply Leaks',
    'Urgent',
    'In Progress',
    '15th Cross Road, Near Water Tank, Indiranagar',
    12.9784, 77.6408,
    'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=600&auto=format&fit=crop&q=80',
    null,
    null,
    'Vikramaditya Joshi',
    '+91 94480 55667',
    'vikram.j@example.com',
    4, // Water
    45,
    '2026-10-14 07:15:00',
    '2026-10-16 11:00:00',
    null
  );
  insertHistory.run(res5.lastInsertRowid, null, 'Submitted', 'Vikramaditya Joshi', 'citizen', 'Water leak reported.', '2026-10-14 07:15:00');
  insertHistory.run(res5.lastInsertRowid, 'Submitted', 'Assigned', 'Municipal Desk', 'admin', 'Assigned to Water Supply & Sewerage Board.', '2026-10-14 10:30:00');
  insertHistory.run(res5.lastInsertRowid, 'Assigned', 'In Progress', 'Engineer Suresh Kumar', 'staff', 'Valve shutoff team in field. Digging permit requested.', '2026-10-16 11:00:00');

  // Sample Issue 6: Broken Footpath (Parks/Public Works)
  const res6 = insertIssue.run(
    'CF-2026-10350',
    'Broken concrete pavement slabs and exposed iron rebar',
    'Pedestrian sidewalk pavers are broken with deep gaps. Senior citizens and children frequently trip here. Unsafe for blind pedestrians.',
    'Damaged Footpaths & Walkways',
    'Medium',
    'Submitted',
    'Outer Ring Road, Opp. Metro Pillar 142, Marathahalli',
    12.9562, 77.7011,
    'https://images.unsplash.com/photo-1590059392233-0b0b8c4c7760?w=600&auto=format&fit=crop&q=80',
    null,
    null,
    'Rohit Bansal',
    '+91 99001 23456',
    'rohit.b@example.com',
    5, // Parks / Public Works
    11,
    '2026-10-24 10:00:00',
    '2026-10-24 10:00:00',
    null
  );
  insertHistory.run(res6.lastInsertRowid, null, 'Submitted', 'Rohit Bansal', 'citizen', 'Complaint submitted with photo proof.', '2026-10-24 10:00:00');

  // Sample Issue 7: Fallen Tree Branch in Park (Resolved)
  const res7 = insertIssue.run(
    'CF-2026-10210',
    'Heavy tree branch collapsed blocking jogging track',
    'A huge banyan tree branch snapped during heavy thunderstorm winds and is completely blocking the walking loop in the municipal park.',
    'Parks & Public Facilities',
    'High',
    'Resolved',
    'Rose Garden Park Jogging Track, Central Ward',
    12.9601, 77.5855,
    'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&auto=format&fit=crop&q=80',
    'Horticulture & Forestry team cleared the fallen limb with chainsaws, trimmed hazardous branches, and swept the track clean.',
    'Ananya Sen',
    '+91 98222 33445',
    'ananya.s@example.com',
    5, // Parks
    15,
    '2026-10-08 14:00:00',
    '2026-10-09 17:30:00',
    '2026-10-09 17:30:00'
  );
  insertHistory.run(res7.lastInsertRowid, null, 'Submitted', 'Ananya Sen', 'citizen', 'Reported fallen branch.', '2026-10-08 14:00:00');
  insertHistory.run(res7.lastInsertRowid, 'Submitted', 'Assigned', 'Municipal Desk', 'admin', 'Assigned to Urban Forestry / Parks.', '2026-10-08 16:00:00');
  insertHistory.run(res7.lastInsertRowid, 'Assigned', 'In Progress', 'Urban Forestry Unit', 'staff', 'Heavy equipment brought on site.', '2026-10-09 09:00:00');
  insertHistory.run(res7.lastInsertRowid, 'In Progress', 'Resolved', 'Parks Director', 'staff', 'Horticulture & Forestry team cleared the fallen limb with chainsaws, trimmed hazardous branches, and swept the track clean.', '2026-10-09 17:30:00');

  // Sample Issue 8: Reopened Issue (Roads)
  const res8 = insertIssue.run(
    'CF-2026-10399',
    'Temporary pothole patch washed away after rain on Richmond Road',
    'The road repair done last week was washed away after the first rain. The gravel is loose and cars are throwing stones at pedestrians.',
    'Potholes & Road Damage',
    'High',
    'Reopened',
    'Richmond Road, Near Sacred Heart Church, Richmond Town',
    12.9667, 77.6080,
    'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&auto=format&fit=crop&q=80',
    null,
    null,
    'David Fernandez',
    '+91 97400 66778',
    'david.f@example.com',
    1,
    29,
    '2026-10-15 15:40:00',
    '2026-10-23 18:20:00',
    null
  );
  insertHistory.run(res8.lastInsertRowid, null, 'Submitted', 'David Fernandez', 'citizen', 'Initial complaint.', '2026-10-15 15:40:00');
  insertHistory.run(res8.lastInsertRowid, 'Submitted', 'Resolved', 'Inspector Rajesh Sharma', 'staff', 'Cold-mix applied.', '2026-10-17 12:00:00');
  insertHistory.run(res8.lastInsertRowid, 'Resolved', 'Reopened', 'David Fernandez', 'citizen', 'Temporary patch washed away in thunderstorm. Gravel scattered everywhere. Reopening request approved.', '2026-10-23 18:20:00');
}

module.exports = {
  getDb,
  hashPassword
};
