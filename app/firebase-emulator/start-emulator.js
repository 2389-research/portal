/**
 * Start Firebase emulator for tests
 * This script is used by the test framework to start the Firebase emulator
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

// Use __dirname to get the directory path
// eslint-disable-next-line no-undef
const configPath = path.resolve(__dirname);

// Check if the emulator should be started with UI
const enableUi = process.argv.includes('--ui');

console.log(`Starting Firebase emulator from config at: ${configPath}`);
console.log(`UI enabled: ${enableUi}`);

// Command to start the emulator
const emulatorArgs = [
  'emulators:start',
  '--only',
  'auth,firestore',
  '--project',
  'demo-test-project',
];

// If UI is not enabled, add the --no-ui flag
if (!enableUi) {
  emulatorArgs.push('--no-ui');
}

// Start the emulator process
const emulator = spawn('firebase', emulatorArgs, {
  cwd: configPath,
  stdio: 'inherit',
});

// Handle emulator process events
emulator.on('error', (err) => {
  console.error('Failed to start Firebase emulator:', err);
  process.exit(1);
});

// Handle clean exit
process.on('SIGINT', () => {
  console.log('Stopping Firebase emulator...');
  emulator.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Stopping Firebase emulator...');
  emulator.kill('SIGTERM');
  process.exit(0);
});

emulator.on('exit', (code, signal) => {
  console.log(`Firebase emulator exited with code ${code} and signal ${signal}`);
  if (code !== 0 && !signal) {
    process.exit(code);
  }
});
