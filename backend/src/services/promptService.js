const { JOB_CONFIG } = require('../constants/jobs');

const TECHNICAL_KEYWORDS = [
    'algorithm',
    'architecture',
    'design',
    'implementation',
    'optimization',
    'database',
    'api',
    'framework',
    'testing',
    'deployment',
    'scalability',
    'performance',
    'security',
    'cloud',
    'microservices',
    'system',
];

const FILLER_WORDS = ['uh', 'um', 'hmm', 'mm', 'ah', 'erm'];

function getUserInfoFromSession(session) {
    return {
        fullName: session.candidate_full_name || '',
        organization: session.candidate_organization || '',
        degree: session.candidate_degree || '',
        currentRole: session.candidate_current_role || '',
    };
}

function trackResponseQuality(response) {
    if (!response || typeof response !== 'string') {
        return {
            level: 'unknown',
            length: 0,
            wordCount: 0,
            hasTechnicalContent: false,
            hasStructure: false,
            isVeryBrief: true,
            isBrief: true,
            isDetailed: false,
            isVeryDetailed: false,
        };
    }

    const length = response.trim().length;
    const wordCount = response.trim().split(/\s+/).filter(Boolean).length;
    const hasTechnicalContent = TECHNICAL_KEYWORDS.some((keyword) =>
        response.toLowerCase().includes(keyword)
    );
    const hasStructure = /situation|task|action|result|challenge|solution|outcome/i.test(response);

    const quality = {
        level: 'moderate',
        length,
        wordCount,
        hasTechnicalContent,
        hasStructure,
        isVeryBrief: length < 50,
        isBrief: length < 150,
        isDetailed: length > 200,
        isVeryDetailed: length > 400,
    };

    if (quality.isVeryBrief) {
        quality.level = 'very_brief';
    } else if (quality.isBrief && !hasTechnicalContent) {
        quality.level = 'brief';
    } else if (quality.isDetailed && hasTechnicalContent && hasStructure) {
        quality.level = 'excellent';
    } else if (quality.isDetailed && hasTechnicalContent) {
        quality.level = 'good';
    } else if (quality.isDetailed) {
        quality.level = 'detailed';
    }

    return quality;
}

function getQualityDistribution(qualityHistory) {
    const distribution = {
        very_brief: 0,
        brief: 0,
        moderate: 0,
        detailed: 0,
        good: 0,
        excellent: 0,
    };

    qualityHistory.forEach((quality) => {
        if (distribution[quality.level] !== undefined) {
            distribution[quality.level] += 1;
        }
    });

    return distribution;
}

function extractTopics(userResponses) {
    const topics = new Set();

    userResponses.forEach((response) => {
        const keywords = response.toLowerCase().match(/\b\w{4,}\b/g) || [];
        keywords.forEach((keyword) => topics.add(keyword));
    });

    return Array.from(topics);
}

function calculateAverageResponseLatency(messages) {
    const latencies = [];

    for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index];

        if (message.role !== 'assistant') {
            continue;
        }

        for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
            const nextMessage = messages[nextIndex];

            if (nextMessage.role === 'user') {
                const latency =
                    new Date(nextMessage.created_at).getTime() -
                    new Date(message.created_at).getTime();

                if (latency >= 0) {
                    latencies.push(latency);
                }

                break;
            }
        }
    }

    if (latencies.length === 0) {
        return null;
    }

    return Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length);
}

function calculateFillerRate(userResponses) {
    if (userResponses.length === 0) {
        return 0;
    }

    let fillerCount = 0;

    userResponses.forEach((response) => {
        const normalizedResponse = response.trim().toLowerCase();
        const isFiller = FILLER_WORDS.some(
            (word) =>
                normalizedResponse === word ||
                normalizedResponse.startsWith(`${word} `) ||
                normalizedResponse.includes(` ${word} `)
        );

        if (normalizedResponse.length <= 5 || isFiller) {
            fillerCount += 1;
        }
    });

    return Number((fillerCount / userResponses.length).toFixed(3));
}

