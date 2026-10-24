/**
 * CivicFix - Smart Public Infrastructure Issue Tracker
 * Complete Full-Stack Web Server (Node.js + SQLite)
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getDb, hashPassword } = require('./database');
const { findPotentialDuplicates } = require('./duplicateDetector');

const PORT = process.env.PORT || 5000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types for static asset serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// In-memory sessions store (token -> user)
const sessions = new Map();

/**
 * Helper to generate unique Tracking ID: CF-YYYY-XXXXX
 */
function generateTrackingId() {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  return `CF-${year}-${randomNum}`;
}

/**
 * Parse incoming JSON request body
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) { // 10MB limit for image data
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send standard JSON response
 */
function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(payload);
}

/**
 * Extract authenticated user from Authorization header
 */
function getAuthUser(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    const token = parts[1];
    return sessions.get(token) || null;
  }
  return null;
}

// Initialize database
const db = getDb();

// Request handler
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  // ==================== REST API ENDPOINTS ====================

  // 1. GET /api/stats - Real Database Calculated Stats
  if (method === 'GET' && pathname === 'api/stats' || (method === 'GET' && pathname === '/api/stats')) {
    try {
      const totalRow = db.prepare('SELECT COUNT(*) as count FROM issues').get();
      const pendingRow = db.prepare("SELECT COUNT(*) as count FROM issues WHERE status IN ('Submitted', 'Under Review')").get();
      const inProgressRow = db.prepare("SELECT COUNT(*) as count FROM issues WHERE status IN ('Assigned', 'In Progress')").get();
      const resolvedRow = db.prepare("SELECT COUNT(*) as count FROM issues WHERE status = 'Resolved'").get();
      const reopenedRow = db.prepare("SELECT COUNT(*) as count FROM issues WHERE status = 'Reopened'").get();
      
      // Overdue issues: status not Resolved and created > 7 days ago
      const overdueRow = db.prepare(`
        SELECT COUNT(*) as count FROM issues 
        WHERE status != 'Resolved' AND datetime(created_at) < datetime('now', '-7 days')
      `).get();

      // Average resolution time in days
      const avgTimeRow = db.prepare(`
        SELECT AVG(julianday(resolved_at) - julianday(created_at)) as avg_days
        FROM issues
        WHERE status = 'Resolved' AND resolved_at IS NOT NULL
      `).get();

      const total = totalRow.count;
      const resolved = resolvedRow.count;
      const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
      const avgResolutionDays = avgTimeRow.avg_days ? Number(avgTimeRow.avg_days.toFixed(1)) : 2.5;

      return sendJson(res, 200, {
        totalIssues: total,
        pendingIssues: pendingRow.count,
        inProgressIssues: inProgressRow.count,
        resolvedIssues: resolved,
        reopenedIssues: reopenedRow.count,
        overdueIssues: overdueRow.count,
        resolutionRate,
        avgResolutionDays
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
      return sendJson(res, 500, { error: 'Failed to compute platform stats' });
    }
  }

  // 2. GET /api/issues - List with Search & Filtering
  if (method === 'GET' && pathname === '/api/issues') {
    try {
      const category = parsedUrl.searchParams.get('category');
      const status = parsedUrl.searchParams.get('status');
      const departmentId = parsedUrl.searchParams.get('departmentId');
      const priority = parsedUrl.searchParams.get('priority');
      const query = parsedUrl.searchParams.get('q');
      const sort = parsedUrl.searchParams.get('sort') || 'newest';

      let sql = `
        SELECT i.*, d.name as department_name, d.code as department_code
        FROM issues i
        LEFT JOIN departments d ON i.department_id = d.id
        WHERE 1=1
      `;
      const params = [];

      if (category && category !== 'All') {
        sql += ' AND i.category = ?';
        params.push(category);
      }
      if (status && status !== 'All') {
        sql += ' AND i.status = ?';
        params.push(status);
      }
      if (departmentId && departmentId !== 'All') {
        sql += ' AND i.department_id = ?';
        params.push(Number(departmentId));
      }
      if (priority && priority !== 'All') {
        sql += ' AND i.priority = ?';
        params.push(priority);
      }
      if (query && query.trim()) {
        sql += ' AND (i.title LIKE ? OR i.description LIKE ? OR i.address LIKE ? OR i.tracking_id LIKE ?)';
        const term = `%${query.trim()}%`;
        params.push(term, term, term, term);
      }

      // Sorting
      if (sort === 'oldest') {
        sql += ' ORDER BY i.created_at ASC';
      } else if (sort === 'most_supported') {
        sql += ' ORDER BY i.support_count DESC, i.created_at DESC';
      } else if (sort === 'priority') {
        sql += ` ORDER BY CASE i.priority 
                  WHEN 'Urgent' THEN 1 
                  WHEN 'High' THEN 2 
                  WHEN 'Medium' THEN 3 
                  WHEN 'Low' THEN 4 
                  ELSE 5 END, i.created_at DESC`;
      } else {
        sql += ' ORDER BY i.created_at DESC';
      }

      const issues = db.prepare(sql).all(...params);
      return sendJson(res, 200, { issues });
    } catch (err) {
      console.error('Error fetching issues:', err);
      return sendJson(res, 500, { error: 'Failed to query issues' });
    }
  }

  // 3. GET /api/issues/track/:trackingId - Citizen Tracking
  if (method === 'GET' && pathname.startsWith('/api/issues/track/')) {
    try {
      const trackingId = decodeURIComponent(pathname.replace('/api/issues/track/', '')).trim();
      const issue = db.prepare(`
        SELECT i.*, d.name as department_name, d.code as department_code, d.email as department_email
        FROM issues i
        LEFT JOIN departments d ON i.department_id = d.id
        WHERE UPPER(i.tracking_id) = UPPER(?)
      `).get(trackingId);

      if (!issue) {
        return sendJson(res, 404, { error: `No complaint found with Tracking ID: ${trackingId}` });
      }

      // Fetch audit status history
      const history = db.prepare(`
        SELECT * FROM status_history
        WHERE issue_id = ?
        ORDER BY created_at ASC
      `).all(issue.id);

      return sendJson(res, 200, { issue, history });
    } catch (err) {
      console.error('Error tracking issue:', err);
      return sendJson(res, 500, { error: 'Error retrieving tracking details' });
    }
  }

  // 4. GET /api/issues/:id - Single Issue Detail with History
  if (method === 'GET' && pathname.startsWith('/api/issues/') && !pathname.includes('check-duplicates') && !pathname.includes('track')) {
    try {
      const id = Number(pathname.replace('/api/issues/', ''));
      if (!id) return sendJson(res, 400, { error: 'Invalid issue ID' });

      const issue = db.prepare(`
        SELECT i.*, d.name as department_name, d.code as department_code, d.email as department_email
        FROM issues i
        LEFT JOIN departments d ON i.department_id = d.id
        WHERE i.id = ?
      `).get(id);

      if (!issue) return sendJson(res, 404, { error: 'Issue not found' });

      const history = db.prepare(`
        SELECT * FROM status_history
        WHERE issue_id = ?
        ORDER BY created_at ASC
      `).all(id);

      return sendJson(res, 200, { issue, history });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to fetch issue details' });
    }
  }

  // 5. POST /api/issues/check-duplicates - Smart Duplicate Detection
  if (method === 'POST' && pathname === '/api/issues/check-duplicates') {
    try {
      const data = await parseJsonBody(req);
      const { title, description, category, latitude, longitude } = data;

      if (!latitude || !longitude) {
        return sendJson(res, 200, { potentialDuplicates: [], count: 0 });
      }

      const duplicates = findPotentialDuplicates(db, {
        title: title || '',
        description: description || '',
        category: category || '',
        latitude: Number(latitude),
        longitude: Number(longitude)
      });

      return sendJson(res, 200, {
        hasDuplicates: duplicates.length > 0,
        count: duplicates.length,
        potentialDuplicates: duplicates
      });
    } catch (err) {
      console.error('Duplicate detection error:', err);
      return sendJson(res, 500, { error: 'Duplicate detection failed' });
    }
  }

  // 6. POST /api/issues - Submit New Complaint
  if (method === 'POST' && pathname === '/api/issues') {
    try {
      const body = await parseJsonBody(req);
      const {
        title,
        description,
        category,
        priority = 'Medium',
        address,
        latitude,
        longitude,
        photoUrl = null,
        citizenName = 'Anonymous Citizen',
        citizenPhone = '',
        citizenEmail = ''
      } = body;

      // Validation
      if (!title || !title.trim()) return sendJson(res, 400, { error: 'Issue title is required' });
      if (!description || !description.trim()) return sendJson(res, 400, { error: 'Description is required' });
      if (!category) return sendJson(res, 400, { error: 'Category is required' });
      if (!address || !address.trim()) return sendJson(res, 400, { error: 'Address/location is required' });
      if (latitude === undefined || longitude === undefined) {
        return sendJson(res, 400, { error: 'GPS coordinates (latitude/longitude) are required' });
      }

      // Auto-assign department based on category
      let defaultDeptId = 1; // Roads by default
      if (category.includes('Pothole') || category.includes('Road')) defaultDeptId = 1;
      else if (category.includes('Garbage') || category.includes('Sanitation')) defaultDeptId = 2;
      else if (category.includes('Streetlight') || category.includes('Electrical')) defaultDeptId = 3;
      else if (category.includes('Drainage') || category.includes('Water')) defaultDeptId = 4;
      else if (category.includes('Park') || category.includes('Footpath')) defaultDeptId = 5;

      const trackingId = generateTrackingId();

      const insertStmt = db.prepare(`
        INSERT INTO issues (
          tracking_id, title, description, category, priority, status,
          address, latitude, longitude, photo_url, citizen_name,
          citizen_phone, citizen_email, department_id, support_count
        ) VALUES (
          ?, ?, ?, ?, ?, 'Submitted',
          ?, ?, ?, ?, ?,
          ?, ?, ?, 1
        )
      `);

      const result = insertStmt.run(
        trackingId,
        title.trim(),
        description.trim(),
        category,
        priority,
        address.trim(),
        Number(latitude),
        Number(longitude),
        photoUrl,
        citizenName.trim() || 'Anonymous Citizen',
        citizenPhone.trim(),
        citizenEmail.trim(),
        defaultDeptId
      );

      const issueId = result.lastInsertRowid;

      // Create initial status history entry
      db.prepare(`
        INSERT INTO status_history (issue_id, old_status, new_status, changed_by_name, changed_by_role, notes)
        VALUES (?, NULL, 'Submitted', ?, 'citizen', 'Citizen submitted new infrastructure complaint.')
      `).run(issueId, citizenName.trim() || 'Citizen');

      return sendJson(res, 201, {
        success: true,
        issueId,
        trackingId,
        message: 'Complaint submitted successfully!'
      });
    } catch (err) {
      console.error('Error creating issue:', err);
      return sendJson(res, 500, { error: 'Failed to create issue' });
    }
  }

  // 7. POST /api/issues/:id/support - Support / Upvote Existing Issue
  if (method === 'POST' && pathname.match(/^\/api\/issues\/(\d+)\/support$/)) {
    try {
      const match = pathname.match(/^\/api\/issues\/(\d+)\/support$/);
      const issueId = Number(match[1]);
      const body = await parseJsonBody(req);
      const supporterName = body.supporterName || 'Community Supporter';
      const supporterContact = body.supporterContact || '';
      const ipAddress = req.socket.remoteAddress || '127.0.0.1';

      // Increment support count
      db.prepare('UPDATE issues SET support_count = support_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(issueId);

      // Record support
      db.prepare(`
        INSERT INTO issue_supports (issue_id, supporter_name, supporter_contact, ip_address)
        VALUES (?, ?, ?, ?)
      `).run(issueId, supporterName, supporterContact, ipAddress);

      const updated = db.prepare('SELECT support_count, tracking_id FROM issues WHERE id = ?').get(issueId);

      return sendJson(res, 200, {
        success: true,
        issueId,
        trackingId: updated.tracking_id,
        newSupportCount: updated.support_count,
        message: 'Thank you for supporting this issue! City officers prioritize complaints with higher citizen impact.'
      });
    } catch (err) {
      console.error('Error supporting issue:', err);
      return sendJson(res, 500, { error: 'Failed to record support' });
    }
  }

  // 8. PATCH /api/issues/:id/status - Staff / Admin Update Status, Priority, Department
  if (method === 'PATCH' && pathname.match(/^\/api\/issues\/(\d+)\/status$/)) {
    try {
      const match = pathname.match(/^\/api\/issues\/(\d+)\/status$/);
      const issueId = Number(match[1]);
      const body = await parseJsonBody(req);
      const {
        status: newStatus,
        priority: newPriority,
        departmentId: newDeptId,
        resolutionNotes,
        resolutionPhotoUrl,
        notes: staffNotes,
        changedByName = 'Municipal Staff'
      } = body;

      const current = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId);
      if (!current) return sendJson(res, 404, { error: 'Issue not found' });

      // Requirement: Mandatory resolution notes before marking resolved!
      if (newStatus === 'Resolved') {
        if (!resolutionNotes || !resolutionNotes.trim()) {
          return sendJson(res, 400, {
            error: 'Resolution notes are strictly required before marking an issue as Resolved.'
          });
        }
      }

      const statusToSet = newStatus || current.status;
      const priorityToSet = newPriority || current.priority;
      const deptToSet = newDeptId !== undefined ? Number(newDeptId) : current.department_id;
      const notesToSet = resolutionNotes || current.resolution_notes;
      const resPhotoToSet = resolutionPhotoUrl || current.resolution_photo_url;
      const resolvedAtToSet = statusToSet === 'Resolved' ? new Date().toISOString() : (statusToSet === 'Reopened' ? null : current.resolved_at);

      db.prepare(`
        UPDATE issues SET
          status = ?,
          priority = ?,
          department_id = ?,
          resolution_notes = ?,
          resolution_photo_url = ?,
          resolved_at = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(statusToSet, priorityToSet, deptToSet, notesToSet, resPhotoToSet, resolvedAtToSet, issueId);

      // Record in status_history if status changed or notes provided
      const changeNote = staffNotes || resolutionNotes || `Status updated from ${current.status} to ${statusToSet}`;
      db.prepare(`
        INSERT INTO status_history (issue_id, old_status, new_status, changed_by_name, changed_by_role, notes)
        VALUES (?, ?, ?, ?, 'staff', ?)
      `).run(issueId, current.status, statusToSet, changedByName, changeNote);

      return sendJson(res, 200, {
        success: true,
        message: `Issue updated successfully to ${statusToSet}`,
        issueId,
        newStatus: statusToSet
      });
    } catch (err) {
      console.error('Error updating status:', err);
      return sendJson(res, 500, { error: 'Failed to update issue status' });
    }
  }

  // 9. GET /api/departments - Municipal Departments List
  if (method === 'GET' && pathname === '/api/departments') {
    try {
      const departments = db.prepare(`
        SELECT d.*, 
          COUNT(i.id) as total_issues,
          SUM(CASE WHEN i.status = 'Resolved' THEN 1 ELSE 0 END) as resolved_issues,
          SUM(CASE WHEN i.status != 'Resolved' THEN 1 ELSE 0 END) as active_issues
        FROM departments d
        LEFT JOIN issues i ON d.id = i.department_id
        GROUP BY d.id
        ORDER BY d.name ASC
      `).all();
      return sendJson(res, 200, { departments });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to fetch departments' });
    }
  }

  // 10. POST /api/auth/login - Role-Based Login
  if (method === 'POST' && pathname === '/api/auth/login') {
    try {
      const { email, password } = await parseJsonBody(req);
      if (!email || !password) {
        return sendJson(res, 400, { error: 'Email and password are required' });
      }

      const user = db.prepare(`
        SELECT u.id, u.email, u.full_name, u.role, u.department_id, u.phone, d.name as department_name
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.id
        WHERE LOWER(u.email) = LOWER(?) AND u.password_hash = ?
      `).get(email.trim(), hashPassword(password));

      if (!user) {
        return sendJson(res, 401, { error: 'Invalid email or password' });
      }

      // Generate random session token
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, user);

      return sendJson(res, 200, {
        success: true,
        token,
        user
      });
    } catch (err) {
      console.error('Login error:', err);
      return sendJson(res, 500, { error: 'Authentication failed' });
    }
  }

  // 11. GET /api/auth/me - Current User
  if (method === 'GET' && pathname === '/api/auth/me') {
    const user = getAuthUser(req);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    return sendJson(res, 200, { user });
  }

  // 12. GET /api/analytics - Comprehensive Live Data for Chart.js
  if (method === 'GET' && pathname === '/api/analytics') {
    try {
      // Category Breakdown
      const byCategory = db.prepare(`
        SELECT category, COUNT(*) as count 
        FROM issues 
        GROUP BY category 
        ORDER BY count DESC
      `).all();

      // Status Breakdown
      const byStatus = db.prepare(`
        SELECT status, COUNT(*) as count 
        FROM issues 
        GROUP BY status
      `).all();

      // Monthly trends (last 6 months)
      const monthlyTrends = db.prepare(`
        SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count,
               SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved_count
        FROM issues
        GROUP BY month
        ORDER BY month ASC
      `).all();

      // Department Workloads
      const departmentWorkload = db.prepare(`
        SELECT d.name as department, 
               COUNT(i.id) as total,
               SUM(CASE WHEN i.status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
               SUM(CASE WHEN i.status IN ('Assigned', 'In Progress') THEN 1 ELSE 0 END) as in_progress,
               SUM(CASE WHEN i.status IN ('Submitted', 'Under Review') THEN 1 ELSE 0 END) as pending
        FROM departments d
        LEFT JOIN issues i ON d.id = i.department_id
        GROUP BY d.id
      `).all();

      // Avg resolution time by category (in days)
      const avgByCategory = db.prepare(`
        SELECT category, 
               ROUND(AVG(julianday(resolved_at) - julianday(created_at)), 1) as avg_days
        FROM issues
        WHERE status = 'Resolved' AND resolved_at IS NOT NULL
        GROUP BY category
      `).all();

      return sendJson(res, 200, {
        byCategory,
        byStatus,
        monthlyTrends,
        departmentWorkload,
        avgByCategory
      });
    } catch (err) {
      console.error('Analytics error:', err);
      return sendJson(res, 500, { error: 'Failed to generate analytics' });
    }
  }

  // 13. POST /api/chatbot - CivicBot AI Assistant & Voice Q&A
  if (method === 'POST' && pathname === '/api/chatbot') {
    try {
      const { message, language = 'en' } = await parseJsonBody(req);
      if (!message || !message.trim()) {
        return sendJson(res, 400, { error: 'Message cannot be empty' });
      }

      const lower = message.toLowerCase();

      // Check if message references a tracking ID (e.g., CF-2026-10492 or similar)
      const trackingMatch = message.match(/CF-\d{4}-\d{4,6}/i);
      if (trackingMatch) {
        const trackingId = trackingMatch[0].toUpperCase();
        const found = db.prepare(`
          SELECT i.*, d.name as department_name 
          FROM issues i 
          LEFT JOIN departments d ON i.department_id = d.id 
          WHERE UPPER(i.tracking_id) = ?
        `).get(trackingId);

        if (found) {
          return sendJson(res, 200, {
            reply: `Here is the current status of complaint **${found.tracking_id}**:\n\n` +
                   `• **Title:** ${found.title}\n` +
                   `• **Status:** ${found.status.toUpperCase()}\n` +
                   `• **Category:** ${found.category}\n` +
                   `• **Assigned Department:** ${found.department_name || 'Under Review'}\n` +
                   `• **Location:** ${found.address}\n` +
                   `• **Citizen Support:** ${found.support_count} supporters\n\n` +
                   (found.resolution_notes ? `• **Resolution Notes:** ${found.resolution_notes}\n` : '') +
                   `You can track the full progress timeline by typing this ID in the "Track Complaint" search bar!`,
            trackingCard: found
          });
        } else {
          return sendJson(res, 200, {
            reply: `I could not locate any complaint with Tracking ID **${trackingId}**. Please double-check the 5-digit number or register a new issue.`
          });
        }
      }

      // Civic knowledge rules & Q&A
      let reply = '';

      if (lower.includes('pothole') || lower.includes('road') || lower.includes('crater')) {
        reply = `To report a **Pothole or Road Damage**:\n` +
                `1. Click the "**Report an Issue**" button on the top menu.\n` +
                `2. Select "**Potholes & Road Damage**" as category.\n` +
                `3. Upload a clear photograph showing the pothole and surrounding landmark.\n` +
                `4. Pin the exact location on our Leaflet map or tap "**Use My Location**".\n\n` +
                `CivicFix automatically checks if nearby residents have already flagged it. If so, you can upvote it with 1 click!`;
      } else if (lower.includes('garbage') || lower.includes('waste') || lower.includes('trash') || lower.includes('dumpster')) {
        reply = `For **Overflowing Garbage or Waste Complaints**:\n` +
                `• Sanitation Dept operates daily collection routes from 6:30 AM to 1:00 PM.\n` +
                `• If your community dumpster has not been cleared for over 24 hours, file a report under "**Overflowing Garbage & Sanitation**".\n` +
                `• Urgent sanitation requests have a municipal target SLA of 3 days.`;
      } else if (lower.includes('streetlight') || lower.includes('light') || lower.includes('dark') || lower.includes('bulb')) {
        reply = `For **Broken Streetlights & Electrical Poles**:\n` +
                `• Report under category "**Broken Streetlights & Electrical**".\n` +
                `• Note down the pole number if stamped on the metal pole (e.g. Pole #42) in the description for faster field dispatch.\n` +
                `• Standard turnaround time for bulb & driver replacement is 4 business days.`;
      } else if (lower.includes('water') || lower.includes('drain') || lower.includes('sewage') || lower.includes('leak')) {
        reply = `For **Water Pipeline Leaks or Drainage Blockages**:\n` +
                `• Immediate emergency water shutoff hotline: **1800-425-9898** (Toll-Free).\n` +
                `• File a ticket under "**Drainage & Water Supply Leaks**" with exact street coordinates so the excavation team can isolate valves.`;
      } else if (lower.includes('duplicate') || lower.includes('similar')) {
        reply = `**How CivicFix Duplicate Detection Works:**\n` +
                `• When you submit a complaint, our smart algorithm checks within a 250-meter radius using the Haversine formula.\n` +
                `• It compares keywords in the title and description.\n` +
                `• If another citizen already reported the same issue, you can simply **Upvote** the existing report instead of creating duplicate paperwork. This raises its priority for municipal crews!`;
      } else if (lower.includes('emergency') || lower.includes('helpline') || lower.includes('contact')) {
        reply = `**Municipal Emergency Helplines:**\n` +
                `• City Central Control Room: **1912**\n` +
                `• Emergency Disaster Relief: **1077**\n` +
                `• Water Supply & Sewerage: **1800-425-9898**\n` +
                `• Fire & Rescue: **101**\n` +
                `• Ambulance: **108**`;
      } else if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
        reply = `Hello! I am **CivicBot**, your AI municipal assistant. I can help you report civic issues (potholes, streetlights, garbage, water leaks), look up complaint status by tracking ID, or connect with emergency services. How can I help you today?`;
      } else {
        reply = `Thank you for reaching out to CivicFix. You can ask me how to report specific infrastructure problems (roads, streetlights, sanitation, water), check existing complaints by providing a tracking ID (e.g. CF-2026-10492), or view municipal department contacts.`;
      }

      return sendJson(res, 200, { reply });
    } catch (err) {
      console.error('Chatbot error:', err);
      return sendJson(res, 500, { error: 'CivicBot encountered an error' });
    }
  }

  // ==================== STATIC FILE SERVING ====================

  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security: prevent path traversal out of PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // If HTML file without extension
      const htmlPath = filePath + '.html';
      if (fs.existsSync(htmlPath)) {
        filePath = htmlPath;
      } else {
        // Fallback to index.html for SPA routing
        filePath = path.join(PUBLIC_DIR, 'index.html');
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=3600'
      });
      res.end(content);
    });
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` CivicFix - Smart Public Infrastructure Issue Tracker `);
  console.log(`=======================================================`);
  console.log(` Server running at: http://localhost:${PORT}`);
  console.log(` Public Portal:     http://localhost:${PORT}/`);
  console.log(` Staff Dashboard:   http://localhost:${PORT}/staff.html`);
  console.log(` Analytics:         http://localhost:${PORT}/analytics.html`);
  console.log(` Ready for hackathon evaluation!`);
  console.log(`=======================================================`);
});
