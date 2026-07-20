'use strict';
// PreToolUse hook on Bash: blocks clearly destructive commands.
const { readStdin, redact, appendLog, out, deny } = require('./common');

const RULES = [
  { re: /\bgit\s+push\s+(?:--force\b|--force-with-lease\b|-f\b)/,
    msg: 'Force-push is blocked by project policy. Use a normal push and coordinate with the team.' },
  { re: /\bgit\s+reset\s+--hard\b/,
    msg: '`git reset --hard` is blocked: it discards uncommitted work and cannot be undone.' },
  { re: /\bgit\s+clean\s+-[a-z]*f[a-z]*/,
    msg: '`git clean -f` is blocked: it permanently deletes untracked files.' },
  { re: /\b(?:rm|del|erase|Remove-Item)\b[^;|&\n]*\.env\b/,
    msg: 'Deleting `.env` is blocked: it is the live, untracked service config and cannot be recovered.' },
  { re: /\brm\s+-[rf]+\s+(?:\/|\~|\.\/?)(?:\s|$)/,
    msg: 'Recursive delete of the filesystem root, home, or current directory is blocked.' },
];

async function main() {
  const raw = await readStdin();
  let input;
  try { input = JSON.parse(raw); } catch (e) { out({}); return; }
  const tool = (input && input.tool_name) || '';
  const cmd = (input && input.tool_input && input.tool_input.command) || '';
  if (tool !== 'Bash' || !cmd) { out({}); return; }

  for (const rule of RULES) {
    if (rule.re.test(cmd)) {
      appendLog({ hook: 'guard', blocked: true, reason: rule.msg, command: redact(cmd).slice(0, 500) });
      deny(rule.msg);
      return;
    }
  }
  appendLog({ hook: 'guard', blocked: false, command: redact(cmd).slice(0, 500) });
  out({});
}
main();
