const Booking = require("../models/Booking");
const User = require("../models/User");
const Futsal = require("../models/Futsal");
const { sendMail } = require("../utils/email");
const { createNotification } = require("../controllers/notificationController");
const cron = require("node-cron");

cron.schedule("0 10 * * *", async () => {
	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);
	tomorrow.setHours(0, 0, 0, 0);
	const nextDay = new Date(tomorrow);
	nextDay.setHours(23, 59, 59, 999);

	const bookings = await Booking.find({
		date: { $gte: tomorrow, $lte: nextDay },
		status: { $in: ["pending", "confirmed"] },
	})
		.populate("user")
		.populate("futsal");

	for (const booking of bookings) {
		if (!booking.user || !booking.user.email) continue;

		if (
			booking.createdAt &&
			tomorrow - booking.createdAt > 24 * 60 * 60 * 1000
		) {
			const html = `<p>This is a reminder for your booking at <b>${booking.futsal.name}</b> on ${booking.date.toDateString()} from ${booking.startTime} to ${booking.endTime}.</p>`;
			await sendMail({
				to: booking.user.email,
				subject: "Booking Reminder",
				html,
			});

			await createNotification({
				user: booking.user._id,
				message: `Reminder: Your booking at ${booking.futsal.name} is tomorrow (${booking.date.toDateString()}) from ${booking.startTime} to ${booking.endTime}.`,
				type: "reminder",
				meta: { booking: booking._id },
			});
		}
	}
});

module.exports = {};
