const { supabaseAdmin } = require('../services/supabaseService');

async function upsertProfileFromInterview(user, userInfo) {
    const payload = {
        user_id: user.id,
        email: user.email,
        full_name: userInfo.fullName,
        organization: userInfo.organization,
        degree: userInfo.degree,
        current_role_name: userInfo.currentRole,
        updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select('*')
        .single();

    if (error) {
        throw new Error(`Unable to upsert profile: ${error.message}`);
    }

    return data;
}

module.exports = {
    upsertProfileFromInterview,
};
