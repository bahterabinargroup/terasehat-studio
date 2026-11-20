// Login dashboard: password PBKDF2 + sesi cookie. Dipakai middleware dan endpoint /api/login, /api/me, dll.

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export function randomHex(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return hex(a);
}

export async function sha256hex(s) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

export async function hashPassword(password, saltHex) {
  const salt = saltHex || randomHex(16);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return { hash: hex(bits), salt };
}

export function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const COOKIE = "ts_session";
export const SESSION_DAYS = 30;

export function readCookie(request, name) {
  const c = request.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : "";
}

export function sessionCookie(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, name: u.name, role: u.role, stores: storeList(u), must_change: !!u.must_change };
}

// Daftar kode toko yang boleh dilihat. null = semua toko.
export function storeList(u) {
  if (!u) return [];
  if (["system", "owner", "spv"].includes(u.role)) return null;
  return String(u.stores || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
}

export function canSeeStore(u, code) {
  const l = storeList(u);
  return l === null || l.includes(String(code || "").toUpperCase());
}

export async function userFromSession(env, request) {
  const token = readCookie(request, COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(`
    SELECT u.*, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?1 AND s.expires_at > datetime('now') AND u.active = 1
  `).bind(await sha256hex(token)).first();
  return row || null;
}
