const corsConfig = () => ({
	origin: (origin, callback) => {
		const allowedOrigins = [process.env.FRONTEND_URL];
		if (!origin || allowedOrigins.includes(origin)) {
			callback(null, true);
		} else {
			callback(new Error("Not allowed by CORS"));
		}
	},
	credentials: true,
	methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token"],
	maxAge: 86400,
});

module.exports = corsConfig;
