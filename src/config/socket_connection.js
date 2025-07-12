const { Server } = require("socket.io");
const logger = require("../utils/logger");
const {
	initializeDashboardSockets,
} = require("../controllers/futsalController");
const { getUnreadCount } = require("../controllers/notificationController");

const config = require("./env_config");

function setupSocket(server) {
	const io = new Server(server, {
		cors: {
			origin: config.frontendUrl,
			credentials: true,
		},
		transports: ["websocket", "polling"],
	});

	const connectedUsers = new Map();

	io.on("connection", (socket) => {
		logger.info(`New client connected: ${socket.id}`);

		socket.on("authenticate", (userId) => {
			if (userId) {
				connectedUsers.set(userId.toString(), socket.id);
				getUnreadCount(userId, (count) => {
					socket.emit("unreadCount", count);
				});
			}
		});

		socket.on("disconnect", () => {
			for (const [userId, socketId] of connectedUsers.entries()) {
				if (socketId === socket.id) {
					connectedUsers.delete(userId);
					break;
				}
			}
		});
	});

	initializeDashboardSockets(io);

	return { io, connectedUsers };
}

module.exports = { setupSocket };
