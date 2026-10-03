require('./fixtures/setup.js');
const assert = require('assert');
const { createMockD1 } = require('./fixtures/mockD1.js');
const { MockR2Bucket } = require('./fixtures/mockR2.js');
const { Database } = require('../dist/worker/db.js');
const { AuthService } = require('../dist/worker/auth.js');
const { MeetingService } = require('../dist/worker/meetings.js');
const { StorageService } = require('../dist/worker/storage.js');
const { MockDurableObjectNamespace } = require('./fixtures/mockDO.js');
const { MeetingRoom } = require('../dist/worker/rooms.js');

async function runStorageTests() {
  console.log('--- Running Cloudflare R2 Storage Tests ---');
  const d1 = await createMockD1();
  const db = new Database(d1);
  const r2 = new MockR2Bucket();
  const mockDO = new MockDurableObjectNamespace(MeetingRoom, {});
  const env = { ENVIRONMENT: 'test', DB: d1, STORAGE: r2, MEETING_ROOMS: mockDO };

  const authService = new AuthService(db, env);
  const meetingService = new MeetingService(db, env);
  const storageService = new StorageService(db, env);

  const { user } = await authService.register({
    email: 'creator@company.com',
    password: 'Password123!',
    name: 'Asset Creator',
  });

  const meeting = await meetingService.createMeeting({
    userId: user.id,
    title: 'Product Launch Planning',
    settings: {
      allowFileUploads: true,
    },
  });

  // 1. Avatar upload & validation
  console.log('1. Testing Avatar Upload & Validation...');
  // Invalid MIME type
  const badData = new Uint8Array([1, 2, 3, 4]).buffer;
  await assert.rejects(
    () => storageService.uploadAvatar(user.id, badData, 'application/pdf'),
    /INVALID_MIME_TYPE/,
    'Must reject non-image MIME types for avatar'
  );

  // Valid avatar
  const validImageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
  const avatarKey = await storageService.uploadAvatar(user.id, validImageData, 'image/png');
  assert(avatarKey.startsWith(`users/${user.id}/avatar/`), 'Avatar key must follow users/{id}/avatar/ hierarchy');

  // Verify avatar in R2
  const r2Avatar = await storageService.getAvatar(avatarKey);
  assert(r2Avatar, 'Avatar must exist in R2 bucket');
  assert.strictEqual(r2Avatar.size, validImageData.byteLength);

  // Verify user updated in D1
  const updatedUser = await db.getUserById(user.id);
  assert.strictEqual(updatedUser.avatar_key, avatarKey);
  console.log('   ✓ Avatar upload and R2 storage passed');

  // 2. Meeting File Upload
  console.log('2. Testing Meeting File Upload...');
  const fileContent = Buffer.from('Cloudflare Workers & Realtime SFU Architecture Spec');
  const exactArrayBuffer = fileContent.buffer.slice(
    fileContent.byteOffset,
    fileContent.byteOffset + fileContent.byteLength
  );

  const uploadedFile = await storageService.uploadMeetingFile({
    meetingPublicId: meeting.public_id,
    userId: user.id,
    fileName: '../../../dangerous/spec.pdf', // Path traversal attempt
    fileData: exactArrayBuffer,
    mimeType: 'application/pdf',
  });

  assert(uploadedFile.id, 'File must have an ID');
  assert(!uploadedFile.file_name.includes('..'), 'Path traversal characters must be sanitized');
  assert.strictEqual(uploadedFile.file_name, 'spec.pdf');
  assert.strictEqual(uploadedFile.file_size, fileContent.length);
  assert(
    uploadedFile.r2_key.startsWith(`meetings/${meeting.id}/files/`),
    'Meeting file key must follow meetings/{id}/files/ hierarchy'
  );
  console.log('   ✓ Meeting file upload and sanitization passed');

  // 3. Meeting File Listing & Download
  console.log('3. Testing Meeting File Listing & Retrieval...');
  const filesList = await storageService.listMeetingFiles(meeting.public_id);
  assert.strictEqual(filesList.length, 1);
  assert.strictEqual(filesList[0].file_name, 'spec.pdf');

  const { file: fetchedFile, r2Object } = await storageService.getMeetingFile(meeting.public_id, uploadedFile.id);
  assert.strictEqual(fetchedFile.id, uploadedFile.id);
  assert(r2Object, 'R2 object must be returned');

  const downloadedText = await r2Object.text();
  assert.strictEqual(downloadedText, 'Cloudflare Workers & Realtime SFU Architecture Spec');
  console.log('   ✓ Meeting file listing and download passed');

  // 4. File uploads disabled check
  console.log('4. Testing Forbidden Uploads when Meeting Disables Files...');
  const restrictedMeeting = await meetingService.createMeeting({
    userId: user.id,
    title: 'Locked Meeting',
    settings: {
      allowFileUploads: false,
    },
  });

  await assert.rejects(
    () =>
      storageService.uploadMeetingFile({
        meetingPublicId: restrictedMeeting.public_id,
        userId: user.id,
        fileName: 'file.txt',
        fileData: new Uint8Array([1, 2, 3]).buffer,
        mimeType: 'text/plain',
      }),
    /FORBIDDEN/,
    'Must reject file uploads if disabled by meeting settings'
  );
  console.log('   ✓ Forbidden upload enforcement passed');

  d1.close();
  console.log(' Cloudflare R2 Storage Tests: ALL PASSED\n');
}

if (require.main === module) {
  runStorageTests().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runStorageTests };
