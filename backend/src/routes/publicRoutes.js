const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { env } = require('../config/env');
const { JOB_CONFIG, getPublicJobs } = require('../constants/jobs');

const router = express.Router();

router.get(
    '/health',
    asyncHandler(async (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
        });
    })
);

router.get(
    '/bootstrap',
    asyncHandler(async (req, res) => {
        res.json({
            supabase: {
                url: env.supabaseUrl,
                anonKey: env.supabaseAnonKey,
            },
            settings: {
                interviewDuration: JOB_CONFIG.INTERVIEW_DURATION,
                timerWarningThreshold: JOB_CONFIG.TIMER_WARNING_THRESHOLD,
                timerDangerThreshold: JOB_CONFIG.TIMER_DANGER_THRESHOLD,
                silenceThreshold: JOB_CONFIG.SILENCE_THRESHOLD,
                voiceRate: JOB_CONFIG.VOICE_RATE,
                voicePitch: JOB_CONFIG.VOICE_PITCH,
                voiceVolume: JOB_CONFIG.VOICE_VOLUME,
                vadThreshold: JOB_CONFIG.VAD_THRESHOLD,
                vadMinSpeechDuration: JOB_CONFIG.VAD_MIN_SPEECH_DURATION,
                vadSilenceDuration: JOB_CONFIG.VAD_SILENCE_DURATION,
            },
            jobs: getPublicJobs(),
        });
    })
);

module.exports = {
    publicRoutes: router,
};
