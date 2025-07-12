module.exports = function futsalPaymentSuccessTemplate({
	ownerName,
	futsalName,
}) {
	return `
    <div style="font-family: Arial, sans-serif;">
      <h2>Congratulations, ${ownerName}!</h2>
      <p>Your payment for the futsal <strong>${futsalName}</strong> has been received successfully.</p>
      <p>Your futsal is now <span style="color:green;font-weight:bold;">active</span> and visible on our platform.</p>
      <p>Thank you for registering with us!</p>
      <br/>
      <p>Best regards,<br/>The Futsal Team</p>
    </div>
  `;
};
