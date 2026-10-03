require('./fixtures/setup.js');
const assert = require('assert');
const { MeetingRoom } = require('../dist/worker/rooms.js');
const { createMockWebSocketPair } = require('./fixtures/mockDO.js');

async function runRoomTests() {
  console.log('--- Running Durable Object Room State & Coordination Tests ---');

  const mockState = { id: { toString: () => 'do-room-test' }, storage: new Map() };
  const env = { ENVIRONMENT: 'test' };
  const room = new MeetingRoom(mockState, env);

  // 1. Initialize room
  console.log('1. Testing Room Initialization...');
  const initRes = await room.fetch(
    new Request('https://room.internal/init', {
      method: 'POST',
      body: JSON.stringify({
        publicId: 'test-room-1',
        title: 'Team Standup',
        hostUserId: 'host-1',
        settings: {
          waitingRoom: true,
          muteOnJoin: false,
          allowChat: true,
        },
      }),
    })
  );
  assert.strictEqual(initRes.status, 200);
  console.log('   ✓ Room initialized');

  // Helper to connect a client WebSocket to room
  async function connectClient() {
    const pair = createMockWebSocketPair();
    const client = pair.client;
    const server = pair.server;

    // Simulate upgrade request
    const upgradeReq = new Request('https://room.internal/websocket', {
      headers: { Upgrade: 'websocket' },
    });
    // In our DO, fetch returns { webSocket: client } and attaches to server
    // We directly pass the server socket into room's private handler via fetch
    // To test with MockWebSocket:
    await room.fetch(upgradeReq);

    // Let's hook pair.server into room's internal handleWebSocketSession
    room.handleWebSocketSession(server);

    return { client, server };
  }

  // 2. Host joins room
  console.log('2. Testing Host Join...');
  const hostMessages = [];
  const hostPair = createMockWebSocketPair();
  hostPair.client.onmessage = (event) => {
    hostMessages.push(JSON.parse(event.data));
  };
  room.handleWebSocketSession(hostPair.server);

  hostPair.client.send(
    JSON.stringify({
      type: 'join',
      participantId: 'p-host',
      userId: 'host-1',
      name: 'Host Alice',
      audioEnabled: true,
      videoEnabled: true,
    })
  );

  await new Promise((r) => setTimeout(r, 20));

  const welcome = hostMessages.find((m) => m.type === 'welcome');
  assert(welcome, 'Host must receive welcome message');
  assert.strictEqual(welcome.participant.role, 'host');
  assert.strictEqual(welcome.participant.name, 'Host Alice');
  console.log('   ✓ Host joined and received welcome state');

  // 3. Guest joins when waiting room is active
  console.log('3. Testing Waiting Room / Lobby Admission...');
  const guestMessages = [];
  const guestPair = createMockWebSocketPair();
  guestPair.client.onmessage = (event) => {
    guestMessages.push(JSON.parse(event.data));
  };
  room.handleWebSocketSession(guestPair.server);

  guestPair.client.send(
    JSON.stringify({
      type: 'join',
      participantId: 'p-guest',
      userId: 'guest-2',
      name: 'Guest Bob',
      audioEnabled: true,
      videoEnabled: true,
    })
  );

  await new Promise((r) => setTimeout(r, 20));

  const waitingMsg = guestMessages.find((m) => m.type === 'waiting_room');
  assert(waitingMsg, 'Guest must be put into waiting room');

  const hostNotified = hostMessages.find((m) => m.type === 'waiting_participant_joined');
  assert(hostNotified, 'Host must be notified of waiting participant');
  assert.strictEqual(hostNotified.participant.participantId, 'p-guest');

  // Host admits guest
  hostPair.client.send(
    JSON.stringify({
      type: 'admit_participant',
      targetParticipantId: 'p-guest',
    })
  );

  await new Promise((r) => setTimeout(r, 20));

  const admittedMsg = guestMessages.find((m) => m.type === 'admitted');
  assert(admittedMsg, 'Guest must receive admitted message');
  console.log('   ✓ Waiting room admission flow passed');

  // 4. State updates & speaking indicator
  console.log('4. Testing Media State Updates & Broadcast...');
  guestPair.client.send(
    JSON.stringify({
      type: 'state_update',
      speaking: true,
      audioEnabled: true,
    })
  );

  await new Promise((r) => setTimeout(r, 20));
  const updateMsg = hostMessages.find(
    (m) => m.type === 'participant_updated' && m.participant.participantId === 'p-guest' && m.participant.speaking
  );
  assert(updateMsg, 'Host must receive speaking state update');
  console.log('   ✓ Participant state updates broadcast passed');

  // 5. Chat message
  console.log('5. Testing Chat Messaging...');
  guestPair.client.send(
    JSON.stringify({
      type: 'chat_message',
      message: 'Hello everyone!',
    })
  );

  await new Promise((r) => setTimeout(r, 20));
  const chatMsg = hostMessages.find((m) => m.type === 'chat_message' && m.message.message === 'Hello everyone!');
  assert(chatMsg, 'Chat message must be broadcast to host');
  assert.strictEqual(chatMsg.message.senderName, 'Guest Bob');
  console.log('   ✓ Chat messaging passed');

  // 6. Host mutes participant
  console.log('6. Testing Host Mute Control...');
  hostPair.client.send(
    JSON.stringify({
      type: 'mute_participant',
      targetParticipantId: 'p-guest',
    })
  );

  await new Promise((r) => setTimeout(r, 20));
  const mutedMsg = guestMessages.find((m) => m.type === 'host_muted_you');
  assert(mutedMsg, 'Guest must receive host_muted_you signal');
  console.log('   ✓ Host mute control passed');

  // 7. Host removes participant
  console.log('7. Testing Host Remove Control...');
  hostPair.client.send(
    JSON.stringify({
      type: 'remove_participant',
      targetParticipantId: 'p-guest',
    })
  );

  await new Promise((r) => setTimeout(r, 20));
  const removedMsg = guestMessages.find((m) => m.type === 'removed_by_host');
  assert(removedMsg, 'Guest must receive removed_by_host notification');
  assert.strictEqual(guestPair.client.readyState, 3, 'Guest socket must be closed');
  console.log('   ✓ Host remove control passed');

  // 8. Host ends meeting
  console.log('8. Testing Host End Meeting for All...');
  hostPair.client.send(
    JSON.stringify({
      type: 'end_meeting',
    })
  );

  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(hostPair.client.readyState, 3, 'Host socket must be closed when meeting ends');
  console.log('   ✓ Host end meeting passed');

  console.log(' Durable Object Room State Tests: ALL PASSED\n');
}

if (require.main === module) {
  runRoomTests().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runRoomTests };