function assessResponseQuality(userResponses) {
    if (userResponses.length === 0) {
        return 'No responses yet';
    }

    const averageLength =
        userResponses.reduce((total, response) => total + response.length, 0) / userResponses.length;

    if (averageLength < 20) return 'Very brief responses - needs improvement';
    if (averageLength < 50) return 'Brief responses - could add more detail';
    if (averageLength < 150) return 'Moderate responses - good baseline';
    if (averageLength < 300) return 'Detailed responses - excellent depth';
    return 'Very detailed responses - comprehensive answers';
}

function determinePhase(questionCount) {
    if (questionCount <= 2) {
        return 'introduction';
    }

    if (questionCount <= 8) {
        return 'main';
    }

    return 'closing';
}

function getAdaptiveDifficultyInstruction(lastResponseQuality) {
    if (!lastResponseQuality) {
        return '';
    }

    if (lastResponseQuality.level === 'very_brief') {
        return `
IMPORTANT - NEXT QUESTION ADAPTATION:
- Previous answer was very brief (${lastResponseQuality.length} chars)
- Encourage elaboration with: "Could you provide a specific example?"
- Or probe deeper: "What was your thought process behind that?"
- Or rephrase: "Let me ask that differently..."`;
    }

    if (lastResponseQuality.level === 'brief') {
        return `
IMPORTANT - NEXT QUESTION ADAPTATION:
- Previous answer lacked depth
- Follow up with: "Can you walk me through the details?"
- Or: "What challenges did you face?"`;
    }

    if (
        lastResponseQuality.level === 'excellent' ||
        lastResponseQuality.level === 'good'
    ) {
        return `
IMPORTANT - NEXT QUESTION ADAPTATION:
- Previous answer was strong and detailed
- You can increase difficulty or dive deeper
- Ask about edge cases, trade-offs, or alternatives`;
    }

    return '';
}

function buildConversationStats(session, messages) {
    const userInfo = getUserInfoFromSession(session);
    const userResponses = messages.filter((message) => message.role === 'user').map((message) => message.content);
    const assistantMessages = messages.filter((message) => message.role === 'assistant');
    const responseQualityHistory = userResponses.map((response) => trackResponseQuality(response));
    const lastResponseQuality = responseQualityHistory[responseQualityHistory.length - 1] || null;
    const topicsCovered = extractTopics(userResponses);
    const averageResponseLength =
        userResponses.length > 0
            ? userResponses.reduce((total, response) => total + response.length, 0) / userResponses.length
            : 0;
    const endTime = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();
    const startTime = session.started_at ? new Date(session.started_at).getTime() : endTime;

    return {
        duration: Math.max(0, Math.floor((endTime - startTime) / 1000)),
        questionCount: assistantMessages.length,
        responseCount: userResponses.length,
        topicsCovered,
        averageResponseLength,
        averageResponseLatencyMs: calculateAverageResponseLatency(messages),
        fillerRate: calculateFillerRate(userResponses),
        phase: determinePhase(assistantMessages.length),
        userInfo,
        responseQualityHistory,
        responseQualityDistribution: getQualityDistribution(responseQualityHistory),
        lastResponseQuality,
        responseQualitySummary: assessResponseQuality(userResponses),
        userResponses,
    };
}

function buildUserInfoContext(userInfo) {
    if (!userInfo.fullName) {
        return '';
    }

    return `
Candidate Information:
- Name: ${userInfo.fullName}
- Organization/Institution: ${userInfo.organization}
- Education: ${userInfo.degree}
- Current Position: ${userInfo.currentRole}

Use this information to personalize the interview experience. For example:
- Reference their educational background when relevant
- Tailor questions to their current role or student status
- Use their name occasionally to make it more personal
- Adjust difficulty based on whether they're a student or working professional
- Ask about relevant experiences from their organization if appropriate`.trim();
}

