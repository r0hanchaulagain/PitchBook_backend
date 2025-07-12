const khaltiService = require("../services/khaltiService");
const config = require("../config/env_config");

/**
 * Shared utility to initiate Khalti payment for any context (booking, registration, etc.)
 * @param {Object} params - { name, email, phone, amount, purchase_order_id, purchase_order_name, return_url }
 * @returns {Promise<Object>} - Khalti payment initiation response
 */
async function initiateKhaltiPayment({
	name,
	email,
	phone,
	amount,
	purchase_order_id,
	purchase_order_name,
	return_url,
}) {
	// Use provided return_url or fallback to default
	const finalReturnUrl = return_url || `${config.frontendUrl}/payment-success`;
	// Convert amount from rupees to paisa (1 NPR = 100 paisa)
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
