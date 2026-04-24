import { CONFIG, loadAppBootstrap, formatTime } from './config.js';
import { authClient } from './auth.js';
import { memoryManager } from './memory-manager.js';
import { geminiService } from './gemini-service.js';

let currentJob = null;
let timerInterval = null;
let timeRemaining = CONFIG.INTERVIEW_DURATION;
let interviewActive = false;

let cameraStream = null;
let cameraEnabled = false;

let recognition = null;
const synthesis = window.speechSynthesis;
let isAISpeaking = false;
let isProcessingResponse = false;
let recognitionActive = false;

let accumulatedTranscripts = [];
let silenceTimer = null;
let noResponseTimer = null;
let stepTimer = null;
let noResponsePhase = null;

const NATURAL_PAUSE_TIME = 4500;
const GRACE_MS = 300;
const NO_RESPONSE_TIMEOUT = 10000;
const STEP_TIMEOUT = 10000;
const PRE_SPEAK_DELAY_MS = 250;
const ASSISTANT_MAX_CHARS = 600;
const TTS_RATE = 0.95;
const TTS_PITCH = 1;
const TTS_VOLUME = 1;

const PREFERRED_VOICE_NAMES = [
    'Google US English Female',
    'Google US English',
    'Microsoft Zira Desktop',
    'Microsoft Zira',
    'Microsoft Eva',
    'Samantha',
    'Karen',
    'Moira',
    'Fiona',
    'Victoria',
    'Amelie',
    'Anna',
    'Ellen',
    'Sandy',
];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadAppBootstrap();
        const user = await authClient.requireAuth();

        if (!user) {
            return;
        }

        authClient.hydrateAuthUI(user);
        loadJobInfo();
        setupSpeechRecognition();

        if (synthesis && typeof synthesis.onvoiceschanged !== 'undefined') {
            synthesis.onvoiceschanged = () => {
                console.log('Voice list loaded:', synthesis.getVoices().length);
            };
        }
    } catch (error) {
        alert(error.message || 'Unable to load the voice interview.');
        window.location.href = '/index.html';
    }
});

function persistClientMessage(role, content, source = 'client') {
    void geminiService.recordMessage({ role, content, source }).catch(() => {});
}

