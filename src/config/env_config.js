const dotenv = require("dotenv");
const path = require("path");

const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

module.exports = {
	port: process.env.PORT || 5000,
	mongoUri: process.env.MONGODB_URI,
	jwtSecret: process.env.JWT_SECRET,
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
	redis: {
		host: process.env.REDIS_HOST,
		port: process.env.REDIS_PORT,
	},
};
