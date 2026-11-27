// Craft Prompt: pilihan arahan tim (durasi, gaya visual, suasana, dst.) + Visual Guide + Winning DNA
// disusun jadi satu prompt video. Versi ini draf otomatis (langsung jadi saat Simpan).
// Claude Brain menyempurnakannya di jadwal berikutnya (06/12/18/21 WIB) memakai kuota Claude Pro.

export const CRAFT_OPTIONS = {
  durasi: ["20", "30", "45"],
  gaya_visual: ["Promo bersih (foto produk jadi bintang)", "Teks bergerak (kinetic typography)", "Kartun berwarna cerah",
    "Ilustrasi datar minimalis", "Editorial majalah", "Video asli talent (UGC)"],
  suasana: ["hangat", "edukatif", "ceria", "tenang", "meyakinkan", "energik", "santai"],
  pembuka: ["Pertanyaan yang dekat dengan keseharian", "Situasi sehari-hari", "Fakta singkat yang aman", "Kebiasaan lama vs coba yang baru"],
  bahasa: ["Santai seperti teman", "Hangat untuk keluarga", "Ringkas dan lugas", "Sopan dan rapi"],
  target: ["Lansia", "Ibu dan keluarga", "Pekerja kantoran", "Umum"],
  cta: ["Cek keranjang kuning", "Cek keranjang kuning, ada paket hemat", "Coba dulu, cek keranjang kuning"],
};

const str = (v, n) => String(v ?? "").trim().slice(0, n);
const pick = (v, list) => (list.includes(v) ? v : "");

export function cleanCraft(b = {}) {
  const O = CRAFT_OPTIONS;
  return {
    durasi: pick(String(b.durasi || ""), O.durasi) || "30",
    gaya_visual: pick(b.gaya_visual, O.gaya_visual),
    suasana: (Array.isArray(b.suasana) ? b.suasana : []).filter((x) => O.suasana.includes(x)).slice(0, 3),
    pembuka: pick(b.pembuka, O.pembuka),
    bahasa: pick(b.bahasa, O.bahasa),
    target: pick(b.target, O.target),
    cta: pick(b.cta, O.cta) || O.cta[0],
    catatan: str(b.catatan, 500),
    hindari: str(b.hindari, 500),
  };
}

// "00.03 – 00.10" -> [3, 10]
function parseRange(w) {
  const m = String(w || "").match(/(\d+)[.:](\d+)\s*[–-]\s*(\d+)[.:](\d+)/);
  return m ? [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])] : null;
}
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}.${String(Math.round(s % 60)).padStart(2, "0")}`;

// Waktu adegan diskalakan ke durasi pilihan, 3 detik pertama tetap hook.
function retime(segments, total) {
  const ranges = segments.map((s) => parseRange(s.waktu));
  if (!ranges.length || ranges.some((r) => !r)) return segments.map((s) => `- ${s.waktu}: ${s.visual}`);
  const end = ranges[ranges.length - 1][1] || total;
  const k = total / end;
  return segments.map((s, i) => {
    let [a, b] = ranges[i];
    a = i === 0 ? 0 : Math.round(a * k); b = i === segments.length - 1 ? total : Math.round(b * k);
    if (i === 0) b = Math.max(3, Math.min(b, 3));
    if (i === 1) a = 3;
    return `- ${fmt(a)} – ${fmt(b)}: ${s.visual}`;
  });
}

export function buildCraftPrompt(guide, craft, dna) {
  let segs = [];
  try { segs = JSON.parse(guide.visual_guide_json || "[]"); } catch (_) {}
  const dur = Number(craft.durasi) || 30;
  const isCar = String(guide.format || "").toUpperCase() === "CAR";
  const akun = guide.target_account === "OFFICIAL" ? "akun utama (rapi, branding kuat)"
    : guide.target_account === "MARKETING" ? "akun pemasaran (jualan langsung, keranjang kuning)" : "";
  const L = [];
  L.push(isCar
    ? `Buat carousel TikTok 9:16 (1080x1920) untuk produk ${guide.product_focus || "-"}.`
    : `Buat video vertikal 9:16 (1080x1920) berdurasi ${dur} detik untuk TikTok, produk ${guide.product_focus || "-"}.`);
  L.push(`Konsep: ${guide.title || "-"}. Nama creative: ${guide.creative_name || guide.script_code}.${akun ? ` Untuk ${akun}.` : ""}`);
  if (craft.target) L.push(`Penonton utama: ${craft.target}.`);
  if (craft.gaya_visual) L.push(`Gaya visual: ${craft.gaya_visual}.`);
  if (craft.suasana.length) L.push(`Suasana: ${craft.suasana.join(", ")}.`);
  if (craft.bahasa) L.push(`Gaya bahasa teks dan suara: ${craft.bahasa.toLowerCase()}, bahasa Indonesia sehari-hari.`);
  L.push("");
  L.push(`Pembuka (3 detik pertama): ${craft.pembuka ? craft.pembuka.toLowerCase() + ". " : ""}Harus langsung menghentikan scroll.`);
  if (dna && dna.formula_hook) L.push(`Rumus hook yang terbukti menang (${dna.id}): ${dna.formula_hook}`);
  if (dna && dna.visual_guideline) L.push(`Visual wajib dari Winning DNA: ${dna.visual_guideline}`);
  L.push("");
  L.push(isCar ? "Urutan slide:" : "Urutan adegan:");
  L.push(...(isCar ? segs.map((s) => `- ${s.waktu}: ${s.visual}`) : retime(segs, dur)));
  L.push("");
  L.push(`Penutup: satu ajakan saja, teks "${craft.cta}".`);
  if (craft.catatan) L.push(`Catatan tambahan: ${craft.catatan}`);
  if (guide.creative_guide) L.push(`Catatan syuting: ${guide.creative_guide}`);
  L.push("");
  L.push("Aturan wajib:");
  L.push("- Jangan bilang produk menyembuhkan, mengobati, atau menurunkan gula darah. Pakai kata membantu, mendukung, cocok untuk.");
  L.push("- Label dan kemasan produk harus terbaca jelas. Takarir maksimal 2 baris.");
  if (craft.hindari) L.push(`- Hindari: ${craft.hindari}`);
  return L.join("\n");
}
