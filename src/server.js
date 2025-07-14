process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const { app, server } = require("./app");
const { connectDB } = require("./config/db_connection");
const config = require("./config/env_config");
const logger = require("./utils/logger");
const { startCronJobs } = require("./jobs/cronManager");
const { setupProcessHandlers } = require("./utils/killing_processes");

const startServer = async () => {
	try {
		const dbConnection = await connectDB(config.mongoUri);

		await new Promise((resolve, reject) => {
			const checkConnection = () => {
				if (dbConnection.readyState === 1) {
					logger.info("Database connection verified");
					resolve();
				} else if (dbConnection.readyState === 0) {
					setTimeout(checkConnection, 100);
				} else {
					reject(new Error("Failed to connect to database"));
				}
			};
			checkConnection();
		});

		setupProcessHandlers(server);

		if (config.nodeEnv === "production") {
			await startCronJobs();
		} else {
			setTimeout(async () => {
				try {
					const {
						futsalCleanupJob,
					} = require("./jobs/futsalRegistrationCleanup");
					await futsalCleanupJob();
				} catch (error) {
					logger.error("Error running development cleanup job:", error);
				}
			}, 5000);
		}

		await new Promise((resolve, reject) => {
			server.listen(config.port, (err) => {
				if (err) return reject(err);
				const serverType =
					server instanceof require("https").Server ? "HTTPS" : "HTTP";
				logger.info(
					`Server running in ${config.nodeEnv} mode on port ${config.port} (${serverType})`
				);
				logger.info("WebSocket server is running");
				resolve();
			});
		});
	} catch (error) {
		logger.error("Failed to start server:", error);
		process.exit(1);
	}
};

process.on("unhandledRejection", (reason, promise) => {
	logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (error) => {
	logger.error("Uncaught Exception:", error);
});

startServer().catch((error) => {
	logger.error("Fatal error during server startup:", error);
	process.exit(1);
});

module.exports = { app, server };
