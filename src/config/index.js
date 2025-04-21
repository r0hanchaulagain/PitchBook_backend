const dotenv = require('dotenv');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

module.exports = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  nodeEnv: process.env.NODE_ENV || 'development',
  smtp: {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
};
