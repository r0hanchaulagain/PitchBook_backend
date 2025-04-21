// Futsal Owner Activation Email Template
module.exports = function futsalOwnerActivationTemplate({ fullName }) {
  return `
    <p>Dear ${fullName},</p>
    <p>Your futsal owner account has been created but is <b>not yet activated</b>.</p>
    <p>To activate your account and add your futsal, please register your futsal and pay the registration fee within 7 days.</p>
    <p>If you do not complete payment within 7 days after registering your futsal, your futsal registration will expire and be removed from the system.</p>
    <p>Thank you,<br/>Futsal App Team</p>
  `;
};
