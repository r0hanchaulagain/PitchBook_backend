const User = require('../models/User');
const Futsal = require('../models/Futsal');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');

// 1. Platform Overview
exports.getOverview = async (req, res) => {
  try {
    const [userStats, futsalStats, bookingStats, revenueStats, transactionStats] =
      await Promise.all([
        User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
        Futsal.aggregate([
          {
            $group: {
              _id: { isActive: '$isActive', isVerified: '$isVerified' },
              count: { $sum: 1 },
            },
          },
        ]),
        Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Booking.aggregate([
          { $match: { paymentStatus: 'paid' } },
          { $group: { _id: null, total: { $sum: '$totalPrice' } } },
        ]),
        Transaction.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
      ]);
    res.json({
      userStats,
      futsalStats,
      bookingStats,
      revenue: revenueStats[0]?.total || 0,
      transactionStats,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 2. Time Series Analytics
exports.getRegistrations = async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const groupBy =
      period === 'daily'
        ? {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          }
        : period === 'weekly'
          ? { year: { $year: '$createdAt' }, week: { $week: '$createdAt' } }
          : { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
    const data = await User.aggregate([
      { $group: { _id: groupBy, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } },
    ]);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getBookings = async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const groupBy =
      period === 'daily'
        ? {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          }
        : period === 'weekly'
          ? { year: { $year: '$createdAt' }, week: { $week: '$createdAt' } }
          : { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
    const data = await Booking.aggregate([
      { $group: { _id: groupBy, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } },
    ]);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getRevenue = async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const groupBy =
      period === 'daily'
        ? {
            year: { $year: '$paymentDetails.paymentDate' },
            month: { $month: '$paymentDetails.paymentDate' },
            day: { $dayOfMonth: '$paymentDetails.paymentDate' },
          }
        : period === 'weekly'
          ? {
              year: { $year: '$paymentDetails.paymentDate' },
              week: { $week: '$paymentDetails.paymentDate' },
            }
          : {
              year: { $year: '$paymentDetails.paymentDate' },
              month: { $month: '$paymentDetails.paymentDate' },
            };
    const data = await Booking.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: groupBy, total: { $sum: '$totalPrice' } } },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } },
    ]);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 3. Top/Bottom Performers
exports.getTopFutsals = async (req, res) => {
  try {
    const { limit = 10, period = 'all' } = req.query;
    let match = {};
    if (period !== 'all') {
      const start = new Date();
      if (period === 'monthly') start.setMonth(start.getMonth() - 1);
      if (period === 'weekly') start.setDate(start.getDate() - 7);
      match = { createdAt: { $gte: start } };
    }
    const data = await Booking.aggregate([
      { $match: match },
      { $group: { _id: '$futsal', bookings: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } },
      { $sort: { bookings: -1, revenue: -1 } },
      { $limit: parseInt(limit) },
      { $lookup: { from: 'futsals', localField: '_id', foreignField: '_id', as: 'futsal' } },
      { $unwind: '$futsal' },
    ]);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getTopUsers = async (req, res) => {
  try {
    const { limit = 10, period = 'all' } = req.query;
    let match = {};
    if (period !== 'all') {
      const start = new Date();
      if (period === 'monthly') start.setMonth(start.getMonth() - 1);
      if (period === 'weekly') start.setDate(start.getDate() - 7);
      match = { createdAt: { $gte: start } };
    }
    const data = await Booking.aggregate([
      { $match: match },
      { $group: { _id: '$user', bookings: { $sum: 1 } } },
      { $sort: { bookings: -1 } },
      { $limit: parseInt(limit) },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
    ]);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getLowPerformingFutsals = async (req, res) => {
  try {
    const { limit = 10, period = 'all' } = req.query;
    let match = {};
    if (period !== 'all') {
      const start = new Date();
      if (period === 'monthly') start.setMonth(start.getMonth() - 1);
      if (period === 'weekly') start.setDate(start.getDate() - 7);
      match = { createdAt: { $gte: start } };
    }
    const data = await Booking.aggregate([
      { $match: match },
      { $group: { _id: '$futsal', bookings: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } },
      { $sort: { bookings: 1, revenue: 1 } },
      { $limit: parseInt(limit) },
      { $lookup: { from: 'futsals', localField: '_id', foreignField: '_id', as: 'futsal' } },
      { $unwind: '$futsal' },
    ]);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 4. Geographical Analytics
exports.getFutsalsByLocation = async (req, res) => {
  try {
    const data = await Futsal.aggregate([
      {
        $group: {
          _id: { city: '$location.city', district: '$location.district' },
          count: { $sum: 1 },
        },
      },
    ]);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getBookingsByLocation = async (req, res) => {
  try {
    const data = await Booking.aggregate([
      { $lookup: { from: 'futsals', localField: 'futsal', foreignField: '_id', as: 'futsal' } },
      { $unwind: '$futsal' },
      {
        $group: {
          _id: { city: '$futsal.location.city', district: '$futsal.location.district' },
          count: { $sum: 1 },
        },
      },
    ]);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 5. Other Stats
exports.getActiveVsInactiveFutsals = async (req, res) => {
  try {
    const data = await Futsal.aggregate([{ $group: { _id: '$isActive', count: { $sum: 1 } } }]);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCancellations = async (req, res) => {
  try {
    const data = await Booking.aggregate([
      { $match: { status: 'cancelled' } },
      { $group: { _id: { futsal: '$futsal', user: '$user' }, count: { $sum: 1 } } },
    ]);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getHolidayImpact = async (req, res) => {
  try {
    // Bookings/revenue on holidays vs regular days
    const holidays = await require('../models/Holiday').find();
    const holidayDates = holidays.map((h) => h.date.toISOString().slice(0, 10));
    const data = await Booking.aggregate([
      { $addFields: { dateStr: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } } },
      {
        $group: {
          _id: { isHoliday: { $in: ['$dateStr', holidayDates] } },
          bookings: { $sum: 1 },
          revenue: { $sum: '$totalPrice' },
        },
      },
    ]);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