function buildContextSummary(stats) {
    let summary = `
Interview Context:
- Duration: ${Math.floor(stats.duration / 60)} minutes ${stats.duration % 60} seconds
- Phase: ${stats.phase}
- Questions Asked: ${stats.questionCount}
- User Responses: ${stats.responseCount}
- Topics Discussed: ${stats.topicsCovered.slice(0, 10).join(', ')}
- Response Quality: ${stats.responseQualitySummary}
    `.trim();

    const userContext = buildUserInfoContext(stats.userInfo);

    if (userContext) {
        summary += `\n\n${userContext}`;
    }

    return summary;
}

function buildSystemPrompt(job, session, messages) {
    const stats = buildConversationStats(session, messages);
    const firstName = stats.userInfo.fullName ? stats.userInfo.fullName.split(' ')[0] : 'there';
    const contextSummary = buildContextSummary(stats);
    const adaptiveInstruction = getAdaptiveDifficultyInstruction(stats.lastResponseQuality);

    let enhancedPrompt = `${job.systemPrompt}

Current Interview Context:
${contextSummary}

PERSONALITY TRAITS (Nishu One - Your Interviewer Persona):
- Professional yet warm and encouraging
- Patient and supportive - this is practice, not a real high-stakes interview
- Shows genuine interest in the candidate's experiences and learning
- Occasionally uses light encouragement to ease tension
- Celebrates good answers: "Excellent example!", "That's a solid approach!"
- Gently probes unclear answers: "Could you elaborate on that?", "What made you choose that approach?"
- Uses natural acknowledgments before transitions

NATURAL CONVERSATION RULES:
- Use brief acknowledgments (2-4 words) before asking next question
- Vary your acknowledgments: "I see", "Interesting", "Makes sense", "Good point", "Fair enough"
- Occasionally reflect back key points: "So you're saying [brief summary]..."
- Build on previous answers: "You mentioned [topic] - how does that relate to..."
- Reference their name occasionally: "${firstName}, tell me about..."
- Don't overdo acknowledgments - keep them natural and brief
- Example flow: "Interesting. Now, building on that..." OR "I see. Let's explore..."

CONTEXT-AWARE FOLLOW-UPS (CRITICAL):
- Always reference previous answers when asking follow-ups
- Connect questions logically based on what they've shared
- Example: "You mentioned working with React - how do you handle state management in larger applications?"
- Example: "Since you have experience with ${
        stats.topicsCovered.length > 0 ? stats.topicsCovered[0] : 'that technology'
    }, how would you approach..."
- Show active listening by building on their responses

Adaptive Behavior:
- If user seems confused, provide hints or rephrase
- If responses are too brief, encourage elaboration with follow-ups
- If user goes off-topic, gently redirect: "That's interesting, but let's focus on..."
- If user asks to repeat a question, provide it naturally
- Maintain professional but friendly tone throughout
- Ask one clear question at a time
- Listen actively to answers before proceeding
- Adapt difficulty based on their responses`;

    if (adaptiveInstruction) {
        enhancedPrompt += `\n${adaptiveInstruction}`;
    }

    if (stats.userInfo.fullName) {
        enhancedPrompt += `

PERSONALIZATION INSTRUCTIONS:
- Candidate's name: ${stats.userInfo.fullName} (use "${firstName}" for casual reference)
- Their background: ${stats.userInfo.organization}
- Education: ${stats.userInfo.degree}
- Current status: ${stats.userInfo.currentRole}
- Use their name naturally 2-3 times during the interview
- Reference their organization when relevant: "How do things work at ${stats.userInfo.organization}?"
- Connect questions to their educational background when appropriate`;

        if (stats.userInfo.currentRole.toLowerCase().includes('student')) {
            enhancedPrompt += `

CRITICAL - STUDENT ADAPTATIONS:
This candidate is a STUDENT - adjust ALL expectations and questions accordingly.

Question Guidelines for Students:
- Focus on: Academic projects, coursework, lab work, internships, hackathons
- Ask about: Class projects, team assignments, research work, personal projects
- Expect: Theoretical knowledge, learning experiences, academic achievements
- DON'T ask about: Production systems, enterprise experience, managing teams
- DO ask about: "What projects have you built in your courses?", "Tell me about your capstone project"
- Tone: Encouraging and educational - help them learn interview skills
- Difficulty: Entry-level appropriate, focus on fundamentals and potential
- Examples of good questions:
  * "What's the most challenging project you've worked on in your classes?"
  * "Tell me about a time you had to learn a new technology for a school project"
  * "How do you approach debugging when working on assignments?"
  * "What concepts from your ${stats.userInfo.degree} courses interest you most?"

Remember: Students are building experience - focus on their potential, learning ability, and academic work.`;
        } else {
            enhancedPrompt += `

PROFESSIONAL ADAPTATIONS:
This candidate is a working professional: ${stats.userInfo.currentRole}

Question Guidelines for Professionals:
- Expect: Real-world experience, production knowledge, team collaboration
- Ask about: Actual projects they've shipped, technical decisions they've made
- Focus on: Problem-solving in real scenarios, handling production issues
- Probe for: Leadership, mentoring, architectural decisions, trade-offs
- Difficulty: Match their stated role level (junior/senior/lead)
- Examples of good questions:
  * "Tell me about a production issue you diagnosed and resolved"
  * "How do you handle technical debt in your current role?"
  * "Describe a time you had to make a critical architectural decision"
  * "How do you mentor junior developers on your team?"

Remember: Professionals should demonstrate practical experience and decision-making ability.`;
        }
    }

    if (stats.phase === 'introduction') {
        enhancedPrompt += `

CURRENT PHASE: Introduction
- Keep it warm and welcoming
- Use their name in greeting: "Hi ${firstName}, great to meet you!"
- Start with easier questions to build rapport
- Set a comfortable tone for the rest of the interview`;
    } else if (stats.phase === 'closing') {
        enhancedPrompt += `

CURRENT PHASE: Closing
- Start wrapping up naturally
- Maybe ask: "Before we finish, is there anything you'd like to add?"
- Thank them for their time
- Keep it brief - interview is almost over`;
    }

    enhancedPrompt += `

Remember: You are Nishu One, a supportive interviewer helping ${firstName} practice. Be conversational, reference previous answers, and create a natural flow. This is a realistic interview simulation - be supportive but thorough.`;

    return enhancedPrompt;
}

