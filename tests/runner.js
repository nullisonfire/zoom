require('./fixtures/setup.js');
const { runAuthTests } = require('./auth.test.js');
const { runMeetingTests } = require('./meetings.test.js');
const { runRoomTests } = require('./rooms.test.js');
const { runRealtimeTests } = require('./realtime.test.js');
const { runStorageTests } = require('./storage.test.js');
const { runE2ETests } = require('./e2e.test.js');

async function runAllSuites() {
  console.log('====================================================');
  console.log(' CLOUDFLARE MEET: COMPREHENSIVE TEST SUITE RUNNER  ');
  console.log('====================================================\n');

  const startTime = Date.now();

  try {
    await runAuthTests();
    await runMeetingTests();
    await runRoomTests();
    await runRealtimeTests();
    await runStorageTests();
    await runE2ETests();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`====================================================`);
    console.log(` ALL TEST SUITES PASSED SUCCESSFULLY in ${elapsed}s! ✨`);
    console.log(`====================================================\n`);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
  }
}

runAllSuites();
