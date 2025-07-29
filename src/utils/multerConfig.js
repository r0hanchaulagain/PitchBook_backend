const multer = require("multer");

const upload = multer({
	dest: "uploads/",
	fileFilter: (req, file, cb) => {
		if (file.mimetype.startsWith("image/")) {
			const allowedMimeTypes = [
				"image/jpeg",
				"image/jpg",
				"image/png",
				"image/gif",
				"image/webp",
			];

			if (allowedMimeTypes.includes(file.mimetype)) {
				const allowedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
				const fileExtension = file.originalname
					.toLowerCase()
					.substring(file.originalname.lastIndexOf("."));

				if (allowedExtensions.includes(fileExtension)) {
					cb(null, true);
				} else {
					cb(
						new Error(
							"Invalid file extension. Only .jpg, .jpeg, .png, .gif, .webp files are allowed."
						),
						false
					);
				}
			} else {
				cb(
					new Error(
						"Invalid MIME type. Only JPEG, PNG, GIF, and WebP images are allowed."
					),
					false
				);
			}
		} else {
			cb(new Error("Only image files are allowed!"), false);
		}
	},
	limits: {
		fileSize: 5 * 1024 * 1024,
		files: 1,
	},
});

const handleMulterError = (err, req, res, next) => {
	if (err instanceof multer.MulterError) {
		if (err.code === "LIMIT_FILE_SIZE") {
			return res.status(400).json({
				error: "File too large",
				message: "File size must be less than 5MB",
			});
		}
		if (err.code === "LIMIT_FILE_COUNT") {
			return res.status(400).json({
				error: "Too many files",
				message: "Only one file is allowed per request",
			});
		}
		return res.status(400).json({
			error: "File upload error",
			message: err.message,
		});
	}

	if (
		err.message &&
		(err.message.includes("Only image files are allowed") ||
			err.message.includes("Invalid MIME type") ||
			err.message.includes("Invalid file extension"))
	) {
		return res.status(400).json({
			error: "Invalid file type",
			message: err.message,
		});
	}

	next(err);
};

module.exports = {
	upload,
	handleMulterError,
};
