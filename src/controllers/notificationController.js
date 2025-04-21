const Notification = require('../models/Notification');
const Booking = require('../models/Booking');

// Get notifications for the logged-in user (for polling)
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id, isRead: false }).sort({
      createdAt: -1,
    });
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Mark notifications as read
exports.markAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, _id: { $in: req.body.ids } },
      { isRead: true },
    );
    res.json({ message: 'Notifications marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create notification utility (to be called on booking/payment events)
exports.createNotification = async ({ user, message, type, meta }) => {
  try {
    await Notification.create({ user, message, type, meta });
  } catch (err) {
    // Logging only; do not throw
    console.error('Notification creation failed', err);
  }
};
