import { CONFIG, loadAppBootstrap, formatTime } from './config.js';
import { authClient } from './auth.js';
import { memoryManager } from './memory-manager.js';
import { geminiService } from './gemini-service.js';

let currentJob = null;
let timerInterval = null;
let timeRemaining = CONFIG.INTERVIEW_DURATION;
let interviewActive = false;

const ASSISTANT_MAX_CHARS = 600;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadAppBootstrap();
        const user = await authClient.requireAuth();

        if (!user) {
            return;
        }

        authClient.hydrateAuthUI(user);
        loadJobInfo();
        initializeChat();
    } catch (error) {
        alert(error.message || 'Unable to load the chat interview.');
        window.location.href = '/index.html';
    }
});

function loadJobInfo() {
    const jobData = sessionStorage.getItem('selectedJob');

    if (!jobData) {
        alert('No job selected. Redirecting to home...');
        window.location.href = '/index.html';
        return;
    }

    currentJob = JSON.parse(jobData);
    document.getElementById('jobTitle').textContent = currentJob.title;
}

function initializeChat() {
    const userInput = document.getElementById('userInput');

    userInput.addEventListener('input', function handleInput() {
        this.style.height = 'auto';
        this.style.height = `${this.scrollHeight}px`;
    });

    userInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    startInterview();
}

async function startInterview() {
    interviewActive = true;
    timeRemaining = CONFIG.INTERVIEW_DURATION;
    memoryManager.startInterview(currentJob);
    geminiService.resetSession();
    await geminiService.initializeSession(currentJob, 'chat');

    startTimer();

    setTimeout(() => {
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
    }, 1000);

    await getAIResponse(true);
}

function startTimer() {
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        timeRemaining -= 1;
        updateTimerDisplay();

        if (timeRemaining <= 0) {
            endInterview();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const timerElement = document.getElementById('timer');
    timerElement.textContent = formatTime(timeRemaining);

    if (timeRemaining <= CONFIG.TIMER_DANGER_THRESHOLD) {
        timerElement.className = 'timer danger';
    } else if (timeRemaining <= CONFIG.TIMER_WARNING_THRESHOLD) {
        timerElement.className = 'timer warning';
    } else {
        timerElement.className = 'timer';
    }
}

async function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();

    if (!message || !interviewActive) {
        return;
    }

    input.value = '';
    input.style.height = 'auto';
    input.disabled = true;
    document.getElementById('sendBtn').disabled = true;

    addMessageToUI('user', message);
    memoryManager.addMessage('user', message);
    showTypingIndicator();

    await getAIResponse();

    input.disabled = false;
    document.getElementById('sendBtn').disabled = false;
    input.focus();
}

function sanitizeAssistantOutput(text) {
    if (!text) {
        return '';
    }

    let cleaned = String(text);
    cleaned = cleaned.replace(
        /\b(generative language api|generativelanguage|gemini|gpt|llm|model|models|prompt|prompts|api|apis|assistant)\b/gi,
        ''
    );
    cleaned = cleaned.replace(/\(.*?(model|gemini|api|assistant|prompt).*?\)/gi, '');
    cleaned = cleaned.replace(/^\s*(as an ai[, ]*)/i, '');
    cleaned = cleaned.replace(/^\s*(as an assistant[, ]*)/i, '');
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    if (cleaned.length > ASSISTANT_MAX_CHARS) {
        const slice = cleaned.slice(0, ASSISTANT_MAX_CHARS);
        const lastPunctuation = Math.max(
            slice.lastIndexOf('.'),
            slice.lastIndexOf('!'),
            slice.lastIndexOf('?')
        );

        if (lastPunctuation > Math.floor(ASSISTANT_MAX_CHARS * 0.5)) {
            cleaned = slice.slice(0, lastPunctuation + 1);
        } else {
            cleaned = `${slice.trim()}...`;
        }
    }

    return cleaned.trim();
}

function persistClientMessage(role, content, source = 'client') {
    void geminiService.recordMessage({ role, content, source }).catch(() => {});
}

async function getAIResponse(isInitial = false) {
    try {
        if (!isInitial) {
            const lastUserMessage = memoryManager.conversationHistory
                .filter((message) => message.role === 'user')
                .pop();

            if (lastUserMessage) {
                const repeatQuestion = memoryManager.checkRepeatRequest(lastUserMessage.content);

                if (repeatQuestion) {
                    hideTypingIndicator();
                    persistClientMessage('user', lastUserMessage.content, 'client-repeat');
                    addMessageToUI('bot', repeatQuestion);
                    memoryManager.addMessage('assistant', repeatQuestion);
                    persistClientMessage('assistant', repeatQuestion, 'client-repeat');
                    return;
                }
            }
        }

        const latestUserMessage = isInitial
            ? ''
            : memoryManager.conversationHistory.filter((message) => message.role === 'user').pop()
                  ?.content || '';

        let response = await geminiService.generateContent({
            job: currentJob,
            mode: 'chat',
            isInitial,
            userMessage: latestUserMessage,
        });

        response = sanitizeAssistantOutput(response);
        hideTypingIndicator();
        addMessageToUI('bot', response);
        memoryManager.addMessage('assistant', response);
    } catch (error) {
        hideTypingIndicator();
        const errorMessage =
            'I apologize, but I encountered an error. The API key may be exhausted. Please try again after some time; the server is busy.';
        addMessageToUI('bot', errorMessage);
        memoryManager.addMessage('assistant', errorMessage);
        persistClientMessage('assistant', errorMessage, 'client-error');
    }
}

