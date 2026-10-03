require('./fixtures/setup.js');
const assert = require('assert');
const { createMockD1 } = require('./fixtures/mockD1.js');
const { Database } = require('../dist/worker/db.js');
const {
  AuthService,
  hashPassword,
  verifyPassword,
  parseCookies,
  buildSessionCookie,
  buildClearSessionCookie,
} = require('../dist/worker/auth.js');

async function runAuthTests() {
  console.log('--- Running Authentication & Session Tests ---');
  const d1 = await createMockD1();
  const db = new Database(d1);
  const authService = new AuthService(db, { ENVIRONMENT: 'test' });

  // 1. Password hashing & verification
  console.log('1. Testing PBKDF2 Password Hashing & Constant-time Verification...');
  const password = 'SuperSecretPassword123!';
  const hash = await hashPassword(password);
  assert(hash.startsWith('pbkdf2:100000:'), 'Hash must start with pbkdf2 algorithm & iterations');

  const valid = await verifyPassword(password, hash);
  assert.strictEqual(valid, true, 'Correct password must verify to true');

  const invalid = await verifyPassword('WrongPassword!', hash);
  assert.strictEqual(invalid, false, 'Incorrect password must verify to false');
  console.log('   ✓ Password hashing and verification passed');

  // 2. Registration validation
  console.log('2. Testing Registration & Validations...');
  // Invalid email
  await assert.rejects(
    () => authService.register({ email: 'bad-email', password: 'Password123!', name: 'Alice' }),
    /INVALID_EMAIL/,
    'Should reject invalid email format'
  );

  // Short password
  await assert.rejects(
    () => authService.register({ email: 'alice@example.com', password: 'short', name: 'Alice' }),
    /WEAK_PASSWORD/,
    'Should reject passwords shorter than 8 characters'
  );

  // Valid registration
  const { user: alice, session: session1 } = await authService.register({
    email: 'alice@example.com',
    password: 'Password123!',
    name: 'Alice Johnson',
  });
  assert(alice.id, 'User must have an ID');
  assert.strictEqual(alice.email, 'alice@example.com');
  assert.strictEqual(alice.name, 'Alice Johnson');
  assert(session1.id, 'Session must have an ID');
  console.log('   ✓ Registration validations passed');

  // Duplicate email registration
  await assert.rejects(
    () => authService.register({ email: 'alice@example.com', password: 'AnotherPassword!', name: 'Alice 2' }),
    /EMAIL_EXISTS/,
    'Should reject duplicate email registration'
  );
  console.log('   ✓ Duplicate email protection passed');

  // 3. Login
  console.log('3. Testing Login...');
  // Wrong password
  await assert.rejects(
    () => authService.login({ email: 'alice@example.com', password: 'WrongPassword!' }),
    /INVALID_CREDENTIALS/,
    'Should reject wrong password'
  );

  // Non-existent email
  await assert.rejects(
    () => authService.login({ email: 'bob@example.com', password: 'Password123!' }),
    /INVALID_CREDENTIALS/,
    'Should reject unknown user'
  );

  // Valid login
  const { user: loggedInUser, session: session2 } = await authService.login({
    email: 'alice@example.com',
    password: 'Password123!',
  });
  assert.strictEqual(loggedInUser.id, alice.id);
  assert(session2.id, 'New session must be created on login');
  console.log('   ✓ Login validation passed');

  // 4. Session retrieval & Logout
  console.log('4. Testing Session Lifecycle...');
  const activeSession = await authService.getSession(session2.id);
  assert(activeSession, 'Active session must be retrieved');
  assert.strictEqual(activeSession.user.id, alice.id);

  // Logout
  await authService.logout(session2.id);
  const deletedSession = await authService.getSession(session2.id);
  assert.strictEqual(deletedSession, null, 'Logged out session must not be found');
  console.log('   ✓ Session lifecycle passed');

  // 5. Cookie header parsing and building
  console.log('5. Testing Cookie Serialization & Parsing...');
  const cookieStr = buildSessionCookie('sess123', Date.now() + 3600000, true);
  assert(cookieStr.includes('HttpOnly'), 'Cookie must be HttpOnly');
  assert(cookieStr.includes('SameSite=Lax'), 'Cookie must be SameSite=Lax');
  assert(cookieStr.includes('Secure'), 'Production cookie must be Secure');

  const parsed = parseCookies('session_id=sess123; other=val');
  assert.strictEqual(parsed.session_id, 'sess123');

  const clearCookie = buildClearSessionCookie(true);
  assert(clearCookie.includes('Max-Age=0'), 'Clear cookie must have Max-Age=0');
  console.log('   ✓ Cookie helpers passed');

  d1.close();
  console.log(' Authentication & Session Tests: ALL PASSED\n');
}

if (require.main === module) {
  runAuthTests().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runAuthTests };
