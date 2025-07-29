const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth");

const notificationController = (req) => {
	const io = req.app.get("io");
	const connectedUsers = req.app.get("connectedUsers");
	return require("../controllers/notificationController")(io, connectedUsers);
};

router.get("/", authenticate, (req, res) =>
	notificationController(req).getNotifications(req, res)
);

router.post("/mark-read", authenticate, (req, res) =>
	notificationController(req).markAsRead(req, res)
);

router.get("/unread-count", authenticate, (req, res) =>
	notificationController(req).getUnreadCount(req, res)
);

module.exports = router;
