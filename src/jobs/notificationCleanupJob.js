// Notification Cleanup Job
const Notification = require('../models/Notification');
const cron = require('node-cron');

// Delete notifications marked as read (run every hour)
cron.schedule('0 * * * *', async () => {
  try {
    const result = await Notification.deleteMany({ isRead: true });
    if (result.deletedCount > 0) {
      console.log(`[NotificationCleanup] Deleted ${result.deletedCount} read notifications.`);
    }
  } catch (err) {
    console.error('[NotificationCleanup] Error deleting read notifications:', err);
  }
});

// Delete notifications older than 7 days that are not read (run every hour)
cron.schedule('10 * * * *', async () => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await Notification.deleteMany({ isRead: false, createdAt: { $lt: oneWeekAgo } });
    if (result.deletedCount > 0) {
      console.log(`[NotificationCleanup] Deleted ${result.deletedCount} old unread notifications.`);
    }
  } catch (err) {
    console.error('[NotificationCleanup] Error deleting old unread notifications:', err);
  }
});

module.exports = {};
