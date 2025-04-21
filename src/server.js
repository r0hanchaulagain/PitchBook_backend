const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');

const port = config.port;

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});
