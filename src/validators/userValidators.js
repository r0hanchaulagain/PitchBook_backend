const { body } = require('express-validator');

exports.registerValidator = [
  body('username').notEmpty().isLength({ min: 3 }),
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['admin', 'user', 'futsalOwner']),
  body('phone').notEmpty(),
  body('fullName').notEmpty(),
];

exports.loginValidator = [body('email').isEmail(), body('password').exists()];

exports.forgotPasswordValidator = [body('email').isEmail()];

exports.resetPasswordValidator = [
  body('token').notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
];

exports.deleteUserValidator = [
  body('id').notEmpty().isString().withMessage('User ID is required'),
];
