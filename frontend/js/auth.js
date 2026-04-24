import { createClient } from '@supabase/supabase-js';
import { CONFIG, loadAppBootstrap } from './config.js';

let supabaseClient = null;
let currentUser = null;
let authListenerRegistered = false;

async function init() {
    await loadAppBootstrap();

    if (!CONFIG.SUPABASE.url || !CONFIG.SUPABASE.anonKey) {
        throw new Error('Supabase client configuration is missing.');
    }

    if (!supabaseClient) {
        supabaseClient = createClient(CONFIG.SUPABASE.url, CONFIG.SUPABASE.anonKey);
    }

    if (!authListenerRegistered) {
        supabaseClient.auth.onAuthStateChange((_event, session) => {
            currentUser = session?.user || null;
            hydrateAuthUI(currentUser);
        });

        authListenerRegistered = true;
    }

    return supabaseClient;
}

function safeNextUrl(rawValue) {
    if (!rawValue) {
        return '/index.html';
    }

    try {
        const nextUrl = new URL(rawValue, window.location.origin);

        if (nextUrl.origin !== window.location.origin) {
            return '/index.html';
        }

        return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    } catch (error) {
        return '/index.html';
    }
}

function getAuthRedirectUrl() {
    const nextPath = `${window.location.pathname}${window.location.search}`;
    return `/auth.html?next=${encodeURIComponent(nextPath)}`;
}

function hydrateAuthUI(user = currentUser) {
    const email = user?.email || '';

    document.querySelectorAll('[data-auth-email]').forEach((element) => {
        element.textContent = email;
    });

    document.querySelectorAll('[data-auth-signout]').forEach((button) => {
        if (button.dataset.bound === 'true') {
            return;
        }

        button.dataset.bound = 'true';
        button.addEventListener('click', async () => {
            try {
                await signOut();
                window.location.href = '/auth.html';
            } catch (error) {
                alert(error.message || 'Unable to sign out right now.');
            }
        });
    });
}

async function getSession() {
    const client = await init();
    const { data, error } = await client.auth.getSession();

    if (error) {
        throw error;
    }

    currentUser = data.session?.user || null;
    return data.session || null;
}

async function requireAuth() {
    const session = await getSession();

    if (!session) {
        window.location.href = getAuthRedirectUrl();
        return null;
    }

    hydrateAuthUI(session.user);
    return session.user;
}

async function signIn(email, password) {
    const client = await init();
    const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        throw error;
    }

    currentUser = data.user || data.session?.user || null;
    hydrateAuthUI(currentUser);
    return data;
}

async function signUp(email, password, metadata = {}) {
    const client = await init();
    const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
            data: metadata,
        },
    });

    if (error) {
        throw error;
    }

    currentUser = data.user || null;
    return data;
}

async function signOut() {
    const client = await init();
    const { error } = await client.auth.signOut();

    if (error) {
        throw error;
    }

    currentUser = null;
    sessionStorage.removeItem('activeInterviewSession');
    sessionStorage.removeItem('selectedJob');
    sessionStorage.removeItem('userInfo');
}

async function getAccessToken({ allowMissing = false } = {}) {
    const session = await getSession();

    if (!session) {
        if (allowMissing) {
            return null;
        }

        throw new Error('Authentication required.');
    }

    return session.access_token;
}

const authClient = {
    init,
    getSession,
    requireAuth,
    signIn,
    signUp,
    signOut,
    getAccessToken,
    hydrateAuthUI,
    safeNextUrl,
    getCurrentUser: () => currentUser,
};

export { authClient };
