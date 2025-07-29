const User = require("../models/User");
const khaltiService = require("../services/khaltiService");
const emailUtil = require("../utils/email");
const { initiateKhaltiPayment } = require("../utils/payment");

exports.registerOwner = async (req, res) => {
	try {
		const { fullName, email, phone, password } = req.body;

		const user = new User({
			fullName,
			email,
			phone,
			password,
			role: "futsalOwner",
			isActiveOwner: false,
		});
		await user.save();

		const return_url = req.body.return_url || req.query.return_url;
		const paymentInit = await initiateKhaltiPayment({
			name: fullName,
			email,
			phone,
			amount: 55000,
			purchase_order_id: user._id.toString(),
			purchase_order_name: "Futsal Owner Registration",
			return_url,
		});

		user.khaltiPidx = paymentInit.pidx;
		await user.save();

		res.status(201).json({
			message:
				"Owner registration successful. Check your email for payment details.",
			payment_url: paymentInit.payment_url,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

exports.verifyPayment = async (req, res) => {
	try {
		const { pidx } = req.query;
		if (!pidx) return res.status(400).json({ error: "Missing pidx" });

		const lookup = await khaltiService.lookupPayment(pidx);
		if (lookup.status === "Completed") {
			const user = await User.findOne({ khaltiPidx: pidx });
			if (user) {
				user.isActiveOwner = true;
				await user.save();
				return res.json({ message: "Payment verified. Owner activated." });
			} else {
				return res.status(404).json({ error: "User not found for this pidx" });
			}
		} else {
			return res
				.status(400)
				.json({ error: "Payment not completed", status: lookup.status });
		}
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

exports.resendPaymentUrl = async (req, res) => {
	try {
		const { email } = req.body;
		if (!email) return res.status(400).json({ error: "Email is required" });
		const user = await User.findOne({ email, role: "futsalOwner" });
		if (!user) return res.status(404).json({ error: "User not found" });
		if (user.isActiveOwner) {
			return res.status(400).json({ error: "Owner is already active" });
		}
		if (!user.khaltiPidx) {
			return res
				.status(400)
				.json({ error: "No payment initiated for this user" });
		}

		const payment_url = `https://test-pay.khalti.com/?pidx=${user.khaltiPidx}`;
		return res.json({ payment_url });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};
