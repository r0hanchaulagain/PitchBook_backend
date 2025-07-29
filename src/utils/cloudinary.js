const cloudinary = require("cloudinary").v2;
const config = require("../config/env_config");

cloudinary.config({
	cloud_name: config.cloudinary.cloudName,
	api_key: config.cloudinary.apiKey,
	api_secret: config.cloudinary.apiSecret,
});

const uploadImage = (filePath, folder = "") => {
	return cloudinary.uploader.upload(filePath, {
		folder,
		resource_type: "image",
	});
};

const deleteImage = (publicId) => {
	return cloudinary.uploader.destroy(publicId);
};

module.exports = {
	uploadImage,
	deleteImage,
};
