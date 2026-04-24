const { env } = require('../config/env');
const { JOB_CONFIG } = require('../constants/jobs');
const { logger } = require('../utils/logger');

class GeminiService {
    constructor() {
        this.currentModel = env.geminiPrimaryModel;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
        this.requestCount = 0;
        this.failureCount = 0;
    }

    async generateContent(systemPrompt, conversationHistory) {
        try {
            const text = await this.makeRequest(this.currentModel, systemPrompt, conversationHistory);
            this.failureCount = 0;

            return {
                text,
                model: this.currentModel,
            };
        } catch (error) {
            logger.error({ err: error, model: this.currentModel }, `Gemini request failed on ${this.currentModel}`);
            this.failureCount += 1;

            if (this.currentModel === env.geminiPrimaryModel && this.failureCount >= 2) {
                this.currentModel = env.geminiFallbackModel;
                const fallbackText = await this.makeRequest(
                    this.currentModel,
                    systemPrompt,
                    conversationHistory
                );

                return {
                    text: fallbackText,
                    model: this.currentModel,
                };
            }

            throw error;
        }
    }

    async makeRequestWithFailover(systemPrompt, conversationHistory, options = {}) {
        const primaryModel = this.currentModel;
        const fallbackModel = env.geminiFallbackModel;
        const modelsToTry =
            fallbackModel && fallbackModel !== primaryModel
                ? [primaryModel, fallbackModel]
                : [primaryModel];

        let lastError = null;

        for (const model of modelsToTry) {
            try {
                const text = await this.makeRequest(model, systemPrompt, conversationHistory, options);

                // If fallback model succeeds, switch subsequent requests to it.
                this.currentModel = model;
                this.failureCount = 0;

                return {
                    text,
                    model,
                };
            } catch (error) {
                lastError = error;
                this.failureCount += 1;
                logger.error(
                    {
                        err: error,
                        model,
                        fallbackAttempt: model !== primaryModel,
                    },
                    'Gemini request attempt failed'
                );
            }
        }

        throw lastError;
    }

