"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AuthService = void 0;
exports.buildClearSessionCookie = buildClearSessionCookie;
exports.buildSessionCookie = buildSessionCookie;
exports.generateMeetingPublicId = generateMeetingPublicId;
exports.generateSessionId = generateSessionId;
exports.hashPassword = hashPassword;
exports.parseCookies = parseCookies;
exports.verifyPassword = verifyPassword;
const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const SESSION_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Hash a plaintext password using PBKDF2 with SHA-256 and a cryptographically secure random salt.
 */
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), {
    name: 'PBKDF2'
  }, false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt,
    iterations: PBKDF2_ITERATIONS,
    hash: 'SHA-256'
  }, keyMaterial, KEY_BYTES * 8);
  const saltHex = bufferToHex(salt);
  const hashHex = bufferToHex(new Uint8Array(derivedBits));
  return `pbkdf2:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
}

/**
 * Verify a plaintext password against a stored PBKDF2 hash using constant-time comparison.
 */
async function verifyPassword(password, storedHash) {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
      return false;
    }
    const iterations = parseInt(parts[1], 10);
    const salt = hexToBuffer(parts[2]);
    const originalHash = parts[3];
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), {
      name: 'PBKDF2'
    }, false, ['deriveBits']);
    const derivedBits = await crypto.subtle.deriveBits({
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    }, keyMaterial, KEY_BYTES * 8);
    const calculatedHash = bufferToHex(new Uint8Array(derivedBits));
    return constantTimeEquals(calculatedHash, originalHash);
  } catch (err) {
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeEquals(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
function bufferToHex(buffer) {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Generate a cryptographically random session token (32 bytes hex).
 */
function generateSessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bufferToHex(bytes);
}

/**
 * Generate a secure, user-friendly meeting public ID (e.g. "abc-defg-hij").
 */
function generateMeetingPublicId() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const getRandomChunk = len => {
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes).map(b => chars[b % chars.length]).join('');
  };
  return `${getRandomChunk(3)}-${getRandomChunk(4)}-${getRandomChunk(3)}`;
}

/**
 * Helper to parse cookies from HTTP Cookie header.
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const key = pair.substring(0, idx).trim();
      const val = pair.substring(idx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

/**
 * Construct Set-Cookie header for session.
 */
function buildSessionCookie(sessionId, expiresAt, isProduction) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const secureFlag = isProduction ? '; Secure' : '';
  return `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`;
}

/**
 * Construct Set-Cookie header to clear session.
 */
function buildClearSessionCookie(isProduction) {
  const secureFlag = isProduction ? '; Secure' : '';
  return `session_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`;
}
class AuthService {
  constructor(db, env) {
    this.db = db;
    this.env = env;
  }
  async register(params) {
    const email = params.email.toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('INVALID_EMAIL: Valid email address is required');
    }
    if (!params.password || params.password.length < 8) {
      throw new Error('WEAK_PASSWORD: Password must be at least 8 characters long');
    }
    const name = params.name.trim();
    if (!name || name.length < 2) {
      throw new Error('INVALID_NAME: Name must be at least 2 characters long');
    }
    const existingUser = await this.db.getUserByEmail(email);
    if (existingUser) {
      throw new Error('EMAIL_EXISTS: An account with this email already exists');
    }
    const passwordHash = await hashPassword(params.password);
    const userId = crypto.randomUUID();
    const user = await this.db.createUser({
      id: userId,
      email,
      name,
      password_hash: passwordHash
    });
    const sessionId = generateSessionId();
    const expiresAt = Date.now() + SESSION_EXPIRATION_MS;
    const session = await this.db.createSession({
      id: sessionId,
      user_id: user.id,
      expires_at: expiresAt
    });
    return {
      user,
      session
    };
  }
  async login(params) {
    const email = params.email.toLowerCase().trim();
    const userWithHash = await this.db.getUserByEmail(email);
    if (!userWithHash) {
      throw new Error('INVALID_CREDENTIALS: Incorrect email or password');
    }
    const isValid = await verifyPassword(params.password, userWithHash.password_hash);
    if (!isValid) {
      throw new Error('INVALID_CREDENTIALS: Incorrect email or password');
    }
    const sessionId = generateSessionId();
    const expiresAt = Date.now() + SESSION_EXPIRATION_MS;
    const session = await this.db.createSession({
      id: sessionId,
      user_id: userWithHash.id,
      expires_at: expiresAt
    });
    const {
      password_hash,
      ...user
    } = userWithHash;
    return {
      user,
      session
    };
  }
  async getSession(sessionId) {
    return this.db.getSessionById(sessionId);
  }
  async logout(sessionId) {
    await this.db.deleteSession(sessionId);
  }
}
exports.AuthService = AuthService;