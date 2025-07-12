const redis = require("redis");
const { promisify } = require("util");
const config = require("../config");

const redisClient = redis.createClient({
	host: config.redis.host,
	port: config.redis.port,
});

redisClient.on("error", (err) => {
	console.error("Redis error:", err);
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
