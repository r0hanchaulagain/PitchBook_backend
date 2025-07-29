const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");
const logger = require("../utils/logger");
const { google } = require("../config/env_config");

const googleConfig = {
	clientID: google.clientId,
	clientSecret: google.clientSecret,
	callbackURL: google.callbackUrl,
	scope: ["profile", "email", "name"],
};

if (google.clientId && google.clientSecret) {
	passport.use(
		new GoogleStrategy(
			googleConfig,
			async (accessToken, refreshToken, profile, done) => {
				try {
					logger.info("Google OAuth callback received", {
						googleId: profile.id,
						email: profile.emails[0]?.value,
						displayName: profile.displayName,
					});

					let user = await User.findOne({ googleId: profile.id });

					if (!user && profile.emails[0]?.value) {
						user = await User.findByEmail(profile.emails[0].value);
					}

					if (user) {
						if (!user.googleId) {
							user.googleId = profile.id;
							user.authProvider = "google";
							user.googleEmail = profile.emails[0]?.value;
							user.googleProfile = {
								picture: profile.photos[0]?.value,
								locale: profile._json.locale,
								verified_email: profile._json.verified_email,
							};

							if (!user.profileImage && profile.photos[0]?.value) {
								user.profileImage = profile.photos[0].value;
							}
							user.isEmailVerified = true;
							await user.save();
						}

						user.lastLogin = new Date();
						await user.save();

						logger.info("Existing user logged in via Google", {
							userId: user._id,
							email: user.email,
							isEmailVerified: user.isEmailVerified,
						});
						return done(null, user);
					}

					const newUser = new User({
						fullName: profile.displayName,
						email: profile.emails[0]?.value,
						googleId: profile.id,
						authProvider: "google",
						googleEmail: profile.emails[0]?.value,
						googleProfile: {
							picture: profile.photos[0]?.value,
							locale: profile._json.locale,
							verified_email: profile._json.verified_email,
						},
						profileImage: profile.photos[0]?.value,
						role: "user",
						favoritesFutsal: [],
						bookingHistory: [],
						lastLogin: new Date(),
						isEmailVerified: true,
					});

					await newUser.save();

					logger.info("New user created via Google OAuth", {
						userId: newUser._id,
						email: newUser.email,
						googleId: newUser.googleId,
						isEmailVerified: newUser.isEmailVerified,
					});

					return done(null, newUser);
				} catch (error) {
					logger.error("Google OAuth error:", error);
					return done(error, null);
				}
			}
		)
	);

	logger.info("Google OAuth strategy configured successfully");
} else {
	logger.warn("Google OAuth not configured - missing environment variables");
	logger.warn(
		"To enable Google OAuth, set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"
	);
}

passport.serializeUser((user, done) => {
	done(null, user.id);
});

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
	googleConfig,
};