function buildConversationForModel(messages) {
    return messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
    }));
}

function buildSessionSummary(session, messages) {
    const stats = buildConversationStats(session, messages);

    return {
        duration_seconds: stats.duration,
        question_count: stats.questionCount,
        response_count: stats.responseCount,
        average_response_length: Math.round(stats.averageResponseLength || 0),
        average_response_latency_ms: stats.averageResponseLatencyMs,
        filler_rate: stats.fillerRate,
        topics_covered: stats.topicsCovered,
        response_quality: stats.responseQualityHistory,
    };
}

function exportForFeedback(session, messages) {
    const stats = buildConversationStats(session, messages);
    const maxMessages =
        JOB_CONFIG.FEEDBACK && JOB_CONFIG.FEEDBACK.MAX_HISTORY_MESSAGES
            ? JOB_CONFIG.FEEDBACK.MAX_HISTORY_MESSAGES
            : 30;

    const messagesWindow = messages.slice(-maxMessages).map((message, index) => ({
        index: index + 1,
        globalIndex: messages.indexOf(message),
        role: message.role,
        content: message.content,
        timestamp: message.created_at,
    }));

    return {
        conversation: messages,
        stats: {
            durationSeconds: stats.duration,
            questionCount: stats.questionCount,
            responseCount: stats.responseCount,
            averageResponseLengthChars: Math.round(stats.averageResponseLength || 0),
            averageResponseLatencyMs: stats.averageResponseLatencyMs,
            fillerRate: stats.fillerRate,
            topicsCovered: stats.topicsCovered,
            phase: stats.phase,
            userInfo: stats.userInfo,
            responseQualityDistribution: stats.responseQualityDistribution,
        },
        responses: stats.userResponses,
        messagesWindow,
        userInfo: stats.userInfo,
    };
}

module.exports = {
    buildSystemPrompt,
    buildConversationForModel,
    buildSessionSummary,
    exportForFeedback,
    buildConversationStats,
    getUserInfoFromSession,
};
