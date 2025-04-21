const redis = require('redis');
const { promisify } = require('util');
require('dotenv').config({ path: process.env.REDIS_ENV_PATH || '.env.redis' });

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
});

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

const getAsync = promisify(redisClient.get).bind(redisClient);
const setAsync = promisify(redisClient.set).bind(redisClient);
const delAsync = promisify(redisClient.del).bind(redisClient);

module.exports = {
  redisClient,
  getAsync,
  setAsync,
  delAsync,
};
