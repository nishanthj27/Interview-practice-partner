const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function getRequiredEnv(name) {
    const value = process.env[name];

    if (!value || !value.trim()) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value.trim();
}

function getNumberEnv(name, fallback) {
    const rawValue = process.env[name];

    if (!rawValue) {
        return fallback;
    }

    const parsedValue = Number(rawValue);

    if (!Number.isFinite(parsedValue)) {
        throw new Error(`Environment variable ${name} must be a valid number.`);
    }

    return parsedValue;
}

const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: getNumberEnv('PORT', 4000),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    geminiApiKey: getRequiredEnv('GEMINI_API_KEY'),
    geminiPrimaryModel: process.env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-flash',
    geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.0-flash',
    supabaseUrl: getRequiredEnv('SUPABASE_URL'),
    supabaseAnonKey: getRequiredEnv('SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    globalRateLimitWindowMs: getNumberEnv('GLOBAL_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    globalRateLimitMax: getNumberEnv('GLOBAL_RATE_LIMIT_MAX', 120),
    aiRateLimitWindowMs: getNumberEnv('AI_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    aiRateLimitMax: getNumberEnv('AI_RATE_LIMIT_MAX', 30),
};

env.isProduction = env.nodeEnv === 'production';

module.exports = {
    env,
};
