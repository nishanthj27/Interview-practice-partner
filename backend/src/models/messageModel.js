const { supabaseAdmin } = require('../services/supabaseService');

async function listInterviewMessages(sessionId) {
    const { data, error } = await supabaseAdmin
        .from('interview_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('message_order', { ascending: true });

    if (error) {
        throw new Error(`Unable to load interview messages: ${error.message}`);
    }

    return data || [];
}

async function getNextMessageOrder(sessionId) {
    const { data, error } = await supabaseAdmin
        .from('interview_messages')
        .select('message_order')
        .eq('session_id', sessionId)
        .order('message_order', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error(`Unable to determine next message order: ${error.message}`);
    }

    return (data?.message_order || 0) + 1;
}

async function appendInterviewMessage(payload) {
    const messageOrder = await getNextMessageOrder(payload.session_id);
    const insertPayload = {
        ...payload,
        message_order: messageOrder,
    };

    const { data, error } = await supabaseAdmin
        .from('interview_messages')
        .insert(insertPayload)
        .select('*')
        .single();

    if (error) {
        throw new Error(`Unable to append interview message: ${error.message}`);
    }

    return data;
}

module.exports = {
    listInterviewMessages,
    appendInterviewMessage,
};
