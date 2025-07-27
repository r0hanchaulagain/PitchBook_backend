const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { authenticate, authorize } = require("../middlewares/auth");

// POST /api/bookings - Create a new booking
router.post(
  "/",
  authenticate,
  authorize("user"),
  bookingController.createBooking
);

// POST /api/bookings/cash - Create a new booking with cash payment
router.post(
  "/cash",
  authenticate,
  authorize("futsalOwner"),
  bookingController.createCashBooking
);

// POST /api/bookings/initiate - Initiate a new booking as Team A
router.post(
  "/initiate",
  authenticate,
  authorize("user"),
  bookingController.initiateBookingAsTeamA
);

// POST /api/bookings/bulk-with-payment - Create bulk booking with Khalti payment
router.post(
  "/bulk-with-payment",
  authenticate,
  authorize("user"),
  bookingController.createBulkBookingWithPayment
);

// GET /api/bookings - Get all bookings (admin only)
router.get(
  "/",
  authenticate,
  authorize("admin"),
  bookingController.getAllBookings
);

// GET /api/bookings/me - Get bookings for the logged-in user
router.get(
  "/me",
  authenticate,
  authorize("user"),
  bookingController.getMyBookings
);

// GET /api/bookings/partial - List all partial bookings
router.get("/partial", bookingController.listPartialBookings);

// GET /api/bookings/availability/:futsalId - Check availability for futsal
router.get(
  "/availability/:futsalId",
  bookingController.checkFutsalAvailability
);

// GET /api/bookings/available-slots - Get available slots for a futsal on a given date
router.get("/available-slots", bookingController.getAvailableSlots);

// GET /api/bookings/futsal - Get bookings for a futsal (with optional date, pagination)
router.get(
  "/futsal",
  authenticate,
  authorize("admin", "futsalOwner"),
  bookingController.getBookingsForFutsal
);

// GET /api/bookings/bulk/verify-payment - Bulk booking payment verification
router.get("/bulk/verify-payment", bookingController.verifyBulkKhaltiPayment);

// GET /api/bookings/:id/verify-payment - Verify Khalti payment for a booking
router.get("/:id/verify-payment", bookingController.verifyKhaltiPayment);

// POST /api/bookings/:id/join - Join an existing booking as team B
router.post(
  "/:id/join",
  authenticate,
  authorize("user"),
  bookingController.joinBooking
);

// POST /api/bookings/:id/initiate-payment - Initiate Khalti payment for a booking
router.post(
  "/:id/initiate-payment",
  authenticate,
  authorize("user"),
  bookingController.initiateKhaltiPayment
);

// GET /api/bookings/:id - Get booking by ID
router.get("/:id", bookingController.getBookingById);

// PUT /api/bookings/:id - Update booking (limited fields)
router.put(
  "/:id",
  authenticate,
  authorize("user", "admin", "futsalOwner"),
  bookingController.updateBooking
);

// DELETE /api/bookings/:id - Cancel booking
router.delete(
  "/:id",
  authenticate,
  authorize("user", "admin", "futsalOwner"),
  bookingController.cancelBooking
);

module.exports = router;