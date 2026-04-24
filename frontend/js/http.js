import { CONFIG, loadAppBootstrap } from './config.js';
import { authClient } from './auth.js';

async function apiFetch(path, options = {}) {
    await loadAppBootstrap();

    const {
        method = 'GET',
        auth = true,
        headers = {},
        body,
        ...rest
    } = options;

    const requestHeaders = new Headers(headers);

    if (!(body instanceof FormData) && body !== undefined && !requestHeaders.has('Content-Type')) {
        requestHeaders.set('Content-Type', 'application/json');
    }

    if (auth) {
        const token = await authClient.getAccessToken({ allowMissing: true });

        if (token) {
            requestHeaders.set('Authorization', `Bearer ${token}`);
        }
    }

    const response = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
        method,
        headers: requestHeaders,
        body,
        ...rest,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const error = new Error(payload?.error || 'Request failed.');
        error.status = response.status;
        error.details = payload?.details;
        throw error;
    }

    return payload;
}

export { apiFetch };
