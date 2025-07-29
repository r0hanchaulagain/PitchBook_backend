// Booking Controller: Handles all booking-related logic
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Futsal = require("../models/Futsal");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { calculateDynamicPrice } = require("../utils/pricing");
const { isHoliday } = require("../services/holidayService");
const { initiateKhaltiPayment } = require("../utils/payment");
const config = require("../config/env_config");

// POST /api/bookings/cash - Create a new booking with cash payment
exports.createCashBooking = async (req, res) => {
    // Don't use transactions in development to avoid replica set requirement
    const useTransaction = config.nodeEnv === "production";
    const session = useTransaction ? await mongoose.startSession() : null;

    if (useTransaction) await session.startTransaction();

	try {
		const notificationController = getNotificationController(req);
		const { futsalId, date, startTime, endTime, bookingType, teamA, teamB } =
			req.body;

		// Input validation
		if (!futsalId || !date || !startTime || !endTime || !bookingType) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({ message: "Missing required fields" });
		}

		// Set default values for teamA and teamB based on bookingType
		let finalTeamA = teamA;
		let finalTeamB = teamB;

		if (bookingType === "full") {
			// For full bookings, default both teams to true if not provided
			finalTeamA = finalTeamA !== undefined ? finalTeamA : true;
			finalTeamB = finalTeamB !== undefined ? finalTeamB : true;
		} else if (bookingType === "partial") {
			// For partial bookings, require at least teamA
			if (finalTeamA === undefined) {
				if (useTransaction) {
					await session.abortTransaction();
					session.endSession();
				}
				return res
					.status(400)
					.json({ message: "Team A is required for partial booking" });
			}
			// Ensure teamB is false for partial bookings
			finalTeamB = false;
		} else {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({ message: "Invalid booking type" });
		}

		// 1. Futsal existence and status
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

		// 2. Calculate duration and validate
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

		// 3. Check for overlapping bookings
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

		// 4. Check if booking is in the future
		const bookingStart = new Date(`${date}T${startTime}`);
		if (bookingStart < new Date()) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({ message: "Cannot book for past time" });
		}

		// 3. Validate booking time against futsal operating hours
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

		// 5. Calculate dynamic price with all modifiers
		const baseDynamicPrice = await calculateDynamicPrice(futsal, {
			date,
			time: startTime,
			// Optionally: userCoords, commission, avgRating, reviewCount
		});
		// Adjust price for actual duration
		const price = Math.round(baseDynamicPrice * (duration / 60));

		// 6. Create booking with cash payment
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

		// Save booking (with or without transaction)
		if (useTransaction) {
			const saveOptions = useTransaction ? { session } : {};
			await booking.save(saveOptions);
		} else {
			await booking.save();
		}

		// 7. Create payment record for cash payment
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

		// Update booking with payment reference
		booking.payment = payment._id;
		if (useTransaction) {
			const saveOptions = useTransaction ? { session } : {};
			await booking.save(saveOptions);
		} else {
			await booking.save();
		}

		// Create notification for the user who made the booking
		await notificationController.createNotification({
			user: req.user._id,
			message: `Your cash booking for ${futsal.name} on ${date} from ${startTime} to ${endTime} has been created.`,
			type: "booking_created",
			meta: { booking: booking._id },
			futsal: futsalId,
		});

		// Create notification for the futsal owner
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

		// Commit the transaction if in production
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

		// Only try to abort transaction if we're using one
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

// Get notification controller with WebSocket support
const getNotificationController = (req = {}) => {
	try {
		// If req has app, use it to get io and connectedUsers
		if (req.app) {
			const io = req.app.get("io");
			const connectedUsers = req.app.get("connectedUsers");
			return require("../controllers/notificationController")(
				io,
				connectedUsers
			);
		}
		// Otherwise, return a mock notification controller that won't send real-time notifications
		// but will still allow database operations
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
		// Return a mock controller that won't fail
		return {
			createNotification: async () => ({}),
		};
	}
};

// Allowed booking durations in minutes
const ALLOWED_DURATIONS = [60, 120];
const MAX_BULK_DAYS = 7;
const BOOKING_DURATION_MINUTES = 60; // Default booking duration in minutes

