const { supabaseAdmin } = require('../services/supabaseService');

async function getFeedbackBySession(sessionId) {
    const { data, error } = await supabaseAdmin
        .from('interview_feedback')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle();

    if (error) {
        throw new Error(`Unable to load interview feedback: ${error.message}`);
    }

    return data || null;
}

async function upsertFeedback(payload) {
    const { data, error } = await supabaseAdmin
        .from('interview_feedback')
        .upsert(
            {
                ...payload,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'session_id' }
        )
        .select('*')
        .single();

    if (error) {
        throw new Error(`Unable to save interview feedback: ${error.message}`);
    }

    return data;
}

async function listFeedbackForUser(userId, options = {}) {
    let query = supabaseAdmin
        .from('interview_feedback')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (options.createdAfter) {
        query = query.gte('created_at', options.createdAfter);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Unable to list interview feedback: ${error.message}`);
    }

    return data || [];
}

module.exports = {
    getFeedbackBySession,
    upsertFeedback,
    listFeedbackForUser,
};
