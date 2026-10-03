/**
 * Global test environment setup for Cloudflare Worker & Web standard APIs.
 */
if (!global.crypto || !global.crypto.subtle) {
  global.crypto = require('crypto').webcrypto;
}

require('./mockDO.js');