function addMessageToUI(type, content) {
    const messagesWrapper = document.getElementById('messagesWrapper');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.textContent = type === 'bot' ? '🎙️' : '👤';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = `
        <div>${escapeHtml(content)}</div>
        <div class="message-time">${new Date().toLocaleTimeString()}</div>
    `;

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    messagesWrapper.appendChild(messageDiv);
    messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
}

function showTypingIndicator() {
    document.getElementById('typingIndicator').style.display = 'flex';
}

function hideTypingIndicator() {
    document.getElementById('typingIndicator').style.display = 'none';
}

async function endInterview() {
    if (!interviewActive) {
        return;
    }

    interviewActive = false;
    clearInterval(timerInterval);

    document.getElementById('userInput').disabled = true;
    document.getElementById('sendBtn').disabled = true;

    const userName = memoryManager.userInfo
        ? memoryManager.userInfo.fullName.split(' ')[0]
        : 'there';
    const closingMessage = `Thank you, ${userName}! That wraps up our interview. You did well - I'll now analyze your responses and provide detailed feedback.`;

    addMessageToUI('bot', closingMessage);
    memoryManager.addMessage('assistant', closingMessage);
    persistClientMessage('assistant', closingMessage, 'client-closing');

    await geminiService.completeSession('completed').catch(() => {});

    setTimeout(() => {
        showFeedbackModal();
    }, 2000);
}

async function showFeedbackModal() {
    const modal = document.getElementById('feedbackModal');
    modal.classList.add('active');

    try {
        const feedback = await geminiService.generateFeedback();
        displayFeedback(feedback);
    } catch (error) {
        const feedbackBody = document.getElementById('feedbackBody');
        feedbackBody.innerHTML = `
            <div class="feedback-section">
                <h3>Error Generating Feedback</h3>
                <p>We encountered an error while generating your feedback. The API key may be exhausted. Please try again after some time; the server is busy.</p>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Error: ${escapeHtml(
                    error.message || 'Unknown error'
                )}</p>
                <button class="btn-primary" onclick="retakeInterview()" style="margin-top: 1rem;">Try Again</button>
            </div>
        `;
    }
}

function displayFeedback(feedback) {
    const feedbackBody = document.getElementById('feedbackBody');
    const scores = feedback.scores || {
        communication: 5,
        technical: 5,
        problemSolving: 5,
        professionalism: 5,
    };

    const averageScore = Math.round(
        (scores.communication +
            scores.technical +
            scores.problemSolving +
            scores.professionalism) /
            4
    );

    feedbackBody.innerHTML = `
        <div class="feedback-section">
            <h3>Overall Performance</h3>
            <p>${escapeHtml(feedback.overall || 'Feedback not available')}</p>
            <div class="score-display">
                <div class="score-item">
                    <div class="score-value">${averageScore}/10</div>
                    <div class="score-label">Overall Score</div>
                </div>
            </div>
        </div>

        <div class="feedback-section">
            <h3>Strengths</h3>
            <ul>
                ${(feedback.strengths || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
        </div>

        <div class="feedback-section">
            <h3>Areas for Improvement</h3>
            <ul>
                ${(feedback.improvements || [])
                    .map((item) => `<li>${escapeHtml(item)}</li>`)
                    .join('')}
            </ul>
        </div>

        <div class="feedback-section">
            <h3>Technical Feedback</h3>
            <p>${escapeHtml(feedback.technical || '')}</p>
        </div>

        <div class="feedback-section">
            <h3>Communication Skills</h3>
            <p>${escapeHtml(feedback.communication || '')}</p>
        </div>

        <div class="feedback-section">
            <h3>Recommendations</h3>
            <ul>
                ${(feedback.recommendations || [])
                    .map((item) => `<li>${escapeHtml(item)}</li>`)
                    .join('')}
            </ul>
        </div>

        <div class="feedback-section">
            <h3>Detailed Scores</h3>
            <div class="score-display">
                <div class="score-item">
                    <div class="score-value">${scores.communication}/10</div>
                    <div class="score-label">Communication</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${scores.technical}/10</div>
                    <div class="score-label">Technical</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${scores.problemSolving}/10</div>
                    <div class="score-label">Problem Solving</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${scores.professionalism}/10</div>
                    <div class="score-label">Professionalism</div>
                </div>
            </div>
        </div>
    `;
}

function goBack() {
    if (!confirm('Are you sure you want to leave the interview?')) {
        return;
    }

    void geminiService.completeSession('abandoned').catch(() => {});
    geminiService.resetSession();
    window.location.href = '/index.html';
}

function goHome() {
    geminiService.resetSession();
    window.location.href = '/index.html';
}

function retakeInterview() {
    geminiService.resetSession();
    window.location.reload();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.sendMessage = sendMessage;
window.endInterview = endInterview;
window.goBack = goBack;
window.goHome = goHome;
window.retakeInterview = retakeInterview;
