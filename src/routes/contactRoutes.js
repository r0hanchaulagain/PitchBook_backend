const express = require('express');
const router = express.Router();
const {
  createContact,
  getContacts,
  updateContactStatus,
  deleteContact
} = require('../controllers/contactController');

// Public routes
router.post('/', createContact);

// Protected admin routes
router.get('/', getContacts);
router.put('/:id/status', updateContactStatus);
router.delete('/:id', deleteContact);

module.exports = router;
