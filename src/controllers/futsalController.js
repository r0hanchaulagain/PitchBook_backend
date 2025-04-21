const Futsal = require('../models/Futsal');
const { validationResult } = require('express-validator');
const { verifyKhaltiPayment } = require('../services/khaltiService');

// GET /api/futsals?search=&city=&district=&page=&limit=
exports.getFutsals = async (req, res) => {
  try {
    const { search, city, district, page = 1 } = req.query;
    const limit = parseInt(req.query.limit) || 15;
    const filter = {};
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (city) filter['location.city'] = city;
    if (district) filter['location.district'] = district;
    const skip = (parseInt(page) - 1) * limit;
    const total = await Futsal.countDocuments(filter);
    const futsals = await Futsal.find(filter).skip(skip).limit(limit);
    res.json({ total, page: parseInt(page), limit, futsals });
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
    res.json({ message: 'Futsal deleted' });
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// GET /api/futsals/:id
exports.getFutsalById = async (req, res) => {
  try {
    const futsal = await Futsal.findById(req.params.id);
    if (!futsal) {
      res.locals.errorMessage = 'Futsal not found';
      return res.status(404).json({ error: 'Futsal not found' });
    }
    res.json(futsal);
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// POST /api/v1/futsals/register - Register futsal (for futsalOwner)
exports.registerFutsal = async (req, res) => {
  try {
    const user = req.user;
    const { name, location, contactInfo, pricing, amenities, images, description, rules } =
      req.body;

    // If user is not futsalOwner, update their role
    if (user.role !== 'futsalOwner' && user.role !== 'admin') {
      user.role = 'futsalOwner';
      await user.save();
    }

    // Set expiryDate to 7 days from now
    const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create futsal with registrationFeeStatus
    const futsal = await Futsal.create({
      name,
      owner: user._id,
      location,
      contactInfo,
      pricing,
      amenities,
      images,
      description,
      rules,
      registrationFeeStatus: {
        paid: false,
        expiryDate,
      },
      isActive: false, // Not active until payment
    });
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
    const { futsalId, paymentToken, amount } = req.body;
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

    // Verify payment with Khalti
    const paymentSuccess = await verifyKhaltiPayment(paymentToken, amount);
    if (!paymentSuccess) {
      return res.status(400).json({ error: 'Payment failed or invalid' });
    }

    // Mark futsal as active and registration fee as paid
    futsal.registrationFeeStatus.paid = true;
    futsal.isActive = true;
    await futsal.save();

    res.json({ message: 'Registration fee paid. Futsal is now active!', futsal });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
};
