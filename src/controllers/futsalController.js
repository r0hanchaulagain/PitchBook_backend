const Futsal = require("../models/Futsal");
const { sendMail } = require("../utils/email");
const User = require("../models/User");
const { isHoliday } = require("../services/holidayService");
const Review = require("../models/Review");
const { uploadImage, deleteImage } = require("../utils/cloudinary");
const { nodeEnv } = require("../config/env_config");

async function getAverageRating(futsalId) {
	const result = await Review.aggregate([
		{
			$match: {
				futsal:
					typeof futsalId === "string"
						? require("mongoose").Types.ObjectId(futsalId)
						: futsalId,
			},
		},
		{ $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
	]);
	return result[0]
		? { avg: result[0].avg, count: result[0].count }
		: { avg: null, count: 0 };
}

function validateOperatingHours(operatingHours) {
	if (!operatingHours) return false;
	const keys = ["weekdays", "weekends", "holidays"];
	for (const key of keys) {
		const val = operatingHours[key];
		if (!val || typeof val !== "object" || Array.isArray(val)) return false;
		if (!val.open || !val.close) return false;
	}
	return true;
}

exports.getFutsals = async (req, res) => {
	const TIMEOUT_MS = 10000;
	const timeout = setTimeout(() => {
		if (!res.headersSent) {
			res.status(504).json({ error: "Request timeout" });
		}
	}, TIMEOUT_MS);

	try {
		const {
			search,
			city,
			district,
			page = 1,
			lng,
			lat,
			minRating,
			minPrice,
			maxPrice,
			amenities,
			side,
			sort = "price_asc",
			radius = 10,
		} = req.query;

		const limit = parseInt(req.query.limit) || 15;
		const skip = (parseInt(page) - 1) * limit;

		const filter = { isActive: true };
		if (search) filter.name = { $regex: search, $options: "i" };
		if (city) filter["location.city"] = city;
		if (district) filter["location.district"] = district;

		if (minPrice || maxPrice) {
			filter["pricing.basePrice"] = {};
			if (minPrice) filter["pricing.basePrice"].$gte = parseInt(minPrice);
			if (maxPrice) filter["pricing.basePrice"].$lte = parseInt(maxPrice);
		}

		if (amenities) {
			const amenitiesArr = amenities
				.split(",")
				.map((a) => a.trim())
				.filter(Boolean);
			if (amenitiesArr.length > 0) {
				filter.amenities = { $all: amenitiesArr };
			}
		}

		if (side) {
			const sideArr = side.split(",").map(Number).filter(Boolean);
			if (sideArr.length > 0) {
				filter.side = { $in: sideArr };
			}
		}

		let query;
		let totalCount;
		let futsals;

		if (lng && lat) {
			query = Futsal.aggregate([
				{
					$geoNear: {
						near: {
							type: "Point",
							coordinates: [parseFloat(lng), parseFloat(lat)],
						},
						distanceField: "distance",
						maxDistance: parseFloat(radius) * 1000,
						spherical: true,
						query: filter,
					},
				},
				{ $skip: skip },
				{ $limit: limit },
			]);

			const countResult = await Futsal.aggregate([
				{
					$geoNear: {
						near: {
							type: "Point",
							coordinates: [parseFloat(lng), parseFloat(lat)],
						},
						distanceField: "distance",
						maxDistance: parseFloat(radius) * 1000,
						spherical: true,
						query: filter,
					},
				},
				{ $count: "total" },
			]);

			totalCount = countResult[0]?.total || 0;
		} else {
			query = Futsal.find(filter).skip(skip).limit(limit);

			if (sort === "price_asc") {
				query.sort({ "pricing.basePrice": 1 });
			} else if (sort === "price_desc") {
				query.sort({ "pricing.basePrice": -1 });
			} else if (sort === "rating_desc") {
				query.sort({ rating: -1 });
			}

			totalCount = await Futsal.countDocuments(filter);
		}

		futsals = await query.exec();

		if (!futsals.length) {
			clearTimeout(timeout);
			return res.status(200).json({
				success: true,
				count: 0,
				pagination: {
					total: 0,
					page: parseInt(page),
					pages: 0,
					limit,
				},
				data: [],
			});
		}

		const { date, time, commission } = req.query;
		const userCoords = lng && lat ? [parseFloat(lng), parseFloat(lat)] : null;
		const commissionNum = commission ? parseFloat(commission) : 0;

		const futsalsWithRatings = await Promise.all(
			futsals.map(async (futsal) => {
				const { avg: avgRating, count: reviewCount } = await getAverageRating(
					futsal._id
				);
				const { calculateDynamicPrice } = require("../utils/pricing");

				let finalPrice = futsal.pricing?.basePrice || 0;
				try {
					finalPrice = await calculateDynamicPrice(futsal, {
						date,
						time,
						userCoords,
						commission: commissionNum,
						avgRating,
						reviewCount,
					});
				} catch (priceError) {
					console.error(
						"Price calculation failed for futsal:",
						futsal._id,
						priceError
					);
				}

				return {
					...(futsal.toObject ? futsal.toObject() : futsal),
					rating: avgRating,
					reviewCount,
					pricing: {
						...futsal.pricing,
						finalPrice,
					},
				};
			})
		);

		let filteredFutsals = futsalsWithRatings;
		if (minRating) {
			const minRatingNum = parseFloat(minRating);
			filteredFutsals = futsalsWithRatings.filter(
				(f) => f.rating >= minRatingNum
			);
		}

		const totalPages = Math.ceil(totalCount / limit);

		clearTimeout(timeout);
		res.status(200).json({
			success: true,
			count: filteredFutsals.length,
			pagination: {
				total: totalCount,
				page: parseInt(page),
				pages: totalPages,
				limit,
			},
			data: filteredFutsals,
		});
	} catch (error) {
		console.error("Error in getFutsals:", error);
		clearTimeout(timeout);
		res.status(500).json({
			success: false,
			error: "Server error",
			details: nodeEnv === "development" ? error.message : undefined,
		});
	}
};

exports.updateFutsal = async (req, res) => {
	try {
		const futsal = await Futsal.findById(req.params.id);
		if (!futsal) {
			return res.status(404).json({ error: "Futsal not found" });
		}
		const updatableFields = [
			"name",
			"location",
			"contactInfo",
			"amenities",
			"images",
			"description",
			"info",
			"side",
			"pricing",
			"operatingHours",
		];
		for (const field of updatableFields) {
			if (req.body[field] !== undefined) {
				if (field === "operatingHours") {
					if (!validateOperatingHours(req.body.operatingHours)) {
						return res.status(400).json({
							error:
								"Invalid operatingHours structure. Must include objects for weekdays, weekends, holidays with open/close.",
						});
					}
				}
				futsal[field] = req.body[field];
			}
		}
		await futsal.save();
		res.json({ message: "Futsal updated", futsal });
	} catch (err) {
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.deleteFutsal = async (req, res) => {
	try {
		const futsal = await Futsal.findOneAndDelete({
			_id: req.params.id,
			owner: req.user._id,
		});
		if (!futsal) {
			res.locals.errorMessage = "Futsal not found";
			return res.status(404).json({ error: "Futsal not found" });
		}
		if (Array.isArray(futsal.images)) {
			for (const imageUrl of futsal.images) {
				const match = imageUrl.match(/\/futsals\/([^/.]+)\/(.+)\.[a-zA-Z]+$/);
				if (match) {
					const publicId = `futsals/${match[1]}/${match[2]}`;
					await deleteImage(publicId).catch(() => {});
				}
			}
		}
		res.json({ message: "Futsal deleted" });
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.getFutsalById = async (req, res) => {
	try {
		const futsal = await Futsal.findById(req.params.id);
		if (!futsal) {
			res.locals.errorMessage = "Futsal not found";
			return res.status(404).json({ error: "Futsal not found" });
		}
		const { avg: avgRating, count: reviewCount } = await getAverageRating(
			futsal._id
		);
		const { date, time, lng, lat, commission } = req.query;
		const userCoords = lng && lat ? [parseFloat(lng), parseFloat(lat)] : null;
		const commissionNum = commission ? parseFloat(commission) : 0;
		const { calculateDynamicPrice } = require("../utils/pricing");
		const finalPrice = await calculateDynamicPrice(futsal, {
			date,
			time,
			userCoords,
			commission: commissionNum,
			avgRating,
			reviewCount,
		});
		let ratingModifier = 0;
		if (avgRating !== null) {
			if (avgRating >= 4.5) ratingModifier = 0.1;
			else if (avgRating >= 4.0) ratingModifier = 0.05;
			else if (avgRating <= 2.5) ratingModifier = -0.1;
		}
		let distance, distanceModifier;
		if (
			userCoords &&
			futsal.location &&
			futsal.location.coordinates &&
			Array.isArray(futsal.location.coordinates.coordinates)
		) {
			const [flng, flat] = futsal.location.coordinates.coordinates;
			const [ulng, ulat] = userCoords;
			const toRad = (deg) => (deg * Math.PI) / 180;
			const R = 6371e3;
			const dLat = toRad(flat - ulat);
			const dLng = toRad(flng - ulng);
			const a =
				Math.sin(dLat / 2) ** 2 +
				Math.cos(toRad(ulat)) * Math.cos(toRad(flat)) * Math.sin(dLng / 2) ** 2;
			const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
			distance = R * c;
			const modifiers = futsal.pricing.modifiers || {};
			if (modifiers.location && modifiers.location.enabled) {
				if (distance > 10000 && modifiers.location.far !== undefined)
					distanceModifier = modifiers.location.far;
				else if (distance <= 10000 && modifiers.location.near !== undefined)
					distanceModifier = modifiers.location.near;
			}
		}
		let isHolidayValue = false;
		let dateToCheck = date;
		if (!dateToCheck) {
			const now = new Date();
			dateToCheck = now.toISOString().slice(0, 10);
		}
		try {
			isHolidayValue = await Promise.race([
				isHoliday(dateToCheck),
				new Promise((resolve) => setTimeout(() => resolve(false), 1000)),
			]);
		} catch (e) {
			console.error("Error checking holiday status:", e);
			isHolidayValue = false;
		}
		const futsalObj = {
			...futsal.toObject(),
			pricing: {
				...futsal.pricing,
				finalPrice,
				avgRating,
				reviewCount,
				ratingModifier,
				distance: distance ? Math.round(distance) : undefined,
				distanceModifier,
			},
			isHoliday: isHolidayValue,
		};
		res.json({ futsal: futsalObj });
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.registerFutsal = async (req, res) => {
	try {
		const user = req.user;
		if (user.role !== "futsalOwner" && user.role !== "admin") {
			return res.status(403).json({
				error:
					"Only futsal owners can register a futsal. Please register as a futsal owner first.",
			});
		}
		const {
			name,
			location,
			contactInfo,
			basePrice,
			amenities,
			images,
			description,
			rules,
			modifiers,
			operatingHours,
			info,
			side,
		} = req.body;

		if (!validateOperatingHours(operatingHours)) {
			return res.status(400).json({
				error:
					"Invalid operatingHours structure. Must include objects for weekdays, weekends, holidays with open/close.",
			});
		}

		const owner = await User.findById(user._id);

		const futsal = await Futsal.create({
			name,
			owner: user._id,
			location,
			contactInfo,
			operatingHours,
			pricing: {
				basePrice,
				rules,
				modifiers: modifiers || undefined,
			},
			amenities,
			images,
			description,
			info,
			side,
			isActive: owner.isActiveOwner,
		});

		if (!owner.isActiveOwner) {
			const subject = "Futsal Registration: Complete Your Payment";
			const html = `<p>Dear ${owner.username || "Owner"},</p>
        <p>Your futsal <b>${futsal.name}</b> has been registered successfully.</p>
        <p>Please pay the registration fee within 7 days to activate your futsal. If you have already paid, you can ignore this message.</p>
        <p>Thank you,<br/>Futsal App Team</p>`;
			await sendMail({ to: owner.email, subject, html });
		}

		res.status(201).json({
			message: "Futsal registered. Please pay registration fee within 7 days.",
			futsal,
		});
	} catch (err) {
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.uploadFutsalImage = async (req, res) => {
	try {
		if (!req.file)
			return res.status(400).json({ error: "No image file provided" });
		const futsalId = req.body.futsalId;
		if (!futsalId)
			return res.status(400).json({ error: "No futsalId provided" });
		const futsal = await Futsal.findById(futsalId);
		if (!futsal) return res.status(404).json({ error: "Futsal not found" });

		const result = await uploadImage(req.file.path, `futsals/${futsalId}`);
		futsal.images.push(result.secure_url);
		await futsal.save();
		res.status(200).json({ url: result.secure_url });
	} catch (err) {
		res.status(500).json({ error: err.message || "Image upload failed" });
	}
};

exports.updateFutsalImage = async (req, res) => {
	try {
		const futsalId = req.params.id;
		if (!req.file)
			return res.status(400).json({ error: "No image file provided" });
		const futsal = await Futsal.findById(futsalId);
		if (!futsal) return res.status(404).json({ error: "Futsal not found" });
		if (req.body.oldPublicId) await deleteImage(req.body.oldPublicId);
		const result = await uploadImage(req.file.path, `futsals/${futsalId}`);
		futsal.images.push(result.secure_url);
		await futsal.save();
		res.status(200).json({ url: result.secure_url });
	} catch (err) {
		res.status(500).json({ error: err.message || "Image update failed" });
	}
};

const getDashboardData = async (futsalId) => {
	if (!futsalId) throw new Error("futsalId is required");

	const futsal = await require("../models/Futsal")
		.findById(futsalId)
		.populate("owner");
	if (!futsal) throw new Error("Futsal not found");

	const now = new Date();
	const currentHour = now.getHours();
	const currentMinute = now.getMinutes();
	const currentTime = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;

	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const tomorrow = new Date(today);
	tomorrow.setDate(today.getDate() + 1);

	const { calculateDynamicPrice } = require("../utils/pricing");
	const currentPrice = await calculateDynamicPrice(futsal, {
		date: today.toISOString().split("T")[0],
		time: currentTime,
	});

	const Booking = require("../models/Booking");
	const todaysBookings = await Booking.find({
		futsal: futsalId,
		date: { $gte: today, $lt: tomorrow },
		status: { $nin: ["cancelled"] },
	}).populate("user", "fullName");

	const totalSlots = 12;
	const bookedSlots = todaysBookings.length;

	const Payment = require("../models/Payment");
	const payments = await Payment.find({
		futsal: futsalId,
		status: "completed",
		type: "booking",
	});
	const totalCollected = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

	const todayBookings = await Booking.find({
		futsal: futsalId,
		date: { $gte: today, $lt: tomorrow },
		status: "confirmed",
	}).select("_id");

	const todayBookingIds = todayBookings.map((b) => b._id);

	const todayPayments = await Payment.find({
		futsal: futsalId,
		booking: { $in: todayBookingIds },
		status: "completed",
		type: "booking",
	});

	const todaysRevenue = todayPayments.reduce(
		(sum, p) => sum + (p.amount || 0),
		0
	);

	const Review = require("../models/Review");
	const reviewsAgg = await Review.aggregate([
		{ $match: { futsal: futsal._id } },
		{
			$group: { _id: null, avgRating: { $avg: "$rating" }, count: { $sum: 1 } },
		},
	]);

	const avgRating = reviewsAgg[0]?.avgRating?.toFixed(1) || null;
	const reviewCount = reviewsAgg[0]?.count || 0;

	const occupancy = Math.round((bookedSlots / totalSlots) * 100);

	const todaysSchedule = todaysBookings
		.map((booking) => ({
			id: booking._id,
			startTime: booking.startTime,
			endTime: booking.endTime,
			customerName: booking.user?.fullName || "Unknown",
			status: booking.status,
			price: booking.price,
			bookingType: booking.bookingType,
			teamA: booking.teamA,
			teamB: booking.teamB,
		}))
		.sort((a, b) => a.startTime.localeCompare(b.startTime));

	const Notification = require("../models/Notification");
	const recentNotifications = await Notification.find({
		user: futsal.owner._id,
		futsal: futsalId,
	})
		.sort({ createdAt: -1 })
		.limit(5)
		.select("message type createdAt meta");

	return {
		currentPricing: {
			value: currentPrice,
			label: "CURRENT PRICING",
			subtext: "Per hour",
			icon: "currency-rupee",
			currency: "Rs.",
		},
		slotsBooked: {
			value: bookedSlots,
			label: "SLOTS BOOKED",
			subtext: "Today",
			icon: "calendar",
		},
		allTimeCollection: {
			value: totalCollected,
			label: "ALL-TIME COLLECTION",
			subtext: "Total revenue",
			icon: "currency-rupee",
			currency: "Rs.",
		},
		totalReviews: {
			value: reviewCount > 0 ? reviewCount : "-",
			label: "TOTAL REVIEWS",
			subtext:
				reviewCount > 0 ? `${avgRating} average rating` : "No reviews yet",
			icon: "star",
			showEmptyState: reviewCount === 0,
		},

		todayStats: {
			bookings: {
				value: bookedSlots,
				label: "Bookings",
				icon: "calendar",
			},
			revenue: {
				value: todaysRevenue,
				label: "Revenue",
				icon: "currency-rupee",
				currency: "Rs.",
			},
			occupancy: {
				value: `${occupancy}%`,
				label: "Occupancy",
				icon: "users",
			},
		},

		todaysSchedule: {
			bookings: todaysSchedule,
			total: todaysSchedule.length,
			hasBookings: todaysSchedule.length > 0,
		},

		recentNotifications: {
			notifications: recentNotifications.map((notification) => ({
				id: notification._id,
				message: notification.message,
				type: notification.type,
				createdAt: notification.createdAt,
				meta: notification.meta,
			})),
			total: recentNotifications.length,
			hasNotifications: recentNotifications.length > 0,
		},

		futsalId: futsal._id,
		lastUpdated: new Date(),
	};
};

const emitDashboardUpdate = async (io, futsalId) => {
	try {
		const data = await getDashboardData(futsalId);
		io.to(`futsal:${futsalId}`).emit("dashboard:update", data);
	} catch (error) {
		console.error("Error emitting dashboard update:", error);
	}
};

exports.getDashboardSummary = async (req, res) => {
	try {
		const { futsalId } = req.query;
		if (!futsalId) {
			return res.status(400).json({ message: "futsalId is required" });
		}

		const data = await getDashboardData(futsalId);
		res.json(data);
	} catch (error) {
		console.error("Error in getDashboardSummary:", error);
		res.status(500).json({
			message: error.message || "Error fetching dashboard data",
			error: nodeEnv === "development" ? error.stack : undefined,
		});
	}
};

exports.initializeDashboardSockets = (io) => {
	io.on("connection", (socket) => {
		socket.on("subscribe:dashboard", (futsalId) => {
			if (futsalId) {
				socket.join(`futsal:${futsalId}`);
				console.log(
					`Client ${socket.id} subscribed to futsal ${futsalId} dashboard`
				);
			}
		});

		socket.on("unsubscribe:dashboard", (futsalId) => {
			if (futsalId) {
				socket.leave(`futsal:${futsalId}`);
			}
		});
	});
};

exports.updatePricingRules = async (req, res) => {
	try {
		const futsalId = req.params.id;
		const userId = req.user._id;
		const isAdmin = req.user.role === "admin";
		const { modifiers } = req.body;
		if (!modifiers || typeof modifiers !== "object") {
			return res.status(400).json({ message: "No modifiers provided" });
		}
		const futsal = await Futsal.findById(futsalId);
		if (!futsal) return res.status(404).json({ message: "Futsal not found" });
		if (!isAdmin && futsal.owner.toString() !== userId.toString()) {
			return res.status(403).json({ message: "Not authorized" });
		}
		for (const key of Object.keys(modifiers)) {
			if (typeof modifiers[key] === "object") {
				futsal.pricing.modifiers[key] = {
					...futsal.pricing.modifiers[key],
					...modifiers[key],
				};
			} else {
				futsal.pricing.modifiers[key] = modifiers[key];
			}
		}
		await futsal.save();
		res.json({ modifiers: futsal.pricing.modifiers });
	} catch (err) {
		res.status(500).json({ message: "Server error", error: err.message });
	}
};

exports.getFutsalTransactions = async (req, res) => {
	try {
		const futsalId = req.params.id;
		const { page = 1, limit = 10, startDate, endDate } = req.query;
		const Payment = require("../models/Payment");
		const Futsal = require("../models/Futsal");

		const futsal = await Futsal.findById(futsalId).populate("owner");
		if (!futsal) return res.status(404).json({ message: "Futsal not found" });

		let paymentQuery = {
			$or: [
				{ type: "booking" },
				{ type: "registration", user: futsal.owner._id },
			],
		};
		if (startDate || endDate) {
			paymentQuery.paidAt = {};
			if (startDate) paymentQuery.paidAt.$gte = new Date(startDate);
			if (endDate) paymentQuery.paidAt.$lte = new Date(endDate);
		}

		let payments = await Payment.find(paymentQuery)
			.populate("booking")
			.populate("user", "fullName")
			.sort({ paidAt: -1 });

		payments = payments.filter((p) => {
			if (p.type === "booking" && p.booking && p.booking.futsal) {
				return p.booking.futsal.toString() === futsalId;
			}
			if (p.type === "registration") {
				return p.user && p.user._id.toString() === futsal.owner._id.toString();
			}
			return false;
		});

		const now = new Date();
		const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		let totalCollected = 0,
			totalRefunded = 0,
			thisMonth = 0;
		payments.forEach((p) => {
			if (p.status === "completed") totalCollected += p.amount;
			if (p.type === "refund" && p.status === "completed")
				totalRefunded += p.amount;
			if (p.status === "completed" && p.paidAt && p.paidAt >= firstDayOfMonth)
				thisMonth += p.amount;
		});

		const paginated = payments.slice((page - 1) * limit, page * limit);
		const transactions = paginated.map((p, idx) => {
			let bookedBy = p.user ? p.user.fullName : "";
			let date = null,
				startTime = null,
				endTime = null;
			if (p.type === "booking" && p.booking) {
				date = p.booking.date;
				startTime = p.booking.startTime;
				endTime = p.booking.endTime;
			}
			return {
				sn: (page - 1) * limit + idx + 1,
				transactionId: p.transactionId || (p._id ? p._id.toString() : ""),
				amount: p.amount,
				status: p.status,
				type: p.type,
				bookedBy,
				date,
				startTime,
				endTime,
				refund: p.type === "refund" ? p.amount : 0,
			};
		});
		res.json({
			summary: {
				totalCollected,
				totalRefunded,
				thisMonth,
			},
			transactions,
			total: payments.length,
			page: parseInt(page),
			limit: parseInt(limit),
			totalPages: Math.ceil(payments.length / limit),
		});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
