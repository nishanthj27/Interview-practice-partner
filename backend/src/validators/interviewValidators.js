const { z } = require('zod');

const userInfoSchema = z.object({
    fullName: z.string().trim().min(2),
    organization: z.string().trim().min(2),
    degree: z.string().trim().min(2),
    currentRole: z.string().trim().min(2),
});

const createSessionSchema = z.object({
    jobId: z.string().trim().min(1),
    mode: z.enum(['chat', 'voice']),
    userInfo: userInfoSchema,
});

const respondSchema = z.object({
    isInitial: z.boolean().optional().default(false),
    userMessage: z.string().trim().max(4000).optional(),
});

const recordMessageSchema = z.object({
    role: z.enum(['user', 'assistant']),
    source: z.string().trim().max(50).optional(),
    content: z.string().trim().min(1).max(4000),
});

const completeSessionSchema = z.object({
    reason: z.string().trim().max(100).optional(),
});

const analyticsQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(90).optional().default(14),
    limit: z.coerce.number().int().min(1).max(25).optional().default(10),
});

module.exports = {
    createSessionSchema,
    respondSchema,
    recordMessageSchema,
    completeSessionSchema,
    analyticsQuerySchema,
};
