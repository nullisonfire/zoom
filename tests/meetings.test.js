require('./fixtures/setup.js');
const assert = require('assert');
const { createMockD1 } = require('./fixtures/mockD1.js');
const { Database } = require('../dist/worker/db.js');
const { AuthService } = require('../dist/worker/auth.js');
const { MeetingService } = require('../dist/worker/meetings.js');
const { MockDurableObjectNamespace } = require('./fixtures/mockDO.js');
const { MeetingRoom } = require('../dist/worker/rooms.js');

async function runMeetingTests() {
  console.log('--- Running Meeting Management & Permissions Tests ---');
  const d1 = await createMockD1();
  const db = new Database(d1);
  const mockDO = new MockDurableObjectNamespace(MeetingRoom, {});
  const env = { ENVIRONMENT: 'test', MEETING_ROOMS: mockDO };

  const authService = new AuthService(db, env);
  const meetingService = new MeetingService(db, env);

  // Setup users
  const { user: host } = await authService.register({
    email: 'host@company.com',
    password: 'Password123!',
    name: 'Meeting Host',
  });

  const { user: participant } = await authService.register({
    email: 'guest@company.com',
    password: 'Password123!',
    name: 'Guest Participant',
  });

  // 1. Create instant meeting
  console.log('1. Testing Meeting Creation...');
  const meeting1 = await meetingService.createMeeting({
    userId: host.id,
    title: 'Design Review',
    settings: {
      waitingRoom: false,
      muteOnJoin: true,
      allowScreenShare: true,
    },
  });

  assert(meeting1.public_id, 'Meeting must have a public ID');
  assert(/^[a-zA-Z0-9_-]+$/.test(meeting1.public_id), 'Public ID must be URL-safe');
  assert.strictEqual(meeting1.status, 'active');
  assert.strictEqual(meeting1.settings.muteOnJoin, true);
  console.log('   ✓ Instant meeting created successfully');

  // 2. Lookup meeting
  console.log('2. Testing Meeting Lookup & Host Detection...');
  const hostView = await meetingService.getMeeting(meeting1.public_id, host.id);
  assert.strictEqual(hostView.is_host, true, 'Host view must identify host');
  assert.strictEqual(hostView.password_hash, null, 'Password hash must never be returned');

  const guestView = await meetingService.getMeeting(meeting1.public_id, participant.id);
  assert.strictEqual(guestView.is_host, false, 'Guest view must identify non-host');
  console.log('   ✓ Meeting lookup and host detection passed');

  // 3. Password-protected meeting
  console.log('3. Testing Password-Protected Meetings...');
  const meeting2 = await meetingService.createMeeting({
    userId: host.id,
    title: 'Secret Board Meeting',
    password: 'Passcode123!',
    settings: {
      waitingRoom: true,
    },
  });

  assert.strictEqual(meeting2.settings.requirePassword, true);

  // Guest attempts to join without password
  await assert.rejects(
    () => meetingService.joinMeeting({ publicId: meeting2.public_id, user: participant }),
    /PASSWORD_REQUIRED/,
    'Must require password if protected'
  );

  // Guest attempts to join with incorrect password
  await assert.rejects(
    () => meetingService.joinMeeting({ publicId: meeting2.public_id, user: participant, password: 'Wrong' }),
    /INVALID_PASSWORD/,
    'Must reject invalid password'
  );

  // Guest joins with correct password
  const joinResult = await meetingService.joinMeeting({
    publicId: meeting2.public_id,
    user: participant,
    password: 'Passcode123!',
  });
  assert.strictEqual(joinResult.role, 'participant');
  assert(joinResult.participantRecordId, 'Must create participant record');
  console.log('   ✓ Password verification passed');

  // 4. Meeting settings updates (Host only)
  console.log('4. Testing Meeting Updates & Authorization...');
  // Non-host attempts to update
  await assert.rejects(
    () =>
      meetingService.updateMeeting({
        publicId: meeting1.public_id,
        userId: participant.id,
        title: 'Hacked Title',
      }),
    /FORBIDDEN/,
    'Non-host cannot update meeting'
  );

  // Host updates title & settings
  const updatedMeeting = await meetingService.updateMeeting({
    publicId: meeting1.public_id,
    userId: host.id,
    title: 'Renamed Meeting',
    settings: { allowChat: false },
  });
  assert.strictEqual(updatedMeeting.title, 'Renamed Meeting');
  assert.strictEqual(updatedMeeting.settings.allowChat, false);
  console.log('   ✓ Authorization for meeting updates passed');

  // 5. Ending meeting
  console.log('5. Testing Meeting Conclude & End State...');
  // Non-host attempts to end
  await assert.rejects(
    () => meetingService.endMeeting(meeting1.public_id, participant.id),
    /FORBIDDEN/,
    'Non-host cannot end meeting'
  );

  // Host ends meeting
  await meetingService.endMeeting(meeting1.public_id, host.id);
  const endedMeeting = await db.getMeetingByPublicId(meeting1.public_id);
  assert.strictEqual(endedMeeting.status, 'ended');
  assert(endedMeeting.ended_at, 'Ended timestamp must be set');

  // No one can join an ended meeting
  await assert.rejects(
    () => meetingService.joinMeeting({ publicId: meeting1.public_id, user: participant }),
    /MEETING_ENDED/,
    'Cannot join ended meeting'
  );
  console.log('   ✓ Meeting ending and status transition passed');

  // 6. User meetings list
  console.log('6. Testing Meeting History Listing...');
  const userMeetings = await meetingService.listUserMeetings(host.id);
  assert(userMeetings.length >= 2, 'Host must see their created meetings');
  console.log('   ✓ Meeting listing passed');

  d1.close();
  console.log(' Meeting Management & Permissions Tests: ALL PASSED\n');
}

if (require.main === module) {
  runMeetingTests().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runMeetingTests };
