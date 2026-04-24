const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { aiLimiter } = require('../middleware/rateLimit');
const {
    createSessionSchema,
    respondSchema,
    recordMessageSchema,
    completeSessionSchema,
} = require('../validators/interviewValidators');
const {
    createSession,
    recordClientMessage,
    generateResponse,
    completeSession,
    generateFeedback,
} = require('../services/interviewSessionService');

const router = express.Router();

router.post(
    '/',
    asyncHandler(async (req, res) => {
        const payload = createSessionSchema.parse(req.body);
        const result = await createSession(req.user, payload, {
            userAgent: req.headers['user-agent'] || null,
        });

        res.status(201).json(result);
    })
);

router.post(
    '/:sessionId/messages',
    asyncHandler(async (req, res) => {
        const payload = recordMessageSchema.parse(req.body);
        const result = await recordClientMessage(req.user.id, req.params.sessionId, payload);
        res.json(result);
    })
);

router.post(
    '/:sessionId/respond',
    aiLimiter,
    asyncHandler(async (req, res) => {
        const payload = respondSchema.parse(req.body);
        const result = await generateResponse(req.user.id, req.params.sessionId, payload);
        res.json(result);
    })
);

router.post(
    '/:sessionId/complete',
    asyncHandler(async (req, res) => {
        const payload = completeSessionSchema.parse(req.body || {});
        const session = await completeSession(req.user.id, req.params.sessionId, payload.reason);
        res.json({
            session,
        });
    })
);

router.post(
    '/:sessionId/feedback',
    aiLimiter,
    asyncHandler(async (req, res) => {
        const feedback = await generateFeedback(req.user.id, req.params.sessionId);
        res.json(feedback);
    })
);

module.exports = {
    interviewRoutes: router,
};