function addToConversationDisplay(type, text) {
    const messagesContainer = document.getElementById('conversationMessages');

    if (!messagesContainer) {
        return;
    }

    const welcomeMessage = messagesContainer.querySelector('.welcome-message-voice');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}-message`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'chat-message-avatar';
    avatarDiv.textContent = type === 'bot' ? '🎙️' : '👤';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-message-content';
    contentDiv.innerHTML = `
        <div>${escapeHtml(text)}</div>
        <div class="chat-message-time">${new Date().toLocaleTimeString()}</div>
    `;

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addAssistantMessage(text, source = 'client') {
    addToConversationDisplay('bot', text);
    memoryManager.addMessage('assistant', text);

    if (source !== 'gemini') {
        persistClientMessage('assistant', text, source);
    }
}

function addUserMessage(text, source = null) {
    addToConversationDisplay('user', text);
    memoryManager.addMessage('user', text);

    if (source) {
        persistClientMessage('user', text, source);
    }
}

function loadJobInfo() {
    const jobData = sessionStorage.getItem('selectedJob');

    if (!jobData) {
        alert('No job selected. Redirecting to home...');
        window.location.href = '/index.html';
        return;
    }

    try {
        currentJob = JSON.parse(jobData);
    } catch (error) {
        window.location.href = '/index.html';
        return;
    }

    document.getElementById('jobTitle').textContent = currentJob.title || 'Interview';
}

function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.warn('SpeechRecognition is not available in this browser.');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        recognitionActive = true;
        if (!isAISpeaking && !isProcessingResponse) {
            updateAvatarStatus('listening', 'Listening...');
        }
    };

    recognition.onresult = (event) => {
        clearAllNoResponseTimers();

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];

            if (!result) {
                continue;
            }

            if (result.isFinal) {
                const transcript = result[0]?.transcript?.trim() || '';

                if (!transcript || isProcessingResponse) {
                    continue;
                }

                if (noResponsePhase && handleQuickCommand(transcript)) {
                    return;
                }

                accumulatedTranscripts.push(transcript);
                resetSilenceTimer();
            } else {
                resetSilenceTimer();
            }
        }
    };

    recognition.onerror = (event) => {
        if (event?.error !== 'no-speech' && event?.error !== 'aborted') {
            console.warn('Speech recognition error:', event.error);
        }
    };

    recognition.onend = () => {
        recognitionActive = false;

        if (interviewActive && !isProcessingResponse && !isAISpeaking) {
            setTimeout(() => {
                try {
                    recognition.start();
                } catch (error) {
                    console.warn('Unable to restart recognition:', error);
                }
            }, 200);
        }
    };
}

function resetSilenceTimer() {
    clearTimeout(silenceTimer);

    if (!interviewActive || isProcessingResponse) {
        return;
    }

    silenceTimer = setTimeout(() => {
        finalizeAfterGrace();
    }, NATURAL_PAUSE_TIME);
}

async function finalizeAfterGrace() {
    clearTimeout(silenceTimer);
    await new Promise((resolve) => setTimeout(resolve, GRACE_MS));

    if (!interviewActive || isProcessingResponse) {
        return;
    }

    await processCompleteAnswer();
}

function startNoResponseFlow() {
    clearAllNoResponseTimers();
    noResponsePhase = null;

    noResponseTimer = setTimeout(async () => {
        if (!interviewActive || isProcessingResponse) {
            return;
        }

        noResponsePhase = 'awaiting_more_time';
        const prompt1 =
            "Take your time - there's no rush to answer. Would you like a moment to think?";
        addAssistantMessage(prompt1, 'voice-no-response');
        await speakText(prompt1);

        stepTimer = setTimeout(async () => {
            if (!interviewActive || isProcessingResponse) {
                return;
            }

            noResponsePhase = 'awaiting_moveon';
            const prompt2 =
                "No worries if that's a tough one. Should we try a different question, or would you like me to rephrase?";
            addAssistantMessage(prompt2, 'voice-no-response');
            await speakText(prompt2);

            stepTimer = setTimeout(async () => {
                if (!interviewActive || isProcessingResponse) {
                    return;
                }

                noResponsePhase = 'awaiting_confirmation';
                const prompt3 =
                    "Just checking - are you still there? Let me know if you'd like to continue or if we should wrap up.";
                addAssistantMessage(prompt3, 'voice-no-response');
                await speakText(prompt3);

                stepTimer = setTimeout(() => {
                    if (!interviewActive || isProcessingResponse) {
                        return;
                    }

                    endInterview();
                }, STEP_TIMEOUT);
            }, STEP_TIMEOUT);
        }, STEP_TIMEOUT);
    }, NO_RESPONSE_TIMEOUT);
}

function clearAllNoResponseTimers() {
    if (noResponseTimer) {
        clearTimeout(noResponseTimer);
        noResponseTimer = null;
    }

    if (stepTimer) {
        clearTimeout(stepTimer);
        stepTimer = null;
    }

    noResponsePhase = null;
}

function handleQuickCommand(text) {
    const lowerText = text.toLowerCase();

    const needMoreTimeKeywords = [
        'yes',
        'i need more time',
        'more time',
        'need more',
        'give me time',
        'a moment',
        'wait',
    ];
    const skipKeywords = ['skip', 'move on', 'next', 'skip this', 'move to next'];
    const toughKeywords = ['tough', 'difficult', 'hard', 'i cannot', "i don't know", 'not sure'];
    const confirmYesKeywords = [
        'yes',
        'continue',
        'resume',
        'keep going',
        'let us continue',
    ];
    const confirmNoKeywords = ['no', 'end', 'stop', 'quit', 'exit', 'end interview'];

    if (noResponsePhase === 'awaiting_more_time') {
        if (needMoreTimeKeywords.some((keyword) => lowerText.includes(keyword))) {
            clearAllNoResponseTimers();
            void (async () => {
                const message = "Okay - take your time. I'll wait.";
                addAssistantMessage(message, 'voice-no-response');
                await speakText(message);
                startNoResponseFlow();
                setTimeout(() => startListening(), 200);
            })();
            return true;
        }

        if (skipKeywords.some((keyword) => lowerText.includes(keyword))) {
            clearAllNoResponseTimers();
            void handleSkipCommand();
            return true;
        }
    }

    if (noResponsePhase === 'awaiting_moveon') {
        if (
            toughKeywords.some((keyword) => lowerText.includes(keyword)) ||
            skipKeywords.some((keyword) => lowerText.includes(keyword))
        ) {
            clearAllNoResponseTimers();
            void handleSkipCommand();
            return true;
        }
    }

    if (noResponsePhase === 'awaiting_confirmation') {
        if (confirmYesKeywords.some((keyword) => lowerText.includes(keyword))) {
            clearAllNoResponseTimers();
            void (async () => {
                const message = 'Great - resuming the interview.';
                addAssistantMessage(message, 'voice-no-response');
                await speakText(message);
                setTimeout(() => startListening(), 250);
            })();
            return true;
        }

        if (confirmNoKeywords.some((keyword) => lowerText.includes(keyword))) {
            clearAllNoResponseTimers();
            void (async () => {
                const message = 'Okay - ending the interview. Thank you for your time.';
                addAssistantMessage(message, 'voice-no-response');
                await speakText(message);
                endInterview();
            })();
            return true;
        }
    }

    return false;
}

async function handleSkipCommand() {
    if (isProcessingResponse) {
        return;
    }

    clearAllNoResponseTimers();
    stopListening();

    const skipMarker = '[skipped - moved to next question]';
    addUserMessage(skipMarker);

    isProcessingResponse = true;
    updateAvatarStatus('thinking', 'Thinking...');

    try {
        const aiResponse = await geminiService.generateContent({
            job: currentJob,
            mode: 'voice',
            isInitial: false,
            userMessage: skipMarker,
        });
        const cleaned = sanitizeAssistantOutput(String(aiResponse || ''));
        addAssistantMessage(cleaned, 'gemini');
        await speakText(cleaned);
    } catch (error) {
        const message =
            'I encountered an error. The API key may be exhausted. Please try again after some time; the server is busy.';
        addAssistantMessage(message, 'voice-error');
        await speakText(message);
    } finally {
        isProcessingResponse = false;
    }

    startNoResponseFlow();
    setTimeout(() => {
        if (interviewActive) {
            startListening();
        }
    }, 250);
}

async function startInterview() {
    if (interviewActive) {
        return;
    }

    interviewActive = true;
    timeRemaining = CONFIG.INTERVIEW_DURATION;
    memoryManager.startInterview(currentJob);
    geminiService.resetSession();
    await geminiService.initializeSession(currentJob, 'voice');

    const startWrapper = document.getElementById('startWrapper');
    if (startWrapper) {
        startWrapper.style.display = 'none';
    }

    startTimer();
    await getAndSpeakAIResponse(true);
    startNoResponseFlow();
    setTimeout(() => startListening(), 300);
}

function startListening() {
    if (!recognition || !interviewActive || isProcessingResponse || isAISpeaking || recognitionActive) {
        return;
    }

    try {
        recognition.start();
    } catch (error) {
        console.warn('Unable to start listening:', error);
    }
}

function stopListening() {
    clearTimeout(silenceTimer);

    if (!recognition || !recognitionActive) {
        return;
    }

    try {
        recognition.stop();
    } catch (error) {
        console.warn('Unable to stop listening:', error);
    }

    recognitionActive = false;
}

async function processCompleteAnswer() {
    if (!accumulatedTranscripts.length || isProcessingResponse) {
        return;
    }

    const fullAnswer = accumulatedTranscripts.join(' ').trim();
    accumulatedTranscripts = [];
    clearTimeout(silenceTimer);
    stopListening();

    isProcessingResponse = true;
    addUserMessage(fullAnswer);
    updateAvatarStatus('thinking', 'Thinking...');

    try {
        let aiResponse = await geminiService.generateContent({
            job: currentJob,
            mode: 'voice',
            isInitial: false,
            userMessage: fullAnswer,
        });

        aiResponse = sanitizeAssistantOutput(String(aiResponse || ''));
        addAssistantMessage(aiResponse, 'gemini');
        await speakText(aiResponse);
    } catch (error) {
        const message =
            'I encountered an error. The API key may be exhausted. Please try again after some time; the server is busy.';
        addAssistantMessage(message, 'voice-error');
        await speakText(message);
    } finally {
        isProcessingResponse = false;
    }

    startNoResponseFlow();
    setTimeout(() => {
        if (interviewActive) {
            startListening();
        }
    }, 250);
}

async function getAndSpeakAIResponse(isInitial = false) {
    if (isProcessingResponse) {
        return;
    }

    isProcessingResponse = true;
    updateAvatarStatus('thinking', 'Thinking...');

    try {
        let aiResponse = await geminiService.generateContent({
            job: currentJob,
            mode: 'voice',
            isInitial,
        });

        aiResponse = sanitizeAssistantOutput(String(aiResponse || ''));
        addAssistantMessage(aiResponse, 'gemini');
        await speakText(aiResponse);
    } catch (error) {
        const message =
            'I encountered an error. The API key may be exhausted. Please try again after some time; the server is busy.';
        addAssistantMessage(message, 'voice-error');
        await speakText(message);
    } finally {
        isProcessingResponse = false;
    }

    startNoResponseFlow();
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

function waitForRecognitionStop(timeout = 1200) {
    return new Promise((resolve) => {
        if (!recognition || !recognitionActive) {
            resolve(true);
            return;
        }

        const previousOnEnd = recognition.onend;
        let finished = false;

        const finish = () => {
            if (finished) {
                return;
            }

            finished = true;
            recognitionActive = false;
            recognition.onend = previousOnEnd;
            resolve(true);
        };

        recognition.onend = () => {
            if (typeof previousOnEnd === 'function') {
                previousOnEnd();
            }
            finish();
        };

        try {
            if (typeof recognition.abort === 'function') {
                recognition.abort();
            } else {
                recognition.stop();
            }
        } catch (error) {
            finish();
        }

        setTimeout(finish, timeout);
    });
}

function playAudioPrime(durationMs = 80) {
    return new Promise((resolve) => {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) {
                resolve();
                return;
            }

            const context = new AudioContextClass();
            const sampleRate = context.sampleRate || 44100;
            const bufferLength = Math.max(1, Math.floor((durationMs / 1000) * sampleRate));
            const buffer = context.createBuffer(1, bufferLength, sampleRate);
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(context.destination);
            source.onended = () => {
                source.disconnect();
                setTimeout(() => {
                    void context.close();
                    resolve();
                }, 20);
            };
            source.start(0);
        } catch (error) {
            resolve();
        }
    });
}

async function speakText(text) {
    return new Promise(async (resolve) => {
        if (!window.speechSynthesis) {
            resolve();
            return;
        }

        try {
            await waitForRecognitionStop();
            await playAudioPrime();
            await new Promise((innerResolve) => setTimeout(innerResolve, PRE_SPEAK_DELAY_MS));

            isAISpeaking = true;
            updateAvatarStatus('speaking', 'Speaking...');

            const utterance = new SpeechSynthesisUtterance(String(text || ''));
            utterance.rate = TTS_RATE;
            utterance.pitch = TTS_PITCH;
            utterance.volume = TTS_VOLUME;
            utterance.lang = 'en-US';

            const voices = synthesis.getVoices() || [];
            let selectedVoice = null;

            for (const preferredVoice of PREFERRED_VOICE_NAMES) {
                selectedVoice = voices.find(
                    (voice) =>
                        voice.name &&
                        voice.name.toLowerCase().includes(preferredVoice.toLowerCase())
                );

                if (selectedVoice) {
                    break;
                }
            }

            if (!selectedVoice) {
                selectedVoice = voices.find((voice) =>
                    voice.lang?.toLowerCase().startsWith('en')
                );
            }

            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }

            utterance.onend = () => {
                isAISpeaking = false;
                updateAvatarStatus('listening', 'Listening...');

                if (interviewActive && !isProcessingResponse) {
                    setTimeout(() => startListening(), 200);
                }

                resolve();
            };

            utterance.onerror = () => {
                isAISpeaking = false;
                setTimeout(() => startListening(), 200);
                resolve();
            };

            synthesis.speak(utterance);
        } catch (error) {
            isAISpeaking = false;
            resolve();
        }
    });
}

function updateAvatarStatus(state, text) {
    const avatar = document.getElementById('avatar');
    const status = document.getElementById('avatarStatus');

    if (avatar) {
        avatar.classList.remove('speaking', 'listening', 'thinking');

        if (state) {
            avatar.classList.add(state);
        }
    }

    if (status) {
        status.textContent = text || '';
    }
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

    if (!timerElement) {
        return;
    }

    timerElement.textContent = formatTime(timeRemaining);

    if (timeRemaining <= CONFIG.TIMER_DANGER_THRESHOLD) {
        timerElement.className = 'timer danger';
    } else if (timeRemaining <= CONFIG.TIMER_WARNING_THRESHOLD) {
        timerElement.className = 'timer warning';
    } else {
        timerElement.className = 'timer';
    }
}

async function endInterview() {
    if (!interviewActive) {
        return;
    }

    interviewActive = false;
    clearInterval(timerInterval);
    clearTimeout(silenceTimer);
    clearAllNoResponseTimers();
    stopListening();

    if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
    }

    try {
        synthesis.cancel();
    } catch (error) {
        console.warn('Unable to stop speech synthesis:', error);
    }

    updateAvatarStatus(null, 'Interview Complete');

    if (memoryManager.userInfo) {
        const userName = memoryManager.userInfo.fullName.split(' ')[0];
        const closingMessage = `Thank you, ${userName}! That wraps up our interview. You did well - I'll now analyze your responses and provide detailed feedback.`;
        addAssistantMessage(closingMessage, 'voice-closing');
        await speakText(closingMessage);
    }

    await geminiService.completeSession('completed').catch(() => {});

    setTimeout(async () => {
        const modal = document.getElementById('feedbackModal');
        if (modal) {
            modal.classList.add('active');
        }

        try {
            const feedback = await geminiService.generateFeedback();
            displayFeedback(feedback);
        } catch (error) {
            document.getElementById('feedbackBody').innerHTML = `
                <div class="feedback-section">
                    <h3>Error Generating Feedback</h3>
                    <p>${escapeHtml(error.message || 'Unable to generate feedback.')}</p>
                </div>
            `;
        }
    }, 2000);
}

