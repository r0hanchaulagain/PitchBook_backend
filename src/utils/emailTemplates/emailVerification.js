const emailVerificationTemplate = ({ fullName, verificationLink }) => {
	return `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="utf-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Email Verification - Futsal Booking System</title>
			<style>
				body {
					font-family: Arial, sans-serif;
					line-height: 1.6;
					color: #333;
					max-width: 600px;
					margin: 0 auto;
					padding: 20px;
				}
				.header {
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					color: white;
					padding: 30px;
					text-align: center;
					border-radius: 10px 10px 0 0;
				}
				.content {
					background: #f9f9f9;
					padding: 30px;
					border-radius: 0 0 10px 10px;
				}
				.button {
					display: inline-block;
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					color: white;
					padding: 15px 30px;
					text-decoration: none;
					border-radius: 5px;
					margin: 20px 0;
					font-weight: bold;
				}
				.footer {
					text-align: center;
					margin-top: 30px;
					color: #666;
					font-size: 14px;
				}
				.warning {
					background: #fff3cd;
					border: 1px solid #ffeaa7;
					padding: 15px;
					border-radius: 5px;
					margin: 20px 0;
				}
			</style>
		</head>
		<body>
			<div class="header">
				<h1>Welcome to Futsal Booking System!</h1>
				<p>Please verify your email address to complete your registration</p>
			</div>
			
			<div class="content">
				<h2>Hello ${fullName},</h2>
				
				<p>Thank you for registering with the Futsal Booking System. To complete your registration and start booking futsal courts, please verify your email address by clicking the button below:</p>
				
				<div style="text-align: center;">
					<a href="${verificationLink}" class="button">Verify Email Address</a>
				</div>
				
				<div class="warning">
					<strong>Important:</strong> This verification link will expire in 24 hours. If you don't verify your email within this time, you'll need to request a new verification link.
				</div>
				
				<p>If the button above doesn't work, you can copy and paste this link into your browser:</p>
				<p style="word-break: break-all; color: #667eea;">${verificationLink}</p>
				
				<p>If you didn't create an account with us, please ignore this email.</p>
				
				<p>Best regards,<br>The Futsal Booking System Team</p>
			</div>
			
			<div class="footer">
				<p>This is an automated email. Please do not reply to this message.</p>
				<p>&copy; 2024 Futsal Booking System. All rights reserved.</p>
			</div>
		</body>
		</html>
	`;
};

module.exports = emailVerificationTemplate; 