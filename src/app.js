const express = require("express");
const https = require("node:https");
const fs = require("node:fs");

const { setupSocket } = require("./config/socket_connection");

const {
	setupMiddlewares,
	setupRoutes,
	setupErrorHandling,
} = require("./config/api_config");

const app = express();
const options = {
	key: fs.readFileSync("src/config/ssl/server.key"),
	cert: fs.readFileSync("src/config/ssl/server.crt"),
};

const server = https.createServer(options, app);

const { io, connectedUsers } = setupSocket(server);
app.set("io", io);
app.set("connectedUsers   ", connectedUsers);

setupMiddlewares(app);
setupRoutes(app);
setupErrorHandling(app);

module.exports = { app, server };
