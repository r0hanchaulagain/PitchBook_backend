const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const auth = require('../middleware/auth'); // Assuming auth middleware is defined in this file

// POST /api/bookings - Create a new booking
router.post('/', bookingController.createBooking);

// GET /api/bookings - Get all bookings (admin only)
router.get('/', bookingController.getAllBookings);

// GET /api/bookings/my - Get bookings for the logged-in user
router.get('/me', auth, bookingController.getMyBookings);

// GET /api/bookings/:id - Get booking by ID
router.get('/:id', bookingController.getBookingById);

// PUT /api/bookings/:id - Update booking (limited fields)
router.put('/:id', bookingController.updateBooking);

// DELETE /api/bookings/:id - Cancel booking
router.delete('/:id', bookingController.cancelBooking);

// Bulk booking creation
router.post('/bulk', auth, bookingController.createBulkBooking);

// Bulk payment for bookings
router.post('/bulk-payment', auth, bookingController.bulkBookingPayment);

// GET /api/bookings/availability/:futsalId - Check availability for futsal
router.get('/availability/:futsalId', bookingController.checkFutsalAvailability);

// POST /api/bookings/:id/payment - Process booking payment
router.post('/:id/payment', bookingController.processBookingPayment);

// POST /api/bookings/:id/join - Join an existing booking as team B
router.post('/:id/join', bookingController.joinBooking);

// POST /api/bookings/initiate - Initiate a new booking as Team A
router.post('/initiate', auth, bookingController.initiateBookingAsTeamA);

module.exports = router;
