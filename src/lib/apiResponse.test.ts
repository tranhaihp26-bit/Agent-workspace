import { describe, expect, it } from 'vitest';
import { readApiJson } from './apiResponse';

describe('API response contract for authenticated Preview requests', () => {
  it('accepts successful JSON payload', async () => {
    const payload = await readApiJson<{ tasks: unknown[] }>(new Response(JSON.stringify({ tasks: [] }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }), '/api/tasks');
    expect(payload.tasks).toEqual([]);
  });
  it('rejects HTML SPA fallback instead of treating it as empty tasks', async () => {
    await expect(readApiJson(new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } }), '/api/tasks')).rejects.toThrow('API_NON_JSON_RESPONSE');
  });
  it('rejects iframe login redirects delivered as HTML', async () => {
    await expect(readApiJson(new Response('<html>sign in</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }), '/api/modules')).rejects.toThrow('API_NON_JSON_RESPONSE');
  });
  it('reports 503 JSON error without exposing remote details', async () => {
    const response = new Response(JSON.stringify({ error: 'secret-token', code: 'PERSISTENCE_UNAVAILABLE' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    await expect(readApiJson(response, '/api/modules')).rejects.toThrow('HTTP 503, code PERSISTENCE_UNAVAILABLE');
  });
  it('rejects malformed application/json', async () => {
    await expect(readApiJson(new Response('{broken', { status: 200, headers: { 'Content-Type': 'application/json' } }), '/api/tasks')).rejects.toThrow('API_INVALID_JSON');
  });
  it('rejects missing Content-Type', async () => {
    await expect(readApiJson(new Response('data', { status: 200 }), '/api/tasks')).rejects.toThrow('API_NON_JSON_RESPONSE');
  });
  it('accepts problem+json and rejects JSON error status', async () => {
    const response = new Response('{}', { status: 401, headers: { 'Content-Type': 'application/problem+json' } });
    await expect(readApiJson(response, '/api/tasks')).rejects.toThrow('HTTP 401');
  });
});
