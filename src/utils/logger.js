const { createLogger, format, transports } = require('winston');
const path = require('path');
const config = require('../config');

const logger = createLogger({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json(),
  ),
  transports: [
    new transports.File({ filename: path.join('src', 'logs', 'error.log'), level: 'error' }),
    new transports.File({ filename: path.join('src', 'logs', 'combined.log') }),
  ],
});

if (config.nodeEnv !== 'production') {
  logger.add(
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    }),
  );
}

module.exports = logger;