function displayFeedback(feedback) {
    const feedbackBody = document.getElementById('feedbackBody');
    const averageScore = Math.round(
        (feedback.scores.communication +
            feedback.scores.technical +
            feedback.scores.problemSolving +
            feedback.scores.professionalism) /
            4
    );

    feedbackBody.innerHTML = `
        <div class="feedback-section">
            <h3>Overall Performance</h3>
            <p>${escapeHtml(feedback.overall || '')}</p>
            <div class="score-display">
                <div class="score-item">
                    <div class="score-value">${averageScore}/10</div>
                    <div class="score-label">Overall Score</div>
                </div>
            </div>
        </div>
        <div class="feedback-section">
            <h3>Strengths</h3>
            <ul>${(feedback.strengths || [])
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join('')}</ul>
        </div>
        <div class="feedback-section">
            <h3>Areas for Improvement</h3>
            <ul>${(feedback.improvements || [])
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join('')}</ul>
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
            <ul>${(feedback.recommendations || [])
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join('')}</ul>
        </div>
        <div class="feedback-section">
            <h3>Detailed Scores</h3>
            <div class="score-display">
                <div class="score-item">
                    <div class="score-value">${feedback.scores.communication}/10</div>
                    <div class="score-label">Communication</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${feedback.scores.technical}/10</div>
                    <div class="score-label">Technical</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${feedback.scores.problemSolving}/10</div>
                    <div class="score-label">Problem Solving</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${feedback.scores.professionalism}/10</div>
                    <div class="score-label">Professionalism</div>
                </div>
            </div>
        </div>
    `;
}

async function enableCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 },
            },
            audio: false,
        });

        cameraStream = stream;
        cameraEnabled = true;

        const video = document.getElementById('cameraPreview');
        const overlay = document.getElementById('cameraOverlay');
        const toggleButton = document.getElementById('toggleCameraBtn');

        video.srcObject = stream;
        video.classList.add('active');
        overlay.classList.add('hidden');
        toggleButton.style.display = 'flex';
    } catch (error) {
        alert('Unable to access the camera. Please check browser permissions.');
    }
}

function toggleCamera() {
    const video = document.getElementById('cameraPreview');
    const icon = document.getElementById('cameraToggleIcon');

    if (cameraEnabled && cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        video.classList.remove('active');
        cameraEnabled = false;
        icon.textContent = '📷';
    } else {
        void enableCamera();
        icon.textContent = '🚫';
    }
}

window.addEventListener('beforeunload', () => {
    if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
    }
});

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
    div.textContent = text || '';
    return div.innerHTML;
}

window.enableCamera = enableCamera;
window.toggleCamera = toggleCamera;
window.startInterview = startInterview;
window.endInterview = endInterview;
window.goBack = goBack;
window.goHome = goHome;
window.retakeInterview = retakeInterview;
