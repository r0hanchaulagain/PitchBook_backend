const axios = require('axios');

const KHALTI_SECRET_KEY = process.env.KHALTI_SECRET_KEY;
const KHALTI_LOOKUP_URL = 'https://a.khalti.com/api/v2/epayment/lookup/';

/**
 * Verifies a Khalti payment pidx using the new lookup endpoint.
 * @param {string} pidx - Payment identifier from Khalti
 * @returns {Promise<boolean>} - Resolves true if payment is valid, else false
 */
async function verifyKhaltiPayment(pidx) {
  try {
    const response = await axios.post(
      KHALTI_LOOKUP_URL,
      `pidx=${pidx}`,
      {
        headers: {
          Authorization: `Key ${KHALTI_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    return response.data && response.data.status === 'Completed';
  } catch (err) {
    return false;
  }
}

module.exports = { verifyKhaltiPayment };
