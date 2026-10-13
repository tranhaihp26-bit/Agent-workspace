/**
 * Optional AI Studio Preview -> dedicated backend HTTP adapter.
 *
 * REUSE: forwards the unchanged /api contract to the canonical Express/ADK
 * backend. There is no new persistence, no Firebase Admin credential, and no
 * duplicate business implementation here.
 *
 * Enable ONLY by explicitly setting AW_PREVIEW_API_UPSTREAM to a trusted,
 * separately deployed Cloud Run HTTPS service URL. Disabled by default.
 */
import https from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import type { RequestHandler } from 'express';

const hopByHop = new Set([
  'host', 'connection', 'keep-alive', 'proxy-authorization', 'proxy-authenticate',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'http2-settings',
]);
const discardRequest = new Set([
  ...hopByHop, 'cookie', 'forwarded', 'x-forwarded-for',
  'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip',
]);
const discardResponse = new Set([...hopByHop, 'set-cookie']);

export function parsePreviewApiUpstream(value: string): URL {
  let target: URL;
  try { target = new URL(value); } catch { throw new Error('AW_PREVIEW_API_UPSTREAM must be an absolute HTTPS Cloud Run URL.'); }
  if (target.protocol !== 'https:' || target.username || target.password ||
      target.pathname !== '/' || target.search || target.hash || target.port ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/.test(target.hostname)) {
    throw new Error('AW_PREVIEW_API_UPSTREAM must be an origin-only HTTPS *.run.app URL.');
  }
  return target;
}

export function filterProxyHeaders(headers: IncomingHttpHeaders, response = false): IncomingHttpHeaders {
  const forbidden = response ? discardResponse : discardRequest;
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !forbidden.has(name.toLowerCase())));
}

export function previewApiUrl(base: URL, originalUrl: string): URL {
  if (!/^\/api(?:\/|\?|$)/.test(originalUrl)) {
    throw new Error('Preview API proxy only accepts /api paths.');
  }
  // Original URL must begin with /api: it cannot introduce a //host override.
  const target = new URL(originalUrl, base);
  if (target.origin !== base.origin) throw new Error('Preview API proxy target is not allowed.');
  return target;
}

/** Only the configured upstream is reachable; no user-controlled proxy target. */
export function createPreviewApiProxy(upstream: string): RequestHandler {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The Preview API proxy must not run in production.');
  }
  const base = parsePreviewApiUpstream(upstream);
  return (req, res) => {
    if (req.hostname.toLowerCase() === base.hostname) {
      return res.status(502).json({ code: 'API_PROXY_LOOP', error: 'Preview backend routing misconfigured.' });
    }
    let target: URL;
    try { target = previewApiUrl(base, req.originalUrl); }
    catch { return res.status(400).json({ code: 'API_PROXY_INVALID_PATH', error: 'Invalid API request.' }); }

    const headers = filterProxyHeaders(req.headers);
    // No Cookie forwarding: Firebase Authorization bearer is sent unchanged.
    const upstreamRequest = https.request(target, { method: req.method, headers }, (upstreamResponse) => {
      if (res.writableEnded) { upstreamResponse.destroy(); return; }
      const responseHeaders = filterProxyHeaders(upstreamResponse.headers, true);
      res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      // Preserve streaming/SSE and binary attachments without buffering.
      upstreamResponse.pipe(res);
    });
    upstreamRequest.on('error', () => {
      if (!res.headersSent) return res.status(502).json({ code: 'API_PROXY_UPSTREAM_UNAVAILABLE', error: 'Dedicated API backend unavailable.' });
      res.destroy();
    });
    req.on('aborted', () => upstreamRequest.destroy());
    res.on('close', () => { if (!res.writableEnded) upstreamRequest.destroy(); });
    req.pipe(upstreamRequest);
  };
}
