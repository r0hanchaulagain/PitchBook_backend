const khaltiService = require('../services/khaltiService');
const config = require('../config');

/**
 * Shared utility to initiate Khalti payment for any context (booking, registration, etc.)
 * @param {Object} params - { name, email, phone, amount, purchase_order_id, purchase_order_name, return_url }
 * @returns {Promise<Object>} - Khalti payment initiation response
 */
async function initiateKhaltiPayment({ name, email, phone, amount, purchase_order_id, purchase_order_name, return_url }) {
  // Use provided return_url or fallback to default
  const finalReturnUrl = return_url || `${config.frontendUrl}/payment-success`;
  return khaltiService.initiatePayment({
    name,
    email,
    phone,
    amount,
    purchase_order_id,
    purchase_order_name,
    return_url: finalReturnUrl
  });
}

module.exports = { initiateKhaltiPayment }; 