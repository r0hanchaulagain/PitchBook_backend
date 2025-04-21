const Futsal = require('../models/Futsal');
const { validationResult } = require('express-validator');
const { verifyKhaltiPayment } = require('../services/khaltiService');
const { sendMail } = require('../utils/email');
const User = require('../models/User');
const { isHoliday } = require('../services/holidayService');
const Review = require('../models/Review');
const { getAsync, setAsync } = require('../utils/redisClient');
const { uploadImage, deleteImage } = require('../utils/cloudinary');

// Helper: Calculate average rating for a futsal
async function getAverageRating(futsalId) {
  const result = await Review.aggregate([
    {
      $match: {
        futsal:
          typeof futsalId === 'string' ? require('mongoose').Types.ObjectId(futsalId) : futsalId,
      },
    },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  return result[0] ? { avg: result[0].avg, count: result[0].count } : { avg: null, count: 0 };
}

// GET /api/futsals?search=&city=&district=&page=&limit=&lng=&lat=&minRating=
exports.getFutsals = async (req, res) => {
  try {
    const { search, city, district, page = 1, lng, lat, minRating } = req.query;
    const limit = parseInt(req.query.limit) || 15;
    const filter = {};
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (city) filter['location.city'] = city;
    if (district) filter['location.district'] = district;
    const skip = (parseInt(page) - 1) * limit;
    const total = await Futsal.countDocuments(filter);
    let futsals;
    let userCoords = null;
    if (lng && lat) {
      userCoords = [parseFloat(lng), parseFloat(lat)];
      futsals = await Futsal.find(filter)
        .near('location.coordinates', {
          center: { type: 'Point', coordinates: userCoords },
          maxDistance: 10000, // 10km, adjust as needed
          spherical: true,
        })
        .skip(skip)
        .limit(limit);
    } else {
      futsals = await Futsal.find(filter).skip(skip).limit(limit);
    }
    // --- Dynamic Pricing Logic ---
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    let holidayModifier = 0;
    try {
      if (await isHoliday(now)) holidayModifier = 0.2;
    } catch (e) {
      holidayModifier = day === 6 ? 0.2 : 0;
    }
    let timeModifier = 0;
    if (hour >= 6 && hour < 12) timeModifier = 0;
    else if (hour >= 12 && hour < 18) timeModifier = 0.1;
    else if (hour >= 18 && hour < 22) timeModifier = 0.2;
    // --- Fetch and apply rating modifier ---
    const futsalsWithDynamicPrice = await Promise.all(
      futsals.map(async (futsal) => {
        const basePrice = futsal.pricing.basePrice || 0;
        let dynamicPrice = basePrice;
        dynamicPrice += basePrice * timeModifier;
        dynamicPrice += basePrice * holidayModifier;
        // --- Distance Modifier ---
        let distance = null;
        let distanceModifier = 0;
        if (
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
            Math.cos(toRad(parseFloat(lat))) * Math.cos(toRad(flat)) * Math.sin(dLng / 2) ** 2;
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          distance = R * c;
          if (distance > 10000) distanceModifier = 0.2;
          else if (distance > 5000) distanceModifier = 0.1;
          dynamicPrice += basePrice * distanceModifier;
        }
        // --- Rating Modifier ---
        const { avg: avgRating, count: reviewCount } = await getAverageRating(futsal._id);
        let ratingModifier = 0;
        if (avgRating !== null) {
          if (avgRating >= 4.5)
            ratingModifier = 0.1; // +10% for top-rated
          else if (avgRating >= 4.0)
            ratingModifier = 0.05; // +5%
          else if (avgRating <= 2.5) ratingModifier = -0.1; // -10% for low-rated
        }
        dynamicPrice += basePrice * ratingModifier;
        return {
          ...futsal.toObject(),
          pricing: {
            ...futsal.pricing,
            dynamicPrice: Math.round(dynamicPrice),
            distance: distance ? Math.round(distance) : undefined,
            distanceModifier,
            ratingModifier,
            avgRating,
            reviewCount,
          },
        };
      }),
    );
    // --- Filter by minRating if provided ---
    const filteredFutsals = minRating
      ? futsalsWithDynamicPrice.filter((f) => (f.pricing.avgRating || 0) >= parseFloat(minRating))
      : futsalsWithDynamicPrice;
    res.json({ total, page: parseInt(page), limit, futsals: filteredFutsals });
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// POST /api/futsals
exports.createFutsal = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.locals.errorMessage = JSON.stringify(errors.array());
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const futsal = await Futsal.create({ ...req.body, owner: req.user._id });
    res.status(201).json(futsal);
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// PUT /api/futsals/:id
exports.updateFutsal = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.locals.errorMessage = JSON.stringify(errors.array());
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const futsal = await Futsal.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      req.body,
      { new: true },
    );
    if (!futsal) {
      res.locals.errorMessage = 'Futsal not found';
      return res.status(404).json({ error: 'Futsal not found' });
    }
    // Notify futsal owner of update
    const owner = await User.findById(futsal.owner);
    if (owner && owner.email) {
      const html = `<p>Your futsal <b>${futsal.name}</b> details have been updated.</p>`;
      await sendMail({ to: owner.email, subject: 'Futsal Details Updated', html });
    }
    res.json(futsal);
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// DELETE /api/futsals/:id
exports.deleteFutsal = async (req, res) => {
  try {
    const futsal = await Futsal.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!futsal) {
      res.locals.errorMessage = 'Futsal not found';
      return res.status(404).json({ error: 'Futsal not found' });
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
    res.json({ message: 'Futsal deleted' });
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// GET /api/futsals/:id
exports.getFutsalById = async (req, res) => {
  try {
    const cacheKey = `futsal:${req.params.id}`;
    const cached = await getAsync(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    const futsal = await Futsal.findById(req.params.id);
    if (!futsal) {
      res.locals.errorMessage = 'Futsal not found';
      return res.status(404).json({ error: 'Futsal not found' });
    }
    // --- Dynamic Pricing Logic ---
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = now.getHours();
    let holidayModifier = 0;
    try {
      if (await isHoliday(now)) holidayModifier = 0.2;
    } catch (e) {
      holidayModifier = day === 6 ? 0.2 : 0;
    }
    let timeModifier = 0;
    if (hour >= 6 && hour < 12) timeModifier = 0;
    else if (hour >= 12 && hour < 18) timeModifier = 0.1;
    else if (hour >= 18 && hour < 22) timeModifier = 0.2;
    const basePrice = futsal.pricing.basePrice || 0;
    let dynamicPrice = basePrice;
    dynamicPrice += basePrice * timeModifier;
    dynamicPrice += basePrice * holidayModifier;
    // --- Rating Modifier ---
    const { avg: avgRating, count: reviewCount } = await getAverageRating(futsal._id);
    let ratingModifier = 0;
    if (typeof avgRating === 'number') {
      if (avgRating >= 4.5)
        ratingModifier = 0.1; // +10% for top-rated
      else if (avgRating >= 4.0)
        ratingModifier = 0.05; // +5%
      else if (avgRating <= 2.5) ratingModifier = -0.1; // -10% for low-rated
    }
    dynamicPrice += basePrice * ratingModifier;
    const response = {
      ...futsal.toObject(),
      pricing: {
        ...futsal.pricing,
        dynamicPrice: Math.round(dynamicPrice),
        ratingModifier,
        avgRating,
        reviewCount,
      },
    };
    await setAsync(cacheKey, JSON.stringify(response), 'EX', 60 * 5); // Cache for 5 min
    res.json(response);
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// POST /api/v1/futsals/register - Register futsal (for futsalOwner)
exports.registerFutsal = async (req, res) => {
  try {
    const user = req.user;
    // Only futsalOwner or admin can register futsal
    if (user.role !== 'futsalOwner' && user.role !== 'admin') {
      return res
        .status(403)
        .json({
          error:
            'Only futsal owners can register a futsal. Please register as a futsal owner first.',
        });
    }
    // Only accept basePrice from request
    const { name, location, contactInfo, basePrice, amenities, images, description, rules } =
      req.body;

    // Set expiryDate to 7 days from now
    const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create futsal with basePrice only
    const futsal = await Futsal.create({
      name,
      owner: user._id,
      location,
      contactInfo,
      pricing: { basePrice },
      amenities,
      images,
      description,
      rules,
      registrationFeeStatus: { paid: false, expiryDate },
      isActive: false,
    });

    // Fetch futsal owner email
    const owner = await User.findById(futsal.owner);
    if (owner && owner.email) {
      const subject = 'Futsal Registration: Complete Your Payment';
      const html = `<p>Dear ${owner.username || 'Owner'},</p>
        <p>Your futsal <b>${futsal.name}</b> has been registered successfully.</p>
        <p>Please pay the registration fee within 7 days to activate your futsal. If you have already paid, you can ignore this message.</p>
        <p>Thank you,<br/>Futsal App Team</p>`;
      await sendMail({ to: owner.email, subject, html });
    }

    res
      .status(201)
      .json({ message: 'Futsal registered. Please pay registration fee within 7 days.', futsal });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// POST /api/v1/futsals/pay-registration - Pay registration fee for futsal
exports.payFutsalRegistration = async (req, res) => {
  try {
    const { futsalId, paymentToken } = req.body;
    const user = req.user;

    // Find futsal and check ownership
    const futsal = await Futsal.findById(futsalId);
    if (!futsal) return res.status(404).json({ error: 'Futsal not found' });
    if (!futsal.owner.equals(user._id) && user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to pay for this futsal' });
    }
    if (futsal.registrationFeeStatus.paid) {
      return res.status(400).json({ error: 'Registration fee already paid' });
    }

    // Verify payment with Khalti (now only needs paymentToken/pidx)
    const paymentSuccess = await verifyKhaltiPayment(paymentToken);
    if (!paymentSuccess) {
      return res.status(400).json({ error: 'Payment failed or invalid' });
    }

    // Mark futsal as active and registration fee as paid
    futsal.registrationFeeStatus.paid = true;
    futsal.isActive = true;
    await futsal.save();

    // Set isActiveOwner=true for the futsal owner if not already set
    const owner = await User.findById(futsal.owner);
    if (owner && owner.role === 'futsalOwner' && !owner.isActiveOwner) {
      owner.isActiveOwner = true;
      await owner.save();
    }

    res.json({ message: 'Registration fee paid. Futsal is now active!', futsal });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// GET /api/futsals/nearby?lng=...&lat=...&radius=... (radius in meters, default 3000)
exports.getNearbyFutsals = async (req, res) => {
  try {
    const { lng, lat, radius = 3000 } = req.query;
    if (!lng || !lat) {
      return res.status(400).json({ message: 'lng and lat are required' });
    }
    const futsals = await Futsal.find({
      'location.coordinates': {
        $near: {
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseInt(radius),
        },
      },
      isActive: true,
    }).limit(20);
    res.json({ futsals });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// POST /api/futsals/upload-image
exports.uploadFutsalImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const futsalId = req.body.futsalId;
    if (!futsalId) return res.status(400).json({ error: 'No futsalId provided' });
    const futsal = await Futsal.findById(futsalId);
    if (!futsal) return res.status(404).json({ error: 'Futsal not found' });
    // Upload image
    const result = await uploadImage(req.file.path, `futsals/${futsalId}`);
    futsal.images.push(result.secure_url);
    await futsal.save();
    res.status(200).json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Image upload failed' });
  }
};

// PUT /api/futsals/:id/update-image
exports.updateFutsalImage = async (req, res) => {
  try {
    const futsalId = req.params.id;
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const futsal = await Futsal.findById(futsalId);
    if (!futsal) return res.status(404).json({ error: 'Futsal not found' });
    // Optionally delete old image if public_id is provided
    if (req.body.oldPublicId) await deleteImage(req.body.oldPublicId);
    const result = await uploadImage(req.file.path, `futsals/${futsalId}`);
    futsal.images.push(result.secure_url);
    await futsal.save();
    res.status(200).json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Image update failed' });
  }
};
