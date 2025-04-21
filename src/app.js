const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./utils/logger');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(cookieParser());
app.use(helmet());
app.use(mongoSanitize());
app.use(xss());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
  }),
);

// Monkey-patch res.send to capture response body
app.use((req, res, next) => {
  const oldSend = res.send;
  res.send = function (body) {
    res.locals.responseBody = body;
    return oldSend.call(this, body);
  };
  next();
});

// Add custom morgan token for error messages
morgan.token('error-message', (req, res) => res.locals.errorMessage || '-');

// Add custom morgan token for response/error message
morgan.token('response-data', (req, res) => {
  if (res.statusCode >= 400) {
    return res.locals.errorMessage || '-';
  }
  try {
    if (typeof res.locals.responseBody === 'object') {
      return JSON.stringify(res.locals.responseBody);
    }
    return res.locals.responseBody || '-';
  } catch (e) {
    return '-';
  }
});

// Use morgan with response-data token
app.use(morgan(':method :url :status :response-time ms - :res[content-length] :response-data'));

// Connect to MongoDB
mongoose
  .connect(config.mongoUri)
  .then(() => logger.info('MongoDB connected'))
  .catch((err) => logger.error('MongoDB connection error:', err));

const API_PREFIX = '/api/v1';

// Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// User routes
app.use(`${API_PREFIX}/users`, require('./routes/userRoutes'));

// Payment routes
app.use(`${API_PREFIX}/payments`, require('./routes/paymentRoutes'));

// Futsal routes
app.use(`${API_PREFIX}/futsals`, require('./routes/futsalRoutes'));

// TODO: Mount other routes here

// Start futsal registration cleanup cron job
require('./jobs/futsalRegistrationCleanup');
// Start notification cleanup cron job
require('./jobs/notificationCleanupJob');

// Error handler
app.use((err, req, res, next) => {
  logger.error(`${err.stack}\nMessage: ${err.message}`);
  res.locals.errorMessage = err.message;
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

module.exports = app;
