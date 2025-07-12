const Futsal = require("../models/Futsal");
const { validationResult } = require("express-validator");
const { verifyKhaltiPayment } = require("../services/khaltiService");
const { sendMail } = require("../utils/email");
const User = require("../models/User");
const { isHoliday } = require("../services/holidayService");
const Review = require("../models/Review");
const { uploadImage, deleteImage } = require("../utils/cloudinary");
const config = require("../config/env_config");

// Helper: Calculate average rating for a futsal
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

// Helper to validate new operatingHours structure
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

// GET /api/futsals?search=&city=&district=&page=&limit=&lng=&lat=&minRating=
exports.getFutsals = async (req, res) => {
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
			sort,
			radius,
		} = req.query;
		const limit = parseInt(req.query.limit) || 15;
		const skip = (parseInt(page) - 1) * limit;

		// Build the base filter
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

		let pipeline = [];
		if (lng && lat) {
			pipeline.push({
				$geoNear: {
					near: {
						type: "Point",
						coordinates: [parseFloat(lng), parseFloat(lat)],
					},
					distanceField: "distance",
					maxDistance: parseInt(radius) * 1000 || 10000, // radius in meters
					spherical: true,
					query: filter,
				},
			});
		} else {
			pipeline.push({ $match: filter });
		}

		// Lookup to join with ratings collection (assuming ratings are stored separately)
		pipeline.push({
			$lookup: {
				from: "ratings", // Replace with your actual ratings collection name
				localField: "_id",
				foreignField: "futsalId", // Replace with the field that links ratings to futsals
				as: "ratings",
			},
		});
		// Calculate average rating and review count
		pipeline.push({
			$addFields: {
				avgRating: { $avg: "$ratings.rating" }, // Replace 'rating' with the actual rating field
				reviewCount: { $size: "$ratings" },
			},
		});

		// Apply minRating filter if provided
		if (minRating) {
			pipeline.push({
				$match: {
					$or: [
						{ avgRating: { $gte: parseFloat(minRating) } },
						{ avgRating: null }, // Include futsals with no ratings if needed
					],
				},
			});
		}

		// Sorting
		if (sort === "price_asc") {
			pipeline.push({ $sort: { "pricing.basePrice": 1 } });
		} else if (sort === "price_desc") {
			pipeline.push({ $sort: { "pricing.basePrice": -1 } });
		}

		// Pagination
		pipeline.push({ $skip: skip }, { $limit: limit });

		// Execute aggregation pipeline
		let futsals = await Futsal.aggregate(pipeline);

		// Calculate total count with the same filters
		const countPipeline = pipeline.slice(0, -2); // Remove skip and limit for total count
		const totalResult = await Futsal.aggregate([
			...countPipeline,
			{ $count: "total" },
		]);
		const total = totalResult.length > 0 ? totalResult[0].total : 0;

		// Dynamic Pricing Logic
		let now;
		let day, hour;
		if (req.query.date && req.query.time) {
			// Use provided date and time
			const [year, month, date] = req.query.date.split("-").map(Number);
			const [h, m] = req.query.time.split(":").map(Number);
			now = new Date(year, month - 1, date, h, m);
			day = now.getDay();
			hour = now.getHours();
		} else {
			now = new Date();
			day = now.getDay();
			hour = now.getHours();
		}
		const userCoords = lng && lat ? [parseFloat(lng), parseFloat(lat)] : null;
		const commission = req.query.commission
			? parseFloat(req.query.commission)
			: 0;

		const futsalsWithDynamicPrice = await Promise.all(
			futsals.map(async (futsal) => {
				const basePrice = futsal.pricing.basePrice || 0;
				let dynamicPrice = basePrice;
				const modifiers = futsal.pricing.modifiers || {};

				// --- Time of Day Modifier ---
				let timeOfDayModifier = 0;
				if (modifiers.timeOfDay && modifiers.timeOfDay.enabled) {
					if (hour >= 6 && hour < 12)
						timeOfDayModifier = modifiers.timeOfDay.morning || 0;
					else if (hour >= 12 && hour < 18)
						timeOfDayModifier = modifiers.timeOfDay.midday || 0;
					else if (hour >= 18 && hour < 22)
						timeOfDayModifier = modifiers.timeOfDay.evening || 0;
				}
				dynamicPrice += basePrice * timeOfDayModifier;

				// --- Holiday Modifier ---
				let holidayModifier = 0;
				if (modifiers.holiday && modifiers.holiday.enabled) {
					if (await isHoliday(now)) {
						holidayModifier = modifiers.holiday.percentage || 0;
					}
				}
				dynamicPrice += basePrice * holidayModifier;

				// --- Weekend Modifier ---
				let weekendModifier = 0;
				if (modifiers.weekend && modifiers.weekend.enabled) {
					if (day === 0 || day === 6) {
						// Sunday=0, Saturday=6
						weekendModifier = modifiers.weekend.percentage || 0;
					}
				}
				dynamicPrice += basePrice * weekendModifier;

				// --- Location Modifier ---
				let distance = null;
				let distanceModifier = 0;
				if (
					modifiers.location &&
					modifiers.location.enabled &&
					userCoords &&
					futsal.location &&
					futsal.location.coordinates &&
					Array.isArray(futsal.location.coordinates.coordinates)
				) {
					const [flng, flat] = futsal.location.coordinates.coordinates;
					const toRad = (deg) => (deg * Math.PI) / 180;
					const R = 6371e3; // meters
					const dLat = toRad(flat - parseFloat(lat));
					const dLng = toRad(flng - parseFloat(lng));
					const a =
						Math.sin(dLat / 2) ** 2 +
						Math.cos(toRad(parseFloat(lat))) *
							Math.cos(toRad(flat)) *
							Math.sin(dLng / 2) ** 2;
					const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
					distance = R * c;
					if (distance > 10000 && modifiers.location.far !== undefined)
						distanceModifier = modifiers.location.far;
					else if (distance <= 10000 && modifiers.location.near !== undefined)
						distanceModifier = modifiers.location.near;
					dynamicPrice += basePrice * distanceModifier;
				}

				// --- Rating Modifier (unchanged) ---
				let ratingModifier = 0;
				const avgRating = futsal.avgRating || null;
				const reviewCount = futsal.reviewCount || 0;
				if (avgRating !== null) {
					if (avgRating >= 4.5)
						ratingModifier = 0.1; // +10% for top-rated
					else if (avgRating >= 4.0)
						ratingModifier = 0.05; // +5%
					else if (avgRating <= 2.5) ratingModifier = -0.1; // -10% for low-rated
				}
				dynamicPrice += basePrice * ratingModifier;

				// Commission logic
				const finalPrice = Math.round(dynamicPrice + dynamicPrice * commission);

				return {
					...futsal,
					pricing: {
						...futsal.pricing,
						dynamicPrice: Math.round(dynamicPrice),
						finalPrice,
						distance: distance ? Math.round(distance) : undefined,
						distanceModifier,
						ratingModifier,
						avgRating,
						reviewCount,
					},
				};
			})
		);

		res.json({
			total,
			page: parseInt(page),
			limit,
			futsals: futsalsWithDynamicPrice,
		});
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

