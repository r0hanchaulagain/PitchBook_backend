const Notification = require("../models/Notification");

class NotificationService {
	constructor(io, connectedUsers) {
		this.io = io;
		// Defensive: ensure connectedUsers is always a Map
		this.connectedUsers = connectedUsers && typeof connectedUsers.get === 'function' ? connectedUsers : new Map();
	}

	// Send notification to a specific user
	async sendToUser(userId, notification) {
		try {
			// Save to database
			const newNotification = await Notification.create({
				...notification,
				user: userId,
			});

			// If user is online, send via WebSocket
			if (this.connectedUsers && typeof this.connectedUsers.get === 'function') {
				const socketId = this.connectedUsers.get(userId.toString());
				if (socketId && this.io && this.io.sockets && this.io.sockets.sockets.has(socketId)) {
					this.io.to(socketId).emit("notification", newNotification);
				}
			}

			return newNotification;
		} catch (error) {
			console.error("Error sending notification:", error);
			throw error;
		}
	}

	// Mark notification as read
	async markAsRead(notificationId, userId) {
		return await Notification.findOneAndUpdate(
			{ _id: notificationId, user: userId },
			{ isRead: true },
			{ new: true }
		);
	}

	// Get user notifications
	async getUserNotifications(userId, { limit = 20, skip = 0 } = {}) {
		return await Notification.find({ user: userId })
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit);
	}

	// Send booking notification
	async sendBookingNotification(userId, bookingData) {
		return this.sendToUser(userId, {
			type: "booking",
			title: "New Booking",
			message: `Your booking for ${bookingData.futsalName} on ${bookingData.date} is confirmed.`,
			data: { bookingId: bookingData._id },
		});
	}

	// Send payment notification
	async sendPaymentNotification(userId, paymentData) {
		return this.sendToUser(userId, {
			type: "payment",
			title: "Payment Received",
			message: `Payment of ${paymentData.amount} for booking #${paymentData.bookingId} was successful.`,
			data: { bookingId: paymentData.bookingId, paymentId: paymentData._id },
		});
	}
}

module.exports = NotificationService;
