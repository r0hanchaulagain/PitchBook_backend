const { isHoliday } = require('../services/holidayService');

/**
 * Calculate the final dynamic price for a futsal slot.
 * @param {Object} futsal - The futsal document (must include pricing, location, etc.)
 * @param {Object} options - { date, time, userCoords, commission, avgRating, reviewCount }
 * @returns {Promise<number>} - The final price (rounded)
 */
async function calculateDynamicPrice(futsal, options = {}) {
  const basePrice = futsal.pricing.basePrice || 0;
  const modifiers = futsal.pricing.modifiers || {};
  const {
    date, // YYYY-MM-DD
    time, // HH:MM
    userCoords, // [lng, lat]
    commission = 0,
    avgRating = null,
    reviewCount = 0,
  } = options;

  // Determine date/time context
  let now;
  let day, hour;
  if (date && time) {
    const [year, month, dayNum] = date.split('-').map(Number);
    const [h, m] = time.split(':').map(Number);
    now = new Date(year, month - 1, dayNum, h, m);
    day = now.getDay();
    hour = now.getHours();
  } else {
    now = new Date();
    day = now.getDay();
    hour = now.getHours();
  }

  // --- Time of Day Modifier ---
  let timeOfDayModifier = 0;
  if (modifiers.timeOfDay && modifiers.timeOfDay.enabled) {
    if (hour >= 6 && hour < 12) timeOfDayModifier = modifiers.timeOfDay.morning || 0;
    else if (hour >= 12 && hour < 18) timeOfDayModifier = modifiers.timeOfDay.midday || 0;
    else if (hour >= 18 && hour < 22) timeOfDayModifier = modifiers.timeOfDay.evening || 0;
  }

  // --- Holiday Modifier ---
  let holidayModifier = 0;
  if (modifiers.holiday && modifiers.holiday.enabled) {
    if (await isHoliday(now)) {
      holidayModifier = modifiers.holiday.percentage || 0;
    }
  }

  // --- Weekend Modifier ---
  let weekendModifier = 0;
  if (modifiers.weekend && modifiers.weekend.enabled) {
    if (day === 0 || day === 6) { // Sunday=0, Saturday=6
      weekendModifier = modifiers.weekend.percentage || 0;
    }
  }

  // --- Location Modifier ---
  let distanceModifier = 0;
  if (
    modifiers.location && modifiers.location.enabled &&
    userCoords &&
    futsal.location &&
    futsal.location.coordinates &&
    Array.isArray(futsal.location.coordinates.coordinates)
  ) {
    const [flng, flat] = futsal.location.coordinates.coordinates;
    const [lng, lat] = userCoords;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371e3; // meters
    const dLat = toRad(flat - parseFloat(lat));
    const dLng = toRad(flng - parseFloat(lng));
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(parseFloat(lat))) * Math.cos(toRad(flat)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    if (distance > 10000 && modifiers.location.far !== undefined) distanceModifier = modifiers.location.far;
    else if (distance <= 10000 && modifiers.location.near !== undefined) distanceModifier = modifiers.location.near;
  }

  // --- Rating Modifier ---
  let ratingModifier = 0;
  if (avgRating !== null) {
    if (avgRating >= 4.5) ratingModifier = 0.1; // +10% for top-rated
    else if (avgRating >= 4.0) ratingModifier = 0.05; // +5%
    else if (avgRating <= 2.5) ratingModifier = -0.1; // -10% for low-rated
  }

  // --- Sum up all applicable modifiers ---
  let dynamicPrice = basePrice;
  dynamicPrice += basePrice * timeOfDayModifier;
  dynamicPrice += basePrice * holidayModifier;
  dynamicPrice += basePrice * weekendModifier;
  dynamicPrice += basePrice * distanceModifier;
  dynamicPrice += basePrice * ratingModifier;

  // --- Commission ---
  const finalPrice = Math.round(dynamicPrice + dynamicPrice * commission);
  return finalPrice;
}

module.exports = { calculateDynamicPrice }; 