const axios = require('axios');

const KHALTI_SECRET_KEY = process.env.KHALTI_SECRET_KEY;
const KHALTI_VERIFY_URL = 'https://khalti.com/api/v2/payment/verify/';

/**
 * Verifies a Khalti payment token and amount.
 * @param {string} token - Payment token from Khalti
 * @param {number} amount - Amount in paisa (Khalti expects NPR * 100)
 * @returns {Promise<boolean>} - Resolves true if payment is valid, else false
 */
async function verifyKhaltiPayment(token, amount) {
  try {
    const response = await axios.post(
      KHALTI_VERIFY_URL,
      { token, amount },
      {
        headers: {
          Authorization: `Key ${KHALTI_SECRET_KEY}`,
        },
      },
    );
    return response.data && response.data.idx ? true : false;
  } catch (err) {
    return false;
  }
}

module.exports = { verifyKhaltiPayment };
