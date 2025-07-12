const nodemailer = require("nodemailer");
const config = require("../config/env_config");

const transporter = nodemailer.createTransport({
	host: config.smtp.host,
	port: config.smtp.port,
	auth: {
		user: config.smtp.user,
		pass: config.smtp.pass,
	},
});

async function sendMail({ to, subject, html }) {
	const mailOptions = {
		from: config.smtp.from,
		to,
		subject,
		html,
	};
	return transporter.sendMail(mailOptions);
}

module.exports = { sendMail };
