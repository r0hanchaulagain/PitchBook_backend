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

// GET /api/bookings - Get all bookings (admin only)
router.get(
	"/",
	authenticate,
	authorize("admin"),
	bookingController.getAllBookings
);

// GET /api/bookings/my - Get bookings for the logged-in user
router.get(
	"/me",
	authenticate,
	authorize("user"),
	bookingController.getMyBookings
);

// Get available slots for a futsal on a given date
router.get("/available-slots", bookingController.getAvailableSlots);

// Get bookings for a futsal (with optional date, pagination)
router.get(
	"/futsal",
	authenticate,
	authorize("admin", "futsalOwner"),
	bookingController.getBookingsForFutsal
);

// GET /api/bookings/:id - Get booking by ID
router.get("/:id", bookingController.getBookingById);

// PUT /api/bookings/:id - Update booking (limited fields)
router.put("/:id", bookingController.updateBooking);

// DELETE /api/bookings/:id - Cancel booking
router.delete("/:id", bookingController.cancelBooking);

// Bulk booking creation
router.post("/bulk", bookingController.createBulkBooking);

// Bulk payment for bookings
router.post("/bulk-payment", bookingController.bulkBookingPayment);

// GET /api/bookings/availability/:futsalId - Check availability for futsal
router.get(
	"/availability/:futsalId",
	bookingController.checkFutsalAvailability
);

// POST /api/bookings/:id/payment - Process booking payment
// router.post('/:id/payment', bookingController.processBookingPayment);

// POST /api/bookings/:id/join - Join an existing booking as team B
router.post("/:id/join", bookingController.joinBooking);

// POST /api/bookings/initiate - Initiate a new booking as Team A
router.post("/initiate", bookingController.initiateBookingAsTeamA);

// POST /api/bookings/:id/initiate-payment - Initiate Khalti payment for a booking
router.post(
	"/:id/initiate-payment",
	authenticate,
	authorize("user"),
	bookingController.initiateKhaltiPayment
);

// GET /api/bookings/:id/verify-payment - Verify Khalti payment for a booking
router.get("/:id/verify-payment", bookingController.verifyKhaltiPayment);

module.exports = router;
