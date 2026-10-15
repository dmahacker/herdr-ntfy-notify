import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('completion notifications ignore focus, deduplicate, and keep blocked alerts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-ntfy-test-'));
  const messages = [];
  let responseStatus = 200;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (req.method === 'POST') messages.push({ body, headers: req.headers });
      res.writeHead(req.method === 'POST' ? responseStatus : 200).end();
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const cli = path.join(dir, 'herdr');
  fs.writeFileSync(cli, `#!${process.execPath}\nif (process.env.FAKE_API_FAIL) process.exit(1);\nconsole.log(JSON.stringify({result:{agent:JSON.parse(process.env.FAKE_AGENT)}}));\n`);
  fs.chmodSync(cli, 0o700);
  const socket = path.join(dir, 'server.sock');
  fs.writeFileSync(socket, 'test server incarnation');
  const env = {
    ...process.env,
    HERDR_BIN_PATH: cli,
    HERDR_SOCKET_PATH: socket,
    HERDR_PLUGIN_STATE_DIR: path.join(dir, 'state'),
    HERDR_PLUGIN_CONFIG_DIR: path.join(dir, 'config'),
    HERDR_NTFY_LOCAL_URL: url,
    HERDR_NTFY_EXTERNAL_URL: url,
    HERDR_NTFY_TOPIC: 'test-only',
    HERDR_NTFY_BEARER_TOKEN: 'test-token',
    HERDR_NTFY_ENABLED: '1',
    HERDR_PLUGIN_CONTEXT_JSON: '{}',
  };
  const agent = (status, seq = 1, terminal = 'term1') => ({
    terminal_id: terminal, pane_id: 'w1:p1', agent_status: status,
    state_change_seq: seq, completion_seq: ['idle', 'done'].includes(status) ? seq : null,
  });
  async function run(status, live = agent(status), overrides = {}) {
    return exec(process.execPath, ['notify.mjs'], {
      cwd: import.meta.dirname,
      env: {
        ...env,
        HERDR_PLUGIN_EVENT_JSON: JSON.stringify({
          event: 'pane_agent_status_changed',
          data: { pane_id: 'w1:p1', agent_status: status, agent: 'Pi' },
        }),
        FAKE_AGENT: JSON.stringify(live), ...overrides,
      }, timeout: 15000,
    });
  }
  try {
    await run('idle');
    assert.equal(messages.length, 1, 'focused completion must notify');
    assert.equal(messages[0].headers.title, 'Herdr agent done');
    assert.match(messages[0].body, /Pi is done/);
    await run('idle');
    await run('done');
    assert.equal(messages.length, 1, 'same completion must not notify twice');
    await run('done', agent('done', 2));
    await run('idle', agent('idle', 2));
    assert.equal(messages.length, 2, 'background completion and read acknowledgement');
    await run('idle', { ...agent('idle', 3), completion_seq: null });
    await run('working', agent('working', 4));
    await run('idle', agent('working', 4));
    assert.equal(messages.length, 2, 'startup idle and stale completion must not notify');
    await run('blocked', agent('blocked', 5));
    await run('blocked', agent('blocked', 5));
    assert.equal(messages.length, 3, 'blocked metadata updates must not repeat alert');
    assert.equal(messages[2].headers.title, 'Herdr agent needs action');
    await Promise.all(Array.from({ length: 8 }, () => run('idle', agent('idle', 6))));
    assert.equal(messages.length, 4, 'concurrent hooks claim a completion once');
    await run('idle', agent('idle', 6, 'term2'));
    assert.equal(messages.length, 5, 'terminals are independent');
    await run('idle', agent('idle', 7), { HERDR_NTFY_ENABLED: '0' });
    assert.equal(messages.length, 5, 'disabled plugin does not send');
    const failed = await run('idle', agent('idle', 7), { FAKE_API_FAIL: '1' });
    assert.match(failed.stderr, /error/i);
    assert.equal(messages.length, 5, 'API failure must not guess completion');
    responseStatus = 503;
    await run('idle', agent('idle', 7));
    const failures = messages.length;
    responseStatus = 200;
    await run('idle', agent('idle', 7));
    assert.equal(messages.length, failures + 1, 'failed delivery releases claim for retry');
    const socket2 = path.join(dir, 'another-server.sock');
    fs.writeFileSync(socket2, 'another server');
    await run('idle', agent('idle', 7), { HERDR_SOCKET_PATH: socket2 });
    assert.equal(messages.length, failures + 2, 'servers are independent');
    await run('idle', agent('idle', 8), { HERDR_PLUGIN_EVENT_JSON: '{' });
    assert.equal(messages.length, failures + 2, 'invalid JSON does not send');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
