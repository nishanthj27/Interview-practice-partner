const { asyncHandler } = require('../utils/asyncHandler');
const { UnauthorizedError } = require('../utils/errors');
const { getUserFromAccessToken } = require('../services/supabaseService');

const requireAuth = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError();
    }

    const accessToken = authHeader.slice('Bearer '.length).trim();

    if (!accessToken) {
        throw new UnauthorizedError();
    }

    req.user = await getUserFromAccessToken(accessToken);
    next();
});

module.exports = {
    requireAuth,
};
