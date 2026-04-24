const { ZodError } = require('zod');
const { AppError } = require('../utils/errors');
const { logger } = require('../utils/logger');

function notFoundHandler(req, res, next) {
    res.status(404).json({
        error: 'Route not found.',
    });
}

function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        next(error);
        return;
    }

    if (error instanceof ZodError) {
        res.status(400).json({
            error: 'Invalid request payload.',
            details: error.flatten(),
        });
        return;
    }

    if (error instanceof AppError) {
        res.status(error.statusCode).json({
            error: error.message,
            details: error.details || undefined,
        });
        return;
    }

    logger.error({ error }, 'Unhandled server error');

    res.status(500).json({
        error: 'Something went wrong on the server.',
    });
}

module.exports = {
    notFoundHandler,
    errorHandler,
};
