const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { authenticate, authorize } = require("../middlewares/auth");

router.post(
	"/",
	authenticate,
	authorize("user"),
	bookingController.createBooking
);

router.post(
	"/cash",
	authenticate,
	authorize("futsalOwner"),
	bookingController.createCashBooking
);

router.post(
	"/initiate",
	authenticate,
	authorize("user"),
	bookingController.initiateBookingAsTeamA
);

router.post(
	"/bulk-with-payment",
	authenticate,
	authorize("user"),
	bookingController.createBulkBookingWithPayment
);

router.get(
	"/",
	authenticate,
	authorize("admin"),
	bookingController.getAllBookings
);

router.get(
	"/me",
	authenticate,
	authorize("user"),
	bookingController.getMyBookings
);

router.get("/partial", bookingController.listPartialBookings);

router.get(
	"/availability/:futsalId",
	bookingController.checkFutsalAvailability
);

router.get("/available-slots", bookingController.getAvailableSlots);

router.get(
	"/futsal",
	authenticate,
	authorize("admin", "futsalOwner"),
	bookingController.getBookingsForFutsal
);

router.get("/bulk/verify-payment", bookingController.verifyBulkKhaltiPayment);

router.get("/:id/verify-payment", bookingController.verifyKhaltiPayment);

router.post(
	"/:id/join",
	authenticate,
	authorize("user"),
	bookingController.joinBooking
);

router.post(
	"/:id/initiate-payment",
	authenticate,
	authorize("user"),
	bookingController.initiateKhaltiPayment
);

router.get("/:id", bookingController.getBookingById);

router.put(
	"/:id",
	authenticate,
	authorize("user", "admin", "futsalOwner"),
	bookingController.updateBooking
);

router.delete(
	"/:id",
	authenticate,
	authorize("user", "admin", "futsalOwner"),
	bookingController.cancelBooking
);

module.exports = router;
