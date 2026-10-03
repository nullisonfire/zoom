require('./fixtures/setup.js');
const assert = require('assert');
const { RealtimeService } = require('../dist/worker/realtime.js');

async function runRealtimeTests() {
  console.log('--- Running Cloudflare Realtime SFU & TURN Tests ---');

  // Test 1: Realtime service in local/mock mode (before live credentials)
  console.log('1. Testing Realtime Service Local/Mock Mode...');
  const localService = new RealtimeService({ ENVIRONMENT: 'development' });
  assert.strictEqual(localService.isConfigured, false);

  const localSession = await localService.createSession();
  assert(localSession.sessionId.startsWith('calls-sess-'), 'Must return valid session format');

  const turnCreds = await localService.getTurnCredentials(86400);
  assert(Array.isArray(turnCreds.iceServers), 'Must return iceServers array');
  assert(turnCreds.iceServers.length > 0, 'Must have at least one STUN/TURN server');
  assert.strictEqual(turnCreds.ttl, 86400);
  console.log('   ✓ Local development mode session & TURN credentials passed');

  // Test 2: Realtime track registration payload validation
  console.log('2. Testing Calls Track Registration Protocol...');
  const tracksResult = await localService.newTracks(localSession.sessionId, {
    sessionDescription: {
      sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=Test\r\nt=0 0\r\na=sendrecv\r\n',
      type: 'offer',
    },
    tracks: [
      { location: 'local', mid: '0', trackName: 'audio' },
      { location: 'local', mid: '1', trackName: 'video' },
    ],
  });

  assert(tracksResult.sessionDescription, 'Must return answer sessionDescription');
  assert.strictEqual(tracksResult.sessionDescription.type, 'answer');
  assert.strictEqual(tracksResult.tracks.length, 2);
  assert.strictEqual(tracksResult.tracks[0].trackName, 'audio');
  assert.strictEqual(tracksResult.tracks[1].trackName, 'video');
  console.log('   ✓ Calls track registration protocol passed');

  // Test 3: Calls configured mode headers and endpoint verification
  console.log('3. Testing Production Calls Endpoint Construction...');
  const prodService = new RealtimeService({
    ENVIRONMENT: 'production',
    CALLS_APP_ID: 'cf-app-123456',
    CALLS_APP_SECRET: 'cf-secret-token-789',
  });
  assert.strictEqual(prodService.isConfigured, true);
  assert.strictEqual(prodService.baseUrl, 'https://rtc.live.cloudflare.com/v1/apps/cf-app-123456');
  console.log('   ✓ Production Calls endpoint verification passed');

  console.log(' Cloudflare Realtime SFU & TURN Tests: ALL PASSED\n');
}

if (require.main === module) {
  runRealtimeTests().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runRealtimeTests };
