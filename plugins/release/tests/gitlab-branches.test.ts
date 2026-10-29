import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitLabAdapter } from '../src/gitlab.js';

describe('GitLab authenticated connection and branch catalog', () => {
  let origin = '';
  const pages: string[] = [];
  let compareResult: unknown = { commits: [{ id: 'b'.repeat(40) }], compare_timeout: false };
  let compareQuery: URLSearchParams;
  const server = createServer((req, res) => {
    if (req.headers['private-token'] !== 'test-only-token') { res.writeHead(401).end('{}'); return; }
    const url = new URL(req.url!, 'http://localhost');
    let value: unknown;
    if (url.pathname === '/api/v4/version') value = { version: '17.0' };
    else if (url.pathname === '/api/v4/user') value = { username: 'dsl-test' };
    else if (url.pathname === '/api/v4/personal_access_tokens/self') value = { scopes: ['api'] };
    else if (url.pathname === '/api/v4/projects/team%2Fproject/repository/compare') {
      compareQuery = url.searchParams;
      value = compareResult;
    }
    else if (url.pathname === '/api/v4/projects/team%2Fproject/repository/branches') {
      pages.push(url.searchParams.get('page')!);
      value = url.searchParams.get('page') === '1'
        ? Array.from({ length: 100 }, (_, i) => ({ name: `feature/${i}`, commit: { id: 'a'.repeat(40) } }))
        : [{ name: 'release/中文', commit: { id: 'b'.repeat(40) } }];
    } else { res.writeHead(404).end('{}'); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
  });
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  it('identifies the account using the configured token', async () => {
    const result = await new GitLabAdapter({ baseUrl: origin, token: 'test-only-token' }).testConnection();
    expect(result.ok).toBe(true); expect(result.account).toBe('dsl-test');
  });
  it('reads every page and preserves branch names and SHA', async () => {
    const refs = await new GitLabAdapter({ baseUrl: origin, token: 'test-only-token' }).listBranches('team/project');
    expect(refs).toHaveLength(101); expect(pages).toEqual(['1', '2']);
    expect(refs[100]).toEqual({ name: 'release/中文', sha: 'b'.repeat(40) });
  });
  it('compares the exact target and source commits using a direct range', async () => {
    const count = await new GitLabAdapter({ baseUrl: origin, token: 'test-only-token' })
      .countAhead('team/project', 'a'.repeat(40), 'b'.repeat(40));
    expect(count).toBe(1);
    expect(Object.fromEntries(compareQuery)).toEqual({ from: 'a'.repeat(40), to: 'b'.repeat(40), straight: 'true' });
  });
  it('does not turn an incomplete comparison into zero changes', async () => {
    const adapter = new GitLabAdapter({ baseUrl: origin, token: 'test-only-token' });
    compareResult = { commits: [], compare_timeout: true };
    await expect(adapter.countAhead('team/project', 'base', 'head')).rejects.toThrow('完整');
    compareResult = {};
    await expect(adapter.countAhead('team/project', 'base', 'head')).rejects.toThrow('完整');
  });
});
