// Booking Cleanup Job: Cancels abandoned/unpaid bookings
const Booking = require('../models/Booking');
const cron = require('node-cron');

// Run every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  const THIRTY_MINUTES = 30 * 60 * 1000;
  const cutoff = new Date(Date.now() - THIRTY_MINUTES);

  try {
    // Find bookings that are still pending and older than 30 minutes
    const staleBookings = await Booking.find({
      status: 'pending',
      createdAt: { $lt: cutoff },
    });

    if (staleBookings.length > 0) {
      const ids = staleBookings.map(b => b._id);
      await Booking.updateMany(
        { _id: { $in: ids } },
        { $set: { status: 'cancelled', updatedAt: new Date() } }
      );
      console.log(`[BookingCleanup] Cancelled ${ids.length} stale bookings.`);
    }
  } catch (err) {
    console.error('[BookingCleanup] Error cancelling stale bookings:', err);
  }
});

module.exports = {}; 