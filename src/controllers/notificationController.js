const Notification = require("../models/Notification");
const NotificationService = require("../services/notificationService");

class NotificationController {
	constructor(io, connectedUsers) {
		this.notificationService = new NotificationService(io, connectedUsers);
	}

	getNotifications = async (req, res) => {
		try {
			const { limit = 20, skip = 0 } = req.query;
			const notifications = await this.notificationService.getUserNotifications(
				req.user._id,
				{ limit: parseInt(limit), skip: parseInt(skip) }
			);
			res.json({ notifications });
		} catch (err) {
			res.status(500).json({ message: err.message });
		}
	};

	markAsRead = async (req, res) => {
		try {
			const { notificationIds } = req.body;
			if (!Array.isArray(notificationIds)) {
				return res
					.status(400)
					.json({ message: "notificationIds must be an array" });
			}

			const promises = notificationIds.map((id) =>
				this.notificationService.markAsRead(id, req.user._id)
			);

			await Promise.all(promises);
			res.json({ message: "Notifications marked as read" });
		} catch (err) {
			res.status(500).json({ message: err.message });
		}
	};

	createNotification = async ({ user, title, message, type, data }) => {
		try {
			return await this.notificationService.sendToUser(user, {
				title,
				message,
				type,
				data,
			});
		} catch (err) {
			console.error("Error creating notification:", err);
			throw err;
		}
	};

	getUnreadCount = async (req, res) => {
		try {
			const count = await Notification.countDocuments({
				user: req.user._id,
				isRead: false,
			});
			res.json({ count });
		} catch (err) {
			res.status(500).json({ message: err.message });
		}
	};
}

module.exports = (io, connectedUsers) => {
	const controller = new NotificationController(io, connectedUsers);
	return {
		getNotifications: controller.getNotifications.bind(controller),
		markAsRead: controller.markAsRead.bind(controller),
		createNotification: controller.createNotification.bind(controller),
		getUnreadCount: controller.getUnreadCount.bind(controller),

		_controller: controller,
	};
};
