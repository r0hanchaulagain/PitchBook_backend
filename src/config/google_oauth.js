const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const logger = require('../utils/logger');

// Google OAuth Configuration
const googleConfig = {
	clientID: process.env.GOOGLE_CLIENT_ID,
	clientSecret: process.env.GOOGLE_CLIENT_SECRET,
	callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8080/api/v1/users/google/callback',
	scope: ['profile', 'email']
};

// Only configure Google Strategy if credentials are provided
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
	// Configure Google Strategy
	passport.use(new GoogleStrategy(googleConfig, async (accessToken, refreshToken, profile, done) => {
		try {
			logger.info('Google OAuth callback received', {
				googleId: profile.id,
				email: profile.emails[0]?.value,
				displayName: profile.displayName
			});

			// Check if user already exists using encryption-aware methods
			let user = await User.findOne({ googleId: profile.id });
			
			// If not found by googleId, try by email
			if (!user && profile.emails[0]?.value) {
				user = await User.findByEmail(profile.emails[0].value);
			}

			if (user) {
				// User exists, update Google info if needed
				if (!user.googleId) {
					user.googleId = profile.id;
					user.authProvider = 'google';
					user.googleEmail = profile.emails[0]?.value;
					user.googleProfile = {
						picture: profile.photos[0]?.value,
						locale: profile._json.locale,
						verified_email: profile._json.verified_email
					};
					// Use Google profile picture if no profile image exists
					if (!user.profileImage && profile.photos[0]?.value) {
						user.profileImage = profile.photos[0].value;
					}
					await user.save();
				}
				
				// Update last login
				user.lastLogin = new Date();
				await user.save();
				
				logger.info('Existing user logged in via Google', { userId: user._id, email: user.email });
				return done(null, user);
			}

			// Create new user
			const newUser = new User({
				fullName: profile.displayName,
				email: profile.emails[0]?.value,
				googleId: profile.id,
				authProvider: 'google',
				googleEmail: profile.emails[0]?.value,
				googleProfile: {
					picture: profile.photos[0]?.value,
					locale: profile._json.locale,
					verified_email: profile._json.verified_email
				},
				profileImage: profile.photos[0]?.value,
				role: 'user', // Default role for Google users
				favoritesFutsal: [],
				bookingHistory: [],
				lastLogin: new Date()
			});

			await newUser.save();
			
			logger.info('New user created via Google OAuth', { 
				userId: newUser._id, 
				email: newUser.email,
				googleId: newUser.googleId 
			});
			
			return done(null, newUser);
		} catch (error) {
			logger.error('Google OAuth error:', error);
			return done(error, null);
		}
	}));

	logger.info('Google OAuth strategy configured successfully');
} else {
	logger.warn('Google OAuth not configured - missing environment variables');
	logger.warn('To enable Google OAuth, set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
}

// Serialize user for session
passport.serializeUser((user, done) => {
	done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
	try {
		const user = await User.findById(id);
		done(null, user);
	} catch (error) {
		done(error, null);
	}
});

module.exports = {
	passport,
	googleConfig
}; 