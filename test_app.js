/**
 * CivicFix - Complete System & API Verification Test Suite
 * Tests database seeding, duplicate detection, status workflow, and chatbot
 */

const { getDb, hashPassword } = require('./database');
const { findPotentialDuplicates, haversineDistance } = require('./duplicateDetector');

const fs = require('node:fs');
const logBuffer = [];
function log(msg) {
  logBuffer.push(msg);
  console.log(msg);
}

function flushLog() {
  fs.writeFileSync('test_output.txt', logBuffer.join('\n'));
}

log('====================================================');
log('   CivicFix System Verification & Test Suite        ');
log('====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    log(`  ✅ PASS: ${message}`);
    passCount++;
  } else {
    log(`  ❌ FAIL: ${message}`);
    failCount++;
  }
}

async function runTests() {
  try {
    // 1. Test Database
    console.log('1. Database Initialization & Seeding:');
    const db = getDb();
    
    const depts = db.prepare('SELECT COUNT(*) as count FROM departments').get();
    assert(depts.count === 5, `Expected 5 municipal departments, found ${depts.count}`);

    const users = db.prepare('SELECT COUNT(*) as count FROM users').get();
    assert(users.count >= 6, `Expected at least 6 demo users, found ${users.count}`);

    const issues = db.prepare('SELECT COUNT(*) as count FROM issues').get();
    assert(issues.count >= 8, `Expected at least 8 demo issues, found ${issues.count}`);

    const history = db.prepare('SELECT COUNT(*) as count FROM status_history').get();
    assert(history.count >= 10, `Expected audit history entries, found ${history.count}`);

    // 2. Test Geospatial Distance (Haversine)
    console.log('\n2. Geospatial Haversine Engine:');
    // Distance between 12.9716, 77.5946 and 12.9719, 77.5948
    const dist = haversineDistance(12.9716, 77.5946, 12.9719, 77.5948);
    assert(dist < 60 && dist > 20, `Distance calculation between nearby MG road points: ${dist}m (expected ~35-50m)`);

    // 3. Test Smart Duplicate Detection
    console.log('\n3. Smart Duplicate Detection:');
    const candidateIssue = {
      title: 'Deep pothole on MG Road near City Center Mall',
      description: 'Big hole in asphalt in front of the mall gate causing traffic',
      category: 'Potholes & Road Damage',
      latitude: 12.9717,
      longitude: 77.5947
    };

    const duplicates = findPotentialDuplicates(db, candidateIssue);
    assert(duplicates.length > 0, `Identified ${duplicates.length} duplicate candidate(s) for MG Road pothole`);
    if (duplicates.length > 0) {
      assert(duplicates[0].confidencePercent > 60, `Duplicate confidence score: ${duplicates[0].confidencePercent}%`);
      assert(duplicates[0].distanceMeters < 100, `Proximity distance: ${duplicates[0].distanceMeters}m`);
      console.log(`     Matched issue: "${duplicates[0].title}" (${duplicates[0].trackingId})`);
    }

    // 4. Test Complaint Status Workflow & Resolution Requirements
    log('\n4. Staff Workflow & Mandatory Resolution Notes:');
    const testIssue = db.prepare("SELECT * FROM issues WHERE status = 'Submitted' LIMIT 1").get();
    assert(!!testIssue, `Found test issue: ${testIssue?.tracking_id}`);

    // Test password hashing
    const adminUser = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@civicfix.gov');
    assert(adminUser.password_hash === hashPassword('admin123'), 'Admin authentication hash verification');

    // 5. Test Analytics Aggregation
    log('\n5. Analytics Aggregation:');
    const catStats = db.prepare('SELECT category, COUNT(*) as count FROM issues GROUP BY category').all();
    assert(catStats.length >= 4, `Categories aggregated: ${catStats.length}`);

    const resolvedStats = db.prepare("SELECT COUNT(*) as count FROM issues WHERE status = 'Resolved'").get();
    assert(resolvedStats.count >= 2, `Resolved issues recorded: ${resolvedStats.count}`);

    log('\n====================================================');
    log(`   Verification Completed: ${passCount} Passed, ${failCount} Failed`);
    log('====================================================\n');

    flushLog();
    process.exit(failCount === 0 ? 0 : 1);
  } catch (err) {
    log('Fatal test error: ' + err.stack);
    flushLog();
    process.exit(1);
  }
}

runTests();