function calculateDurationInMinutes(startTime, endTime) {
	// startTime and endTime are in "HH:MM" format
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

// POST /api/bookings - Create a new booking
exports.createBooking = async (req, res) => {
	// Only use transactions in production to avoid replica set requirement in development
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

		// Validate booking type and team parameters
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
		// Team boolean validation
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
		// 1. Futsal existence and status
		const futsal = await Futsal.findById(futsalId).populate("owner");
		if (!futsal || !futsal.isActive) {
			return res.status(404).json({ message: "Futsal not found or inactive" });
		}
		// Calculate duration
		const duration = calculateDurationInMinutes(startTime, endTime);
		// Validate duration: must be 30-120 min and a multiple of 15
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
		// Calculate dynamic price using shared utility (per hour)
		const baseDynamicPrice = await calculateDynamicPrice(futsal, {
			date,
			time: startTime,
			// Optionally: userCoords, commission, avgRating, reviewCount
		});
		// Adjust price for actual duration
		const finalPrice = Math.round(baseDynamicPrice * (duration / 60));
		// 3. Operating hours validation (new logic)
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

		// 4. Booking must be in the future
		const bookingStart = new Date(`${date}T${startTime}`);
		if (bookingStart < new Date()) {
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({ message: "Cannot book for past time" });
		}
		// 5. Check for paid bookings in the same slot
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

		// 6. Find any unpaid competing bookings for the same slot
		const competingBookings = await Booking.find({
			futsal: futsalId,
			date: new Date(date),
			isPaid: false,
			status: "pending",
			paymentExpiresAt: { $gt: new Date() }, // Only consider unexpired unpaid bookings
			$or: [{ startTime: { $lt: endTime }, endTime: { $gt: startTime } }],
		}).session(session || null);

		// 7. User cannot have overlapping paid bookings
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

		// 8. Check if user has too many pending unpaid bookings
		const userPendingCount = await Booking.countDocuments({
			user: req.user._id,
			isPaid: false,
			status: "pending",
			paymentExpiresAt: { $gt: new Date() },
		}).session(useTransaction ? session : null);

		if (userPendingCount >= 3) {
			// Limit to 3 pending bookings per user
			if (useTransaction) {
				await session.abortTransaction();
				session.endSession();
			}
			return res.status(400).json({
				message:
					"You have too many pending bookings. Please complete payment for existing bookings or wait for them to expire.",
			});
		}
		// 9. Create booking with payment expiration (15 minutes from now)
		const paymentExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

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

		// 10. Update competing bookings to include this new booking
		if (competingBookings.length > 0) {
			await Booking.updateMany(
				{ _id: { $in: competingBookings.map((b) => b._id) } },
				{ $push: { competingBookings: booking._id } },
				{ session: useTransaction ? session : null }
			);
		}

		try {
			// Save booking with session if in transaction
			const saveOptions = useTransaction ? { session } : {};
			await booking.save(saveOptions);

			// Create notification for the user who made the booking
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

			// Create notification for the futsal owner
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

			// Commit the transaction if in production
			if (useTransaction) {
				await session.commitTransaction();
				session.endSession();
			} else if (session) {
				// If we created a session but aren't using transactions, end it
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
			// If any error occurs, abort the transaction if it was started
			if (useTransaction && session && session.inTransaction()) {
				await session.abortTransaction();
				session.endSession();
			} else if (session) {
				// If we created a session but aren't using transactions, end it
				session.endSession();
			}
			console.error("Error creating booking:", err);
			return res.status(500).json({
				message: "Failed to create booking",
				error: err.message,
			});
		}
	} catch (err) {
		// Handle any errors in the outer try block
		if (useTransaction && session && session.inTransaction()) {
			await session.abortTransaction();
			session.endSession();
		} else if (session) {
			// If we created a session but aren't using transactions, end it
			session.endSession();
		}
		console.error("Unexpected error in createBooking:", err);
		return res.status(500).json({
			message: "An unexpected error occurred",
			error: err.message,
		});
	}
};

// POST /api/bookings/bulk-with-payment - Create bulk booking with Khalti payment for full days
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

        // Input validation
        if (!futsalId || !startDate || !numberOfDays || !bookingType) {
            if (useTransaction) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Validate number of days (max 7 days)
        if (numberOfDays > MAX_BULK_DAYS) {
            if (useTransaction) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(400).json({ 
				message: `Bulk booking cannot exceed ${MAX_BULK_DAYS} days`,
            });
        }

        // Get futsal details including operating hours
		const futsal = await Futsal.findById(futsalId).populate("owner");
        if (!futsal || !futsal.isActive) {
            if (useTransaction) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(404).json({ message: "Futsal not found or inactive" });
        }

        // Validate booking type
		if (!["full", "partial"].includes(bookingType)) {
            if (useTransaction) {
                await session.abortTransaction();
                session.endSession();
            }
            return res.status(400).json({ message: "Invalid bookingType" });
        }

        // Get operating hours or use defaults if not set
		const openingTime = futsal.operatingHours?.opening || "06:00";
		const closingTime = futsal.operatingHours?.closing || "22:00";
        
        // Calculate total duration in hours
		const durationHours =
			calculateDurationInMinutes(openingTime, closingTime) / 60;
        
        // Calculate price for full day
        const basePricePerHour = futsal.pricePerHour || 1000;
        const pricePerDay = Math.ceil(basePricePerHour * durationHours);
        const totalPrice = pricePerDay * numberOfDays;

        // Generate booking dates and validate each one
        const bookingDates = [];
        const currentDate = new Date(startDate);
        const now = new Date();
        
        for (let i = 0; i < numberOfDays; i++) {
            // Check if booking date is in the past
            if (currentDate < now) {
                if (useTransaction) {
                    await session.abortTransaction();
                    session.endSession();
                }
                return res.status(400).json({ 
					message: `Cannot book for past date: ${currentDate.toISOString().split("T")[0]}`,
                });
            }

			// Removed isSlotWithinOperatingHours check for full-day booking
			// (We are booking the entire available day by definition)

            // Check for existing paid bookings
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

        // Create bookings for each day with payment expiration (30 minutes)
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

        // Save all bookings
        const createdBookings = await Booking.insertMany(bookings, { session });
		const bookingIds = createdBookings.map((b) => b._id);
		

		// For development/testing: workaround for Khalti display bug
		const amountToSend = Math.min(totalPrice, 1000); // send in rupees for Khalti UI bug workaround
		// Prepare Khalti payment payload
		const khaltiPayload = {
			name: req.user.fullName || "Customer",
			email: req.user.email || "",
			phone: req.user.phone || "",
			amount: amountToSend,
            purchase_order_id: `bulk_${Date.now()}`,
            purchase_order_name: `Full Day Booking for ${futsal.name} (${numberOfDays} days)`,
			return_url: `${config.frontendUrl}/bookings/verify`,
		};
		// Generate Khalti payment URL
		const paymentInit = await initiateKhaltiPayment(khaltiPayload);


		// Update bookings with payment reference (no session)
		const updateResult = await Booking.updateMany(
            { _id: { $in: bookingIds } },
            { 
				$set: {
					"paymentDetails.pidx": paymentInit.pidx,
					paymentUrl: paymentInit.payment_url,
            },
			}
		);




        // Create notifications
        const notificationPromises = [];
        
        // Notification for user
        notificationPromises.push(
			notificationController.createNotification(
				{
                user: userId,
                message: `Your bulk booking for ${futsal.name} (${numberOfDays} days) has been created. Please complete payment within 30 minutes.`,
					type: "booking_created",
                meta: { booking: bookingIds[0] }, // Link to first booking
					futsal: futsalId,
				},
				{ session }
			)
        );

        // Notification for futsal owner
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

        // Return response with payment URL
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
		// Concise but informative error log for debugging
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

// GET /api/bookings - Get all bookings (admin only)
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

// GET /api/bookings/my - Get bookings for the logged-in user
exports.getMyBookings = async (req, res) => {
	try {
		const bookings = await Booking.find({
			user: req.user._id,
			status: { $ne: "cancelled" }, // Exclude cancelled bookings
		})
			.populate("futsal", "name location images") // Only include necessary futsal fields
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

// GET /api/bookings/:id - Get booking by ID
exports.getBookingById = async (req, res) => {
	try {
		const booking = await Booking.findById(req.params.id)
			.populate("futsal")
			.populate("user");
		if (!booking) {
			return res.status(404).json({ message: "Booking not found" });
		}
		// Only allow admin or owner of booking to view
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

// PUT /api/bookings/:id - Update booking (limited fields)
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
		// Only allow updating status for simplicity (specialRequests removed)
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

// DELETE /api/bookings/:id - Cancel booking
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
		// Notify user
		const user = await User.findById(booking.user);
		if (user && user.email) {
			const html = `<p>Your booking for ${booking.futsal.name} on ${booking.date.toDateString()} from ${booking.startTime} to ${booking.endTime} has been cancelled.</p>`;
			await sendBookingEmail({
				to: user.email,
				subject: "Booking Cancelled",
				html,
			});
		}
		// Notify futsal owner
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

// POST /api/bookings/:id/join - Join an existing booking as team B
exports.joinBooking = async (req, res) => {
	try {
        const booking = await Booking.findById(req.params.id).populate('user', 'name email phone');
		if (!booking) {
            return res.status(404).json({ 
                success: false,
                message: "Booking not found" 
            });
		}

        // Check if user is trying to join their own booking
        if (booking.user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ 
                success: false,
                message: "You cannot join your own booking" 
            });
        }
        
        if (booking.bookingType !== "partial" || booking.teamB !== false) {
            return res.status(400).json({ 
                success: false,
                message: "This booking is not open for joining" 
            });
		}
        
        // Update booking with team B information from authenticated user
        // Since teamB is a boolean in the schema, we'll store the user info in a separate field
        booking.teamB = true; // Mark as taken
        booking.teamBUser = {
            user: req.user._id,
            name: req.user.name,
            email: req.user.email,
            phone: req.user.phone,
            joinedAt: new Date()
        };
        
        // Update booking status to confirmed since both teams are now set
        booking.status = "confirmed";
		booking.updatedAt = new Date();
        
		await booking.save();
        
        // Find and update any competing bookings to mark them as unavailable
        if (booking.competingBookings && booking.competingBookings.length > 0) {
            await Booking.updateMany(
                {
                    _id: { $in: booking.competingBookings },
                    status: "pending"
                },
                { 
                    $set: { 
                        status: "unavailable",
                        updatedAt: new Date() 
                    } 
                }
            );
        }
        
        res.status(200).json({ 
            success: true,
            message: "Successfully joined the booking as Team B", 
            booking
        });
        
	} catch (err) {
        console.error("Error joining booking:", err);
        res.status(500).json({ 
            success: false,
            message: "Failed to join booking", 
            error: err.message
        });
    }
};


// GET /api/bookings/availability/:futsalId - Check availability for futsal
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
			// Check slot availability
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
		// If only date, return all bookings for the day
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

// POST /api/bookings/initiate - Initiate a new booking as Team A
exports.initiateBookingAsTeamA = async (req, res) => {
	try {
		const { futsalId, date, startTime, endTime, bookingType } = req.body;
		if (!futsalId || !date || !startTime || !endTime || !bookingType) {
			return res.status(400).json({ message: "Missing required fields" });
		}
		// 1. Futsal existence and status
		const futsal = await Futsal.findById(futsalId).populate("owner");
		if (!futsal || !futsal.isActive) {
			return res.status(404).json({ message: "Futsal not found or inactive" });
		}
		// Calculate price dynamically (reuse logic from createBooking)
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
		// Duration validation
		const duration = calculateDurationInMinutes(startTime, endTime);
		if (!ALLOWED_DURATIONS.includes(duration)) {
			return res.status(400).json({
				message: "Invalid booking duration. Allowed: 30, 60, 90, 120 min",
			});
		}
		// Check slot availability
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
		// Create booking with current user as Team A (boolean)
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
		// Notify futsal owner
		if (futsal.owner && futsal.owner.email) {
			const html = `<p>A new booking has been initiated for your futsal <b>${futsal.name}</b> on ${date} from ${startTime} to ${endTime}.</p>`;
			// await sendBookingEmail({ to: futsal.owner.email, subject: 'New Booking Initiated', html });
		}
		res.status(201).json({ message: "Booking initiated as Team A", booking });
	} catch (err) {
		res.status(500).json({ message: "Server error", error: err.message });
	}
};

// GET /api/bookings/available-slots?futsalId=...&date=YYYY-MM-DD
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

		// Get all bookings that should block the time slot
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

		// Return only the necessary time slot information
		const bookedSlots = bookings.map((b) => ({
			startTime: b.startTime,
			endTime: b.endTime,
		}));

		res.json({ bookedSlots });
	} catch (err) {
		res.status(500).json({ message: "Server error", error: err.message });
	}
};

// POST /api/bookings/:id/initiate-payment - Initiate Khalti payment for a booking
exports.initiateKhaltiPayment = async (req, res) => {
	try {
		const bookingId = req.params.id;
		const booking = await Booking.findById(bookingId).populate("futsal user");
		if (!booking) return res.status(404).json({ error: "Booking not found" });
		if (booking.paymentStatus === "paid") {
			return res.status(400).json({ error: "Booking already paid" });
		}
		// Prepare payment details
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
		// Save pidx to booking
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

// GET /api/bookings/:id/verify-payment?pidx=... - Verify Khalti payment for a booking
exports.verifyKhaltiPayment = async (req, res) => {
	

	// Only use transactions in production to avoid replica set requirement in development
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

		// Find the booking
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

		// Add session only if using transactions
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

		// Check if booking is already paid
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

		// Check if booking payment has expired
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

		// Lookup payment status from Khalti

		const lookup = await require("../services/khaltiService").lookupPayment(
			pidx
		);



		if (lookup.status === "Completed") {
			// 1. Mark the booking as paid

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



			// 2. Cancel all competing bookings
			if (booking.competingBookings && booking.competingBookings.length > 0) {
				const competingBookingIds = booking.competingBookings.map((b) => b._id);

				// Update all competing bookings to mark them as cancelled
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

				// Send notifications to users with competing bookings
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
								return null; // Don't fail the whole operation if one notification fails
							});
					}
				);

				await Promise.all(notificationPromises);
			}

			// 3. Check if payment already exists to prevent duplicates
			const Payment = require("../models/Payment");
			const existingPayment = await Payment.findOne({
				booking: booking._id,
				transactionId: pidx,
				status: "completed",
			}).session(session || null);

			let transaction;
			if (!existingPayment) {
				// Only create a new payment record if one doesn't already exist
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

			// 4. Send success notifications
			const notificationController = getNotificationController(req);
			await Promise.all(
				[
					// Notify user
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
					// Notify futsal owner
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

			// Only commit if we're using transactions
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
			// Payment failed
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

// GET /api/bookings/bulk/verify-payment?pidx=... - Verify Khalti payment for bulk bookings
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
			// 1. Mark booking as paid/confirmed
			booking.paymentStatus = "paid";
			booking.status = "confirmed";
			booking.isPaid = true;
			booking.paymentDetails = booking.paymentDetails || {};
			booking.paymentDetails.paymentMethod = "khalti";
			booking.paymentDetails.paymentDate = new Date();
			await booking.save();

			// 2. Create Payment record if not exists
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

			// 3. Send notifications
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
		res
			.status(500)
			.json({
				error: "An error occurred while verifying bulk payment",
				details: err.message,
			});
	}
};

// GET /api/bookings/partial?lng=&lat=&radius= - List all partial bookings with optional location filtering
exports.listPartialBookings = async (req, res) => {
    try {
        const { lng, lat, radius = 10 } = req.query;
        
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        
        // Base query for partial bookings
        const baseQuery = {
            bookingType: "partial",
            status: { $ne: "cancelled" },
            $or: [
                // Either the date is in the future
                { date: { $gt: now } },
                // Or it's today but the end time is in the future
                {
                    date: { $gte: startOfToday, $lte: now },
                    $expr: {
                        $gt: [
                            { $dateFromString: { 
                                dateString: { $concat: [
                                    { $substr: [{ $dateToString: { date: '$date', format: '%Y-%m-%d' } }, 0, -1] },
                                    'T',
                                    { $ifNull: ['$endTime', '23:59'] },
                                    ':00.000Z'
                                ]}
                            }},
                            now
                        ]
                    }
                }
            ]
        };

        let query;
        
        if (lng && lat) {
            // If coordinates are provided, use geospatial query
            const coordinates = [parseFloat(lng), parseFloat(lat)];
            const maxDistance = parseFloat(radius) * 1000; // Convert km to meters
            
            // First find futsals within the radius
            const nearbyFutsals = await Futsal.find({
                "location.coordinates": {
                    $near: {
                        $geometry: {
                            type: "Point",
                            coordinates: coordinates
                        },
                        $maxDistance: maxDistance
                    }
                }
            }).select('_id');
            
            // Get array of futsal IDs within the radius
            const futsalIds = nearbyFutsals.map(f => f._id);
            
            // Find bookings for these futsals
            query = Booking.find({
                ...baseQuery,
                futsal: { $in: futsalIds }
            });
        } else {
            // If no coordinates, just use the base query
            query = Booking.find(baseQuery);
        }

        // Execute the query with population and sorting
        const bookings = await query
            .populate({
                path: "futsal",
                select: "name location address",
                populate: {
                    path: "location",
                    select: "coordinates city district"
                }
            })
            .populate("teamA", "name")
            .populate("teamB", "name")
            .sort({ createdAt: -1 });

        res.json(bookings);
    } catch (error) {
        console.error("Error listing partial bookings:", error);
        res.status(500).json({ message: "Failed to list partial bookings", error: error.message });
	}
};

// GET /api/bookings/futsal?futsalId=...&date=YYYY-MM-DD&limit=15&page=1
exports.getBookingsForFutsal = async (req, res) => {
	try {
		const { futsalId, date, limit = 15, page = 1 } = req.query;

		if (!futsalId) {
			return res.status(400).json({ message: "futsalId is required" });
		}
		// Determine date range
		let startDate, endDate;
		if (date) {
			startDate = new Date(date);
		} else {
			startDate = new Date();
			startDate.setHours(0, 0, 0, 0);
		}
		endDate = new Date(startDate);
		endDate.setDate(startDate.getDate() + 1);

		// Pagination
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
