const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');
const { UnauthorizedError } = require('../utils/errors');

const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

async function getUserFromAccessToken(accessToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !data.user) {
        throw new UnauthorizedError('Your session is invalid or has expired. Please sign in again.');
    }

    return data.user;
}

module.exports = {
    supabaseAdmin,
    getUserFromAccessToken,
};
