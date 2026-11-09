const TOKEN_KEY = 'hms_token';
let token = localStorage.getItem(TOKEN_KEY);

export function setToken(t) { token = t; localStorage.setItem(TOKEN_KEY, t); }
export function clearToken() { token = null; localStorage.removeItem(TOKEN_KEY); }
export function getToken() { return token; }

export async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    if (res.status === 401 && !path.endsWith('/login')) {
      clearToken();
      window.dispatchEvent(new CustomEvent('hms:unauthorized'));
    }
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

export const GET = p => api('GET', p);
export const POST = (p, b) => api('POST', p, b);
export const PUT = (p, b) => api('PUT', p, b);