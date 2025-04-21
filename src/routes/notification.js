const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { isAuthenticated } = require('../middleware/auth');

// HTTP polling endpoints
router.get('/', isAuthenticated, notificationController.getNotifications);
router.post('/mark-read', isAuthenticated, notificationController.markAsRead);

module.exports = router;
