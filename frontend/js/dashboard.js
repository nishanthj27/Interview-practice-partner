import { authClient } from './auth.js';
import { loadAppBootstrap } from './config.js';
import { apiFetch } from './http.js';

function renderOverview(overview) {
    document.getElementById('totalInterviews').textContent = overview.totals.interviews;
    document.getElementById('completedInterviews').textContent =
        overview.totals.completedInterviews;
    document.getElementById('practiceMinutes').textContent = overview.totals.practiceMinutes;
    document.getElementById('averageScore').textContent = overview.scores.averageOverall || '-';
}

function renderTimeline(timeline) {
    const container = document.getElementById('timelineRows');

    if (!timeline.length) {
        container.innerHTML = '<div class="empty-state small">No interview activity yet.</div>';
        return;
    }

    container.innerHTML = timeline
        .map(
            (point) => `
                <div class="timeline-row">
                    <span>${point.date}</span>
                    <span>${point.sessions} session${point.sessions === 1 ? '' : 's'}</span>
                    <span>${point.averageScore || '-'} / 10</span>
                </div>
            `
        )
        .join('');
}

function renderJobs(jobBreakdown) {
    const container = document.getElementById('jobRows');

    if (!jobBreakdown.length) {
        container.innerHTML = '<div class="empty-state small">No job analytics available yet.</div>';
        return;
    }

    container.innerHTML = jobBreakdown
        .map(
            (job) => `
                <div class="timeline-row">
                    <span>${job.jobTitle}</span>
                    <span>${job.sessions} session${job.sessions === 1 ? '' : 's'}</span>
                    <span>${job.averageScore || '-'} / 10</span>
                </div>
            `
        )
        .join('');
}

function renderRecentSessions(sessions) {
    const container = document.getElementById('recentSessions');

    if (!sessions.length) {
        container.innerHTML = '<div class="empty-state small">No saved sessions yet.</div>';
        return;
    }

    container.innerHTML = sessions
        .map(
            (session) => `
                <div class="session-card">
                    <div class="session-card-top">
                        <strong>${session.jobTitle}</strong>
                        <span class="session-badge">${session.mode}</span>
                    </div>
                    <div class="session-card-meta">
                        <span>${new Date(session.startedAt).toLocaleString()}</span>
                        <span>${Math.round(session.durationSeconds / 60)} min</span>
                        <span>${session.overallScore ? `${session.overallScore}/10` : 'Pending score'}</span>
                    </div>
                    <p>${session.feedbackSummary || 'Feedback will appear after the session is scored.'}</p>
                </div>
            `
        )
        .join('');
}

async function bootstrapDashboard() {
    await loadAppBootstrap();
    const user = await authClient.requireAuth();

    if (!user) {
        return;
    }

    authClient.hydrateAuthUI(user);

    const [overview, timeline, jobs, recentSessions] = await Promise.all([
        apiFetch('/api/analytics/overview'),
        apiFetch('/api/analytics/timeline?days=14'),
        apiFetch('/api/analytics/jobs?days=30'),
        apiFetch('/api/analytics/recent-sessions?limit=8'),
    ]);

    renderOverview(overview);
    renderTimeline(timeline);
    renderJobs(jobs);
    renderRecentSessions(recentSessions);
}

document.addEventListener('DOMContentLoaded', () => {
    bootstrapDashboard().catch((error) => {
        document.getElementById('dashboardError').textContent =
            error.message || 'Unable to load dashboard data.';
    });
});
