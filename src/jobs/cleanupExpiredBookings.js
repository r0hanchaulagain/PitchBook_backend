const Booking = require("../models/Booking");
const {
	getNotificationController,
} = require("../controllers/notificationController");
const mongoose = require("mongoose");

async function cleanupExpiredBookings() {
	const session = await mongoose.startSession();
	session.startTransaction();

	try {
		const now = new Date();

		// Find all expired unpaid bookings
		const expiredBookings = await Booking.find({
			isPaid: false,
			paymentExpiresAt: { $lte: now },
			status: "pending",
		})
			.populate("user futsal")
			.session(session);

		if (expiredBookings.length === 0) {
			await session.commitTransaction();
			session.endSession();
			return { cleaned: 0 };
		}

		// Get all competing bookings to update
		const competingBookingIds = [];
		expiredBookings.forEach((booking) => {
			if (booking.competingBookings && booking.competingBookings.length > 0) {
				competingBookingIds.push(...booking.competingBookings);
			}
		});

		// Remove expired bookings from competingBookings array of other bookings
		if (competingBookingIds.length > 0) {
			await Booking.updateMany(
				{ _id: { $in: competingBookingIds } },
				{
					$pull: {
						competingBookings: { $in: expiredBookings.map((b) => b._id) },
					},
				},
				{ session }
			);
		}

		// Delete the expired bookings
		const result = await Booking.deleteMany({
			_id: { $in: expiredBookings.map((b) => b._id) },
		}).session(session);

		// Send notifications for expired bookings
		const notificationPromises = expiredBookings.map((booking) => {
			const notificationController = getNotificationController({});
			return Promise.all([
				// Notify user
				notificationController.createNotification({
					user: booking.user._id,
					message:
						`Your booking for ${booking.futsal.name} on ${booking.date.toISOString().split("T")[0]} ` +
						`from ${booking.startTime} to ${booking.endTime} has expired.`,
					type: "booking_expired",
					meta: { booking: booking._id, futsal: booking.futsal._id },
				}),
				// Notify futsal owner if exists
				booking.futsal.owner &&
					notificationController.createNotification({
						user: booking.futsal.owner,
						message:
							`A pending booking for ${booking.futsal.name} on ${booking.date.toISOString().split("T")[0]} ` +
							`from ${booking.startTime} to ${booking.endTime} has expired.`,
						type: "booking_expired",
						meta: {
							booking: booking._id,
							futsal: booking.futsal._id,
							customer: booking.user._id,
						},
					}),
			]);
		});

		await Promise.all(notificationPromises.flat().filter(Boolean));

		await session.commitTransaction();
		session.endSession();

		return { cleaned: result.deletedCount };
	} catch (error) {
		await session.abortTransaction();
		session.endSession();
		console.error("Error cleaning up expired bookings:", error);
		throw error;
	}
}

module.exports = { cleanupExpiredBookings };
