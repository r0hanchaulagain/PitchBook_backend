const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth");

// Get notification controller with WebSocket support
const notificationController = (req) => {
	const io = req.app.get("io");
	const connectedUsers = req.app.get("connectedUsers");
	return require("../controllers/notificationController")(io, connectedUsers);
};

// Get notifications (paginated)
router.get("/", authenticate, (req, res) =>
	notificationController(req).getNotifications(req, res)
);

// Mark notifications as read
router.post("/mark-read", authenticate, (req, res) =>
	notificationController(req).markAsRead(req, res)
);

// Get unread notifications count
router.get("/unread-count", authenticate, (req, res) =>
	notificationController(req).getUnreadCount(req, res)
);

module.exports = router;
