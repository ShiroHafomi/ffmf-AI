'use strict';
// PreToolUse / PostToolUse hook on "*": appends an audit line for every tool call.
const { readStdin, redact, appendLog, out } = require('./common');

async function main() {
  const raw = await readStdin();
  let input;
  try { input = JSON.parse(raw); } catch (e) { out({}); return; }
  const event = (input && input.hook_event_name) || 'unknown';
  const tool = (input && input.tool_name) || '';
  const session = (input && input.session_id) || '';
  let cmd = '';
  let inputSummary = '';
  if (input && input.tool_input) {
    if (typeof input.tool_input === 'string') {
      cmd = input.tool_input;
    } else {
      cmd = input.tool_input.command || '';
      const rest = Object.assign({}, input.tool_input);
      delete rest.command;
      try { inputSummary = JSON.stringify(rest); } catch (e) { inputSummary = '[unserializable]'; }
    }
  }
  appendLog({
    hook: 'audit',
    event,
    tool,
    session: session.slice(0, 12),
    command: redact(cmd).slice(0, 500),
    input: redact(inputSummary).slice(0, 300),
  });
  out({});
}
main();
