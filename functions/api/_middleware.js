// Kunci semua /api/*.
// - Jadwal cloud Claude Brain mengirim header `x-pipeline-secret` (akses penuh).
// - Orang di dashboard login dengan username + password (cookie sesi). Hak lihat toko diatur per user.
import { safeEqual, userFromSession } from "../../lib/auth.js";

const PUBLIC = ["/api/login", "/api/logout"];
// Endpoint penerima data otomatis: hanya jadwal cloud atau owner.
const SYNC = ["/api/ads-sync", "/api/budget-sync", "/api/brain-sync", "/api/scrape", "/api/enrich", "/api/seller-center", "/api/sales-sync"];

export async function onRequest(context) {
  const { request, env, next, data } = context;
  if (request.method === "OPTIONS") return next();
  const path = new URL(request.url).pathname.replace(/\/$/, "");

  const secret = request.headers.get("x-pipeline-secret") || "";
  if (secret && env.PIPELINE_SECRET && safeEqual(secret, env.PIPELINE_SECRET)) {
    data.user = { id: 0, role: "system", name: "Jadwal Cloud", username: "system" };
    return next();
  }
  if (PUBLIC.includes(path)) return next();

  const user = await userFromSession(env, request);
  if (!user) return Response.json({ ok: false, error: "unauthorized", login: true }, { status: 401 });
  if (user.must_change && !["/api/me", "/api/password"].includes(path)) {
    return Response.json({ ok: false, error: "Ganti password dulu", must_change: true }, { status: 403 });
  }
  if (SYNC.includes(path) && user.role !== "owner") {
    return Response.json({ ok: false, error: "Hanya owner atau jadwal cloud" }, { status: 403 });
  }
  data.user = user;
  return next();
}
