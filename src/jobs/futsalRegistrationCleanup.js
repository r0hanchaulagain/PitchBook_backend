const cron = require('node-cron');
const Futsal = require('../models/Futsal');
const User = require('../models/User');
const nodemailer = require('nodemailer');
const config = require('../config');

// Setup nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || config.smtpHost,
  port: process.env.SMTP_PORT || config.smtpPort,
  auth: {
    user: process.env.SMTP_USER || config.smtpUser,
    pass: process.env.SMTP_PASS || config.smtpPass,
  },
});

// Send reminder email
async function sendReminderEmail(user, futsal) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Futsal App <no-reply@futsal.com>',
    to: user.email,
    subject: 'Futsal Registration Payment Reminder',
    html: `<p>Dear ${user.fullName},</p>
      <p>Your futsal <b>${futsal.name}</b> registration is pending payment. Please pay the registration fee before ${futsal.registrationFeeStatus.expiryDate.toDateString()} to activate your futsal.</p>
      <p>If you do not complete payment, your futsal registration will expire and will be removed from our system.</p>
      <p>Thank you,<br/>Futsal App Team</p>`,
  });
}

const ENV = process.env.NODE_ENV || 'development';

async function futsalCleanupJob() {
  const now = new Date();
  // Find futsals that are not paid and have expired
  const expiredFutsals = await Futsal.find({
    'registrationFeeStatus.paid': false,
    'registrationFeeStatus.expiryDate': { $lte: now },
  });

  // Remove expired futsals
  if (expiredFutsals.length > 0) {
    const ids = expiredFutsals.map((f) => f._id);
    await Futsal.deleteMany({ _id: { $in: ids } });
    console.log(`Deleted ${ids.length} expired futsal registrations.`);
  }

  // Find futsals expiring in next 2 days and send reminders
  const soonExpiring = await Futsal.find({
    'registrationFeeStatus.paid': false,
    'registrationFeeStatus.expiryDate': {
      $gt: now,
      $lte: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
    },
  });
  for (const futsal of soonExpiring) {
    const owner = await User.findById(futsal.owner);
    if (owner && owner.email) {
      await sendReminderEmail(owner, futsal);
      console.log(`Sent reminder to ${owner.email} for futsal ${futsal.name}`);
    }
  }
}

// Run at startup
futsalCleanupJob();

if (ENV === 'production') {
  // Server cron: run daily at midnight
  cron.schedule('0 0 * * *', futsalCleanupJob);
  console.log('Production cron: Futsal registration cleanup scheduled for midnight daily');
} else {
  // Local cron: run every 30 minutes
  cron.schedule('*/30 * * * *', futsalCleanupJob);
  console.log('Local cron: Futsal registration cleanup scheduled every 30 minutes');
}

module.exports = {};
