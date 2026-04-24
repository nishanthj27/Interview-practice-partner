import { authClient } from './auth.js';

function setStatus(message, isError = false) {
    const statusElement = document.getElementById('authStatus');

    if (!statusElement) {
        return;
    }

    statusElement.textContent = message || '';
    statusElement.className = isError ? 'auth-status error' : 'auth-status';
}

function setMode(mode) {
    const authCard = document.getElementById('authCard');
    const signInButton = document.getElementById('showSignIn');
    const signUpButton = document.getElementById('showSignUp');
    const submitButton = document.getElementById('authSubmit');
    const helperText = document.getElementById('authHelperText');
    const nameGroup = document.getElementById('nameGroup');

    authCard.dataset.mode = mode;
    signInButton.classList.toggle('active', mode === 'signin');
    signUpButton.classList.toggle('active', mode === 'signup');
    submitButton.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
    helperText.textContent =
        mode === 'signin'
            ? 'Sign in to continue your interview practice.'
            : 'Create an account to save sessions, feedback, and analytics.';
    nameGroup.hidden = mode !== 'signup';
    setStatus('');
}

async function bootstrapAuthPage() {
    await authClient.init();

    const currentSession = await authClient.getSession();
    const params = new URLSearchParams(window.location.search);
    const nextUrl = authClient.safeNextUrl(params.get('next'));

    if (currentSession) {
        window.location.href = nextUrl;
        return;
    }

    const form = document.getElementById('authForm');
    const signInToggle = document.getElementById('showSignIn');
    const signUpToggle = document.getElementById('showSignUp');

    signInToggle.addEventListener('click', () => setMode('signin'));
    signUpToggle.addEventListener('click', () => setMode('signup'));

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const mode = document.getElementById('authCard').dataset.mode || 'signin';
        const formData = new FormData(form);
        const email = formData.get('email').trim();
        const password = formData.get('password').trim();
        const fullName = formData.get('fullName').trim();

        setStatus(mode === 'signin' ? 'Signing you in...' : 'Creating your account...');

        try {
            if (mode === 'signin') {
                await authClient.signIn(email, password);
                window.location.href = nextUrl;
                return;
            }

            const result = await authClient.signUp(email, password, {
                full_name: fullName,
            });

            if (result.session) {
                window.location.href = nextUrl;
                return;
            }

            setStatus(
                'Account created. Check your email for the confirmation link, then sign in.',
                false
            );
            setMode('signin');
            form.reset();
        } catch (error) {
            setStatus(error.message || 'Authentication failed. Please try again.', true);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bootstrapAuthPage().catch((error) => {
        setStatus(error.message || 'Unable to initialize authentication.', true);
    });
});
