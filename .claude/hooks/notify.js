'use strict';
// Stop / Notification hook: logs the event and fires a best-effort Windows toast.
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { readStdin, redact, LOG_DIR, appendLog, out } = require('./common');

// Best-effort Windows toast via BurntToast. Silently ignored if unavailable.
function toast(title, message) {
  const ps = [
    "Import-Module BurntToast -ErrorAction SilentlyContinue",
    "if (Get-Command New-BurntToastNotification -ErrorAction SilentlyContinue) {",
    "  New-BurntToastNotification -Text @('" + String(title).replace(/'/g, "''") + "', '" + String(message).replace(/'/g, "''").slice(0, 200) + "')",
    "}",
  ].join('\n');
  const tmp = path.join(LOG_DIR, 'toast.ps1');
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(tmp, ps);
    exec('powershell -NoProfile -ExecutionPolicy Bypass -File "' + tmp + '"', { windowsHide: true }, () => {});
  } catch (e) {}
}

async function main() {
  const event = process.argv[2] || 'unknown';
  const raw = await readStdin();
  let input = {};
  try { input = JSON.parse(raw); } catch (e) {}
  const session = (input && input.session_id) || '';
  let detail = '';
  if (input && input.tool_input) {
    detail = typeof input.tool_input === 'string' ? input.tool_input : JSON.stringify(input.tool_input);
  }
  appendLog({ hook: 'notify', event, session: session.slice(0, 12), detail: redact(detail).slice(0, 300) });

  if (event === 'Stop') {
    toast('Claude Code', 'Session stopped' + (detail ? ': ' + detail : ''));
  } else if (event === 'Notification') {
    toast('Claude Code', detail || 'Notification');
  }
  out({});
}
main();
