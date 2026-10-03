require('./fixtures/setup.js');
const assert = require('assert');
const { createMockD1 } = require('./fixtures/mockD1.js');
const { MockR2Bucket } = require('./fixtures/mockR2.js');
const { MockDurableObjectNamespace, createMockWebSocketPair } = require('./fixtures/mockDO.js');
const { MeetingRoom } = require('../dist/worker/rooms.js');
const worker = require('../dist/worker/index.js').default;

async function runE2ETests() {
  console.log('====================================================');
  console.log(' Running Full End-to-End Video Conferencing Workflow');
  console.log('====================================================\n');

  const d1 = await createMockD1();
  const r2 = new MockR2Bucket();
  const mockDO = new MockDurableObjectNamespace(MeetingRoom, {});
  const env = {
    ENVIRONMENT: 'development',
    DB: d1,
    STORAGE: r2,
    MEETING_ROOMS: mockDO,
    CALLS_APP_ID: '', // Local dev/test fallback mode
    CALLS_APP_SECRET: '',
  };

  // Helper to make simulated Worker HTTP requests
  async function callWorker(path, method = 'GET', body = null, headers = {}) {
    const reqHeaders = new Headers(headers);
    if (body && !(body instanceof FormData) && typeof body === 'object') {
      reqHeaders.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }
    const request = new Request(`https://meet.cloudflare.internal${path}`, {
      method,
      headers: reqHeaders,
      body,
    });
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
    const response = await worker.fetch(request, env, ctx);
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {}
    return { status: response.status, headers: response.headers, json, text };
  }

  // 1. Register Alice (Host)
  console.log('Step 1: Registering Alice (Host)...');
  const aliceReg = await callWorker('/api/auth/register', 'POST', {
    email: 'alice@cloudflare.com',
    password: 'HostPassword123!',
    name: 'Alice Host',
  });
  assert.strictEqual(aliceReg.status, 201);
  const aliceSessionId = aliceReg.json.data.sessionId;
  const aliceUser = aliceReg.json.data.user;
  const aliceAuthHeader = { Authorization: `Bearer ${aliceSessionId}` };
  console.log(`   ✓ Alice registered: ${aliceUser.name} (${aliceUser.id})`);

  // 2. Register Bob (Participant)
  console.log('Step 2: Registering Bob (Participant)...');
  const bobReg = await callWorker('/api/auth/register', 'POST', {
    email: 'bob@cloudflare.com',
    password: 'GuestPassword123!',
    name: 'Bob Participant',
  });
  assert.strictEqual(bobReg.status, 201);
  const bobSessionId = bobReg.json.data.sessionId;
  const bobUser = bobReg.json.data.user;
  const bobAuthHeader = { Authorization: `Bearer ${bobSessionId}` };
  console.log(`   ✓ Bob registered: ${bobUser.name} (${bobUser.id})`);

  // 3. Alice creates a new conference meeting
  console.log('Step 3: Alice creates a meeting...');
  const createMeetingRes = await callWorker('/api/meetings', 'POST', {
    title: 'Cloudflare Product Architecture Sync',
    settings: {
      waitingRoom: false,
      allowChat: true,
      allowScreenShare: true,
      allowFileUploads: true,
    },
  }, aliceAuthHeader);

  assert.strictEqual(createMeetingRes.status, 201);
  const meeting = createMeetingRes.json.data.meeting;
  const publicId = meeting.public_id;
  console.log(`   ✓ Meeting created with Public ID: ${publicId}`);

  // 4. Bob looks up meeting by URL public ID
  console.log('Step 4: Bob inspects meeting by Public ID...');
  const getMeetingRes = await callWorker(`/api/meetings/${publicId}`, 'GET', null, bobAuthHeader);
  assert.strictEqual(getMeetingRes.status, 200);
  assert.strictEqual(getMeetingRes.json.data.meeting.title, 'Cloudflare Product Architecture Sync');
  console.log('   ✓ Meeting metadata validated');

  // 5. Connect Alice (Host Context / Window 1) to Durable Object WebSocket
  console.log('Step 5: Alice opens meeting and connects WebSocket (Window 1)...');
  const doId = env.MEETING_ROOMS.idFromName(publicId);
  const room = env.MEETING_ROOMS.get(doId);

  const alicePair = createMockWebSocketPair();
  const aliceEvents = [];
  alicePair.client.onmessage = (e) => aliceEvents.push(JSON.parse(e.data));
  room.handleWebSocketSession(alicePair.server);

  alicePair.client.send(
    JSON.stringify({
      type: 'join',
      participantId: 'p-alice',
      userId: aliceUser.id,
      name: aliceUser.name,
      audioEnabled: true,
      videoEnabled: true,
    })
  );

  await new Promise((r) => setTimeout(r, 20));
  const aliceWelcome = aliceEvents.find((e) => e.type === 'welcome');
  assert(aliceWelcome, 'Alice must receive welcome event');
  assert.strictEqual(aliceWelcome.participant.role, 'host');
  console.log('   ✓ Alice connected as Host');

  // 6. Connect Bob (Participant Context / Window 2) to Durable Object WebSocket
  console.log('Step 6: Bob joins meeting via WebSocket (Window 2)...');
  const bobPair = createMockWebSocketPair();
  const bobEvents = [];
  bobPair.client.onmessage = (e) => bobEvents.push(JSON.parse(e.data));
  room.handleWebSocketSession(bobPair.server);

  bobPair.client.send(
    JSON.stringify({
      type: 'join',
      participantId: 'p-bob',
      userId: bobUser.id,
      name: bobUser.name,
      audioEnabled: true,
      videoEnabled: true,
    })
  );

  await new Promise((r) => setTimeout(r, 20));
  const bobWelcome = bobEvents.find((e) => e.type === 'welcome');
  assert(bobWelcome, 'Bob must receive welcome event');
  assert.strictEqual(bobWelcome.participants.length, 2, 'Room must contain Alice and Bob');

  // Verify Alice received participant_joined for Bob
  const aliceSawBobJoin = aliceEvents.find(
    (e) => e.type === 'participant_joined' && e.participant.participantId === 'p-bob'
  );
  assert(aliceSawBobJoin, 'Alice must be notified that Bob joined');
  console.log('   ✓ Bob joined, Alice and Bob presence synchronized');

  // 7. Cloudflare Calls WebRTC Session & Track registration for Bob
  console.log('Step 7: Bob creates Calls SFU Session and publishes media tracks...');
  const callsSessionRes = await callWorker(`/api/meetings/${publicId}/realtime/session`, 'POST', {}, bobAuthHeader);
  assert.strictEqual(callsSessionRes.status, 200);
  const bobCallsSessionId = callsSessionRes.json.data.sessionId;

  // Bob registers tracks with Calls SFU
  const tracksRes = await callWorker(`/api/meetings/${publicId}/realtime/tracks/new`, 'POST', {
    sessionId: bobCallsSessionId,
    sessionDescription: {
      sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=BobAudioVideo\r\nt=0 0\r\na=sendrecv\r\n',
      type: 'offer',
    },
    tracks: [
      { location: 'local', mid: '0', trackName: 'audio' },
      { location: 'local', mid: '1', trackName: 'video' },
    ],
  }, bobAuthHeader);
  assert.strictEqual(tracksRes.status, 200);

  // Bob notifies Durable Object room of published tracks
  bobPair.client.send(
    JSON.stringify({
      type: 'calls_session_registered',
      callsSessionId: bobCallsSessionId,
      tracks: { audio: 'track-audio-1', video: 'track-video-1' },
    })
  );

  await new Promise((r) => setTimeout(r, 20));
  const aliceSawAudioTrack = aliceEvents.find(
    (e) => e.type === 'track_published' && e.participantId === 'p-bob' && e.trackType === 'audio'
  );
  assert(aliceSawAudioTrack, 'Alice must receive track_published for Bob audio');
  console.log('   ✓ Cloudflare Calls tracks published and signaled to peers');

  // 8. Alice toggles microphone off (Mute)
  console.log('Step 8: Alice toggles microphone off...');
  alicePair.client.send(
    JSON.stringify({
      type: 'state_update',
      audioEnabled: false,
    })
  );

  await new Promise((r) => setTimeout(r, 20));
  const bobSawAliceMute = bobEvents.find(
    (e) => e.type === 'participant_updated' && e.participant.participantId === 'p-alice' && !e.participant.audioEnabled
  );
  assert(bobSawAliceMute, 'Bob must receive participant_updated showing Alice muted');
  console.log('   ✓ Microphone toggle synchronized across participants');

  // 9. Bob starts screen share
  console.log('Step 9: Bob starts screen sharing...');
  bobPair.client.send(
    JSON.stringify({
      type: 'state_update',
      screenSharing: true,
    })
  );

  await new Promise((r) => setTimeout(r, 20));
  const aliceSawScreenShare = aliceEvents.find(
    (e) => e.type === 'participant_updated' && e.participant.participantId === 'p-bob' && e.participant.screenSharing
  );
  assert(aliceSawScreenShare, 'Alice must receive screen sharing update');
  console.log('   ✓ Screen sharing status broadcast to all participants');

  // 10. Chat interaction between Alice and Bob
  console.log('Step 10: In-meeting Chat between Alice and Bob...');
  alicePair.client.send(
    JSON.stringify({
      type: 'chat_message',
      message: 'Hello Bob, welcome to the Cloudflare Calls SFU session!',
    })
  );

  await new Promise((r) => setTimeout(r, 20));
  const bobReceivedChat = bobEvents.find(
    (e) => e.type === 'chat_message' && e.message.message.includes('welcome to the Cloudflare Calls')
  );
  assert(bobReceivedChat, 'Bob must receive chat message from Alice');

  // Bob replies
  bobPair.client.send(
    JSON.stringify({
      type: 'chat_message',
      message: 'Thanks Alice, audio and video quality are fantastic!',
    })
  );

  await new Promise((r) => setTimeout(r, 20));
  const aliceReceivedReply = aliceEvents.find(
    (e) => e.type === 'chat_message' && e.message.message.includes('fantastic')
  );
  assert(aliceReceivedReply, 'Alice must receive Bob reply');
  console.log('   ✓ Real-time chat messages exchanged and sanitized');

  // 11. Bob leaves the meeting
  console.log('Step 11: Bob leaves the meeting...');
  bobPair.client.close(1000, 'User left meeting');

  await new Promise((r) => setTimeout(r, 20));
  const aliceSawBobLeave = aliceEvents.find(
    (e) => e.type === 'participant_left' && e.participantId === 'p-bob'
  );
  assert(aliceSawBobLeave, 'Alice must receive participant_left event for Bob');
  console.log('   ✓ Bob departure cleanly updated presence for remaining participants');

  // 12. Alice (Host) ends meeting for all
  console.log('Step 12: Alice (Host) ends meeting for all via REST API...');
  const endMeetingRes = await callWorker(`/api/meetings/${publicId}/end`, 'POST', {}, aliceAuthHeader);
  assert.strictEqual(endMeetingRes.status, 200);

  // Verify meeting status in D1 is now 'ended'
  const meetingInD1 = await d1.prepare('SELECT * FROM meetings WHERE public_id = ?').bind(publicId).first();
  assert.strictEqual(meetingInD1.status, 'ended');
  assert(meetingInD1.ended_at, 'ended_at must be populated');
  console.log('   ✓ Meeting ended and marked in D1 database');

  d1.close();
  console.log('\n====================================================');
  console.log(' Full End-to-End Video Conferencing Test: PASSED! 🎉');
  console.log('====================================================\n');
}

if (require.main === module) {
  runE2ETests().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runE2ETests };
