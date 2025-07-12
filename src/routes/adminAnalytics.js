const express = require("express");
const router = express.Router();
const adminAnalytics = require("../controllers/adminAnalyticsController");
const { isAdmin } = require("../middleware/auth");

router.get("/overview", isAdmin, adminAnalytics.getOverview);
router.get("/registrations", isAdmin, adminAnalytics.getRegistrations);
router.get("/bookings", isAdmin, adminAnalytics.getBookings);
router.get("/revenue", isAdmin, adminAnalytics.getRevenue);
router.get("/top-futsals", isAdmin, adminAnalytics.getTopFutsals);
router.get("/top-users", isAdmin, adminAnalytics.getTopUsers);
router.get(
	"/low-performing-futsals",
	isAdmin,
	adminAnalytics.getLowPerformingFutsals
);
router.get(
	"/futsals-by-location",
	isAdmin,
	adminAnalytics.getFutsalsByLocation
);
router.get(
	"/bookings-by-location",
	isAdmin,
	adminAnalytics.getBookingsByLocation
);
router.get(
	"/active-vs-inactive-futsals",
	isAdmin,
	adminAnalytics.getActiveVsInactiveFutsals
);
router.get("/cancellations", isAdmin, adminAnalytics.getCancellations);
router.get("/holiday-impact", isAdmin, adminAnalytics.getHolidayImpact);

module.exports = router;
