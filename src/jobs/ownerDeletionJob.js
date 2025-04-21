// Owner Deletion Cascade & Hard Deletion Job
const User = require('../models/User');
const Futsal = require('../models/Futsal');
const Booking = require('../models/Booking');
const { sendMail } = require('../utils/email');
const cron = require('node-cron');

// Run every hour to check for owners marked for deletion
cron.schedule('0 * * * *', async () => {
  const now = new Date();
  // Find owners scheduled for deletion whose 24h window has expired
  const owners = await User.find({
    role: 'futsalOwner',
    scheduledDeletion: { $lte: now },
    isDeleted: false,
  });
  for (const owner of owners) {
    // Find futsals owned by this owner
    const futsals = await Futsal.find({ owner: owner._id });
    // Find users with active bookings for these futsals
    const futsalIds = futsals.map((f) => f._id);
    const bookings = await Booking.find({
      futsal: { $in: futsalIds },
      status: { $in: ['pending', 'confirmed'] },
    })
      .populate('user')
      .populate('futsal');
    // Notify users
    for (const booking of bookings) {
      if (booking.user && booking.user.email) {
        const html = `<p>Your booking for ${booking.futsal.name} has been cancelled due to futsal/owner account deletion.</p>`;
        await sendMail({ to: booking.user.email, subject: 'Booking Cancelled', html });
      }
    }
    // Hard delete futsals, bookings, and owner
    await Booking.deleteMany({ futsal: { $in: futsalIds } });
    await Futsal.deleteMany({ owner: owner._id });
    await User.deleteOne({ _id: owner._id });
  }
});

module.exports = {};
