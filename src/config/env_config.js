const dotenv = require("dotenv");
const path = require("path");

const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

module.exports = {
	port: process.env.PORT,

	mongoUri: process.env.MONGODB_URI,

	jwtSecret: process.env.JWT_SECRET,
	cookie_secret: process.env.COOKIE_SECRET,

	nodeEnv: process.env.NODE_ENV || "development",

	smtp: {
		host: process.env.SMTP_HOST,
		port: process.env.SMTP_PORT,
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS,
		from: process.env.SMTP_FROM,
	},
	frontendUrl: process.env.FRONTEND_URL,

	khaltiSecretKey: process.env.KHALTI_SECRET_KEY,

	cloudinary: {
		cloudName: process.env.CLOUDINARY_CLOUD_NAME,
		apiKey: process.env.CLOUDINARY_API_KEY,
		apiSecret: process.env.CLOUDINARY_API_SECRET,
	},

	csrf_secret: process.env.CSRF_SECRET,
	session_secret: process.env.SESSION_SECRET,

	altcha: {
		hmac_key: process.env.ALTCHA_HMAC_KEY,
		max_number: process.env.ALTCHA_MAX_NUMBER,
		max_challenge_age: process.env.ALTCHA_MAX_CHALLENGE_AGE,
		algorithm: process.env.ALTCHA_ALGORITHM,
	},

	google: {
		clientId: process.env.GOOGLE_CLIENT_ID,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET,
		callbackUrl: process.env.GOOGLE_CALLBACK_URL,
	},

	data_encryption_key: process.env.DATA_ENCRYPTION_KEY,
};
