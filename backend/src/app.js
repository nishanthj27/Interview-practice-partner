const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');

const { env } = require('./config/env');
const { logger } = require('./utils/logger');
const { globalLimiter } = require('./middleware/rateLimit');
const { requireAuth } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const { publicRoutes } = require('./routes/publicRoutes');
const { interviewRoutes } = require('./routes/interviewRoutes');
const { analyticsRoutes } = require('./routes/analyticsRoutes');

const app = express();

app.disable('x-powered-by');

app.use(
    pinoHttp({
        logger,
        genReqId(req) {
            return req.headers['x-request-id'] || crypto.randomUUID();
        },
    })
);

app.use(
    cors({
        origin(origin, callback) {
            if (
                !origin ||
                origin === env.frontendUrl ||
                (!env.isProduction && /^http:\/\/localhost:\d+$/.test(origin))
            ) {
                callback(null, true);
                return;
            }

            callback(new Error('Request origin is not allowed by CORS.'));
        },
        credentials: true,
    })
);

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use('/api', globalLimiter);

app.use('/api/public', publicRoutes);
app.use('/api/interviews', requireAuth, interviewRoutes);
app.use('/api/analytics', requireAuth, analyticsRoutes);

if (env.isProduction) {
    const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');

    app.use(express.static(frontendDistPath));

    app.all('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
            return next();
        }

        return res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = {
    app,
};