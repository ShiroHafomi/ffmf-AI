'use strict';
// Shared helpers for Claude Code hook scripts (run via node).
const fs = require('fs');
const path = require('path');

const HOOKS_DIR = __dirname;
const ROOT = path.resolve(HOOKS_DIR, '..', '..'); // D:/backend AI
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'hooks.log');

// Read the JSON payload Claude Code pipes to the hook on stdin.
// Resolves even if stdin is a TTY or never closes, so a hook can never hang.
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    if (process.stdin.isTTY) { finish(''); return; }
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => { data += c; });
      process.stdin.on('end', () => finish(data));
      process.stdin.on('error', () => finish(data));
    } catch (e) { finish(''); }
    setTimeout(() => finish(data), 3000); // safety net
  });
}

// Redact likely secrets before anything is written to the log file.
function redact(s) {
  if (typeof s !== 'string') s = String(s == null ? '' : s);
  return s
    .replace(/X-API-Key:\s*\S+/gi, 'X-API-Key: [REDACTED]')
    .replace(/Authorization:\s*\S+/gi, 'Authorization: [REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, 'Bearer [REDACTED]')
    .replace(/(api[_-]?key|token|secret|password|passwd|db_password)(\s*[:=]\s*["']?)[^\s"',]+/gi, '$1$2[REDACTED]');
}

function ensureLogDir() {
  try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) {}
}

function appendLog(obj) {
  ensureLogDir();
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n';
  try {
    let size = 0;
    try { size = fs.statSync(LOG_FILE).size; } catch (e) {}
    if (size > 2 * 1024 * 1024) { // trim to last ~500 lines if > 2MB
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n');
      fs.writeFileSync(LOG_FILE, lines.slice(-500).join('\n') + '\n');
    }
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {}
}

// Write the single JSON object the harness expects on stdout.
function out(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// Deny a PreToolUse request with a human-readable reason.
function deny(reason) {
  out({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}

module.exports = { ROOT, LOG_DIR, LOG_FILE, readStdin, redact, appendLog, out, deny };
