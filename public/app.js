(function () {
  const EMPTY = { contents_ads: [], winning_dna: [], scripts_briefs: [], daily_checklists: [], competitor_radar: [] };

  const state = {
    tab: "overview",
    tierFilter: "ALL",
    data: JSON.parse(JSON.stringify(EMPTY)),
    loading: true
  };

  // Data dulu disimpan di browser; sekarang selalu dari database Cloudflare D1.
  try { localStorage.removeItem("TERASEHAT_STATE_V1"); } catch (_) {}
  function persist() {}

  function getSecret() {
    try { return localStorage.getItem("TERASEHAT_SECRET") || ""; } catch (_) { return ""; }
  }
  function askSecret(msg) {
    const v = window.prompt(msg || "Masukkan kode akses dashboard Terasehat:");
    if (v) { try { localStorage.setItem("TERASEHAT_SECRET", v.trim()); } catch (_) {} }
    return v;
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", "x-pipeline-secret": getSecret() },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) {
      if (askSecret("Kode akses salah atau belum diisi. Masukkan kode akses dashboard:")) return api(path, body);
      throw new Error("Kode akses diperlukan");
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.error || ("HTTP " + res.status));
    return json;
  }

  function parseJsonArr(v) {
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(v || "[]"); return Array.isArray(p) ? p : []; } catch (_) { return []; }
  }

  async function loadState() {
    state.loading = true;
    try {
      if (!getSecret()) askSecret();
      const d = await api("/api/state");
      Object.keys(EMPTY).forEach(k => { state.data[k] = d[k] || []; });
      state.error = "";
    } catch (e) {
      state.error = e.message;
    }
    state.loading = false;
    render();
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const fmt = (n) => Number(n || 0).toLocaleString("id-ID");
  const rp = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");

  function tierBadge(tier, score) {
    if (tier === "WINNING" || score >= 75) {
      return `<span class="badge badge-fyp">WINNING (Skor ${score}/100)</span>`;
    }
    if (tier === "POTENSIAL" || score >= 45) {
      return `<span class="badge badge-mid">POTENSIAL (Skor ${score}/100)</span>`;
    }
    return `<span class="badge badge-low">BONCOS (Skor ${score}/100)</span>`;
  }

  function humanBadge(status) {
    if (status === "approved") return `<span class="badge badge-fyp">Approved</span>`;
    if (status === "revision") return `<span class="badge badge-low">Perlu revisi</span>`;
    if (status === "published") return `<span class="badge badge-purple">Sudah tayang</span>`;
    return `<span class="badge badge-mid">Menunggu review</span>`;
  }

  function updateSidebarBadges() {
    const ads = state.data.contents_ads || [];
    const scripts = state.data.scripts_briefs || [];
    const chks = (state.data.daily_checklists || []).filter(c => !c.is_done);
    document.getElementById("badge-ads-count").textContent = ads.length;
    document.getElementById("badge-script-count").textContent = scripts.length;
    document.getElementById("badge-chk-count").textContent = chks.length + " Aktif";
  }

  // 1. OVERVIEW PIPELINE (Diagram Alur Gambar 2 + KPI Toko Terasehat)
  function renderOverview() {
    const ads = [...(state.data.contents_ads || [])].sort((a, b) => b.total_score - a.total_score);
    const totalGmv = ads.reduce((s, a) => s + Number(a.gmv_idr || 0), 0);
    const totalSpend = ads.reduce((s, a) => s + Number(a.ad_spend_idr || 0), 0);
    const totalOrders = ads.reduce((s, a) => s + Number(a.orders || 0), 0);
    const totalViews = ads.reduce((s, a) => s + Number(a.views || 0), 0);
    const roas = totalSpend > 0 ? (totalGmv / totalSpend).toFixed(2) : "0.00";
    const winningCount = ads.filter(a => a.rank_tier === "WINNING").length;
    const waitingScripts = (state.data.scripts_briefs || []).filter(s => s.human_status === "waiting_check").length;

    const top3Html = ads.slice(0, 3).map((a, idx) => `
      <div style="padding:12px 14px;background:var(--l2);border-radius:var(--r-sm);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-weight:600">#${idx + 1}</span>
            <span class="badge badge-purple">${a.script_code}</span>
            ${tierBadge(a.rank_tier, a.total_score)}
            <span style="font-size:11.5px;color:var(--teks3)">👤 ${a.creator_name}</span>
          </div>
          <div style="font-weight:600;font-size:13.5px;margin-bottom:3px">${a.title}</div>
          <div style="font-size:12px;color:var(--teks2)">🎙️ Hook 3s: <i>"${a.hook_3s}"</i></div>
        </div>
        <div style="text-align:right;min-width:170px">
          <div style="font-size:18px;font-weight:600;letter-spacing:-0.01em">${rp(a.gmv_idr)}</div>
          <div style="font-size:12px;color:var(--teks2)">ROAS <b>${a.roas}x</b> • ${fmt(a.orders)} pesanan • ${fmt(a.views)} views</div>
        </div>
      </div>
    `).join("");

    return `
      <div class="topbar">
        <div>
          <h1>Dashboard</h1>
          <p>Data Seller Center dan TikTok, dibaca Claude, jadi Visual Guide buat tim kreator.</p>
        </div>
        <div class="topbar-actions">
          <button class="btn" id="btn-open-import">Input data Seller Center</button>
          <button class="btn btn-primary" data-go-tab="scripts">Review ${waitingScripts} Visual Guide</button>
        </div>
      </div>

      <!-- Visualisasi Alur Closed-Loop Sesuai Gambar 2 -->
      <div class="card" style="background:var(--color-surface-alt)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <span class="badge badge-purple">Alur pipeline</span>
          <span style="font-size:12px;color:var(--teks2)">Klik kotak mana saja untuk pindah ke modul terkait</span>
        </div>
        <div class="kpi-grid" style="margin-bottom:0">
          <div class="kpi-card" style="cursor:pointer;border:1px solid var(--garis2)" data-go-tab="radar">
            <div class="kpi-lbl">1. INPUT DATA</div>
            <div style="font-weight:600;font-size:14px;margin-bottom:4px">Seller Center + ScrapeCreators</div>
            <div class="kpi-sub">TikTok Ads Lib • TikTok Shop • Creator Emails</div>
          </div>
          <div class="kpi-card" style="cursor:pointer;border:1px solid var(--garis2)" data-go-tab="dna">
            <div class="kpi-lbl">2. AI AGENT (BRAIN)</div>
            <div style="font-weight:600;font-size:14px;margin-bottom:4px">Claude (Self-Learning)</div>
            <div class="kpi-sub">Find Winning DNA & Evaluasi Algoritma</div>
          </div>
          <div class="kpi-card" style="cursor:pointer;border:1px solid var(--garis2)" data-go-tab="scripts">
            <div class="kpi-lbl">3. BRIEF & REPORT</div>
            <div style="font-weight:600;font-size:14px;margin-bottom:4px">Visual Guide (Check by Human)</div>
            <div class="kpi-sub">Daily Checklist • Creative Guide • Review</div>
          </div>
          <div class="kpi-card" style="cursor:pointer;border:1px solid var(--garis2)" data-go-tab="checklist">
            <div class="kpi-lbl">4. EKSEKUSI TIM</div>
            <div style="font-weight:600;font-size:14px;margin-bottom:4px">Create Manual by Team</div>
            <div class="kpi-sub">Syuting & Edit oleh Tim Kreator Manusia</div>
          </div>
          <div class="kpi-card" style="cursor:pointer;border:1px solid var(--garis2)" data-go-tab="ranking">
            <div class="kpi-lbl">5. OUTPUT & EVALUASI</div>
            <div style="font-weight:600;font-size:14px;margin-bottom:4px;color:var(--naik)">Output (ADS) Ranking</div>
            <div class="kpi-sub">Score Top-to-Bottom → Balik ke Claude Brain</div>
          </div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-lbl">TOTAL GMV (SELLER CENTER)</div>
          <div class="kpi-val" style="color:var(--naik)">${rp(totalGmv)}</div>
          <div class="kpi-sub">📦 <b>${fmt(totalOrders)}</b> pesanan selesai</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-lbl">BIAYA IKLAN (AD SPEND)</div>
          <div class="kpi-val">${rp(totalSpend)}</div>
          <div class="kpi-sub">ROAS Gabungan: <b style="color:var(--lime)">${roas}x</b></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-lbl">TOTAL VIEWS KONTEN</div>
          <div class="kpi-val">${fmt(totalViews)}</div>
          <div class="kpi-sub">Dari ${ads.length} video terdata</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-lbl">RASIO WINNING DNA</div>
          <div class="kpi-val" style="color:var(--naik)">${winningCount} / ${ads.length}</div>
          <div class="kpi-sub">Konten berstatus <b>WINNING (Skor ≥75)</b></div>
        </div>
      </div>

      <div class="card">
        <div class="card-hd">
          <div>
            <h2 class="card-title">Top 3 konten</h2>
            <p class="card-desc">Diurutkan otomatis berdasarkan kombinasi ROAS Seller Center, GMV, Share/Save Ratio, dan Views.</p>
          </div>
          <button class="btn" data-go-tab="ranking">Lihat semua ranking</button>
        </div>
        ${top3Html}
      </div>
    `;
  }

  // 2. OUTPUT (ADS) RESULT & RANKING TOP-TO-BOTTOM
  function renderRanking() {
    let ads = [...(state.data.contents_ads || [])].sort((a, b) => b.total_score - a.total_score);
    if (state.tierFilter !== "ALL") {
      ads = ads.filter(a => a.rank_tier === state.tierFilter);
    }

    const rowsHtml = ads.map((a, idx) => `
      <tr>
        <td style="font-weight:700;color:var(--lime)">#${idx + 1}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span class="badge badge-purple">${a.script_code}</span>
            <b style="color:var(--teks)">${a.title}</b>
          </div>
          <div style="font-size:11.5px;color:var(--teks2)">🎙️ Hook 3s: <i>"${a.hook_3s}"</i></div>
          <div style="font-size:11px;color:var(--teks3);margin-top:3px">👤 ${a.creator_name} • 📅 ${a.published_at} • ⏱️ ${a.duration_s}s</div>
          <div style="font-size:11.5px;color:var(--lime);margin-top:4px">🧠 <b>Evaluasi Claude:</b> ${a.claude_evaluation}</div>
        </td>
        <td>${tierBadge(a.rank_tier, a.total_score)}</td>
        <td class="num" style="font-weight:700;color:var(--naik)">${rp(a.gmv_idr)}</td>
        <td class="num">${rp(a.ad_spend_idr)}</td>
        <td class="num" style="font-weight:700;color:var(--lime)">${a.roas}x</td>
        <td class="num">${fmt(a.orders)}</td>
        <td class="num">${fmt(a.views)}</td>
        <td class="num">${fmt(a.shares)} / ${fmt(a.saves)}</td>
        <td class="num">${a.ctr_pct}%</td>
      </tr>
    `).join("");

    return `
      <div class="topbar">
        <div>
          <h1>Ranking Konten & Iklan</h1>
          <p>Data gabungan Tokopedia/TikTok Shop Seller Center + ScrapeCreators, diurutkan dari skor tertinggi ke terendah untuk dievaluasi Claude.</p>
        </div>
        <div class="topbar-actions">
          <select class="input" id="sel-tier-filter">
            <option value="ALL" ${state.tierFilter === "ALL" ? "selected" : ""}>Semua Tier (${(state.data.contents_ads || []).length})</option>
            <option value="WINNING" ${state.tierFilter === "WINNING" ? "selected" : ""}>WINNING (Skor ≥75)</option>
            <option value="POTENSIAL" ${state.tierFilter === "POTENSIAL" ? "selected" : ""}>POTENSIAL (Skor 45-74)</option>
            <option value="BONCOS" ${state.tierFilter === "BONCOS" ? "selected" : ""}>BONCOS (<45)</option>
          </select>
          <button class="btn btn-primary" id="btn-open-import">Tambah hasil Seller Center</button>
        </div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Konten, Kode Script, Hook 3 Detik, & Evaluasi Claude</th>
                <th>Tier & Total Score</th>
                <th class="num">GMV (Omzet)</th>
                <th class="num">Ad Spend</th>
                <th class="num">ROAS</th>
                <th class="num">Orders</th>
                <th class="num">Views</th>
                <th class="num">Share / Save</th>
                <th class="num">CTR%</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 3. SELF-LEARNING & WINNING DNA (CLAUDE BRAIN)
  function renderDna() {
    const dnas = state.data.winning_dna || [];
    const winPatterns = dnas.filter(d => d.category !== "ANTI_PATTERN");
    const antiPatterns = dnas.filter(d => d.category === "ANTI_PATTERN");

    const winHtml = winPatterns.map(d => `
      <div class="hook-box win" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span class="badge badge-fyp">🧬 ${d.id} • WINNING DNA</span>
          <span style="font-size:12px;color:var(--naik);font-weight:600">Confidence: ${d.confidence_score}%</span>
        </div>
        <h3 style="margin:0 0 6px;font-size:15px">${d.title}</h3>
        <div style="font-size:12.5px;margin-bottom:4px"><b>🎙️ Formula Hook (0–3s):</b> <code>${d.formula_hook}</code></div>
        <div style="font-size:12.5px;margin-bottom:4px"><b>⏱️ Durasi Ideal:</b> ${d.best_duration}</div>
        <div style="font-size:12.5px;margin-bottom:6px"><b>🎬 Aturan Visual Tim:</b> ${d.visual_guideline}</div>
        <div style="font-size:12px;color:var(--naik)">📊 <b>Bukti Data Seller Center:</b> ${d.evidence_summary}</div>
      </div>
    `).join("");

    const antiHtml = antiPatterns.map(d => `
      <div class="hook-box lose" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span class="badge badge-low">🚫 ${d.id} • PANTANGAN (ANTI-PATTERN)</span>
          <span style="font-size:12px;color:var(--turun);font-weight:600">Wajib Dihindari</span>
        </div>
        <h3 style="margin:0 0 6px;font-size:15px">${d.title}</h3>
        <div style="font-size:12.5px;margin-bottom:4px"><b>❌ Pola Gagal:</b> ${d.formula_hook}</div>
        <div style="font-size:12.5px;margin-bottom:6px"><b>🎬 Kesalahan Visual:</b> ${d.visual_guideline}</div>
        <div style="font-size:12px;color:var(--turun)">📉 <b>Bukti Kerugian:</b> ${d.evidence_summary}</div>
      </div>
    `).join("");

    return `
      <div class="topbar">
        <div>
          <h1>Winning DNA</h1>
          <p>Memori pembelajaran otomatis dari perbandingan konten Ranking Teratas (ROAS >5x) vs Konten Boncos di Seller Center Terasehat.</p>
        </div>
        <div class="topbar-actions">
          <button class="btn btn-primary" id="btn-run-self-learning">Jadwal self-learning</button>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h2 class="card-title" style="margin-bottom:12px">Pola yang menang</h2>
          ${winHtml}
        </div>
        <div class="card">
          <h2 class="card-title" style="margin-bottom:12px">Pola yang dihindari</h2>
          ${antiHtml}
          <div style="background:var(--l2);padding:14px;border-radius:var(--r-sm);margin-top:14px">
            <div style="font-weight:600;color:var(--lime);margin-bottom:6px">🤖 Cara Kerja Self-Learning di Laptop Owner:</div>
            <p style="margin:0;font-size:12.5px;color:var(--teks2)">
              Setiap kali data baru dari Seller Center masuk, script <code>agent/garap-terasehat.sh</code> mengirimkan Top 5 Winner & Bottom 5 Boncos ke <b>Claude Pro</b>. Claude mengekstrak pola kalimat & visualnya ke halaman ini, lalu langsung menggunakannya untuk menulis Script baru di tab sebelah.
            </p>
          </div>
        </div>
      </div>
    `;
  }

  // 4. BRIEF & REPORT: SCRIPT (CHECK BY HUMAN) & CREATIVE GUIDE
  function renderScripts() {
    const scripts = state.data.scripts_briefs || [];
    const cardsHtml = scripts.map((s, idx) => {
      const segments = parseJsonArr(s.visual_guide_json);
      if (segments.length) return renderVisualGuideCard(s, idx, segments);
      const hooks = parseJsonArr(s.hook_options_json);
      const hooksHtml = hooks.map((h, i) => `
        <div style="background:var(--l2);padding:9px 12px;border-radius:var(--r-sm);margin-bottom:6px;border-left:3px solid var(--naik)">
          <span style="font-size:11px;color:var(--naik);font-weight:700">OPSI HOOK #${i + 1} (0–3 DETIK PERTAMA):</span>
          <div style="font-weight:600;margin-top:2px">${h}</div>
        </div>
      `).join("");

      return `
        <div class="brief-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px">
            <div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">
                <span class="badge badge-purple">KODE WAJIB CAPTION: #${s.script_code}</span>
                ${humanBadge(s.human_status)}
                <span style="font-size:12px;color:var(--teks3)">👤 PIC: <b>${s.assigned_creator}</b> • 📦 Produk: ${s.product_focus}</span>
              </div>
              <h3 style="margin:0;font-size:16px">${s.title}</h3>
              <div style="font-size:12px;color:var(--lime);margin-top:2px">🧬 Sumber DNA: ${s.based_on_dna}</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-primary" style="height:32px;padding:0 12px;font-size:13px" data-script-act="approved" data-idx="${idx}">Approve</button>
              <button class="btn" style="height:32px;padding:0 12px;font-size:13px" data-script-act="revision" data-idx="${idx}">Minta revisi</button>
              <button class="btn" style="height:32px;padding:0 12px;font-size:13px" data-script-act="published" data-idx="${idx}">Sudah tayang</button>
            </div>
          </div>

          <div style="margin-bottom:12px">
            <div style="font-size:12px;font-weight:600;color:var(--teks2);margin-bottom:6px">🎙️ PILIHAN KALIMAT HOOK 3 DETIK PERTAMA (WAJIB REKAM MINIMAL 2 VARIASI):</div>
            ${hooksHtml}
          </div>

          <div class="grid-2">
            <div style="background:var(--l2);padding:12px 14px;border-radius:var(--r-sm)">
              <div style="font-size:12px;font-weight:600;color:var(--lime);margin-bottom:4px">📜 BODY SCRIPT & CTA KERANJANG KUNING:</div>
              <div style="font-size:12.5px;color:var(--teks);white-space:pre-line;margin-bottom:8px">${s.body_script}</div>
              <div style="border-top:1px solid var(--garis);padding-top:8px;font-size:12.5px;color:var(--naik)">
                <b>🛒 CTA Penutup:</b> "${s.cta_script}"
              </div>
            </div>
            <div style="background:var(--l2);padding:12px 14px;border-radius:var(--r-sm)">
              <div style="font-size:12px;font-weight:600;color:var(--amb);margin-bottom:4px">🎨 GUIDE CREATIVE (ARAHAN SYUTING TIM MANUSIA):</div>
              <div style="font-size:12.5px;color:var(--teks2);white-space:pre-line">${s.creative_guide}</div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="topbar">
        <div>
          <h1>Visual Guide</h1>
          <p>Visual Guide per detik yang diracik Claude dari Winning DNA. Owner/Leader <b>Approve</b> dulu sebelum disyuting tim kreator. Pakai <b>nama creative</b> persis di nama file, caption, dan nama iklan.</p>
        </div>
      </div>

      ${cardsHtml || `<div class="card" style="color:var(--teks2)">Belum ada Visual Guide. Jadwal Claude Brain jalan jam 06:00, 12:00, 18:00, dan 21:00 WIB.</div>`}
    `;
  }

  function renderVisualGuideCard(s, idx, segments) {
    const rows = segments.map(seg => `
      <div style="display:grid;grid-template-columns:minmax(96px,auto) 1fr;gap:12px;padding:9px 12px;background:var(--l2);border-radius:var(--r-sm);margin-bottom:6px">
        <div style="font-weight:700;color:var(--naik);font-size:12.5px;white-space:nowrap">${esc(seg.waktu)}</div>
        <div style="font-size:13px;line-height:1.5">${esc(seg.visual)}</div>
      </div>
    `).join("");
    return `
      <div class="brief-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">
              <span class="badge badge-purple">NAMA CREATIVE: ${esc(s.creative_name || s.script_code)}</span>
              ${humanBadge(s.human_status)}
            </div>
            <h3 style="margin:0;font-size:16px">${esc(s.title)}</h3>
            <div style="font-size:12px;color:var(--teks3);margin-top:3px">📦 ${esc(s.product_focus)} • 📱 Akun: ${esc(s.account || "-")} • 🎞️ ${esc(s.format || "VID")} • 👤 ${esc(s.assigned_creator)}</div>
            <div style="font-size:12px;color:var(--lime);margin-top:2px">🧬 Dasar: ${esc(s.based_on_dna)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-primary" style="height:32px;padding:0 12px;font-size:13px" data-script-act="approved" data-idx="${idx}">Approve</button>
            <button class="btn" style="height:32px;padding:0 12px;font-size:13px" data-script-act="revision" data-idx="${idx}">Minta revisi</button>
            <button class="btn" style="height:32px;padding:0 12px;font-size:13px" data-script-act="published" data-idx="${idx}">Sudah tayang</button>
          </div>
        </div>
        <div style="font-size:12px;font-weight:700;color:var(--teks2);margin-bottom:6px">VISUAL</div>
        ${rows}
        ${s.creative_guide ? `<div style="margin-top:10px;font-size:12.5px;color:var(--teks2);white-space:pre-line"><b style="color:var(--amb)">Catatan syuting:</b> ${esc(s.creative_guide)}</div>` : ""}
        ${s.human_notes ? `<div style="margin-top:8px;font-size:12.5px;color:var(--teks2)"><b>Catatan revisi:</b> ${esc(s.human_notes)}</div>` : ""}
      </div>
    `;
  }

  // 5. DAILY CHECKLIST & EVALUASI TIM KONTEN MANUSIA
  function renderChecklist() {
    const chks = state.data.daily_checklists || [];
    const doneCount = chks.filter(c => c.is_done).length;

    const listHtml = chks.map((c, idx) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;background:var(--l2);border-radius:var(--r-sm);margin-bottom:8px;opacity:${c.is_done ? "0.6" : "1"}">
        <label style="display:flex;align-items:center;gap:11px;cursor:pointer;flex:1">
          <input type="checkbox" data-chk-idx="${idx}" data-chk-id="${esc(c.id)}" ${c.is_done ? "checked" : ""} style="width:17px;height:17px;accent-color:var(--naik);cursor:pointer" />
          <div>
            <div style="font-weight:600;text-decoration:${c.is_done ? "line-through" : "none"}">${c.task_title}</div>
            <div style="font-size:11.5px;color:var(--teks3)">👤 PIC: <b>${c.pic_name}</b> • 📌 Kode Script: <code>${c.related_script_code}</code> • 🏷️ ${c.category}</div>
          </div>
        </label>
        <span class="badge ${c.is_done ? "badge-fyp" : "badge-mid"}">${c.is_done ? "✅ Selesai" : "⏳ Belum"}</span>
      </div>
    `).join("");

    return `
      <div class="topbar">
        <div>
          <h1>Daily Checklist</h1>
          <p>SOP harian dari persetujuan naskah, syuting manual oleh tim kreator, upload dengan kode unik, hingga evaluasi hasil Seller Center.</p>
        </div>
        <div class="topbar-actions">
          <span class="badge badge-fyp" style="font-size:13px;padding:6px 12px">Progress Hari Ini: ${doneCount} / ${chks.length} Selesai</span>
        </div>
      </div>

      <div class="card">
        <h2 class="card-title" style="margin-bottom:12px">Checklist hari ini</h2>
        ${listHtml}
      </div>
    `;
  }

  // 6. RADAR SCRAPECREATORS (TIKTOK ADS LIBRARY, TIKTOK SHOP, FIND CREATOR EMAILS)
  function renderRadar() {
    const radars = state.data.competitor_radar || [];
    const cardsHtml = radars.map(r => `
      <div class="brief-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
          <span class="badge badge-purple">📡 SUMBER: ${r.source}</span>
          <span style="font-size:12px;color:var(--teks2)">${r.metrics_summary}</span>
        </div>
        <h3 style="margin:0 0 4px;font-size:15.5px">${r.brand_or_creator}</h3>
        ${r.contact_email && r.contact_email !== "-" ? `<div style="font-size:12.5px;color:var(--naik);margin-bottom:6px">📧 <b>Email Afiliasi/Kreator:</b> <code>${r.contact_email}</code></div>` : ""}
        <div style="background:var(--l2);padding:10px 12px;border-radius:var(--r-sm);margin:8px 0;font-weight:500">${r.title_or_hook}</div>
        <div style="font-size:12.5px;color:var(--lime)">💡 <b>Rekomendasi untuk Terasehat:</b> ${r.ai_takeaway}</div>
      </div>
    `).join("");

    return `
      <div class="topbar">
        <div>
          <h1>Radar Kompetitor</h1>
          <p>Sesuai dokumentasi ScrapeCreators di diagram: memantau iklan kompetitor, produk naik di TikTok Shop, dan mencari email kreator afiliasi.</p>
        </div>
      </div>

      ${cardsHtml}
    `;
  }

  function openImportModal() {
    const modal = document.getElementById("app-modal");
    const box = document.getElementById("app-modal-content");
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h2 style="margin:0;font-size:17px">📥 Input / Simulasi Data Baru dari Seller Center</h2>
        <button class="btn" id="btn-close-modal">Tutup</button>
      </div>
      <p style="font-size:12.5px;color:var(--teks2);margin-top:0">
        Masukkan hasil performa video/iklan terbaru dari <b>Tokopedia / TikTok Shop Seller Center</b>. Sistem akan otomatis menghitung <b>Total Score (0–100)</b> dan mengurutkan ulang <b>Ranking Top-to-Bottom</b>:
      </p>
      <div style="display:grid;gap:10px;margin-bottom:14px">
        <div class="grid-2" style="gap:10px">
          <input class="input" id="imp-code" placeholder="Kode Script (contoh: TRS-019)" value="TRS-019" />
          <input class="input" id="imp-creator" placeholder="Nama Kreator (contoh: Rian)" value="Rian (Tim Creator)" />
        </div>
        <input class="input" id="imp-title" placeholder="Judul Konten / Video" value="Jurnal 7 Hari Orang Tua Cobain Rutinitas Pagi Terasehat" />
        <input class="input" id="imp-hook" placeholder="Kalimat Hook 3 Detik Pertama" value="Awalnya nyokap paling susah disuruh minum herbal, tapi setelah 7 hari nyobain seduhan pagi ini..." />
        <div class="grid-2" style="gap:10px">
          <input class="input" id="imp-gmv" type="number" placeholder="GMV / Omzet Seller Center (Rp)" value="52400000" />
          <input class="input" id="imp-spend" type="number" placeholder="Biaya Iklan / Ad Spend (Rp)" value="8200000" />
        </div>
        <div class="grid-2" style="gap:10px">
          <input class="input" id="imp-orders" type="number" placeholder="Jumlah Pesanan (Orders)" value="580" />
          <input class="input" id="imp-views" type="number" placeholder="Views TikTok" value="142000" />
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-primary" id="btn-save-import">Hitung skor & simpan</button>
      </div>
    `;
    modal.classList.add("open");
    document.getElementById("btn-close-modal").onclick = () => modal.classList.remove("open");
    document.getElementById("btn-save-import").onclick = async () => {
      const code = (document.getElementById("imp-code").value || "").trim().toUpperCase();
      const m = code.match(/^TRS-?(\d{2,})/);
      const item = {
        id: "SC-" + (code || Date.now()),
        script_code: m ? "TRS" + m[1] : code,
        title: document.getElementById("imp-title").value || "Konten Terasehat",
        creator_name: document.getElementById("imp-creator").value || "Tim Konten",
        published_at: new Date().toISOString().slice(0, 10),
        views: Number(document.getElementById("imp-views").value || 0),
        gmv_idr: Number(document.getElementById("imp-gmv").value || 0),
        ad_spend_idr: Number(document.getElementById("imp-spend").value || 0),
        orders: Number(document.getElementById("imp-orders").value || 0),
        hook_3s: document.getElementById("imp-hook").value || ""
      };
      try {
        await api("/api/seller-center", { items: [item] });
        modal.classList.remove("open");
        state.tab = "ranking";
        await loadState();
      } catch (e) {
        alert("Gagal simpan: " + e.message);
      }
    };
  }

  function render() {
    updateSidebarBadges();
    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === state.tab);
    });

    const container = document.getElementById("view-container");
    if (state.tab === "overview") container.innerHTML = renderOverview();
    else if (state.tab === "ranking") container.innerHTML = renderRanking();
    else if (state.tab === "dna") container.innerHTML = renderDna();
    else if (state.tab === "scripts") container.innerHTML = renderScripts();
    else if (state.tab === "checklist") container.innerHTML = renderChecklist();
    else if (state.tab === "radar") container.innerHTML = renderRadar();
    if (state.loading || state.error) {
      container.insertAdjacentHTML("afterbegin", `<div class="card" style="margin-bottom:12px;color:${state.error ? "var(--color-ember)" : "var(--color-mid-gray)"}">${state.error ? "⚠️ Gagal ambil data: " + esc(state.error) + ` <button class="btn" id="btn-reload" style="margin-left:8px">Coba lagi</button>` : "Memuat data dari database..."}</div>`);
      const r = document.getElementById("btn-reload");
      if (r) r.onclick = () => { askSecret(); loadState(); };
    }

    container.querySelectorAll("[data-go-tab]").forEach(el => {
      el.onclick = () => {
        state.tab = el.dataset.goTab;
        window.scrollTo({ top: 0, behavior: "smooth" });
        render();
      };
    });

    const btnImport = document.getElementById("btn-open-import");
    if (btnImport) btnImport.onclick = openImportModal;

    const selTier = document.getElementById("sel-tier-filter");
    if (selTier) selTier.onchange = (e) => { state.tierFilter = e.target.value; render(); };

    container.querySelectorAll("[data-script-act]").forEach(btn => {
      btn.onclick = async () => {
        const s = state.data.scripts_briefs[Number(btn.dataset.idx)];
        if (!s) return;
        const act = btn.dataset.scriptAct;
        let notes;
        if (act === "revision") {
          notes = window.prompt("Catatan revisi buat Claude/tim:", s.human_notes || "");
          if (notes === null) return;
        }
        try {
          await api("/api/update", { type: "script_status", script_code: s.script_code, status: act, notes });
          s.human_status = act;
          if (notes !== undefined) s.human_notes = notes;
          render();
        } catch (e) { alert("Gagal simpan: " + e.message); }
      };
    });

    container.querySelectorAll("[data-chk-id]").forEach(chk => {
      chk.onchange = async (e) => {
        const c = state.data.daily_checklists[Number(chk.dataset.chkIdx)];
        if (!c) return;
        try {
          await api("/api/update", { type: "checklist", id: chk.dataset.chkId, is_done: e.target.checked });
          c.is_done = e.target.checked ? 1 : 0;
          render();
        } catch (err) { e.target.checked = !e.target.checked; alert("Gagal simpan: " + err.message); }
      };
    });

    const btnSelfLearn = document.getElementById("btn-run-self-learning");
    if (btnSelfLearn) {
      btnSelfLearn.onclick = () => {
        alert("Self-Learning jalan otomatis di cloud jam 06:00, 12:00, 18:00, dan 21:00 WIB. Hasilnya muncul di sini setelah jadwal berikutnya selesai.");
      };
    }
  }

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.onclick = () => {
      state.tab = btn.dataset.tab;
      window.scrollTo({ top: 0, behavior: "smooth" });
      render();
    };
  });

  document.getElementById("app-modal").onclick = (e) => {
    if (e.target.id === "app-modal") e.target.classList.remove("open");
  };

  render();
  loadState();
})();
