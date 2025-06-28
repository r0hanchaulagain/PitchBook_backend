const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./utils/logger');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const createMongoSanitizer = require('./utils/mongoSanitizer');
const xssSanitizer = require('./utils/xssSanitizer');

const app = express();

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [config.frontendUrl,"moz-extension://5d9abfcd-ab40-4485-ac5e-bc52e6f100a2"];

    console.log("Request origin:", origin);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400,
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(createMongoSanitizer({ logSanitized: true }));
app.use(xssSanitizer);
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(helmet());
// Hybrid rate limiting: block bursts, allow frequent safe endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
const burstLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 10, // max 10 requests per second
  message: 'Too many requests in a short time, slow down.',
});
// Apply burst limiter to all routes
app.use(burstLimiter);
// Apply general limiter to all except /api/v1/users/me
app.use((req, res, next) => {
  if (req.path === '/api/v1/users/me') return next();
  return generalLimiter(req, res, next);
});
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
  .catch((err) => {
    const handleMongoConnectionError = (err) => {
      logger.error('MongoDB connection error:', err);
      // Optionally, you can also log a more descriptive message or take further action
      // For example: process.exit(1);
    };
    handleMongoConnectionError(err);
  });

const API_PREFIX = '/api/v1';

// Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// User routes
app.use(`${API_PREFIX}/users`, require('./routes/userRoutes'));

// Payment routes
app.use(`${API_PREFIX}/payments`, require('./routes/paymentRoutes'));

// Futsal routes
app.use(`${API_PREFIX}/futsals`, require('./routes/futsalRoutes'));

// Registration routes
app.use(`${API_PREFIX}/registration`, require('./routes/registrationRoutes'));

app.use(`${API_PREFIX}/booking`, require('./routes/bookingRoutes'))

// Start futsal registration cleanup cron job
require('./jobs/futsalRegistrationCleanup');
// Start notification cleanup cron job
require('./jobs/notificationCleanupJob');
// Start booking cleanup cron job
require('./jobs/bookingCleanupJob');

// Error handler
app.use((err, req, res, next) => {
  logger.error(`${err.stack}\nMessage: ${err.message}`);
  res.locals.errorMessage = err.message;
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

module.exports = app;
// TODO: Fix all the email related issues