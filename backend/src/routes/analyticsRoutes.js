const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { analyticsQuerySchema } = require('../validators/interviewValidators');
const {
    getOverview,
    getTimeline,
    getJobBreakdown,
    getRecentSessions,
} = require('../services/analyticsService');

const router = express.Router();

router.get(
    '/overview',
    asyncHandler(async (req, res) => {
        res.json(await getOverview(req.user.id));
    })
);

router.get(
    '/timeline',
    asyncHandler(async (req, res) => {
        const query = analyticsQuerySchema.parse(req.query);
        res.json(await getTimeline(req.user.id, query.days));
    })
);

router.get(
    '/jobs',
    asyncHandler(async (req, res) => {
        const query = analyticsQuerySchema.parse(req.query);
        res.json(await getJobBreakdown(req.user.id, query.days));
    })
);

router.get(
    '/recent-sessions',
    asyncHandler(async (req, res) => {
        const query = analyticsQuerySchema.parse(req.query);
        res.json(await getRecentSessions(req.user.id, query.limit));
    })
);

module.exports = {
    analyticsRoutes: router,
};
