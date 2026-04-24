const DEFAULT_SETTINGS = {
    INTERVIEW_DURATION: 600,
    TIMER_WARNING_THRESHOLD: 180,
    TIMER_DANGER_THRESHOLD: 60,
    SILENCE_THRESHOLD: 5000,
    VOICE_RATE: 1,
    VOICE_PITCH: 1,
    VOICE_VOLUME: 1,
    VAD_THRESHOLD: 0.01,
    VAD_MIN_SPEECH_DURATION: 500,
    VAD_SILENCE_DURATION: 1500,
};

function resolveApiBaseUrl() {
    if (window.location.port === '5173') {
        return 'http://localhost:4000';
    }

    return '';
}

const CONFIG = {
    API_BASE_URL: resolveApiBaseUrl(),
    ...DEFAULT_SETTINGS,
    JOBS: [],
    SUPABASE: {
        url: '',
        anonKey: '',
    },
};

let bootstrapPromise = null;

async function loadAppBootstrap(forceRefresh = false) {
    if (bootstrapPromise && !forceRefresh) {
        return bootstrapPromise;
    }

    bootstrapPromise = (async () => {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/public/bootstrap`);

        if (!response.ok) {
            throw new Error('Unable to load application configuration from the server.');
        }

        const payload = await response.json();

        CONFIG.JOBS = payload.jobs || [];
        CONFIG.SUPABASE.url = payload.supabase?.url || '';
        CONFIG.SUPABASE.anonKey = payload.supabase?.anonKey || '';
        CONFIG.INTERVIEW_DURATION =
            payload.settings?.interviewDuration || DEFAULT_SETTINGS.INTERVIEW_DURATION;
        CONFIG.TIMER_WARNING_THRESHOLD =
            payload.settings?.timerWarningThreshold || DEFAULT_SETTINGS.TIMER_WARNING_THRESHOLD;
        CONFIG.TIMER_DANGER_THRESHOLD =
            payload.settings?.timerDangerThreshold || DEFAULT_SETTINGS.TIMER_DANGER_THRESHOLD;
        CONFIG.SILENCE_THRESHOLD =
            payload.settings?.silenceThreshold || DEFAULT_SETTINGS.SILENCE_THRESHOLD;
        CONFIG.VOICE_RATE = payload.settings?.voiceRate || DEFAULT_SETTINGS.VOICE_RATE;
        CONFIG.VOICE_PITCH = payload.settings?.voicePitch || DEFAULT_SETTINGS.VOICE_PITCH;
        CONFIG.VOICE_VOLUME = payload.settings?.voiceVolume || DEFAULT_SETTINGS.VOICE_VOLUME;
        CONFIG.VAD_THRESHOLD =
            payload.settings?.vadThreshold || DEFAULT_SETTINGS.VAD_THRESHOLD;
        CONFIG.VAD_MIN_SPEECH_DURATION =
            payload.settings?.vadMinSpeechDuration ||
            DEFAULT_SETTINGS.VAD_MIN_SPEECH_DURATION;
        CONFIG.VAD_SILENCE_DURATION =
            payload.settings?.vadSilenceDuration || DEFAULT_SETTINGS.VAD_SILENCE_DURATION;

        return CONFIG;
    })();

    return bootstrapPromise;
}

function getJobById(jobId) {
    return CONFIG.JOBS.find((job) => job.id === jobId);
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export { CONFIG, loadAppBootstrap, getJobById, formatTime };
