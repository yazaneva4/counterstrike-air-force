import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('static server rejects encoded sibling traversal and handles malformed paths', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const sibling = await mkdtemp(root.replace(/\/$/, '') + '-');
  await writeFile(path.join(sibling, 'private.txt'), 'must not be served');
  const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: '39317' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`server exited ${code}`))); });
    const get = path => fetch('http://127.0.0.1:39317' + path);
    assert.equal((await get('/')).status, 200);
    assert.equal((await get('/%E0%A4')).status, 400);
    assert.equal((await get('/src')).status, 404);
    assert.equal((await get('/..%2f' + path.basename(sibling) + '/private.txt')).status, 403);
  } finally {
    server.kill();
    await rm(sibling, { recursive: true, force: true });
  }
});
