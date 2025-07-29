const Booking = require("../models/Booking");
const cron = require("node-cron");

cron.schedule("*/15 * * * *", async () => {
	const FIFTEEN_MINUTES = 15 * 60 * 1000;
	const cutoff = new Date(Date.now() - FIFTEEN_MINUTES);

	try {
		const staleBookings = await Booking.find({
			status: "pending",
			createdAt: { $lt: cutoff },
		});

		if (staleBookings.length > 0) {
			const ids = staleBookings.map((b) => b._id);
			await Booking.updateMany(
				{ _id: { $in: ids } },
				{ $set: { status: "cancelled", updatedAt: new Date() } }
			);
			console.log(`[BookingCleanup] Cancelled ${ids.length} stale bookings.`);
		}
	} catch (err) {
		console.error("[BookingCleanup] Error cancelling stale bookings:", err);
	}
});

module.exports = {};
