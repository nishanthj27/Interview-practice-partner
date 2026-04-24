import { apiFetch } from './http.js';

class GeminiService {
    constructor() {
        this.currentSession = this.readStoredSession();
    }

    readStoredSession() {
        try {
            const storedSession = sessionStorage.getItem('activeInterviewSession');
            return storedSession ? JSON.parse(storedSession) : null;
        } catch (error) {
            return null;
        }
    }

    persistSession(session) {
        this.currentSession = session;
        sessionStorage.setItem('activeInterviewSession', JSON.stringify(session));
    }

    resetSession() {
        this.currentSession = null;
        sessionStorage.removeItem('activeInterviewSession');
    }

    async initializeSession(job, mode) {
        const existingSession = this.readStoredSession();

        if (
            existingSession &&
            existingSession.jobId === job.id &&
            existingSession.mode === mode
        ) {
            this.currentSession = existingSession;
            return existingSession;
        }

        const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || 'null');

        if (!userInfo) {
            throw new Error('Missing interview information. Please restart from the home page.');
        }

        const response = await apiFetch('/api/interviews', {
            method: 'POST',
            body: JSON.stringify({
                jobId: job.id,
                mode,
                userInfo,
            }),
        });

        const session = {
            id: response.session.id,
            jobId: job.id,
            mode,
        };

        this.persistSession(session);
        return session;
    }

    async generateContent({ job, mode, userMessage = '', isInitial = false }) {
        const session = await this.initializeSession(job, mode);

        const response = await apiFetch(`/api/interviews/${session.id}/respond`, {
            method: 'POST',
            body: JSON.stringify({
                isInitial,
                userMessage,
            }),
        });

        return response.message;
    }

    async recordMessage({ role, content, source = 'client' }) {
        const session = this.readStoredSession();

        if (!session || !content || !content.trim()) {
            return null;
        }

        return apiFetch(`/api/interviews/${session.id}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                role,
                content,
                source,
            }),
        });
    }

    async completeSession(reason = 'completed') {
        const session = this.readStoredSession();

        if (!session) {
            return null;
        }

        return apiFetch(`/api/interviews/${session.id}/complete`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
        });
    }

    async generateFeedback() {
        const session = this.readStoredSession();

        if (!session) {
            throw new Error('Interview session not found.');
        }

        return apiFetch(`/api/interviews/${session.id}/feedback`, {
            method: 'POST',
        });
    }
}

const geminiService = new GeminiService();

export { geminiService };