// PUT /api/futsals/:id
exports.updateFutsal = async (req, res) => {
	try {
		const futsal = await Futsal.findById(req.params.id);
		if (!futsal) {
			return res.status(404).json({ error: "Futsal not found" });
		}
		// Only allow update of certain fields
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

// DELETE /api/futsals/:id
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
		// Delete all images from Cloudinary (if public_id can be parsed)
		if (Array.isArray(futsal.images)) {
			for (const imageUrl of futsal.images) {
				// Try to extract public_id from the URL
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

// GET /api/futsals/:id
exports.getFutsalById = async (req, res) => {
	try {
		const futsal = await Futsal.findById(req.params.id);
		if (!futsal) {
			res.locals.errorMessage = "Futsal not found";
			return res.status(404).json({ error: "Futsal not found" });
		}
		// Get avgRating and reviewCount
		const { avg: avgRating, count: reviewCount } = await getAverageRating(
			futsal._id
		);
		// Dynamic pricing context from query
		const { date, time, lng, lat, commission } = req.query;
		const userCoords = lng && lat ? [parseFloat(lng), parseFloat(lat)] : null;
		const commissionNum = commission ? parseFloat(commission) : 0;
		// Calculate dynamic price using shared utility
		const { calculateDynamicPrice } = require("../utils/pricing");
		const finalPrice = await calculateDynamicPrice(futsal, {
			date,
			time,
			userCoords,
			commission: commissionNum,
			avgRating,
			reviewCount,
		});
		// Calculate ratingModifier (same as in getFutsals)
		let ratingModifier = 0;
		if (avgRating !== null) {
			if (avgRating >= 4.5) ratingModifier = 0.1;
			else if (avgRating >= 4.0) ratingModifier = 0.05;
			else if (avgRating <= 2.5) ratingModifier = -0.1;
		}
		// Optionally, calculate distance if userCoords and futsal location are present
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
			// Get distanceModifier from futsal.pricing.modifiers if present
			const modifiers = futsal.pricing.modifiers || {};
			if (modifiers.location && modifiers.location.enabled) {
				if (distance > 10000 && modifiers.location.far !== undefined)
					distanceModifier = modifiers.location.far;
				else if (distance <= 10000 && modifiers.location.near !== undefined)
					distanceModifier = modifiers.location.near;
			}
		}
		// --- Add isHoliday field ---
		let isHolidayValue = false;
		let dateToCheck = date;
		if (!dateToCheck) {
			// Use current date in YYYY-MM-DD format
			const now = new Date();
			dateToCheck = now.toISOString().slice(0, 10);
		}
		try {
			isHolidayValue = await isHoliday(dateToCheck);
		} catch (e) {
			isHolidayValue = false;
		}
		// Build response structure (match getFutsals)
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

// POST /api/v1/futsals/register - Register futsal (for futsalOwner)
exports.registerFutsal = async (req, res) => {
	try {
		const user = req.user;
		if (user.role !== "futsalOwner" && user.role !== "admin") {
			return res.status(403).json({
				error:
					"Only futsal owners can register a futsal. Please register as a futsal owner first.",
			});
		}
		// Only accept basePrice from request
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

		// Fetch owner
		const owner = await User.findById(user._id);

		// Create futsal with all required and important fields
		const futsal = await Futsal.create({
			name,
			owner: user._id,
			location,
			contactInfo,
			operatingHours,
			pricing: {
				basePrice,
				rules,
				modifiers: modifiers || undefined, // If not provided, Mongoose will use defaults
			},
			amenities,
			images,
			description,
			info,
			side,
			isActive: owner.isActiveOwner,
		});

		// Fetch futsal owner email #TODO: add to resend the email if owner is not active and tried to create a futsal
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

// GET /api/futsals/nearby?lng=...&lat=...&radius=... (radius in meters, default 3000)
exports.getNearbyFutsals = async (req, res) => {
	try {
		const { lng, lat, radius = 3000 } = req.query;
		if (!lng || !lat) {
			return res.status(400).json({ message: "lng and lat are required" });
		}
		const futsals = await Futsal.find({
			"location.coordinates": {
				$near: {
					$geometry: {
						type: "Point",
						coordinates: [parseFloat(lng), parseFloat(lat)],
					},
					$maxDistance: parseInt(radius),
				},
			},
			isActive: true,
		}).limit(20);
		res.json({ futsals });
	} catch (err) {
		res.status(500).json({ error: err.message || "Server error" });
	}
};

// POST /api/futsals/upload-image
exports.uploadFutsalImage = async (req, res) => {
	try {
		if (!req.file)
			return res.status(400).json({ error: "No image file provided" });
		const futsalId = req.body.futsalId;
		if (!futsalId)
			return res.status(400).json({ error: "No futsalId provided" });
		const futsal = await Futsal.findById(futsalId);
		if (!futsal) return res.status(404).json({ error: "Futsal not found" });
		// Upload image
		const result = await uploadImage(req.file.path, `futsals/${futsalId}`);
		futsal.images.push(result.secure_url);
		await futsal.save();
		res.status(200).json({ url: result.secure_url });
	} catch (err) {
		res.status(500).json({ error: err.message || "Image upload failed" });
	}
};

// PUT /api/futsals/:id/update-image
exports.updateFutsalImage = async (req, res) => {
	try {
		const futsalId = req.params.id;
		if (!req.file)
			return res.status(400).json({ error: "No image file provided" });
		const futsal = await Futsal.findById(futsalId);
		if (!futsal) return res.status(404).json({ error: "Futsal not found" });
		// Optionally delete old image if public_id is provided
		if (req.body.oldPublicId) await deleteImage(req.body.oldPublicId);
		const result = await uploadImage(req.file.path, `futsals/${futsalId}`);
		futsal.images.push(result.secure_url);
		await futsal.save();
		res.status(200).json({ url: result.secure_url });
	} catch (err) {
		res.status(500).json({ error: err.message || "Image update failed" });
	}
};

// GET /api/futsals/dashboard-summary?futsalId=...
// Returns: Dashboard summary data matching the frontend UI
const getDashboardData = async (futsalId) => {
	if (!futsalId) throw new Error("futsalId is required");

	// Fetch futsal and owner
	const futsal = await require("../models/Futsal")
		.findById(futsalId)
		.populate("owner");
	if (!futsal) throw new Error("Futsal not found");

	// Current date and time for dynamic pricing
	const now = new Date();
	const currentHour = now.getHours();
	const currentMinute = now.getMinutes();
	const currentTime = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;

	// Today's date boundaries
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const tomorrow = new Date(today);
	tomorrow.setDate(today.getDate() + 1);

	// Calculate current dynamic price
	const { calculateDynamicPrice } = require("../utils/pricing");
	const currentPrice = await calculateDynamicPrice(futsal, {
		date: today.toISOString().split("T")[0],
		time: currentTime,
	});

	// 1. Get today's bookings
	const Booking = require("../models/Booking");
	const todaysBookings = await Booking.find({
		futsal: futsalId,
		date: { $gte: today, $lt: tomorrow },
		status: { $nin: ["cancelled"] },
	});

	// 2. Calculate slots (assuming 1 hour slots from 6 AM to 6 PM)
	const totalSlots = 12; // 12 hours from 6 AM to 6 PM
	const bookedSlots = todaysBookings.length;

	// 3. Calculate all-time collection from Payment model
	const Payment = require("../models/Payment");
	const payments = await Payment.find({
		futsal: futsalId,
		status: "completed",
		type: "booking", // Only count booking payments
	});
	const totalCollected = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

	// 5. Today's revenue - only for today's bookings
	const todayBookings = await Booking.find({
		futsal: futsalId,
		date: { $gte: today, $lt: tomorrow },
		status: "confirmed",
	}).select("_id");

	const todayBookingIds = todayBookings.map((b) => b._id);

	// Get payments for today's bookings
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

	// 5. Get reviews data
	const Review = require("../models/Review");
	const reviewsAgg = await Review.aggregate([
		{ $match: { futsal: futsal._id } },
		{
			$group: { _id: null, avgRating: { $avg: "$rating" }, count: { $sum: 1 } },
		},
	]);

	const avgRating = reviewsAgg[0]?.avgRating?.toFixed(1) || null;
	const reviewCount = reviewsAgg[0]?.count || 0;

	// 6. Get today's stats
	const occupancy = Math.round((bookedSlots / totalSlots) * 100);

	// 7. Format the response to match the frontend UI
	return {
		// Top cards
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

		// Today's stats
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

		// Additional data that might be needed
		futsalId: futsal._id,
		lastUpdated: new Date(),
	};
};

// Emit dashboard update to specific futsal owner
const emitDashboardUpdate = async (io, futsalId) => {
	try {
		const data = await getDashboardData(futsalId);
		io.to(`futsal:${futsalId}`).emit("dashboard:update", data);
	} catch (error) {
		console.error("Error emitting dashboard update:", error);
	}
};

// HTTP endpoint to get dashboard data
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
			error: config.nodeEnv === "development" ? error.stack : undefined,
		});
	}
};

// Socket.IO initialization
exports.initializeDashboardSockets = (io) => {
	io.on("connection", (socket) => {
		// Handle futsal owner dashboard subscription
		socket.on("subscribe:dashboard", (futsalId) => {
			if (futsalId) {
				socket.join(`futsal:${futsalId}`);
				console.log(
					`Client ${socket.id} subscribed to futsal ${futsalId} dashboard`
				);
			}
		});

		// Handle unsubscription
		socket.on("unsubscribe:dashboard", (futsalId) => {
			if (futsalId) {
				socket.leave(`futsal:${futsalId}`);
			}
		});
	});
};

// PATCH /api/futsals/:id/pricing-rules
exports.updatePricingRules = async (req, res) => {
	try {
		const futsalId = req.params.id;
		const userId = req.user._id;
		const isAdmin = req.user.role === "admin";
		const { modifiers } = req.body;
		if (!modifiers || typeof modifiers !== "object") {
			return res.status(400).json({ message: "No modifiers provided" });
		}
		// Find futsal
		const futsal = await Futsal.findById(futsalId);
		if (!futsal) return res.status(404).json({ message: "Futsal not found" });
		if (!isAdmin && futsal.owner.toString() !== userId.toString()) {
			return res.status(403).json({ message: "Not authorized" });
		}
		// Update only provided fields in pricing.modifiers
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

// GET /api/futsals/:id/transactions
exports.getFutsalTransactions = async (req, res) => {
	try {
		const futsalId = req.params.id;
		const { page = 1, limit = 10, startDate, endDate } = req.query;
		const Payment = require("../models/Payment");
		const Booking = require("../models/Booking");
		const Futsal = require("../models/Futsal");
		const User = require("../models/User");

		// Find futsal and owner
		const futsal = await Futsal.findById(futsalId).populate("owner");
		if (!futsal) return res.status(404).json({ message: "Futsal not found" });

		// Build payment query
		let paymentQuery = {
			$or: [
				// Booking payments for this futsal
				{ type: "booking" },
				// Registration payments for this futsal's owner
				{ type: "registration", user: futsal.owner._id },
			],
		};
		// Date range filter (on paidAt)
		if (startDate || endDate) {
			paymentQuery.paidAt = {};
			if (startDate) paymentQuery.paidAt.$gte = new Date(startDate);
			if (endDate) paymentQuery.paidAt.$lte = new Date(endDate);
		}

		// Find all relevant payments, populate booking and user
		let payments = await Payment.find(paymentQuery)
			.populate("booking")
			.populate("user", "fullName")
			.sort({ paidAt: -1 });

		// Filter booking payments to only those for this futsal
		payments = payments.filter((p) => {
			if (p.type === "booking" && p.booking && p.booking.futsal) {
				return p.booking.futsal.toString() === futsalId;
			}
			if (p.type === "registration") {
				return p.user && p.user._id.toString() === futsal.owner._id.toString();
			}
			return false;
		});

		// Transaction summary
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

		// Paginate payments
		const paginated = payments.slice((page - 1) * limit, page * limit);
		// Format for response
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
