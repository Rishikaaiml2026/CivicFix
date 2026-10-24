/**
 * CivicFix - Smart Duplicate Detection Engine
 * Combines geospatial Haversine proximity, categorical matching,
 * and text similarity (token Jaccard + n-gram overlap)
 * to flag potential duplicate complaints before database insertion.
 */

// Earth radius in meters
const EARTH_RADIUS_METERS = 6371000;

// Common stop words to filter out for clean text comparison
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'in', 'on',
  'at', 'to', 'for', 'with', 'by', 'about', 'near', 'from', 'very', 'here',
  'this', 'that', 'there', 'it', 'has', 'have', 'had', 'been', 'my', 'our',
  'road', 'street', 'cross', 'lane', 'opp', 'opposite'
]);

/**
 * Calculates great-circle distance between two GPS coordinates using Haversine formula
 * @returns {number} distance in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Clean and tokenize a text string into significant words
 */
function tokenize(text) {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

/**
 * Jaccard similarity index between two token sets: |A ∩ B| / |A ∪ B|
 */
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionCount++;
  }
  const unionCount = setA.size + setB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * Calculates text similarity score combining title and description
 */
function calculateTextSimilarity(newTitle, newDesc, existingTitle, existingDesc) {
  const titleA = tokenize(newTitle);
  const titleB = tokenize(existingTitle);
  const descA = tokenize(newDesc);
  const descB = tokenize(existingDesc);

  const titleScore = jaccardSimilarity(titleA, titleB);
  const descScore = jaccardSimilarity(descA, descB);

  // Title has higher weight (65%) than description (35%)
  return (titleScore * 0.65) + (descScore * 0.35);
}

/**
 * Evaluates spatial proximity score based on distance
 */
function calculateSpatialScore(distanceMeters) {
  if (distanceMeters <= 50) return 1.0;
  if (distanceMeters <= 150) return 0.85;
  if (distanceMeters <= 300) return 0.60;
  if (distanceMeters <= 600) return 0.35;
  if (distanceMeters <= 1000) return 0.15;
  return 0.0;
}

/**
 * Scan database for potential duplicates of a proposed issue
 * @param {object} db - DatabaseSync instance
 * @param {object} candidate - { title, description, category, latitude, longitude }
 * @param {number} threshold - Minimum confidence percentage (default 40%)
 * @returns {Array} List of matched potential duplicates sorted by confidence score
 */
function findPotentialDuplicates(db, candidate, threshold = 35) {
  const { title, description, category, latitude, longitude } = candidate;

  // Retrieve active or recently resolved issues (within last 30 days)
  const stmt = db.prepare(`
    SELECT id, tracking_id, title, description, category, priority, status,
           address, latitude, longitude, photo_url, support_count, created_at
    FROM issues
    WHERE status != 'Resolved' OR (resolved_at >= datetime('now', '-30 days'))
  `);

  const activeIssues = stmt.all();
  const potentialMatches = [];

  for (const issue of activeIssues) {
    const distanceMeters = haversineDistance(
      latitude,
      longitude,
      issue.latitude,
      issue.longitude
    );

    // If more than 1.5 km away, skip immediately
    if (distanceMeters > 1500) continue;

    const spatialScore = calculateSpatialScore(distanceMeters);
    const categoryMatch = issue.category.toLowerCase() === (category || '').toLowerCase();
    const categoryScore = categoryMatch ? 1.0 : 0.0;
    const textScore = calculateTextSimilarity(title, description, issue.title, issue.description);

    // Weighted composite confidence score:
    // 50% Spatial proximity + 30% Text similarity + 20% Category match
    const compositeScore = (spatialScore * 0.50) + (textScore * 0.30) + (categoryScore * 0.20);
    const confidencePercent = Math.round(compositeScore * 100);

    // Flag if confidence meets threshold AND (is within 400m OR has high text match)
    if (confidencePercent >= threshold && (distanceMeters <= 400 || textScore > 0.45)) {
      let reason = [];
      if (distanceMeters <= 80) {
        reason.push(`Very close location (${distanceMeters}m away)`);
      } else if (distanceMeters <= 300) {
        reason.push(`Nearby location (${distanceMeters}m away)`);
      }

      if (categoryMatch) {
        reason.push(`Same issue category (${issue.category})`);
      }

      if (textScore > 0.3) {
        reason.push(`Similar problem description`);
      }

      potentialMatches.push({
        issueId: issue.id,
        trackingId: issue.tracking_id,
        title: issue.title,
        description: issue.description,
        category: issue.category,
        status: issue.status,
        address: issue.address,
        latitude: issue.latitude,
        longitude: issue.longitude,
        photoUrl: issue.photo_url,
        supportCount: issue.support_count,
        createdAt: issue.created_at,
        distanceMeters,
        confidencePercent,
        matchReasons: reason
      });
    }
  }

  // Sort highest confidence first
  return potentialMatches.sort((a, b) => b.confidencePercent - a.confidencePercent);
}

module.exports = {
  haversineDistance,
  tokenize,
  jaccardSimilarity,
  calculateTextSimilarity,
  findPotentialDuplicates
};
