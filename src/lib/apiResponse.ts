/**
 * Read a JSON API response without accepting a Vite/iframe HTML fallback as data.
 * This is a response-contract check, not an alternative persistence mechanism.
 */
export async function readApiJson<T>(response: Response, endpoint: string): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const jsonType = /^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|\s*$)/i;
  if (!jsonType.test(contentType)) {
    throw new Error(`[API_NON_JSON_RESPONSE] ${endpoint}: HTTP ${response.status}, Content-Type ${contentType || 'missing'}. Verify Preview /api routing and authentication redirects.`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`[API_INVALID_JSON] ${endpoint}: HTTP ${response.status}. The server did not return valid JSON.`);
  }

  if (!response.ok) {
    // Intentionally avoid including remote error messages, tokens or response bodies in logs.
    const payload = data && typeof data === 'object' ? data as Record<string, unknown> : null;
    const code = payload && typeof payload.code === 'string' && /^[A-Z_]{1,64}$/.test(payload.code) ? payload.code : 'REQUEST_FAILED';
    throw new Error(`[API_HTTP_ERROR] ${endpoint}: HTTP ${response.status}, code ${code}.`);
  }

  return data as T;
}
