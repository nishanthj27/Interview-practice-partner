const { loadAnalyticsDataset } = require('../models/analyticsModel');

function getRangeStart(days) {
    const date = new Date();
    date.setDate(date.getDate() - days + 1);
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
}

function getAverage(values) {
    if (!values.length) {
        return 0;
    }

    return Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(1));
}

async function getOverview(userId) {
    const { sessions, feedback } = await loadAnalyticsDataset(userId);
    const completedSessions = sessions.filter((session) => session.status === 'completed');
    const totalPracticeMinutes = Math.round(
        sessions.reduce((total, session) => total + (session.duration_seconds || 0), 0) / 60
    );

    return {
        totals: {
            interviews: sessions.length,
            completedInterviews: completedSessions.length,
            chatSessions: sessions.filter((session) => session.mode === 'chat').length,
            voiceSessions: sessions.filter((session) => session.mode === 'voice').length,
            practiceMinutes: totalPracticeMinutes,
        },
        scores: {
            averageOverall: getAverage(
                completedSessions
                    .map((session) => session.overall_score)
                    .filter((score) => Number.isFinite(score))
            ),
            averageCommunication: getAverage(
                feedback
                    .map((item) => Number(item.scores?.communication))
                    .filter((score) => Number.isFinite(score))
            ),
            averageTechnical: getAverage(
                feedback
                    .map((item) => Number(item.scores?.technical))
                    .filter((score) => Number.isFinite(score))
            ),
        },
    };
}

async function getTimeline(userId, days = 14) {
    const { sessions, feedback } = await loadAnalyticsDataset(userId, {
        startedAfter: getRangeStart(days),
    });

    const feedbackBySessionId = new Map(feedback.map((item) => [item.session_id, item]));
    const buckets = new Map();

    sessions.forEach((session) => {
        const dayKey = new Date(session.started_at).toISOString().slice(0, 10);
        const bucket = buckets.get(dayKey) || {
            date: dayKey,
            sessions: 0,
            averageScore: 0,
            _scores: [],
        };

        bucket.sessions += 1;

        const feedbackRecord = feedbackBySessionId.get(session.id);
        const overallScore = session.overall_score || feedbackRecord?.scores?.overall;

        if (Number.isFinite(overallScore)) {
            bucket._scores.push(overallScore);
        }

        buckets.set(dayKey, bucket);
    });

    return Array.from(buckets.values())
        .sort((left, right) => left.date.localeCompare(right.date))
        .map((bucket) => ({
            date: bucket.date,
            sessions: bucket.sessions,
            averageScore: getAverage(bucket._scores),
        }));
}

async function getJobBreakdown(userId, days = 30) {
    const { sessions } = await loadAnalyticsDataset(userId, {
        startedAfter: getRangeStart(days),
    });

    const breakdown = new Map();

    sessions.forEach((session) => {
        const key = session.job_id;
        const entry = breakdown.get(key) || {
            jobId: session.job_id,
            jobTitle: session.job_title,
            sessions: 0,
            averageScore: 0,
            _scores: [],
        };

        entry.sessions += 1;

        if (Number.isFinite(session.overall_score)) {
            entry._scores.push(session.overall_score);
        }

        breakdown.set(key, entry);
    });

    return Array.from(breakdown.values())
        .map((entry) => ({
            jobId: entry.jobId,
            jobTitle: entry.jobTitle,
            sessions: entry.sessions,
            averageScore: getAverage(entry._scores),
        }))
        .sort((left, right) => right.sessions - left.sessions);
}

async function getRecentSessions(userId, limit = 10) {
    const { sessions, feedback } = await loadAnalyticsDataset(userId, { limit });
    const feedbackBySessionId = new Map(feedback.map((item) => [item.session_id, item]));

    return sessions.slice(0, limit).map((session) => ({
        id: session.id,
        jobTitle: session.job_title,
        mode: session.mode,
        status: session.status,
        startedAt: session.started_at,
        durationSeconds: session.duration_seconds || 0,
        overallScore: session.overall_score || null,
        feedbackSummary:
            session.feedback_summary || feedbackBySessionId.get(session.id)?.overall || null,
    }));
}

module.exports = {
    getOverview,
    getTimeline,
    getJobBreakdown,
    getRecentSessions,
};
