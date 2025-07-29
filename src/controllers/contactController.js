const Contact = require("../models/Contact");

exports.createContact = async (req, res, next) => {
	try {
		const { name, email, subject, message } = req.body;

		const contact = await Contact.create({
			name,
			email,
			subject,
			message,
		});

		res.status(201).json({
			success: true,
			data: contact,
		});
	} catch (error) {
		next(error);
	}
};

exports.getContacts = async (req, res, next) => {
	try {
		const contacts = await Contact.find().sort({ createdAt: -1 });

		res.status(200).json({
			success: true,
			count: contacts.length,
			data: contacts,
		});
	} catch (error) {
		next(error);
	}
};

exports.updateContactStatus = async (req, res, next) => {
	try {
		const { status } = req.body;

		const contact = await Contact.findByIdAndUpdate(
			req.params.id,
			{ status },
			{ new: true, runValidators: true }
		);

		if (!contact) {
			return res.status(404).json({
				success: false,
				error: "Contact message not found",
			});
		}

		res.status(200).json({
			success: true,
			data: contact,
		});
	} catch (error) {
		next(error);
	}
};

exports.deleteContact = async (req, res, next) => {
	try {
		const contact = await Contact.findByIdAndDelete(req.params.id);

		if (!contact) {
			return res.status(404).json({
				success: false,
				error: "Contact message not found",
			});
		}

		res.status(200).json({
			success: true,
			data: {},
		});
	} catch (error) {
		next(error);
	}
};
