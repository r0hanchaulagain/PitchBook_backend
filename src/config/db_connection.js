const mongoose = require("mongoose");
const logger = require("../utils/logger");

let isConnected = false;
let connectionRetries = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds

async function connectDB(uri) {
	if (isConnected) {
		logger.info("Using existing MongoDB connection");
		return mongoose.connection;
	}

	try {
		// Configure mongoose to use native promises
		mongoose.Promise = global.Promise;

		// Set connection options
		const options = {
			serverSelectionTimeoutMS: 10000, // 10 seconds
			socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
			maxPoolSize: 10,
			retryWrites: true,
			w: "majority",
		};

		// Connect to MongoDB
		await mongoose.connect(uri, options);

		const db = mongoose.connection;

		// Event handlers
		db.on("connected", () => {
			isConnected = true;
			connectionRetries = 0;
			logger.info("MongoDB connected successfully");
		});

		db.on("error", (err) => {
			logger.error(`MongoDB connection error: ${err.message}`);
			isConnected = false;

			// Attempt to reconnect
			if (connectionRetries < MAX_RETRIES) {
				connectionRetries++;
				logger.info(
					`Attempting to reconnect (${connectionRetries}/${MAX_RETRIES})...`
				);
				setTimeout(() => connectDB(uri), RETRY_DELAY);
			} else {
				logger.error(
					"Max retries reached. Please check your MongoDB connection."
				);
				process.exit(1);
			}
		});

		db.on("disconnected", () => {
			logger.warn("MongoDB disconnected");
			isConnected = false;

			// Try to reconnect if this wasn't a manual disconnect
			if (process.env.NODE_ENV !== "test") {
				logger.info("Attempting to reconnect to MongoDB...");
				setTimeout(() => connectDB(uri), RETRY_DELAY);
			}
		});

		// Handle process termination
		process.on("SIGINT", async () => {
			try {
				await db.close();
				logger.info("MongoDB connection closed through app termination");
				process.exit(0);
			} catch (error) {
				logger.error("Error closing MongoDB connection:", error);
				process.exit(1);
			}
		});

		return db;
	} catch (error) {
		logger.error(`Failed to connect to MongoDB: ${error.message}`);

		// Retry connection
		if (connectionRetries < MAX_RETRIES) {
			connectionRetries++;
			logger.info(
				`Retrying connection (${connectionRetries}/${MAX_RETRIES})...`
			);
			await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
			return connectDB(uri);
		}

		logger.error("Max connection retries reached. Exiting...");
		process.exit(1);
	}
}

module.exports = { connectDB };
