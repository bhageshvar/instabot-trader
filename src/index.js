const express = require('express');
const bodyParser = require('body-parser');
const config = require('config');
const logger = require('./common/logger').logger;
const ExchangeManager = require('./exchanges/manager');
const allExchanges = require('./exchanges/all');
const notifier = require('./notifications/notifier');
const allNotifiers = require('./notifications/all');
const validateSignature = require('./common/validate_signature');

// Set up the logger
logger.setLevel(config.get('server.logLevel'));

const startTime = new Date();

logger.bright('\n');
logger.bright('=================================================\n');
logger.bright('  Instabot Trader bot starting  🤖  🚀  🌔  🏎️ \n');
logger.bright('  Tip BTC: 39vBjyAu65vYEd7thnW75V7eULTcz7wgxV\n');
logger.bright('=================================================\n');
logger.results(`\nStarted at ${startTime}\n`);

// Set up the notifiers
allNotifiers.forEach(item => notifier.addChannel(item.name, item.driver));
if (config.get('notifications.alertOnStartup')) {
    notifier.send(`Instabot Trader starting up at ${startTime}.`);
}

// Prepare Express
const app = express();
const url = config.get('server.url');
const healthCheckUrl = config.get('server.healthCheck');
const port = parseInt(config.get('server.port'), 10);
const signingMethod = config.get('server.security.signingMethod').toLowerCase();
const secret = config.get('server.security.secret');

// middleware to decode the query params in the request
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
});

// Create the exchange manager
const manager = new ExchangeManager(allExchanges);
notifier.setExchangeManager(manager);


/**
 * Bot handler
 */
app.post(url, (req, res) => {
    logger.notice('HTTP POST request received...');

    // Get the commands from the SMS
    const message = req.body.subject || req.body.Body || req.body.message || '';
    if (message === '') {
        logger.error('Request did not include a message.\nPOST messages in a variable called subject, Body or message.');
        logger.error(req.body);
        return res.sendStatus(400);
    }

    if (!validateSignature(message, signingMethod, secret)) {
        logger.error('Message has an invalid signature - discarding.');
        logger.error(req.body);
        return res.sendStatus(400);
    }

    // Try and process them
    manager.executeMessage(message, config.get('credentials'));

    // Respond to the request
    return res.send(message);
});


/**
 * Health check endpoint (for load balancers)
 */
app.get(healthCheckUrl, (req, res) => res.send(''));


/**
 * Start the server listening for incoming HTTP requests
 */
app.listen(port, (err) => {
    if (err) {
        logger.error(`Failed to start server on port ${port}`);
        logger.error(err);
    } else {
        logger.results('\nServer is listening for commands at');
        logger.results(`http://localhost:${port}${url}\n`);
    }
}).on('error', (err) => {
    logger.error('Error starting server');
    logger.error(err);
    if (err.errno === 'EADDRINUSE') {
        logger.error(`The port ${port} is already in use.`);
    }
});
