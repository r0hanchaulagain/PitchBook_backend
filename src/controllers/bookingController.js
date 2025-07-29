const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Futsal = require("../models/Futsal");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { calculateDynamicPrice } = require("../utils/pricing");
const { isHoliday } = require("../services/holidayService");
const { initiateKhaltiPayment } = require("../utils/payment");
const config = require("../config/env_config");

exports.createCashBooking = async (req, res) => {
	const useTransaction = config.nodeEnv === "production";
	const session = useTransaction ? await mongoose.startSession() : null;

	if (useTransaction) await session.startTransaction();

	try {
		const notificationController = getNotificationController(req);
		const { futsalId, date, startTime, endTime, bookingType, teamA, teamB } =
			req.body;

		if (!futsalId || !date || !startTime || !endTime || !bookingType) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({ message: "Missing required fields" });
		}

		let finalTeamA = teamA;
		let finalTeamB = teamB;

		if (bookingType === "full") {
			finalTeamA = finalTeamA !== undefined ? finalTeamA : true;
			finalTeamB = finalTeamB !== undefined ? finalTeamB : true;
		} else if (bookingType === "partial") {
			if (finalTeamA === undefined) {
				if (useTransaction) {
					await session.abortTransaction();
					session.endSession();
				}
				return res
					.status(400)
					.json({ message: "Team A is required for partial booking" });
			}

			finalTeamB = false;
		} else {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({ message: "Invalid booking type" });
		}

		const query = Futsal.findById(futsalId).populate("owner");
		if (useTransaction) query.session(session);
		const futsal = await query;

		if (!futsal || !futsal.isActive) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(404).json({ message: "Futsal not found or inactive" });
		}

		const duration = calculateDurationInMinutes(startTime, endTime);
		if (duration < 30 || duration > 120 || duration % 15 !== 0) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({
				message:
					"Invalid booking duration. Allowed: 30-120 min, in 15-min steps.",
			});
		}

		const slotQuery = Booking.findOne({
			futsal: futsalId,
			date: new Date(date),
			status: { $nin: ["cancelled"] },
			$or: [
				{ startTime: { $lt: endTime }, endTime: { $gt: startTime } },
				{ startTime: startTime, endTime: endTime },
			],
		});

		if (useTransaction) slotQuery.session(session);
		const slotConflict = await slotQuery;

		if (slotConflict) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(409).json({ message: "Time slot already booked" });
		}

		const bookingStart = new Date(`${date}T${startTime}`);
		if (bookingStart < new Date()) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({ message: "Cannot book for past time" });
		}

		const isHolidayFlag = await isHoliday(date);
		if (
			!isSlotWithinOperatingHours(
				startTime,
				endTime,
				futsal.operatingHours,
				date,
				isHolidayFlag
			)
		) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({
				message: "Booking time is outside of operating hours",
				operatingHours: futsal.operatingHours,
				isHoliday: isHolidayFlag,
			});
		}

		const baseDynamicPrice = await calculateDynamicPrice(futsal, {
			date,
			time: startTime,
		});

		const price = Math.round(baseDynamicPrice * (duration / 60));

		const booking = new Booking({
			futsal: futsalId,
			user: req.user._id,
			date: new Date(date),
			startTime,
			endTime,
			price,
			status: "confirmed",
			isPaid: true,
			paymentStatus: "paid",
			paymentMethod: "cash",
			paymentDetails: {
				paymentMethod: "cash",
				paymentDate: new Date(),
			},
			bookingType,
			teamA: finalTeamA,
			teamB: finalTeamB,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		if (useTransaction) {
			const saveOptions = useTransaction ? { session } : {};
			await booking.save(saveOptions);
		} else {
			await booking.save();
		}

		const Payment = require("../models/Payment");
		const payment = new Payment({
			user: req.user._id,
			booking: booking._id,
			futsal: futsal._id,
			type: "booking",
			amount: price,
			status: "completed",
			paymentMethod: "cash",
			transactionId: `CASH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
			metadata: {
				date: booking.date,
				startTime: booking.startTime,
				endTime: booking.endTime,
				receivedBy: req.user._id,
				receivedAt: new Date(),
			},
		});

		if (useTransaction) {
			await payment.save({ session });
		} else {
			await payment.save();
		}

		booking.payment = payment._id;
		if (useTransaction) {
			const saveOptions = useTransaction ? { session } : {};
			await booking.save(saveOptions);
		} else {
			await booking.save();
		}

		await notificationController.createNotification({
			user: req.user._id,
			message: `Your cash booking for ${futsal.name} on ${date} from ${startTime} to ${endTime} has been created.`,
			type: "booking_created",
			meta: { booking: booking._id },
			futsal: futsalId,
		});

		if (futsal.owner && futsal.owner._id) {
			await notificationController.createNotification({
				user: futsal.owner._id,
				message: `New cash booking for your futsal ${futsal.name} on ${date} from ${startTime} to ${endTime}.`,
				type: "new_booking",
				meta: {
					booking: booking._id,
					futsal: futsalId,
					customer: req.user._id,
				},
			});
		}

		if (useTransaction) {
			await session.commitTransaction();
			session.endSession();
		}

		return res.status(201).json({
			message: "Cash booking created successfully",
			booking,
		});
	} catch (err) {
		console.error("Error creating cash booking:", err);

		if (useTransaction && session) {
			try {
				await session.abortTransaction();
				session.endSession();
			} catch (transactionErr) {
				console.error("Error aborting transaction:", transactionErr);
			}
		}

		res.status(500).json({
			message: "Error creating cash booking",
			error:
				config.nodeEnv === "production" ? "Internal server error" : err.message,
		});
	}
};

const getNotificationController = (req = {}) => {
	try {
		if (req.app) {
			const io = req.app.get("io");
			const connectedUsers = req.app.get("connectedUsers");
			return require("../controllers/notificationController")(
				io,
				connectedUsers
			);
		}

		console.warn(
			"No request.app available, using mock notification controller"
		);
		return {
			createNotification: async (data) => {
				return { _id: new mongoose.Types.ObjectId() };
			},
		};
	} catch (error) {
		console.error("Error initializing notification controller:", error);

		return {
			createNotification: async () => ({}),
		};
	}
};

const ALLOWED_DURATIONS = [60, 120];
const MAX_BULK_DAYS = 7;
const BOOKING_DURATION_MINUTES = 60;

function calculateDurationInMinutes(startTime, endTime) {
	const [sh, sm] = startTime.split(":").map(Number);
	const [eh, em] = endTime.split(":").map(Number);
	return eh * 60 + em - (sh * 60 + sm);
}

function isSlotWithinOperatingHours(
	startTime,
	endTime,
	operatingHours,
	date,
	isHolidayFlag
) {
	const day = new Date(date).getDay();
	let hours;
	if (isHolidayFlag && operatingHours.holidays) {
		hours = operatingHours.holidays;
	} else if (day === 0 || day === 6) {
		hours = operatingHours.weekends;
	} else {
		hours = operatingHours.weekdays;
	}
	if (!hours || !hours.open || !hours.close) return false;
	return startTime >= hours.open && endTime <= hours.close;
}

function getDayOfWeek(date) {
	return new Date(date)
		.toLocaleDateString("en-US", { weekday: "long" })
		.toLowerCase();
}

exports.createBooking = async (req, res) => {
	const useTransaction = config.nodeEnv === "production";
	const session = useTransaction ? await mongoose.startSession() : null;

	if (useTransaction) {
		await session.startTransaction();
	}

	try {
		const notificationController = getNotificationController(req);
		const { futsalId, date, startTime, endTime, bookingType, teamA, teamB } =
			req.body;

		if (!futsalId || !date || !startTime || !endTime || !bookingType) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({ message: "Missing required fields" });
		}

		if (bookingType === "full" && (!teamA || !teamB)) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res
				.status(400)
				.json({ message: "Both teams are required for full booking" });
		} else if (bookingType === "partial" && !teamA) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res
				.status(400)
				.json({ message: "Team A is required for partial booking" });
		}

		if (bookingType === "full") {
			if (teamA !== true || teamB !== true) {
				return res.status(400).json({
					message: "Both teamA and teamB must be true for full booking",
				});
			}
		} else if (bookingType === "partial") {
			if (teamA !== true || teamB !== false) {
				return res.status(400).json({
					message:
						"For partial booking, teamA must be true and teamB must be false",
				});
			}
		} else {
			return res.status(400).json({ message: "Invalid bookingType" });
		}

		const futsal = await Futsal.findById(futsalId).populate("owner");
		if (!futsal || !futsal.isActive) {
			return res.status(404).json({ message: "Futsal not found or inactive" });
		}

		const duration = calculateDurationInMinutes(startTime, endTime);

		if (duration < 30 || duration > 120 || duration % 15 !== 0) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({
				message:
					"Invalid booking duration. Allowed: 30-120 min, in 15-min steps.",
			});
		}

		const baseDynamicPrice = await calculateDynamicPrice(futsal, {
			date,
			time: startTime,
		});

		const finalPrice = Math.round(baseDynamicPrice * (duration / 60));

		const isHolidayFlag = await isHoliday(date);
		if (
			!isSlotWithinOperatingHours(
				startTime,
				endTime,
				futsal.operatingHours,
				date,
				isHolidayFlag
			)
		) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res
				.status(400)
				.json({ message: "Booking time outside operating hours" });
		}

		const bookingStart = new Date(`${date}T${startTime}`);
		if (bookingStart < new Date()) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({ message: "Cannot book for past time" });
		}

		const paidBookingConflict = await Booking.findOne({
			futsal: futsalId,
			date: new Date(date),
			isPaid: true,
			status: { $nin: ["cancelled"] },
			$or: [{ startTime: { $lt: endTime }, endTime: { $gt: startTime } }],
		}).session(useTransaction ? session : null);

		if (paidBookingConflict) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(409).json({
				message: "This time slot has already been booked and paid for",
			});
		}

		const competingBookings = await Booking.find({
			futsal: futsalId,
			date: new Date(date),
			isPaid: false,
			status: "pending",
			paymentExpiresAt: { $gt: new Date() },
			$or: [{ startTime: { $lt: endTime }, endTime: { $gt: startTime } }],
		}).session(session || null);

		const userPaidConflict = await Booking.findOne({
			user: req.user._id,
			date: new Date(date),
			isPaid: true,
			status: { $nin: ["cancelled"] },
			$or: [{ startTime: { $lt: endTime }, endTime: { $gt: startTime } }],
		}).session(useTransaction ? session : null);

		if (userPaidConflict) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res
				.status(409)
				.json({ message: "You already have a paid booking during this time" });
		}

		const userPendingCount = await Booking.countDocuments({
			user: req.user._id,
			isPaid: false,
			status: "pending",
			paymentExpiresAt: { $gt: new Date() },
		}).session(useTransaction ? session : null);

		if (userPendingCount >= 3) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({
				message:
					"You have too many pending bookings. Please complete payment for existing bookings or wait for them to expire.",
			});
		}

		const paymentExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

		const booking = new Booking({
			futsal: futsalId,
			user: req.user._id,
			date: new Date(date),
			startTime,
			endTime,
			price: finalPrice,
			status: "pending",
			isPaid: false,
			paymentExpiresAt,
			competingBookings: competingBookings.map((b) => b._id),
			createdAt: new Date(),
			updatedAt: new Date(),
			bookingType,
			teamA,
			teamB,
		});

		if (competingBookings.length > 0) {
			await Booking.updateMany(
				{ _id: { $in: competingBookings.map((b) => b._id) } },
				{ $push: { competingBookings: booking._id } },
				{ session: useTransaction ? session : null }
			);
		}

		try {
			const saveOptions = useTransaction ? { session } : {};
			await booking.save(saveOptions);

			await notificationController.createNotification(
				{
					user: req.user._id,
					message: `Your booking for ${futsal.name} on ${date} from ${startTime} to ${endTime} has been created. You have 15 minutes to complete the payment.`,
					type: "booking_created",
					meta: { booking: booking._id },
					futsal: futsalId,
				},
				{ session: useTransaction ? session : null }
			);

			if (futsal.owner && futsal.owner._id) {
				await notificationController.createNotification(
					{
						user: futsal.owner._id,
						message: `New pending booking for your futsal ${futsal.name} on ${date} from ${startTime} to ${endTime}.`,
						type: "new_booking",
						meta: {
							booking: booking._id,
							futsal: futsalId,
							customer: req.user._id,
						},
					},
					{ session: useTransaction ? session : null }
				);
			}

			if (useTransaction) {
				await session.commitTransaction();
				session.endSession();
			} else if (session) {
				session.endSession();
			}

			return res.status(201).json({
				message:
					"Booking created successfully. Please complete payment within 15 minutes.",
				booking: {
					...booking.toObject(),
					paymentExpiresAt,
					paymentUrl: `/api/v1/booking/${booking._id}/initiate-payment`,
				},
				price: finalPrice,
				paymentExpiresAt,
			});
		} catch (err) {
			if (useTransaction && session && session.inTransaction()) {
				await session.abortTransaction();
				session.endSession();
			} else if (session) {
				session.endSession();
			}
			console.error("Error creating booking:", err);
			return res.status(500).json({
				message: "Failed to create booking",
				error: err.message,
			});
		}
	} catch (err) {
		if (useTransaction && session && session.inTransaction()) {
			await session.abortTransaction();
			session.endSession();
		} else if (session) {
			session.endSession();
		}
		console.error("Unexpected error in createBooking:", err);
		return res.status(500).json({
			message: "An unexpected error occurred",
			error: err.message,
		});
	}
};

exports.createBulkBookingWithPayment = async (req, res) => {
	const useTransaction = config.nodeEnv === "production";
	const session = useTransaction ? await mongoose.startSession() : null;
	const notificationController = getNotificationController(req);

	if (useTransaction) {
		await session.startTransaction();
	}

	try {
		const { futsalId, startDate, numberOfDays, bookingType } = req.body;
		const userId = req.user._id;

		if (!futsalId || !startDate || !numberOfDays || !bookingType) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({ message: "Missing required fields" });
		}

		if (numberOfDays > MAX_BULK_DAYS) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({
				message: `Bulk booking cannot exceed ${MAX_BULK_DAYS} days`,
			});
		}

		const futsal = await Futsal.findById(futsalId).populate("owner");
		if (!futsal || !futsal.isActive) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(404).json({ message: "Futsal not found or inactive" });
		}

		if (!["full", "partial"].includes(bookingType)) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({ message: "Invalid bookingType" });
		}

		const openingTime = futsal.operatingHours?.opening || "06:00";
		const closingTime = futsal.operatingHours?.closing || "22:00";

		const durationHours =
			calculateDurationInMinutes(openingTime, closingTime) / 60;

		const basePricePerHour = futsal.pricePerHour || 1000;
		const pricePerDay = Math.ceil(basePricePerHour * durationHours);
		const totalPrice = pricePerDay * numberOfDays;

		const bookingDates = [];
		const currentDate = new Date(startDate);
		const now = new Date();

		for (let i = 0; i < numberOfDays; i++) {
			if (currentDate < now) {
				if (useTransaction) {
					await session.abortTransaction();
					session.endSession();
				}
				return res.status(400).json({
					message: `Cannot book for past date: ${currentDate.toISOString().split("T")[0]}`,
				});
			}

			const existingBooking = await Booking.findOne({
				futsal: futsalId,
				date: currentDate,
				isPaid: true,
				status: { $nin: ["cancelled"] },
				$or: [
					{ startTime: { $lt: closingTime } },
					{ endTime: { $gt: openingTime } },
				],
			}).session(useTransaction ? session : null);

			if (existingBooking) {
				if (useTransaction) {
					await session.abortTransaction();
					session.endSession();
				}
				return res.status(409).json({
					message: `Time slot already booked on ${currentDate.toISOString().split("T")[0]}`,
				});
			}

			bookingDates.push(new Date(currentDate));
			currentDate.setDate(currentDate.getDate() + 1);
		}

		const paymentExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
		const bookings = bookingDates.map((date) => ({
			user: userId,
			futsal: futsalId,
			date: date,
			startTime: openingTime,
			endTime: closingTime,
			price: pricePerDay,
			bookingType,
			teamA: true,
			teamB: bookingType === "full",
			status: "pending",
			isPaid: false,
			paymentStatus: "pending",
			paymentMethod: "khalti",
			paymentExpiresAt,
			createdAt: new Date(),
			updatedAt: new Date(),
		}));

		const createdBookings = await Booking.insertMany(bookings, { session });
		const bookingIds = createdBookings.map((b) => b._id);

		const amountToSend = Math.min(totalPrice, 1000);

		const khaltiPayload = {
			name: req.user.fullName || "Customer",
			email: req.user.email || "",
			phone: req.user.phone || "",
			amount: amountToSend,
			purchase_order_id: `bulk_${Date.now()}`,
			purchase_order_name: `Full Day Booking for ${futsal.name} (${numberOfDays} days)`,
			return_url: `${config.frontendUrl}/bookings/verify`,
		};

		const paymentInit = await initiateKhaltiPayment(khaltiPayload);

		const updateResult = await Booking.updateMany(
			{ _id: { $in: bookingIds } },
			{
				$set: {
					"paymentDetails.pidx": paymentInit.pidx,
					paymentUrl: paymentInit.payment_url,
				},
			}
		);

		const notificationPromises = [];

		notificationPromises.push(
			notificationController.createNotification(
				{
					user: userId,
					message: `Your bulk booking for ${futsal.name} (${numberOfDays} days) has been created. Please complete payment within 30 minutes.`,
					type: "booking_created",
					meta: { booking: bookingIds[0] },
					futsal: futsalId,
				},
				{ session }
			)
		);

		if (futsal.owner && futsal.owner._id) {
			notificationPromises.push(
				notificationController.createNotification(
					{
						user: futsal.owner._id,
						message: `New bulk booking request for ${futsal.name} (${numberOfDays} days).`,
						type: "new_booking",
						meta: {
							booking: bookingIds[0],
							futsal: futsalId,
							customer: userId,
						},
					},
					{ session }
				)
			);
		}

		await Promise.all(notificationPromises);

		if (useTransaction) {
			await session.commitTransaction();
			session.endSession();
		}

		res.status(201).json({
			success: true,
			message:
				"Full day bookings created successfully. Please complete the payment.",
			totalAmount: totalPrice,
			currency: "NPR",
			paymentUrl: paymentInit.payment_url,
			pidx: paymentInit.pidx,
			bookingIds,
			bookingDates: bookingDates.map((d) => d.toISOString().split("T")[0]),
			paymentExpiresAt,
			duration: {
				startTime: openingTime,
				endTime: closingTime,
				hours: durationHours,
			},
		});
	} catch (error) {
		console.error("Bulk booking payment error:", {
			message: error.message,
			status: error.response?.status,
			data: error.response?.data,
			url: error.config?.url,
		});
		if (useTransaction && session) {
			await session.abortTransaction();
			session.endSession();
		}
		res.status(500).json({
			success: false,
			message: "Failed to process full day bulk booking",
			error: error.message,
		});
	}
};

exports.getAllBookings = async (req, res) => {
	try {
		if (req.user.role !== "admin") {
			return res.status(403).json({ message: "Admin only" });
		}
		const bookings = await Booking.find().populate("futsal").populate("user");
		res.status(200).json({ bookings });
	} catch (err) {
		res.status(500).json({ message: "Server error", error: err.message });
	}
};

exports.getMyBookings = async (req, res) => {
	try {
		const bookings = await Booking.find({
			user: req.user._id,
			status: { $ne: "cancelled" },
		})
			.populate("futsal", "name location images")
			.sort({ date: -1, startTime: -1 });

		res.status(200).json({
			success: true,
			count: bookings.length,
			data: bookings,
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			message: "Server error",
			error: config.nodeEnv === "development" ? err.message : undefined,
		});
	}
};

exports.getBookingById = async (req, res) => {
	try {
		const booking = await Booking.findById(req.params.id)
			.populate("futsal")
			.populate("user");
		if (!booking) {
			return res.status(404).json({ message: "Booking not found" });
		}

		if (
			req.user.role !== "admin" &&
			booking.user._id.toString() !== req.user._id.toString()
		) {
			return res.status(403).json({ message: "Not authorized" });
		}
		res.status(200).json({ booking });
	} catch (err) {
		res.status(500).json({ message: "Server error", error: err.message });
	}
};

exports.updateBooking = async (req, res) => {
	try {
		const booking = await Booking.findById(req.params.id);
		if (!booking) {
			return res.status(404).json({ message: "Booking not found" });
		}
		if (
			req.user.role !== "admin" &&
			booking.user.toString() !== req.user._id.toString()
		) {
			return res.status(403).json({ message: "Not authorized" });
		}

		if (req.body.status !== undefined) {
			booking.status = req.body.status;
		}
		booking.updatedAt = new Date();
		await booking.save();
		res.status(200).json({ message: "Booking updated", booking });
	} catch (err) {
		res.status(500).json({ message: "Server error", error: err.message });
	}
};

exports.cancelBooking = async (req, res) => {
	try {
		const booking = await Booking.findById(req.params.id).populate("futsal");
		if (!booking) {
			return res.status(404).json({ message: "Booking not found" });
		}
		if (
			req.user.role !== "admin" &&
			booking.user.toString() !== req.user._id.toString()
		) {
			return res.status(403).json({ message: "Not authorized" });
		}
		if (booking.status === "cancelled") {
			return res.status(400).json({ message: "Booking already cancelled" });
		}
		booking.status = "cancelled";
		booking.updatedAt = new Date();
		await booking.save();

		const user = await User.findById(booking.user);
		if (user && user.email) {
			const html = `<p>Your booking for ${booking.futsal.name} on ${booking.date.toDateString()} from ${booking.startTime} to ${booking.endTime} has been cancelled.</p>`;
			await sendBookingEmail({
				to: user.email,
				subject: "Booking Cancelled",
				html,
			});
		}

		if (booking.futsal.owner && booking.futsal.owner.email) {
			const html = `<p>A booking for your futsal <b>${booking.futsal.name}</b> on ${booking.date.toDateString()} from ${booking.startTime} to ${booking.endTime} has been cancelled.</p>`;
			await sendBookingEmail({
				to: booking.futsal.owner.email,
				subject: "Booking Cancelled",
				html,
			});
		}
		res.status(200).json({ message: "Booking cancelled", booking });
	} catch (err) {
		res.status(500).json({ message: "Server error", error: err.message });
	}
};

exports.joinBooking = async (req, res) => {
	try {
		const booking = await Booking.findById(req.params.id).populate(
			"user",
			"name email phone"
		);
		if (!booking) {
			return res.status(404).json({
				success: false,
				message: "Booking not found",
			});
		}

		if (booking.user._id.toString() === req.user._id.toString()) {
			return res.status(400).json({
				success: false,
				message: "You cannot join your own booking",
			});
		}

		if (booking.bookingType !== "partial" || booking.teamB !== false) {
			return res.status(400).json({
				success: false,
				message: "This booking is not open for joining",
			});
		}

		booking.teamB = true;
		booking.teamBUser = {
			user: req.user._id,
			name: req.user.name,
			email: req.user.email,
			phone: req.user.phone,
			joinedAt: new Date(),
		};

		booking.status = "confirmed";
		booking.updatedAt = new Date();

		await booking.save();

		if (booking.competingBookings && booking.competingBookings.length > 0) {
			await Booking.updateMany(
				{
					_id: { $in: booking.competingBookings },
					status: "pending",
				},
				{
					$set: {
						status: "unavailable",
						updatedAt: new Date(),
					},
				}
			);
		}

		res.status(200).json({
			success: true,
			message: "Successfully joined the booking as Team B",
			booking,
		});
	} catch (err) {
		console.error("Error joining booking:", err);
		res.status(500).json({
			success: false,
			message: "Failed to join booking",
			error: err.message,
		});
	}
};

exports.checkFutsalAvailability = async (req, res) => {
	try {
		const { futsalId } = req.params;
		const { date, startTime, endTime } = req.query;
		if (!futsalId || !date) {
			return res.status(400).json({ message: "Missing required parameters" });
		}
		const futsal = await Futsal.findById(futsalId);
		if (!futsal || !futsal.isActive) {
			return res.status(404).json({ message: "Futsal not found or inactive" });
		}
		if (startTime && endTime) {
			const slotConflict = await Booking.findOne({
				futsal: futsalId,
				date: new Date(date),
				status: { $nin: ["cancelled"] },
				$or: [{ startTime: { $lt: endTime }, endTime: { $gt: startTime } }],
			});
			if (slotConflict) {
				return res
					.status(200)
					.json({ available: false, message: "Slot not available" });
			}
			return res
				.status(200)
				.json({ available: true, message: "Slot available" });
		}

		const bookings = await Booking.find({
			futsal: futsalId,
			date: new Date(date),
			status: { $nin: ["cancelled"] },
		});
		res.status(200).json({ bookings });
	} catch (err) {
		res.status(500).json({ message: "Server error", error: err.message });
	}
};

exports.initiateBookingAsTeamA = async (req, res) => {
	try {
		const { futsalId, date, startTime, endTime, bookingType } = req.body;
		if (!futsalId || !date || !startTime || !endTime || !bookingType) {
			return res.status(400).json({ message: "Missing required fields" });
		}

		const futsal = await Futsal.findById(futsalId).populate("owner");
		if (!futsal || !futsal.isActive) {
			return res.status(404).json({ message: "Futsal not found or inactive" });
		}

		let price = futsal.pricing.basePrice;
		if (futsal.pricing.rules && Array.isArray(futsal.pricing.rules)) {
			const bookingDay = getDayOfWeek(date);
			for (const rule of futsal.pricing.rules) {
				if (
					(rule.day === bookingDay || rule.day === "any") &&
					startTime >= rule.start &&
					endTime <= rule.end
				) {
					price = rule.price;
				}
			}
		}

		const duration = calculateDurationInMinutes(startTime, endTime);
		if (!ALLOWED_DURATIONS.includes(duration)) {
			return res.status(400).json({
				message: "Invalid booking duration. Allowed: 30, 60, 90, 120 min",
			});
		}

		const slotConflict = await Booking.findOne({
			futsal: futsalId,
			date: new Date(date),
			startTime,
			endTime,
			status: { $nin: ["cancelled"] },
		});
		if (slotConflict) {
			return res.status(409).json({ message: "Slot already booked" });
		}

		const booking = new Booking({
			futsal: futsalId,
			user: req.user._id,
			date,
			startTime,
			endTime,
			price,
			status: "pending",
			bookingType,
			teamA: true,
			teamB: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await booking.save();

		if (futsal.owner && futsal.owner.email) {
			const html = `<p>A new booking has been initiated for your futsal <b>${futsal.name}</b> on ${date} from ${startTime} to ${endTime}.</p>`;
		}
		res.status(201).json({ message: "Booking initiated as Team A", booking });
	} catch (err) {
		res.status(500).json({ message: "Server error", error: err.message });
	}
};

exports.getAvailableSlots = async (req, res) => {
	try {
		const { futsalId, date } = req.query;
		if (!futsalId || !date) {
			return res
				.status(400)
				.json({ message: "futsalId and date are required" });
		}
		const futsal = await Futsal.findById(futsalId);
		if (!futsal) {
			return res.status(404).json({ message: "Futsal not found" });
		}

		const bookings = await Booking.find({
			futsal: futsalId,
			date: new Date(date),
			status: { $in: ["confirmed", "paid"] },
			$or: [
				{ isPaid: true },
				{ paymentMethod: "cash" },
				{ paymentStatus: "completed" },
				{ status: "confirmed" },
			],
		});

		const bookedSlots = bookings.map((b) => ({
			startTime: b.startTime,
			endTime: b.endTime,
		}));

		res.json({ bookedSlots });
	} catch (err) {
		res.status(500).json({ message: "Server error", error: err.message });
	}
};

exports.initiateKhaltiPayment = async (req, res) => {
	try {
		const bookingId = req.params.id;
		const booking = await Booking.findById(bookingId).populate("futsal user");
		if (!booking) return res.status(404).json({ error: "Booking not found" });
		if (booking.paymentStatus === "paid") {
			return res.status(400).json({ error: "Booking already paid" });
		}

		const { fullName, email, phone } = booking.user;
		const amount = booking.price;
		const return_url = req.body.return_url || req.query.return_url;
		const paymentInit = await initiateKhaltiPayment({
			name: fullName || booking.user.name || "User",
			email: email || "",
			phone: phone || "",
			amount,
			purchase_order_id: booking._id.toString(),
			purchase_order_name: `Booking for ${booking.futsal.name}`,
			return_url,
		});

		booking.paymentDetails = booking.paymentDetails || {};
		booking.paymentDetails.khaltiPidx = paymentInit.pidx;
		await booking.save();
		res.status(201).json({
			message:
				"Khalti payment initiated. Complete payment using the provided URL.",
			payment_url: paymentInit.payment_url,
			pidx: paymentInit.pidx,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

exports.verifyKhaltiPayment = async (req, res) => {
	const useTransaction = config.nodeEnv === "production";
	const session = useTransaction ? await mongoose.startSession() : null;

	if (useTransaction) {
		await session.startTransaction();
	}

	try {
		const bookingId = req.params.id;
		const { pidx } = req.query;

		if (!pidx) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			} else if (session) {
				session.endSession();
			}
			return res.status(400).json({ error: "Payment ID (pidx) is required" });
		}

		const query = Booking.findById(bookingId)
			.populate("futsal user")
			.populate({
				path: "competingBookings",
				select: "user futsal date startTime endTime",
				populate: [
					{ path: "user", select: "name email" },
					{ path: "futsal", select: "name owner" },
				],
			});

		if (useTransaction) {
			query.session(session);
		}

		const booking = await query;

		if (!booking) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			} else if (session) {
				session.endSession();
			}
			return res.status(404).json({ error: "Booking not found" });
		}

		if (booking.isPaid) {
			if (useTransaction) {
				await session.commitTransaction();
				session.endSession();
			} else if (session) {
				session.endSession();
			}
			return res.status(200).json({
				message: "Payment already verified",
				booking,
				redirectUrl: `/bookings/${booking._id}?payment=success`,
			});
		}

		if (booking.paymentExpiresAt && booking.paymentExpiresAt < new Date()) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			} else if (session) {
				session.endSession();
			}
			return res.status(400).json({
				error: "Payment session has expired. Please create a new booking.",
				redirectUrl: `/futsals/${booking.futsal._id}/book?expired=true`,
			});
		}

		const lookup = await require("../services/khaltiService").lookupPayment(
			pidx
		);

		if (lookup.status === "Completed") {
			booking.isPaid = true;
			booking.paymentStatus = "paid";
			booking.status = "confirmed";
			booking.paymentDetails = {
				...booking.paymentDetails,
				paymentMethod: "khalti",
				paymentDate: new Date(),
				transactionId: pidx,
			};

			const saveOptions = useTransaction ? { session } : {};
			const updatedBooking = await booking.save(saveOptions);

			if (booking.competingBookings && booking.competingBookings.length > 0) {
				const competingBookingIds = booking.competingBookings.map((b) => b._id);

				const updateOptions = useTransaction ? { session } : {};
				await Booking.updateMany(
					{ _id: { $in: competingBookingIds } },
					{
						$set: {
							status: "cancelled",
							updatedAt: new Date(),
							cancellationReason: "Another user completed payment first",
						},
					},
					updateOptions
				);

				const notificationPromises = booking.competingBookings.map(
					(competing) => {
						const notificationController = getNotificationController(req);
						return notificationController
							.createNotification({
								user: competing.user._id,
								message:
									`The time slot you were interested in at ${competing.futsal.name} on ${competing.date.toISOString().split("T")[0]} ` +
									`from ${competing.startTime} to ${competing.endTime} is no longer available.`,
								type: "booking_cancelled",
								meta: {
									booking: competing._id,
									futsal: competing.futsal._id,
									reason: "Another user completed payment first",
								},
							})
							.catch((err) => {
								console.error(
									"Failed to send notification for competing booking:",
									err
								);
								return null;
							});
					}
				);

				await Promise.all(notificationPromises);
			}

			const Payment = require("../models/Payment");
			const existingPayment = await Payment.findOne({
				booking: booking._id,
				transactionId: pidx,
				status: "completed",
			}).session(session || null);

			let transaction;
			if (!existingPayment) {
				transaction = new Payment({
					user: booking.user._id,
					booking: booking._id,
					futsal: booking.futsal._id,
					type: "booking",
					amount: booking.price,
					status: "completed",
					paymentMethod: "khalti",
					transactionId: pidx,
					metadata: {
						date: booking.date,
						startTime: booking.startTime,
						endTime: booking.endTime,
					},
					paidAt: new Date(),
				});
				await transaction.save({ session });
			} else {
				transaction = existingPayment;
			}

			const notificationController = getNotificationController(req);
			await Promise.all(
				[
					notificationController
						.createNotification({
							user: booking.user._id,
							message:
								`Your payment for booking at ${booking.futsal.name} on ${booking.date.toISOString().split("T")[0]} ` +
								`from ${booking.startTime} to ${booking.endTime} has been confirmed.`,
							type: "payment_confirmed",
							meta: {
								booking: booking._id,
								futsal: booking.futsal._id,
								transaction: transaction._id,
							},
						})
						.catch((err) => {
							console.error(
								"Failed to send payment confirmation to user:",
								err
							);
							return null;
						}),

					notificationController
						.createNotification({
							user: booking.futsal.owner,
							message:
								`Payment confirmed for booking at ${booking.futsal.name} on ${booking.date.toISOString().split("T")[0]} ` +
								`from ${booking.startTime} to ${booking.endTime}.`,
							type: "booking_confirmed",
							meta: {
								booking: booking._id,
								futsal: booking.futsal._id,
								customer: booking.user._id,
								transaction: transaction._id,
							},
						})
						.catch((err) => {
							console.error(
								"Failed to send booking confirmation to futsal owner:",
								err
							);
							return null;
						}),
				].filter((p) => p !== null)
			);

			if (useTransaction) {
				await session.commitTransaction();
				session.endSession();
			} else if (session) {
				session.endSession();
			}

			return res.status(200).json({
				message: "Payment verified successfully",
				booking,
				transaction,
				redirectUrl: `/bookings/${booking._id}?payment=success`,
			});
		} else {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			} else if (session) {
				session.endSession();
			}

			booking.paymentStatus = "failed";
			const saveOptions = useTransaction ? { session } : {};
			await booking.save(saveOptions);

			return res.status(400).json({
				error: "Payment verification failed",
				booking,
				redirectUrl: `/bookings/${booking._id}/payment?status=failed`,
			});
		}
	} catch (error) {
		console.error("Error in verifyKhaltiPayment:", {
			message: error.message,
			stack: error.stack,
			bookingId: req.params.id,
			pidx: req.query.pidx,
		});

		if (useTransaction && session && session.inTransaction()) {
			await session.abortTransaction();
			session.endSession();
		} else if (session) {
			session.endSession();
		}

		return res.status(500).json({
			error: "An error occurred while verifying payment",
			details: config.nodeEnv === "development" ? error.message : undefined,
		});
	}
};

exports.verifyBulkKhaltiPayment = async (req, res) => {
	const { pidx } = req.query;
	if (!pidx) {
		return res.status(400).json({ error: "Missing pidx" });
	}
	try {
		const bookings = await Booking.find({ "paymentDetails.pidx": pidx });
		if (!bookings || bookings.length === 0) {
			return res
				.status(404)
				.json({ error: "No bookings found for this payment" });
		}

		const Payment = require("../models/Payment");
		const notificationController = getNotificationController(req);

		const results = [];
		for (const booking of bookings) {
			booking.paymentStatus = "paid";
			booking.status = "confirmed";
			booking.isPaid = true;
			booking.paymentDetails = booking.paymentDetails || {};
			booking.paymentDetails.paymentMethod = "khalti";
			booking.paymentDetails.paymentDate = new Date();
			await booking.save();

			let payment = await Payment.findOne({
				booking: booking._id,
				transactionId: pidx,
				status: "completed",
			});
			if (!payment) {
				payment = await Payment.create({
					user: booking.user,
					booking: booking._id,
					futsal: booking.futsal,
					type: "booking",
					amount: booking.price,
					status: "completed",
					paymentMethod: "khalti",
					transactionId: pidx,
					paidAt: new Date(),
				});
			}

			try {
				await notificationController.createNotification({
					user: booking.user,
					message: `Your payment for booking at ${booking.futsal} on ${booking.date.toISOString().split("T")[0]} has been confirmed.`,
					type: "payment_confirmed",
					meta: {
						booking: booking._id,
						futsal: booking.futsal,
						transaction: payment._id,
					},
				});
			} catch (err) {
				console.error("Failed to send payment confirmation to user:", err);
			}
			try {
				await notificationController.createNotification({
					user: booking.futsal.owner,
					message: `Payment confirmed for booking at ${booking.futsal} on ${booking.date.toISOString().split("T")[0]}.`,
					type: "booking_confirmed",
					meta: {
						booking: booking._id,
						futsal: booking.futsal,
						customer: booking.user,
						transaction: payment._id,
					},
				});
			} catch (err) {
				console.error(
					"Failed to send booking confirmation to futsal owner:",
					err
				);
			}

			results.push({ booking, payment });
		}

		res.status(200).json({
			message: "Bulk payment verified successfully",
			results,
		});
	} catch (err) {
		res.status(500).json({
			error: "An error occurred while verifying bulk payment",
			details: err.message,
		});
	}
};

exports.listPartialBookings = async (req, res) => {
	try {
		const { lng, lat, radius = 10 } = req.query;

		const now = new Date();
		const startOfToday = new Date(now);
		startOfToday.setHours(0, 0, 0, 0);

		const baseQuery = {
			bookingType: "partial",
			status: { $ne: "cancelled" },
			$or: [
				{ date: { $gt: now } },

				{
					date: { $gte: startOfToday, $lte: now },
					$expr: {
						$gt: [
							{
								$dateFromString: {
									dateString: {
										$concat: [
											{
												$substr: [
													{
														$dateToString: {
															date: "$date",
															format: "%Y-%m-%d",
														},
													},
													0,
													-1,
												],
											},
											"T",
											{ $ifNull: ["$endTime", "23:59"] },
											":00.000Z",
										],
									},
								},
							},
							now,
						],
					},
				},
			],
		};

		let query;

		if (lng && lat) {
			const coordinates = [parseFloat(lng), parseFloat(lat)];
			const maxDistance = parseFloat(radius) * 1000;

			const nearbyFutsals = await Futsal.find({
				"location.coordinates": {
					$near: {
						$geometry: {
							type: "Point",
							coordinates: coordinates,
						},
						$maxDistance: maxDistance,
					},
				},
			}).select("_id");

			const futsalIds = nearbyFutsals.map((f) => f._id);

			query = Booking.find({
				...baseQuery,
				futsal: { $in: futsalIds },
			});
		} else {
			query = Booking.find(baseQuery);
		}

		const bookings = await query
			.populate({
				path: "futsal",
				select: "name location address",
				populate: {
					path: "location",
					select: "coordinates city district",
				},
			})
			.populate("teamA", "name")
			.populate("teamB", "name")
			.sort({ createdAt: -1 });

		res.json(bookings);
	} catch (error) {
		console.error("Error listing partial bookings:", error);
		res
			.status(500)
			.json({
				message: "Failed to list partial bookings",
				error: error.message,
			});
	}
};

exports.getBookingsForFutsal = async (req, res) => {
	try {
		const { futsalId, date, limit = 15, page = 1 } = req.query;

		if (!futsalId) {
			return res.status(400).json({ message: "futsalId is required" });
		}

		let startDate, endDate;
		if (date) {
			startDate = new Date(date);
		} else {
			startDate = new Date();
			startDate.setHours(0, 0, 0, 0);
		}
		endDate = new Date(startDate);
		endDate.setDate(startDate.getDate() + 1);

		const skip = (parseInt(page) - 1) * parseInt(limit);
		const query = {
			futsal: futsalId,
			date: { $gte: startDate, $lt: endDate },
			status: { $nin: ["cancelled"] },
		};

		const bookings = await Booking.find(query)
			.populate("user", "fullName")
			.sort({ startTime: 1 })
			.skip(skip)
			.limit(parseInt(limit));
		const total = await Booking.countDocuments(query);

		res.json({
			bookings,
			total,
			page: parseInt(page),
			limit: parseInt(limit),
			totalPages: Math.ceil(total / parseInt(limit)),
		});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
