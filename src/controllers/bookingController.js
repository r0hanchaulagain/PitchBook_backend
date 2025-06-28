// Booking Controller: Handles all booking-related logic
const Booking = require('../models/Booking');
const Futsal = require('../models/Futsal');
const User = require('../models/User');
// const sendMail = require('../utils/sendMail'); // Assuming sendMail utility is defined in this file
const { createNotification } = require('./notificationController');
const { calculateDynamicPrice } = require('../utils/pricing');
const { isHoliday } = require('../services/holidayService');
const { initiateKhaltiPayment } = require('../utils/payment');

// Allowed booking durations in minutes
const ALLOWED_DURATIONS = Array.from({ length: 7 }, (_, i) => 30 + i * 15); // [30, 45, 60, 75, 90, 105, 120]
const MAX_BULK_DAYS = 30;

// Utility for sending booking-related emails
// async function sendBookingEmail({ to, subject, html }) {
//   return sendMail({ to, subject, html });
// }

function calculateDurationInMinutes(startTime, endTime) {
  // startTime and endTime are in "HH:MM" format
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function isSlotWithinOperatingHours(startTime, endTime, operatingHours, date, isHolidayFlag) {
  const day = new Date(date).getDay();
  let hours;
  if (isHolidayFlag && operatingHours.holidays) {
    hours = operatingHours.holidays;
  } else if (day === 0 || day === 6) {
    hours = operatingHours.weekends;
  } else {
    hours = operatingHours.weekdays;
  }
  if (!hours || !hours.open || !hours.close) return false;
  return startTime >= hours.open && endTime <= hours.close;
}

function getDayOfWeek(date) {
  return new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
}

// POST /api/bookings - Create a new booking
exports.createBooking = async (req, res) => {
  try {
    const { futsalId, date, startTime, endTime, bookingType, teamA, teamB } = req.body;
    if (!futsalId || !date || !startTime || !endTime || !bookingType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // Team boolean validation
    if (bookingType === 'full') {
      if (teamA !== true || teamB !== true) {
        return res.status(400).json({ message: 'Both teamA and teamB must be true for full booking' });
      }
    } else if (bookingType === 'partial') {
      if (teamA !== true || teamB !== false) {
        return res.status(400).json({ message: 'For partial booking, teamA must be true and teamB must be false' });
      }
    } else {
      return res.status(400).json({ message: 'Invalid bookingType' });
    }
    // 1. Futsal existence and status
    const futsal = await Futsal.findById(futsalId).populate('owner');
    if (!futsal || !futsal.isActive) {
      return res.status(404).json({ message: 'Futsal not found or inactive' });
    }
    // Calculate duration
    const duration = calculateDurationInMinutes(startTime, endTime);
    // Validate duration: must be 30-120 min and a multiple of 15
    if (duration < 30 || duration > 120 || duration % 15 !== 0) {
      return res.status(400).json({ message: 'Invalid booking duration. Allowed: 30-120 min, in 15-min steps.' });
    }
    // Calculate dynamic price using shared utility (per hour)
    const baseDynamicPrice = await calculateDynamicPrice(futsal, {
      date,
      time: startTime,
      // Optionally: userCoords, commission, avgRating, reviewCount
    });
    // Adjust price for actual duration
    const finalPrice = Math.round(baseDynamicPrice * (duration / 60));
    // 3. Operating hours validation (new logic)
    const isHolidayFlag = await isHoliday(date);
    if (!isSlotWithinOperatingHours(startTime, endTime, futsal.operatingHours, date, isHolidayFlag)) {
      return res.status(400).json({ message: 'Booking time outside operating hours' });
    }
    // 4. Booking must be in the future
    const bookingStart = new Date(`${date}T${startTime}`);
    if (bookingStart < new Date()) {
      return res.status(400).json({ message: 'Cannot book for past time' });
    }
    // 5. Slot availability (no overlap)
    const slotConflict = await Booking.findOne({
      futsal: futsalId,
      date: new Date(date),
      status: { $nin: ['cancelled'] },
      $or: [{ startTime: { $lt: endTime }, endTime: { $gt: startTime } }],
    });
    if (slotConflict) {
      return res.status(409).json({ message: 'Time slot already booked' });
    }
    // 6. User cannot double-book
    const userConflict = await Booking.findOne({
      user: req.user._id,
      date: new Date(date),
      status: { $nin: ['cancelled'] },
      $or: [{ startTime: { $lt: endTime }, endTime: { $gt: startTime } }],
    });
    if (userConflict) {
      return res.status(409).json({ message: 'You already have a booking during this time' });
    }
    // 9. Create booking
    const booking = new Booking({
      futsal: futsalId,
      user: req.user._id,
      date: new Date(date),
      startTime,
      endTime,
      price: finalPrice,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      bookingType,
      teamA,
      teamB
    });
    await booking.save();
    // Notify futsal owner of booking attempt
    if (futsal.owner && futsal.owner.email) {
      const html = `<p>A new booking has been attempted for your futsal <b>${futsal.name}</b> on ${date} from ${startTime} to ${endTime}.</p>`;
      // await sendBookingEmail({ to: futsal.owner.email, subject: 'New Booking Attempt', html });
    }
    // --- Notification: Booking created ---
    await createNotification({
      user: req.user._id,
      message: `Your booking for ${futsal.name} on ${date} from ${startTime} to ${endTime} has been created.`,
      type: 'booking_created',
      meta: { booking: booking._id },
    });
    return res.status(201).json({ message: 'Booking created', booking, price: finalPrice });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/bookings/bulk - Create bulk booking
exports.createBulkBooking = async (req, res) => {
  try {
    const {
      futsalId,
      startDate,
      endDate,
      startTime,
      endTime,
      daysOfWeek,
      bookingType,
      teamA,
      teamB
    } = req.body;
    if (!futsalId || !startDate || !endDate || !startTime || !endTime || !daysOfWeek) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // Team boolean validation
    if (bookingType === 'full') {
      if (teamA !== true || teamB !== true) {
        return res.status(400).json({ message: 'Both teamA and teamB must be true for full booking' });
      }
    } else if (bookingType === 'partial') {
      if (teamA !== true || teamB !== false) {
        return res.status(400).json({ message: 'For partial booking, teamA must be true and teamB must be false' });
      }
    } else {
      return res.status(400).json({ message: 'Invalid bookingType' });
    }
    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays > MAX_BULK_DAYS) {
      return res.status(400).json({ message: `Bulk booking cannot exceed ${MAX_BULK_DAYS} days` });
    }
    // Generate dates for booking
    const bookingDates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      if (daysOfWeek.includes(day)) {
        bookingDates.push(new Date(d));
      }
    }
    if (bookingDates.length === 0) {
      return res.status(400).json({ message: 'No valid booking dates found' });
    }
    // Validate each date
    const validBookings = [];
    const invalidBookings = [];
    for (const date of bookingDates) {
      // Repeat single booking validation logic
      // Duration
      const duration = calculateDurationInMinutes(startTime, endTime);
      if (!ALLOWED_DURATIONS.includes(duration)) {
        invalidBookings.push({ date, reason: 'Invalid duration' });
        continue;
      }
      // Futsal
      const futsal = await Futsal.findById(futsalId);
      if (!futsal || !futsal.isActive) {
        invalidBookings.push({ date, reason: 'Futsal not found or inactive' });
        continue;
      }
      // Operating hours
      const isHolidayFlag = await isHoliday(date);
      if (!isSlotWithinOperatingHours(startTime, endTime, futsal.operatingHours, date, isHolidayFlag)) {
        invalidBookings.push({ date, reason: 'Outside operating hours' });
        continue;
      }
      // Future booking
      const bookingStart = new Date(`${date.toISOString().split('T')[0]}T${startTime}`);
      if (bookingStart < new Date()) {
        invalidBookings.push({ date, reason: 'Cannot book for past time' });
        continue;
      }
      // Slot conflict
      const slotConflict = await Booking.findOne({
        futsal: futsalId,
        date: date,
        status: { $nin: ['cancelled'] },
        $or: [{ startTime: { $lt: endTime }, endTime: { $gt: startTime } }],
      });
      if (slotConflict) {
        invalidBookings.push({ date, reason: 'Time slot already booked' });
        continue;
      }
      // User conflict
      const userConflict = await Booking.findOne({
        user: req.user._id,
        date: date,
        status: { $nin: ['cancelled'] },
        $or: [{ startTime: { $lt: endTime }, endTime: { $gt: startTime } }],
      });
      if (userConflict) {
        invalidBookings.push({ date, reason: 'User already has a booking during this time' });
        continue;
      }
      validBookings.push(date);
    }
    if (validBookings.length === 0) {
      return res.status(400).json({ message: 'No valid slots available', invalidBookings });
    }
    // Calculate total price
    const futsal = await Futsal.findById(futsalId);
    const duration = calculateDurationInMinutes(startTime, endTime);
    let pricePerBooking = futsal.pricing.basePrice;
    if (futsal.pricing.rules && Array.isArray(futsal.pricing.rules)) {
      const bookingDay = getDayOfWeek(validBookings[0]);
      for (const rule of futsal.pricing.rules) {
        // Match day (or 'any') and time overlap
        if (
          (rule.day === bookingDay || rule.day === 'any') &&
          startTime >= rule.start &&
          endTime <= rule.end
        ) {
          pricePerBooking = rule.price;
        }
      }
    }
    const totalPrice = pricePerBooking * validBookings.length;
    // Save only valid bookings (pending status)
    const createdBookings = [];
    for (const date of validBookings) {
      const booking = new Booking({
        futsal: futsalId,
        user: req.user._id,
        date: date,
        startTime,
        endTime,
        price: pricePerBooking,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        bookingType,
        teamA,
        teamB,
        isBulkBooking: true,
      });
      await booking.save();
      createdBookings.push(booking);
      // Notify futsal owner of booking attempt
      if (futsal.owner && futsal.owner.email) {
        const html = `<p>A new booking has been attempted for your futsal <b>${futsal.name}</b> on ${date.toDateString()} from ${startTime} to ${endTime}.</p>`;
        // await sendBookingEmail({ to: futsal.owner.email, subject: 'New Booking Attempt', html });
      }
      // --- Notification: Booking created ---
      await createNotification({
        user: req.user._id,
        message: `Your booking for ${futsal.name} on ${date.toDateString()} from ${startTime} to ${endTime} has been created.`,
        type: 'booking_created',
        meta: { booking: booking._id },
      });
    }
    return res.status(201).json({
      message: 'Bulk booking created',
      bookings: createdBookings,
      invalidBookings,
      totalPrice,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/bookings/bulk-payment - Bulk payment for multiple bookings
exports.bulkBookingPayment = async (req, res) => {
  try {
    const { bookingIds, token, totalAmount } = req.body;
    if (!Array.isArray(bookingIds) || bookingIds.length === 0 || !token || !totalAmount) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // Fetch all bookings
    const bookings = await Booking.find({
      _id: { $in: bookingIds },
      paymentStatus: { $ne: 'paid' },
    });
    if (bookings.length !== bookingIds.length) {
      return res.status(400).json({ message: 'Some bookings not found or already paid' });
    }
    // Calculate total
    const sum = bookings.reduce((acc, b) => acc + (b.price || 0), 0);
    if (sum !== totalAmount) {
      return res.status(400).json({ message: 'Total amount mismatch' });
    }
    // Simulate payment (replace with real gateway logic)
    for (let booking of bookings) {
      booking.paymentStatus = 'paid';
      booking.updatedAt = new Date();
      await booking.save();
      // Notify user
      await createNotification({
        user: booking.user,
        message: `Your payment for booking at ${booking.futsal.name} on ${booking.date.toDateString()} is successful!`,
        type: 'booking_payment',
        meta: { booking: booking._id },
      });
    }
    res.status(200).json({ message: 'Bulk payment successful', bookingIds });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/bookings - Get all bookings (admin only)
exports.getAllBookings = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin only' });
    }
    const bookings = await Booking.find().populate('futsal').populate('user');
    res.status(200).json({ bookings });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/bookings/my - Get bookings for the logged-in user
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user._id })
      .populate('futsal')
      .sort({ date: -1, startTime: -1 });
    res.status(200).json({ bookings });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/bookings/:id - Get booking by ID
exports.getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('futsal').populate('user');
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    // Only allow admin or owner of booking to view
    if (req.user.role !== 'admin' && booking.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    res.status(200).json({ booking });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PUT /api/bookings/:id - Update booking (limited fields)
exports.updateBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    if (req.user.role !== 'admin' && booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    // Only allow updating status for simplicity (specialRequests removed)
    if (req.body.status !== undefined) {
      booking.status = req.body.status;
    }
    booking.updatedAt = new Date();
    await booking.save();
    res.status(200).json({ message: 'Booking updated', booking });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// DELETE /api/bookings/:id - Cancel booking
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('futsal');
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    if (req.user.role !== 'admin' && booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Booking already cancelled' });
    }
    booking.status = 'cancelled';
    booking.updatedAt = new Date();
    await booking.save();
    // Notify user
    const user = await User.findById(booking.user);
    if (user && user.email) {
      const html = `<p>Your booking for ${booking.futsal.name} on ${booking.date.toDateString()} from ${booking.startTime} to ${booking.endTime} has been cancelled.</p>`;
      await sendBookingEmail({ to: user.email, subject: 'Booking Cancelled', html });
    }
    // Notify futsal owner
    if (booking.futsal.owner && booking.futsal.owner.email) {
      const html = `<p>A booking for your futsal <b>${booking.futsal.name}</b> on ${booking.date.toDateString()} from ${booking.startTime} to ${booking.endTime} has been cancelled.</p>`;
      await sendBookingEmail({
        to: booking.futsal.owner.email,
        subject: 'Booking Cancelled',
        html,
      });
    }
    res.status(200).json({ message: 'Booking cancelled', booking });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/bookings/:id/join - Join an existing booking as team B
exports.joinBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    if (booking.bookingType !== 'partial' || !booking.teamB || !booking.teamB.isOpen) {
      return res.status(400).json({ message: 'This booking is not open for joining' });
    }
    // Only allow joining if not already joined
    if (booking.teamB && !booking.teamB.isOpen) {
      return res.status(400).json({ message: 'Team B already filled' });
    }
    booking.teamB = req.body.teamB || { isOpen: false };
    booking.updatedAt = new Date();
    await booking.save();
    res.status(200).json({ message: 'Joined as Team B', booking });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/bookings/:id/payment - Process booking payment
exports.processBookingPayment = async (req, res) => {
  try {
    const { token, amount } = req.body;
    const bookingId = req.params.id;
    // 1. Find booking
    const booking = await Booking.findById(bookingId).populate('futsal');
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    // 2. Prevent double payment
    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Booking already paid' });
    }
    // 3. Amount must match booking price
    if (Number(amount) !== Number(booking.price)) {
      return res.status(400).json({ message: 'Payment amount does not match booking price' });
    }
    // 4. Verify with Khalti (mocked here)
    // In production, send HTTP request to Khalti API to verify token/amount
    // For now, assume any non-empty token is valid
    if (!token || typeof token !== 'string' || token.length < 5) {
      return res.status(400).json({ message: 'Invalid payment token' });
    }
    // 5. Update booking status
    booking.paymentStatus = 'paid';
    booking.status = 'confirmed';
    booking.paymentDetails = {
      transactionId: token,
      paymentMethod: 'khalti',
      paymentDate: new Date(),
    };
    booking.updatedAt = new Date();
    await booking.save();
    // Optionally: create transaction record here
    // Send confirmation email to user
    const user = await User.findById(booking.user);
    if (user && user.email) {
      const html = `<p>Your booking for ${booking.futsal.name} on ${booking.date.toDateString()} from ${booking.startTime} to ${booking.endTime} has been confirmed. Payment received.</p>`;
      await sendBookingEmail({ to: user.email, subject: 'Booking Confirmed', html });
    }
    // Notify futsal owner
    if (booking.futsal.owner && booking.futsal.owner.email) {
      const html = `<p>A booking for your futsal <b>${booking.futsal.name}</b> on ${booking.date.toDateString()} from ${booking.startTime} to ${booking.endTime} has been confirmed and paid.</p>`;
      await sendBookingEmail({
        to: booking.futsal.owner.email,
        subject: 'Booking Confirmed',
        html,
      });
    }
    // --- Notification: Booking payment successful ---
    await createNotification({
      user: booking.user,
      message: `Your payment for booking at ${booking.futsal.name} on ${booking.date.toDateString()} is successful!`,
      type: 'booking_payment',
      meta: { booking: booking._id },
    });
    res.status(200).json({ message: 'Payment successful', booking });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/bookings/availability/:futsalId - Check availability for futsal
exports.checkFutsalAvailability = async (req, res) => {
  try {
    const { futsalId } = req.params;
    const { date, startTime, endTime } = req.query;
    if (!futsalId || !date) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }
    const futsal = await Futsal.findById(futsalId);
    if (!futsal || !futsal.isActive) {
      return res.status(404).json({ message: 'Futsal not found or inactive' });
    }
    if (startTime && endTime) {
      // Check slot availability
      const slotConflict = await Booking.findOne({
        futsal: futsalId,
        date: new Date(date),
        status: { $nin: ['cancelled'] },
        $or: [{ startTime: { $lt: endTime }, endTime: { $gt: startTime } }],
      });
      if (slotConflict) {
        return res.status(200).json({ available: false, message: 'Slot not available' });
      }
      return res.status(200).json({ available: true, message: 'Slot available' });
    }
    // If only date, return all bookings for the day
    const bookings = await Booking.find({
      futsal: futsalId,
      date: new Date(date),
      status: { $nin: ['cancelled'] },
    });
    res.status(200).json({ bookings });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/bookings/initiate - Initiate a new booking as Team A
exports.initiateBookingAsTeamA = async (req, res) => {
  try {
    const { futsalId, date, startTime, endTime, bookingType } = req.body;
    if (!futsalId || !date || !startTime || !endTime || !bookingType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // 1. Futsal existence and status
    const futsal = await Futsal.findById(futsalId).populate('owner');
    if (!futsal || !futsal.isActive) {
      return res.status(404).json({ message: 'Futsal not found or inactive' });
    }
    // Calculate price dynamically (reuse logic from createBooking)
    let price = futsal.pricing.basePrice;
    if (futsal.pricing.rules && Array.isArray(futsal.pricing.rules)) {
      const bookingDay = getDayOfWeek(date);
      for (const rule of futsal.pricing.rules) {
        if (
          (rule.day === bookingDay || rule.day === 'any') &&
          startTime >= rule.start &&
          endTime <= rule.end
        ) {
          price = rule.price;
        }
      }
    }
    // Duration validation
    const duration = calculateDurationInMinutes(startTime, endTime);
    if (!ALLOWED_DURATIONS.includes(duration)) {
      return res
        .status(400)
        .json({ message: 'Invalid booking duration. Allowed: 30, 60, 90, 120 min' });
    }
    // Check slot availability
    const slotConflict = await Booking.findOne({
      futsal: futsalId,
      date: new Date(date),
      startTime,
      endTime,
      status: { $nin: ['cancelled'] },
    });
    if (slotConflict) {
      return res.status(409).json({ message: 'Slot already booked' });
    }
    // Create booking with current user as Team A (boolean)
    const booking = new Booking({
      futsal: futsalId,
      user: req.user._id,
      date,
      startTime,
      endTime,
      price,
      status: 'pending',
      bookingType,
      teamA: true,
      teamB: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await booking.save();
    // Notify futsal owner
    if (futsal.owner && futsal.owner.email) {
      const html = `<p>A new booking has been initiated for your futsal <b>${futsal.name}</b> on ${date} from ${startTime} to ${endTime}.</p>`;
      // await sendBookingEmail({ to: futsal.owner.email, subject: 'New Booking Initiated', html });
    }
    res.status(201).json({ message: 'Booking initiated as Team A', booking });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/bookings/available-slots?futsalId=...&date=YYYY-MM-DD
exports.getAvailableSlots = async (req, res) => {
  try {
    const { futsalId, date } = req.query;
    if (!futsalId || !date) {
      return res.status(400).json({ message: 'futsalId and date are required' });
    }
    const futsal = await Futsal.findById(futsalId);
    if (!futsal) {
      return res.status(404).json({ message: 'Futsal not found' });
    }
    // Fetch all bookings for that day
    const bookings = await Booking.find({
      futsal: futsalId,
      date: new Date(date),
      status: { $nin: ['cancelled'] },
    });
    // Return only booked slots
    const bookedSlots = bookings.map(b => ({ startTime: b.startTime, endTime: b.endTime }));
    res.json({ bookedSlots });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/bookings/:id/initiate-payment - Initiate Khalti payment for a booking
exports.initiateKhaltiPayment = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const booking = await Booking.findById(bookingId).populate('futsal user');
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({ error: 'Booking already paid' });
    }
    // Prepare payment details
    const { fullName, email, phone } = booking.user;
    const amount = booking.price;
    const return_url = req.body.return_url || req.query.return_url;
    const paymentInit = await initiateKhaltiPayment({
      name: fullName || booking.user.name || 'User',
      email: email || '',
      phone: phone || '',
      amount,
      purchase_order_id: booking._id.toString(),
      purchase_order_name: `Booking for ${booking.futsal.name}`,
      return_url
    });
    // Save pidx to booking
    booking.paymentDetails = booking.paymentDetails || {};
    booking.paymentDetails.khaltiPidx = paymentInit.pidx;
    await booking.save();
    res.status(201).json({
      message: 'Khalti payment initiated. Complete payment using the provided URL.',
      payment_url: paymentInit.payment_url,
      pidx: paymentInit.pidx,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/bookings/:id/verify-payment?pidx=... - Verify Khalti payment for a booking
exports.verifyKhaltiPayment = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { pidx } = req.query;
    if (!pidx) {
      return res.status(400).json({ error: 'Missing pidx' });
    }
    const booking = await Booking.findById(bookingId).populate('futsal user');
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    // Lookup payment status
    const lookup = await require('../services/khaltiService').lookupPayment(pidx);
    if (lookup.status === 'Completed') {
      booking.paymentStatus = 'paid';
      booking.status = 'confirmed';
      booking.paymentDetails = {
        ...booking.paymentDetails,
        paymentMethod: 'khalti',
        paymentDate: new Date(),
        transactionId: pidx,
      };
      await booking.save();
      // Optionally notify user and futsal owner here
      return res.json({ message: 'Payment verified. Booking confirmed.', booking });
    } else {
      return res.status(400).json({ error: 'Payment not completed', status: lookup.status });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
