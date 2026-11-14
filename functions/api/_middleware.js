// Kunci semua /api/* pakai PIPELINE_SECRET.
// Dashboard mengirim header `x-pipeline-secret` (kode akses yang diisi owner sekali di browser),
// jadwal cloud Claude Brain juga mengirim header yang sama.
export async function onRequest(context) {
  const { request, env, next } = context;
  if (request.method === "OPTIONS") return next();

  const expected = env.PIPELINE_SECRET;
  if (!expected) {
    return Response.json({ ok: false, error: "PIPELINE_SECRET belum diset di Cloudflare." }, { status: 503 });
  }
  const got = request.headers.get("x-pipeline-secret") || "";
  if (!timingSafeEqual(got, expected)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return next();
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
