const Holiday = require('../models/Holiday');
const Futsal = require('../models/Futsal');

// Create a holiday
exports.createHoliday = async (req, res) => {
  try {
    const { name, date, isRecurring, recurringDetails } = req.body;
    const holiday = await Holiday.create({ name, date, isRecurring, recurringDetails });
    res.status(201).json({ message: 'Holiday created', holiday });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all holidays
exports.getHolidays = async (req, res) => {
  try {
    const holidays = await Holiday.find();
    res.json({ holidays });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update a holiday
exports.updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const holiday = await Holiday.findByIdAndUpdate(id, req.body, { new: true });
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });
    res.json({ message: 'Holiday updated', holiday });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete a holiday
exports.deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const holiday = await Holiday.findByIdAndDelete(id);
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });
    res.json({ message: 'Holiday deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Futsal closure management
// POST /api/futsals/:id/close - Close futsal for specific dates/reasons
exports.closeFutsal = async (req, res) => {
  try {
    const { id } = req.params;
    const { dates, reason } = req.body; // dates: array of Date
    const futsal = await Futsal.findById(id);
    if (!futsal) return res.status(404).json({ message: 'Futsal not found' });
    if (!futsal.closures) futsal.closures = [];
    dates.forEach((date) => {
      futsal.closures.push({ date: new Date(date), reason });
    });
    await futsal.save();
    res.json({ message: 'Futsal closed for specified dates', closures: futsal.closures });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/futsals/:id/closures - Get futsal closure dates
exports.getFutsalClosures = async (req, res) => {
  try {
    const { id } = req.params;
    const futsal = await Futsal.findById(id);
    if (!futsal) return res.status(404).json({ message: 'Futsal not found' });
    res.json({ closures: futsal.closures || [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
