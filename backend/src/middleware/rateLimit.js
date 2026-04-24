const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { env } = require('../config/env');

function keyGenerator(req) {
    return req.user?.id || ipKeyGenerator(req.ip);
}

const globalLimiter = rateLimit({
    windowMs: env.globalRateLimitWindowMs,
    max: env.globalRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    message: {
        error: 'Too many requests. Please wait a moment and try again.',
    },
});

const aiLimiter = rateLimit({
    windowMs: env.aiRateLimitWindowMs,
    max: env.aiRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    message: {
        error: 'You have reached the interview request limit for now. Please try again shortly.',
    },
});

module.exports = {
    globalLimiter,
    aiLimiter,
};
