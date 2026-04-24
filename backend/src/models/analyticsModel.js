const { listInterviewSessionsForUser } = require('./interviewModel');
const { listFeedbackForUser } = require('./feedbackModel');

async function loadAnalyticsDataset(userId, options = {}) {
    const [sessions, feedback] = await Promise.all([
        listInterviewSessionsForUser(userId, {
            startedAfter: options.startedAfter,
            limit: options.limit,
        }),
        listFeedbackForUser(userId, {
            createdAfter: options.startedAfter,
        }),
    ]);

    return {
        sessions,
        feedback,
    };
}

module.exports = {
    loadAnalyticsDataset,
};
