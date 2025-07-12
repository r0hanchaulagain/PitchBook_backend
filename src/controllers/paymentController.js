const { verifyKhaltiPayment } = require("../services/khaltiService");
const Futsal = require("../models/Futsal");
const { sendMail } = require("../utils/email");
const futsalPaymentSuccessTemplate = require("../utils/emailTemplates/futsalPaymentSuccess");
const User = require("../models/User");
const Payment = require("../models/Payment");

// POST /api/v1/payments/verify
exports.verifyFutsalRegistrationPayment = async (req, res) => {
	const { futsalId, pidx } = req.body;
	if (!futsalId || !pidx) {
		return res.status(400).json({ error: "futsalId and pidx are required." });
	}
	try {
		const isPaid = await verifyKhaltiPayment(pidx);
		if (!isPaid) {
			return res
				.status(400)
				.json({ error: "Payment not completed or invalid." });
		}
		// Fetch previous status
		const futsal = await Futsal.findById(futsalId).populate("owner");
		if (!futsal) {
			return res.status(404).json({ error: "Futsal not found." });
		}
		const wasPaid = futsal.registrationFeeStatus.paid;
		// Update payment status
		futsal.registrationFeeStatus.paid = true;
		await futsal.save();
		// Create Payment record for registration
		await Payment.create({
			user: futsal.owner._id,
			futsal: futsal._id,
			type: "registration",
			amount: 55000, // or use actual amount if variable
			currency: "NPR",
			status: "completed",
			transactionId: pidx,
			paymentMethod: "khalti",
			paidAt: new Date(),
			metadata: {
				registrationType: "futsal_registration",
				futsalName: futsal.name,
			},
		});
		// If payment was not previously complete, send success email
		if (!wasPaid) {
			// Get owner email and name
			const owner = futsal.owner;
			if (owner && owner.email) {
				await sendMail({
					to: owner.email,
					subject: "Futsal Payment Successful",
					html: futsalPaymentSuccessTemplate({
						ownerName: owner.fullName || owner.username,
						futsalName: futsal.name,
					}),
				});
			}
		}
		res.json({
			message: "Payment verified and registration completed.",
			futsal,
		});
	} catch (err) {
		res.status(500).json({ error: err.message || "Server error" });
	}
};
