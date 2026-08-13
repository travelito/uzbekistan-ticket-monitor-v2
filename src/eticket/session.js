const logger = require('../utils/logger');

const HOME_URL = 'https://eticket.railway.uz/ru/home';
const CSRF_URL = 'https://eticket.railway.uz/api/v1/csrf-token';
const HTTP_TIMEOUT_MS = 10000;

let session = {
  xsrfToken: null,
  vsId: null,
  cookie: null,
  lastRefreshedAt: null
};

function buildCookie(xsrfToken, vsId) {
  const cookieParts = [];
  if (xsrfToken) cookieParts.push(`XSRF-TOKEN=${xsrfToken}`);
  if (vsId) cookieParts.push(`X-VS-Id=${vsId}`);
  return cookieParts.join('; ');
}

function parseSetCookieHeader(setCookieHeader, name) {
  if (!setCookieHeader) return null;
  const headerValue = Array.isArray(setCookieHeader) ? setCookieHeader.join(', ') : setCookieHeader;
  const regex = new RegExp(`(?:^|,\\s*)${name}=([^;\\s,]+)`, 'i');
  const match = headerValue.match(regex);
  return match ? match[1] : null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const signal = controller.signal;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal
    });

    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHome() {
  const response = await fetchWithTimeout(HOME_URL, {
    method: 'GET',
    headers: {
      Accept: 'text/html'
    }
  });
  if (!response.ok) {
    throw new Error(`Home request failed: HTTP ${response.status}`);
  }
  return response;
}

async function fetchCsrfToken() {
  const response = await fetchWithTimeout(CSRF_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Referer: HOME_URL,
      Origin: 'https://eticket.railway.uz'
    }
  });
  if (!response.ok) {
    throw new Error(`CSRF token request failed: HTTP ${response.status}`);
  }
  return response;
}

function extractCookiesFromResponse(response) {
  const setCookie = response.headers.get('set-cookie');
  const xsrfToken = parseSetCookieHeader(setCookie, 'XSRF-TOKEN');
  const vsId = parseSetCookieHeader(setCookie, 'X-VS-Id');
  return { xsrfToken, vsId };
}

async function refreshSession() {
  logger.info('eticket.session', 'Refreshing Eticket session');

  await fetchHome();
  const csrfResponse = await fetchCsrfToken();
  const { xsrfToken, vsId } = extractCookiesFromResponse(csrfResponse);

  if (!xsrfToken || !vsId) {
    throw new Error('Failed to extract XSRF-TOKEN or X-VS-Id from CSRF response');
  }

  session = {
    xsrfToken,
    vsId,
    cookie: buildCookie(xsrfToken, vsId),
    lastRefreshedAt: new Date().toISOString()
  };

  logger.info('eticket.session', 'Eticket session refreshed', {
    lastRefreshedAt: session.lastRefreshedAt
  });
  return session;
}

function getSession() {
  if (!session.xsrfToken || !session.vsId) {
    throw new Error('Eticket session is not initialized');
  }
  return session;
}

function startSessionRefresher() {
  const intervalMinutes = 10;
  const intervalMs = intervalMinutes * 60 * 1000;

  refreshSession().catch((error) => {
    logger.error('eticket.session', 'Initial Eticket session refresh failed', { message: error.message });
  });

  setInterval(() => {
    refreshSession().catch((error) => {
      logger.error('eticket.session', 'Periodic Eticket session refresh failed', { message: error.message });
    });
  }, intervalMs);
}

module.exports = {
  refreshSession,
  getSession,
  startSessionRefresher
};
