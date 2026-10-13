import { describe, expect, it } from 'vitest';
import { filterProxyHeaders, parsePreviewApiUpstream, previewApiUrl } from '../previewApiProxy';

describe('previewApiProxy restricted origin', () => {
  const origin = 'https://agent-workspace-stage-xyz.a.run.app';
  it('accepts a valid Google Cloud Run HTTPS origin', () => {
    expect(parsePreviewApiUpstream(origin).origin).toBe(origin);
  });
  it.each(['http://example.run.app', 'https://localhost', 'https://127.0.0.1', 'https://evil.com',
    'https://foo.run.app/api', 'https://foo.run.app?x=1', 'https://user:pass@foo.run.app',
    'https://foo.run.app:8443', '//foo.run.app', 'https://foo.run.app.evil.com'])('rejects unsafe upstream %s', (input) => {
    expect(() => parsePreviewApiUpstream(input)).toThrow();
  });
  it('forwards the exact API URL and query', () => {
    const base = parsePreviewApiUpstream(origin);
    expect(previewApiUrl(base, '/api/tasks?status=all').href).toBe(origin + '/api/tasks?status=all');
  });
  it.each(['/tasks', '//attacker.com/api/tasks', '/', '/api2/tasks'])('rejects non-API request %s', (path) => {
    expect(() => previewApiUrl(parsePreviewApiUpstream(origin), path)).toThrow();
  });
  it('forwards authorization but never browser cookies or forwarded identity headers', () => {
    const headers = filterProxyHeaders({ authorization: 'Bearer TEST', cookie: 'session=secret', host: 'evil', 'x-forwarded-for': '1.1.1.1', accept: 'application/json' });
    expect(headers).toEqual({ authorization: 'Bearer TEST', accept: 'application/json' });
  });
  it('does not forward upstream Set-Cookie to the browser', () => {
    expect(filterProxyHeaders({ 'set-cookie': ['x=y'], 'content-type': 'application/json' }, true)).toEqual({ 'content-type': 'application/json' });
  });
});
