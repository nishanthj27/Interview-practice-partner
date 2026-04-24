const { getJobById } = require('../constants/jobs');
const { createInterviewSession, getInterviewSessionForUser, updateInterviewSession } = require('../models/interviewModel');
const { appendInterviewMessage, listInterviewMessages } = require('../models/messageModel');
const { getFeedbackBySession, upsertFeedback } = require('../models/feedbackModel');
const { upsertProfileFromInterview } = require('../models/profileModel');
const { geminiService } = require('./geminiService');
const { buildConversationForModel, buildSessionSummary, buildSystemPrompt, exportForFeedback } = require('./promptService');
const { BadRequestError, ConflictError, NotFoundError } = require('../utils/errors');

function getAverageScore(scores) {
    return Math.round(
        (scores.communication + scores.technical + scores.problemSolving + scores.professionalism) / 4
    );
}

function normalizeFeedbackRecord(record) {
    if (!record) {
        return null;
    }

    return {
        overall: record.overall,
        strengths: Array.isArray(record.strengths) ? record.strengths : [],
        improvements: Array.isArray(record.improvements) ? record.improvements : [],
        technical: record.technical,
        communication: record.communication,
        recommendations: Array.isArray(record.recommendations) ? record.recommendations : [],
        scores: record.scores || {
            communication: 5,
            technical: 5,
            problemSolving: 5,
            professionalism: 5,
        },
        evidence: Array.isArray(record.evidence) ? record.evidence : [],
        confidence: typeof record.confidence === 'number' ? record.confidence : 0.5,
    };
}

async function syncSessionSummary(session) {
    const messages = await listInterviewMessages(session.id);
    const summary = buildSessionSummary(session, messages);
    return updateInterviewSession(session.id, summary);
}

async function createSession(user, payload, requestMeta) {
    const job = getJobById(payload.jobId);

    if (!job) {
        throw new NotFoundError('Selected job role was not found.');
    }

    await upsertProfileFromInterview(user, payload.userInfo);

    const session = await createInterviewSession({
        user_id: user.id,
        job_id: job.id,
        job_title: job.title,
        mode: payload.mode,
        status: 'active',
        candidate_full_name: payload.userInfo.fullName,
        candidate_organization: payload.userInfo.organization,
        candidate_degree: payload.userInfo.degree,
        candidate_current_role: payload.userInfo.currentRole,
        metadata: {
            userAgent: requestMeta.userAgent,
        },
    });

    return {
        session,
        job: {
            id: job.id,
            title: job.title,
            icon: job.icon,
            description: job.description,
        },
    };
}

async function requireOwnedSession(sessionId, userId) {
    try {
        return await getInterviewSessionForUser(sessionId, userId);
    } catch (error) {
        throw new NotFoundError('Interview session not found.');
    }
}

async function recordClientMessage(userId, sessionId, payload) {
    const session = await requireOwnedSession(sessionId, userId);

    if (!payload.content || !payload.content.trim()) {
        throw new BadRequestError('Message content is required.');
    }

    await appendInterviewMessage({
        session_id: session.id,
        user_id: userId,
        role: payload.role,
        content: payload.content.trim(),
        source: payload.source || 'client',
        model_name: null,
    });

    await syncSessionSummary(session);

    return { success: true };
}

async function generateResponse(userId, sessionId, payload) {
    const session = await requireOwnedSession(sessionId, userId);

    if (session.status !== 'active') {
        throw new ConflictError('This interview session has already been completed.');
    }

    if (!payload.isInitial) {
        if (!payload.userMessage || !payload.userMessage.trim()) {
            throw new BadRequestError('A user message is required to continue the interview.');
        }

        await appendInterviewMessage({
            session_id: session.id,
            user_id: userId,
            role: 'user',
            content: payload.userMessage.trim(),
            source: payload.source || 'client',
            model_name: null,
        });
    }

    const messages = await listInterviewMessages(session.id);
    const job = getJobById(session.job_id);

    if (!job) {
        throw new NotFoundError('The selected job role could not be loaded.');
    }

    const systemPrompt = buildSystemPrompt(job, session, messages);
    const conversationHistory = buildConversationForModel(messages);
    const response = await geminiService.generateContent(systemPrompt, conversationHistory);

    await appendInterviewMessage({
        session_id: session.id,
        user_id: userId,
        role: 'assistant',
        content: response.text,
        source: 'gemini',
        model_name: response.model,
    });

    await syncSessionSummary(session);

    return {
        message: response.text,
        model: response.model,
    };
}

async function completeSession(userId, sessionId, reason = 'completed') {
    const session = await requireOwnedSession(sessionId, userId);
    const currentSession = await syncSessionSummary(session);
    const finalStatus = reason === 'abandoned' ? 'abandoned' : 'completed';

    return updateInterviewSession(session.id, {
        ...buildSessionSummary(currentSession, await listInterviewMessages(session.id)),
        status: finalStatus,
        ended_at: currentSession.ended_at || new Date().toISOString(),
        metadata: {
            ...(currentSession.metadata || {}),
            completedReason: reason,
        },
    });
}

async function generateFeedback(userId, sessionId) {
    const session = await requireOwnedSession(sessionId, userId);
    const existingFeedback = normalizeFeedbackRecord(await getFeedbackBySession(session.id));

    if (existingFeedback) {
        return existingFeedback;
    }

    const messages = await listInterviewMessages(session.id);
    const job = getJobById(session.job_id);

    if (!job) {
        throw new NotFoundError('The selected job role could not be loaded.');
    }

    const feedback = await geminiService.generateFeedback(job, exportForFeedback(session, messages));
    const overallScore = getAverageScore(feedback.scores);

    await upsertFeedback({
        session_id: session.id,
        user_id: userId,
        overall: feedback.overall,
        strengths: feedback.strengths,
        improvements: feedback.improvements,
        technical: feedback.technical,
        communication: feedback.communication,
        recommendations: feedback.recommendations,
        scores: feedback.scores,
        evidence: feedback.evidence,
        confidence: feedback.confidence,
    });

    await updateInterviewSession(session.id, {
        ...buildSessionSummary(session, messages),
        status: 'completed',
        ended_at: session.ended_at || new Date().toISOString(),
        overall_score: overallScore,
        feedback_summary: feedback.overall,
        feedback_generated_at: new Date().toISOString(),
    });

    return feedback;
}

module.exports = {
    createSession,
    recordClientMessage,
    generateResponse,
    completeSession,
    generateFeedback,
};