    async makeRequest(model, systemPrompt, conversationHistory, options = {}) {
        this.requestCount += 1;

        const contents = [
            {
                role: 'user',
                parts: [{ text: systemPrompt }],
            },
            ...conversationHistory,
        ];

        const response = await fetch(`${this.baseUrl}/${model}:generateContent?key=${env.geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: 0.4,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                    ...options.generationConfig,
                },
                safetySettings: [
                    {
                        category: 'HARM_CATEGORY_HARASSMENT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
                    },
                    {
                        category: 'HARM_CATEGORY_HATE_SPEECH',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
                    },
                    {
                        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
                    },
                    {
                        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
                    },
                ],
            }),
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            throw new Error(
                `Gemini API request failed: ${response.status} ${
                    errorPayload.error?.message || 'Unknown error'
                }`
            );
        }

        const payload = await response.json().catch(() => null);

        if (!payload) {
            throw new Error('Gemini returned an empty response body.');
        }

        return this.extractTextFromResponse(payload);
    }

    extractJsonObject(rawText) {
        if (typeof rawText !== 'string' || !rawText.trim()) {
            return null;
        }

        const trimmed = rawText.trim();

        // Handle fenced blocks like ```json ... ```
        const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fencedMatch?.[1]) {
            return fencedMatch[1].trim();
        }

        const firstBrace = trimmed.indexOf('{');
        const lastBrace = trimmed.lastIndexOf('}');

        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return trimmed.slice(firstBrace, lastBrace + 1);
        }

        return null;
    }

    extractTextFromResponse(data) {
        const candidate = data?.candidates?.[0];
        const parts = candidate?.content?.parts;

        if (Array.isArray(parts) && parts.length > 0) {
            return parts.map((part) => part.text).join('\n');
        }

        if (typeof candidate?.content === 'string') {
            return candidate.content;
        }

        if (typeof candidate?.text === 'string') {
            return candidate.text;
        }

        if (typeof candidate?.outputText === 'string') {
            return candidate.outputText;
        }

        if (typeof data?.text === 'string') {
            return data.text;
        }

        if (typeof data?.outputText === 'string') {
            return data.outputText;
        }

        const findFirstString = (value, depth = 0) => {
            if (depth > 6) {
                return null;
            }

            if (typeof value === 'string' && value.trim().length > 0) {
                return value;
            }

            if (Array.isArray(value)) {
                for (const item of value) {
                    const found = findFirstString(item, depth + 1);
                    if (found) {
                        return found;
                    }
                }
            }

            if (value && typeof value === 'object') {
                for (const key of Object.keys(value)) {
                    const found = findFirstString(value[key], depth + 1);
                    if (found) {
                        return found;
                    }
                }
            }

            return null;
        };

        const fallback = findFirstString(data);

        if (fallback) {
            return fallback;
        }

        return JSON.stringify(data);
    }

    async generateFeedback(jobRole, conversationData) {
        const feedbackConfig = JOB_CONFIG.FEEDBACK || {};
        const maxRetries = feedbackConfig.RETRIES || 2;
        const requireJson = feedbackConfig.REQUIRE_JSON !== false;
        const minImprovements = feedbackConfig.MIN_IMPROVEMENTS || 3;
        const confidenceThreshold = feedbackConfig.CONFIDENCE_THRESHOLD || 0.35;
        const userInfo = conversationData?.userInfo || null;
        const metrics = conversationData?.stats || {};
        const transcriptPreview = (conversationData?.messagesWindow || [])
            .map((message) => {
                const trimmedContent =
                    message.content.length > 600
                        ? `${message.content.slice(0, 600)}...`
                        : message.content;

                return `${message.index}. ${message.role.toUpperCase()}: ${trimmedContent}`;
            })
            .join('\n');

        const userInfoText = userInfo?.fullName
            ? `
Candidate Profile:
- Name: ${userInfo.fullName}
- Organization/Institution: ${userInfo.organization}
- Education: ${userInfo.degree}
- Current Role/Status: ${userInfo.currentRole}

Note: Consider this background when providing personalized feedback and recommendations.
`
            : '';

        const metricsText = `
Interview Metrics:
- Duration (s): ${metrics.durationSeconds || 0}
- Questions asked: ${metrics.questionCount || 0}
- User responses: ${metrics.responseCount || 0}
- Avg response length (chars): ${metrics.averageResponseLengthChars || 0}
- Avg response latency (ms): ${metrics.averageResponseLatencyMs || 'N/A'}
- Filler rate: ${metrics.fillerRate || 0}
        `.trim();

        const rubricText = `Rubric: ${JSON.stringify(JOB_CONFIG.FEEDBACK_RUBRIC || {}).slice(0, 2000)}`;

        const fewShot = `
Example 1:
Messages:
1. ASSISTANT: Tell me about a project you built.
2. USER: I built a web app using React and Node. It had authentication and used PostgreSQL.
3. ASSISTANT: How did you handle scaling?
4. USER: We used basic optimization...

Expected JSON (example):
{
  "overall": "User provided concise answers but lacked depth in scaling specifics.",
  "strengths": ["Clear description of stack","Mentioned database and auth"],
  "improvements": ["Provide specific performance metrics","Explain design choices for scaling","Include trade-offs made"],
  "technical": "Good stack knowledge but lacks depth on scaling.",
  "communication": "Clear but short; provide more structured examples.",
  "recommendations": ["Prepare metrics", "Use STAR structure", "Practice deeper technical explanations"],
  "scores": {"communication":6,"technical":5,"problemSolving":5,"professionalism":7},
  "evidence": [{"msgIndex":2,"excerpt":"I built a web app using React and Node","role":"user"}],
  "confidence": 0.85
}
        `.trim();

        let feedbackPrompt = `
You are an expert interview evaluator. Produce structured feedback for the candidate for the role: "${jobRole.title}".

${userInfoText}

${rubricText}

${metricsText}

Transcript (most recent messages):
${transcriptPreview}

${fewShot}

Task:
- Analyze the transcript and produce a JSON object ONLY (no extra text). The JSON MUST follow this schema:

{
  "overall": "string",
  "strengths": ["string","string",...],
  "improvements": ["string","string",...],
  "technical": "string",
  "communication": "string",
  "recommendations": ["string","string",...],
  "scores": { "communication": int, "technical": int, "problemSolving": int, "professionalism": int },
  "evidence": [ { "msgIndex": int, "excerpt": "string", "role": "user|assistant" } ],
  "confidence": number
}

Important:
- Ensure "improvements" are explicitly tied to the job role "${jobRole.title}".
- Provide at least ${minImprovements} concrete improvements.
- ${
    userInfo?.fullName
        ? `Personalize feedback for ${userInfo.fullName}, considering their background at ${userInfo.organization} and current status as ${userInfo.currentRole}.`
        : ''
}
- ${
    userInfo?.currentRole?.toLowerCase().includes('student')
        ? 'Since this is a student, focus feedback on building foundational skills, academic projects, and preparing for entry-level positions.'
        : ''
}
- If you cannot answer, return confidence < ${confidenceThreshold}.
        `;

        if (requireJson) {
            feedbackPrompt += '\n\nIMPORTANT: Output valid JSON only. Do not include any additional commentary.';
        }

        let lastError = null;

        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            try {
                const { text: raw, model } = await this.makeRequestWithFailover(feedbackPrompt, [], {
                    generationConfig: {
                        responseMimeType: 'application/json',
                    },
                });
                let parsed = null;

                try {
                    parsed = JSON.parse(raw);
                } catch (parseError) {
                    const extractedJson = this.extractJsonObject(raw);
                    if (extractedJson) {
                        parsed = JSON.parse(extractedJson);
                    }
                }

                if (!parsed) {
                    lastError = new Error('Model output was not valid JSON.');
                    continue;
                }

                const validated = this.validateParsedFeedback(parsed);
                const confidence =
                    typeof validated.confidence === 'number' ? validated.confidence : 0.5;

                if (confidence < confidenceThreshold && attempt < maxRetries) {
                    lastError = new Error(`Model confidence too low (${confidence}).`);
                    continue;
                }

                logger.info({ model }, 'Feedback generation succeeded');
                return this.ensureAllFields(validated, conversationData, jobRole);
            } catch (error) {
                lastError = error;
                logger.error(
                    {
                        err: error,
                        attempt: attempt + 1,
                        maxAttempts: maxRetries + 1,
                        activeModel: this.currentModel,
                    },
                    'Feedback generation attempt failed'
                );
                await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
            }
        }

        logger.error({ err: lastError, activeModel: this.currentModel }, 'Falling back to default interview feedback');

        return this.ensureAllFields(
            this.getDefaultFeedback(
                conversationData?.stats?.responseCount || 0,
                conversationData?.stats?.averageResponseLengthChars || 0,
                userInfo
            ),
            conversationData,
            jobRole
        );
    }

    validateParsedFeedback(parsed) {
        const defaultScores = {
            communication: 5,
            technical: 5,
            problemSolving: 5,
            professionalism: 5,
        };

        const feedback = {
            overall: parsed?.overall ? String(parsed.overall).trim() : '',
            strengths: Array.isArray(parsed?.strengths) ? parsed.strengths.map(String) : [],
            improvements: Array.isArray(parsed?.improvements) ? parsed.improvements.map(String) : [],
            technical: parsed?.technical ? String(parsed.technical).trim() : '',
            communication: parsed?.communication ? String(parsed.communication).trim() : '',
            recommendations: Array.isArray(parsed?.recommendations)
                ? parsed.recommendations.map(String)
                : [],
            scores:
                parsed?.scores && typeof parsed.scores === 'object'
                    ? parsed.scores
                    : defaultScores,
            evidence: Array.isArray(parsed?.evidence) ? parsed.evidence : [],
            confidence:
                typeof parsed?.confidence === 'number'
                    ? parsed.confidence
                    : Number(parsed?.confidence || 0.5),
        };

        ['communication', 'technical', 'problemSolving', 'professionalism'].forEach((key) => {
            let value = Number(feedback.scores[key]);

            if (!Number.isFinite(value)) {
                value = defaultScores[key];
            }

            value = Math.round(value);

            if (value < 1) value = 1;
            if (value > 10) value = 10;

            feedback.scores[key] = value;
        });

        return feedback;
    }

    ensureAllFields(parsedFeedback, conversationData, jobRole) {
        const roleName = jobRole?.title || 'the role';
        const stats = conversationData?.stats || {};
        const userInfo = conversationData?.userInfo || null;

        if (!parsedFeedback.overall) {
            parsedFeedback.overall = `Feedback generated for ${roleName}. Review the detailed notes below for strengths, improvement areas, and recommendations.`;
        }

        if (!Array.isArray(parsedFeedback.strengths) || parsedFeedback.strengths.length === 0) {
            parsedFeedback.strengths = [
                stats.responseCount > 0
                    ? 'Stayed engaged and contributed answers during the session.'
                    : 'Showed initiative by starting a practice session.',
            ];
        }

        if (
            !Array.isArray(parsedFeedback.improvements) ||
            parsedFeedback.improvements.length === 0
        ) {
            parsedFeedback.improvements = [
                `Provide more role-specific examples relevant to ${roleName}.`,
                'Use the STAR structure (Situation, Task, Action, Result) to organize answers.',
                'Explain your reasoning, trade-offs, and outcomes with more depth.',
            ];
        }

        if (!parsedFeedback.technical) {
            parsedFeedback.technical = `For ${roleName}, focus on showing deeper subject knowledge, real examples, and practical decision-making.`;
        }

        if (!parsedFeedback.communication) {
            parsedFeedback.communication =
                'Keep answers structured, direct, and supported by concrete examples.';
        }

        if (
            !Array.isArray(parsedFeedback.recommendations) ||
            parsedFeedback.recommendations.length === 0
        ) {
            parsedFeedback.recommendations = [
                'Practice answering common questions aloud before your next mock interview.',
                'Prepare 4-5 strong stories you can adapt to behavioral and role-specific prompts.',
                'Review your target role requirements and align examples to those expectations.',
            ];
        }

        if (!Array.isArray(parsedFeedback.evidence) || parsedFeedback.evidence.length === 0) {
            parsedFeedback.evidence = [];
        }

        if (!Number.isFinite(parsedFeedback.confidence)) {
            parsedFeedback.confidence = 0.5;
        }

        if (userInfo?.fullName && !parsedFeedback.overall.startsWith(userInfo.fullName)) {
            parsedFeedback.overall = `${userInfo.fullName}, ${parsedFeedback.overall
                .charAt(0)
                .toLowerCase()}${parsedFeedback.overall.slice(1)}`;
        }

        return parsedFeedback;
    }

    getDefaultFeedback(participationRate, averageResponseLength, userInfo) {
        let baseScore = 5;

        if (participationRate === 0) {
            baseScore = 1;
        } else if (participationRate <= 2) {
            baseScore = 3;
        } else if (averageResponseLength < 20) {
            baseScore = 4;
        } else if (averageResponseLength < 50) {
            baseScore = 5;
        } else if (averageResponseLength < 100) {
            baseScore = 6;
        } else {
            baseScore = 7;
        }

        return {
            overall: userInfo?.fullName
                ? `${userInfo.fullName}, thank you for completing the interview. Continue practicing to build stronger, more specific answers.`
                : 'Thank you for completing the interview. Continue practicing to build stronger, more specific answers.',
            strengths: participationRate > 0
                ? ['Completed the session and stayed engaged with the interviewer.']
                : ['Started a practice interview session.'],
            improvements: [
                'Provide more detailed answers with specific examples.',
                'Connect your answers more directly to the role requirements.',
                'Show your reasoning and trade-offs instead of staying at a surface level.',
            ],
            technical:
                'Keep strengthening role-specific knowledge and practice explaining your decisions clearly.',
            communication:
                'Aim for concise but complete answers with context, action, and outcomes.',
            recommendations: [
                'Practice mock interviews regularly.',
                'Prepare stories from projects, coursework, or work experience ahead of time.',
                'Review feedback after each session and focus on one improvement area at a time.',
            ],
            scores: {
                communication: baseScore,
                technical: baseScore,
                problemSolving: baseScore,
                professionalism: Math.min(baseScore + 1, 10),
            },
            evidence: [],
            confidence: 0.4,
        };
    }
}

module.exports = {
    geminiService: new GeminiService(),
};
