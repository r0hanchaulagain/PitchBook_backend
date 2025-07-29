const khaltiService = require("../services/khaltiService");
const config = require("../config/env_config");
async function initiateKhaltiPayment({
	name,
	email,
	phone,
	amount,
	purchase_order_id,
	purchase_order_name,
	return_url,
}) {
	const finalReturnUrl = return_url || `${config.frontendUrl}/payment-success`;

	const amountInPaisa = Math.round(amount * 100);
	return khaltiService.initiatePayment({
		name,
		email,
		phone,
		amount: amountInPaisa,
		purchase_order_id,
		purchase_order_name,
		return_url: finalReturnUrl,
	});
}

module.exports = { initiateKhaltiPayment };
