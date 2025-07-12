const cloudinary = require("cloudinary").v2;
const config = require("../config/env_config");

cloudinary.config({
	cloud_name: config.cloudinary.cloudName,
	api_key: config.cloudinary.apiKey,
	api_secret: config.cloudinary.apiSecret,
});

/**
 * Upload an image to Cloudinary
 * @param {string} filePath - Local path or base64 string
 * @param {string} folder - Cloudinary folder (optional)
 * @returns {Promise<{url: string, public_id: string}>}
 */
const uploadImage = (filePath, folder = "") => {
	return cloudinary.uploader.upload(filePath, {
		folder,
		resource_type: "image",
	});
};

/**
 * Delete an image from Cloudinary
 * @param {string} publicId
 * @returns {Promise}
 */
const deleteImage = (publicId) => {
	return cloudinary.uploader.destroy(publicId);
};

module.exports = {
	uploadImage,
	deleteImage,
};
