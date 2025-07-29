const cron = require("node-cron");
const logger = require("../utils/logger");
const { futsalCleanupJob } = require("./futsalRegistrationCleanup");

let cleanupTask;

const startCronJobs = () => {
	try {
		cleanupTask = cron.schedule(
			"0 0 * * *",
			async () => {
				logger.info("Running scheduled futsal cleanup job...");
				try {
					await futsalCleanupJob();
					logger.info("Scheduled futsal cleanup job completed successfully");
				} catch (error) {
					logger.error("Error in scheduled futsal cleanup job:", error);
				}
			},
			{
				scheduled: true,
				timezone: "Asia/Kathmandu",
			}
		);

		logger.info("Cron jobs started successfully");
		return cleanupTask;
	} catch (error) {
		logger.error("Failed to start cron jobs:", error);
		throw error;
	}
};

const stopCronJobs = () => {
	if (cleanupTask) {
		cleanupTask.stop();
		logger.info("Cron jobs stopped");
	}
};

process.on("SIGINT", () => {
	stopCronJobs();
	process.exit(0);
});

module.exports = {
	startCronJobs,
	stopCronJobs,
};
