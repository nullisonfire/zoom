"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addCorsHeaders = addCorsHeaders;
exports.checkRateLimit = checkRateLimit;
exports.errorResponse = errorResponse;
exports.getOptionalUser = getOptionalUser;
exports.handleCors = handleCors;
exports.jsonResponse = jsonResponse;
exports.requireAuth = requireAuth;
var _auth = require("./auth");
// Rate limiting in-memory bucket (reset per worker instance/isolate)
const rateLimits = new Map();
function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return true;
  }
  if (entry.count >= limit) {
    return false;
  }
  entry.count += 1;
  return true;
}
function jsonResponse(data, status = 200, extraHeaders = {}) {
  const payload = {
    success: true,
    data
  };
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...extraHeaders
    }
  });
}
function errorResponse(code, message, status = 400, extraHeaders = {}) {
  const payload = {
    success: false,
    error: {
      code,
      message
    }
  };
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      ...extraHeaders
    }
  });
}
function handleCors(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400'
      }
    });
  }
  return null;
}
function addCorsHeaders(response, origin) {
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', origin || '*');
  newHeaders.set('Access-Control-Allow-Credentials', 'true');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

/**
 * Extract authenticated user and session from Cookie or Bearer token.
 */
async function getOptionalUser(request, authService) {
  let sessionId = null;

  // 1. Check Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    sessionId = authHeader.substring(7).trim();
  }

  // 2. Check Cookie header
  if (!sessionId) {
    const cookies = (0, _auth.parseCookies)(request.headers.get('Cookie'));
    sessionId = cookies.session_id || null;
  }
  if (!sessionId) return null;
  try {
    return await authService.getSession(sessionId);
  } catch (_) {
    return null;
  }
}

/**
 * Require authenticated user. Throws errorResponse if unauthorized.
 */
async function requireAuth(request, authService) {
  const result = await getOptionalUser(request, authService);
  if (!result) {
    throw new Error('UNAUTHORIZED: Authentication is required');
  }
  return result;
}