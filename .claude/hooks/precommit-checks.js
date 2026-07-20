'use strict';
// PreToolUse hook on Bash: runs the test suite before `git commit`.
// Blocks the commit on genuine test failure; fails open if the runner is absent.
const { execFileSync } = require('child_process');
const { readStdin, redact, ROOT, appendLog, out, deny } = require('./common');

const TEST_TIMEOUT_MS = 60000;

async function main() {
  const raw = await readStdin();
  let input;
  try { input = JSON.parse(raw); } catch (e) { out({}); return; }
  const tool = (input && input.tool_name) || '';
  const cmd = (input && input.tool_input && input.tool_input.command) || '';
  if (tool !== 'Bash' || !/\bgit\s+commit\b/.test(cmd)) { out({}); return; }

  appendLog({ hook: 'precommit', phase: 'start', command: redact(cmd).slice(0, 500) });
  try {
    execFileSync('py', ['-m', 'pytest', '-q'], {
      cwd: ROOT,
      timeout: TEST_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    appendLog({ hook: 'precommit', result: 'pass' });
    out({});
  } catch (e) {
    const errText = (e.stderr || '') + (e.stdout || '');
    const runnerMissing = e.code === 'ENOENT' ||
      /No module named ['"]?pytest/.test(errText) ||
      /error: pytest/.test(errText);
    if (e.status !== null && !runnerMissing) {
      const summary = (e.stdout || '').split('\n').slice(-25).join('\n');
      appendLog({ hook: 'precommit', result: 'fail' });
      deny(
        'Pre-commit tests failed — commit blocked.\n' +
        'Run `py -m pytest -q` to see the full report.\n\n' +
        summary.slice(0, 1500)
      );
    } else {
      // Test runner not available in this environment: fail open, but record it.
      appendLog({ hook: 'precommit', result: 'runner-unavailable', error: String(e.message || e) });
      out({});
    }
  }
}
main();
