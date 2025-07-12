const logger = require("./logger");

const gracefulShutdown = (server) => {
	return async () => {
		logger.info("Shutdown signal received. Closing server...");

		try {
			if (server && typeof server.close === "function") {
				await new Promise((resolve) => server.close(resolve));
				logger.info("HTTP server closed");
			}

			const mongoose = require("mongoose");
			if (mongoose.connection.readyState === 1) {
				await mongoose.connection.close();
				logger.info("MongoDB connection closed");
			}

			logger.info("Process terminated");
			process.exit(0);
		} catch (error) {
			logger.error("Error during shutdown:", error);
			process.exit(1);
		}
	};
};

const setupProcessHandlers = (server) => {
	const shutdownHandler = gracefulShutdown(server);

	process.removeListener("SIGTERM", shutdownHandler);
	process.removeListener("SIGINT", shutdownHandler);

	process.on("SIGTERM", shutdownHandler);
	process.on("SIGINT", shutdownHandler);

	process.setMaxListeners(20);
};

module.exports = {
	setupProcessHandlers,
};
