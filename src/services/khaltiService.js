const axios = require('axios');
const config = require('../config');

const KHALTI_INITIATE_URL = 'https://dev.khalti.com/api/v2/epayment/initiate/';
const KHALTI_LOOKUP_URL = 'https://dev.khalti.com/api/v2/epayment/lookup/';


async function initiatePayment({ name, email, phone, amount, purchase_order_id, purchase_order_name, return_url }) {
  const payload = {
    return_url,
    website_url: config.frontendUrl,
    amount: amount.toString(),
    purchase_order_id,
    purchase_order_name,
    customer_info: { name, email, phone }
  };
  const response = await axios.post(KHALTI_INITIATE_URL, payload, {
    headers: {
      Authorization: `Key ${config.khaltiSecretKey}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data;
}

async function lookupPayment(pidx) {
  const response = await axios.post(KHALTI_LOOKUP_URL, { pidx }, {
    headers: {
      Authorization: `Key ${config.khaltiSecretKey}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data;
}

module.exports = { initiatePayment, lookupPayment };
