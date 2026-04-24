const { supabaseAdmin } = require('../services/supabaseService');

async function createInterviewSession(payload) {
    const { data, error } = await supabaseAdmin
        .from('interview_sessions')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        throw new Error(`Unable to create interview session: ${error.message}`);
    }

    return data;
}

async function getInterviewSessionForUser(sessionId, userId) {
    const { data, error } = await supabaseAdmin
        .from('interview_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

    if (error) {
        throw new Error(`Unable to load interview session: ${error.message}`);
    }

    return data;
}

async function updateInterviewSession(sessionId, updates) {
    const { data, error } = await supabaseAdmin
        .from('interview_sessions')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select('*')
        .single();

    if (error) {
        throw new Error(`Unable to update interview session: ${error.message}`);
    }

    return data;
}

async function listInterviewSessionsForUser(userId, options = {}) {
    let query = supabaseAdmin
        .from('interview_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false });

    if (options.startedAfter) {
        query = query.gte('started_at', options.startedAfter);
    }

    if (options.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Unable to list interview sessions: ${error.message}`);
    }

    return data || [];
}

module.exports = {
    createInterviewSession,
    getInterviewSessionForUser,
    updateInterviewSession,
    listInterviewSessionsForUser,
};
