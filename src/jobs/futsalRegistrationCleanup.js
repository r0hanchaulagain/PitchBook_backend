const mongoose = require("mongoose");
const Futsal = require("../models/Futsal");
const User = require("../models/User");
const nodemailer = require("nodemailer");
const config = require("../config/env_config");
const logger = require("../utils/logger");

let transporter;
if (
	config.smtp.host &&
	config.smtp.port &&
	config.smtp.user &&
	config.smtp.pass
) {
	transporter = nodemailer.createTransport({
		host: config.smtp.host,
		port: config.smtp.port,
		auth: {
			user: config.smtp.user,
			pass: config.smtp.pass,
		},
	});
} else {
	logger.warn(
		"SMTP configuration is incomplete. Email notifications will be disabled."
	);
}

async function sendReminderEmail(user, futsal) {
	if (!transporter) {
		logger.warn("Cannot send email: SMTP not configured");
		return;
	}

	try {
		await transporter.sendMail({
			from: config.smtp.from,
			to: user.email,
			subject: "Futsal Registration Payment Reminder",
			html: `<p>Dear ${user.fullName},</p>
            <p>Your futsal <b>${futsal.name}</b> registration is pending payment. Please pay the registration fee before ${futsal.registrationFeeStatus.expiryDate.toDateString()} to activate your futsal.</p>
            <p>If you do not complete payment, your futsal registration will expire and will be removed from our system.</p>
            <p>Thank you,<br/>Futsal App Team</p>`,
		});
		logger.info(`Sent payment reminder to ${user.email}`);
	} catch (error) {
		logger.error(`Failed to send email to ${user.email}:`, error.message);
	}
}

const ENV = config.nodeEnv || "development";

async function futsalCleanupJob() {
	if (mongoose.connection.readyState !== 1) {
		logger.warn("Skipping futsal cleanup: MongoDB not connected");
		return;
	}

	const isProduction = config.nodeEnv === "production";
	let session = null;

	try {
		const now = new Date();

		if (isProduction) {
			session = await mongoose.startSession();
			session.startTransaction();
		}

		const queryOptions = session ? { session } : {};

		const expiredFutsals = await Futsal.find(
			{
				"registrationFeeStatus.paid": false,
				"registrationFeeStatus.expiryDate": { $lte: now },
			},
			null,
			queryOptions
		);

		if (expiredFutsals.length > 0) {
			const ids = expiredFutsals.map((f) => f._id);
			await Futsal.deleteMany({ _id: { $in: ids } }, queryOptions);
			logger.info(`Deleted ${ids.length} expired futsal registrations`);
		}

		const twoDaysFromNow = new Date();
		twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

		const soonExpiring = await Futsal.find(
			{
				"registrationFeeStatus.paid": false,
				"registrationFeeStatus.expiryDate": {
					$gt: now,
					$lte: twoDaysFromNow,
				},
			},
			null,
			queryOptions
		);

		for (const futsal of soonExpiring) {
			try {
				const owner = await User.findById(futsal.owner).session(session);
				if (owner && owner.email) {
					await sendReminderEmail(owner, futsal);
					logger.info(
						`Sent reminder to ${owner.email} for futsal ${futsal.name}`
					);
				}
			} catch (error) {
				logger.error(`Error processing futsal ${futsal._id}:`, error.message);
				continue;
			}
		}

		if (isProduction && session) {
			await session.commitTransaction();
		}
		logger.info("Futsal cleanup job completed successfully");
	} catch (error) {
		if (isProduction && session) {
			await session.abortTransaction();
		}
		logger.error("Futsal cleanup job failed:", error.message);
		throw error;
	} finally {
		if (session) {
			await session.endSession();
		}
	}
}

module.exports = {
	futsalCleanupJob,
};
