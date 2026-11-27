(function () {
  const EMPTY = { store_accounts: [], contents_ads: [], winning_dna: [], scripts_briefs: [], daily_checklists: [], competitor_radar: [], competitors: [], ads_period_metrics: [], ads_budget: [], ads_daily_spend: [], ads_balance: [], store_sales_daily: [] };

  const state = {
    tab: "overview",
    tierFilter: "ALL",
    adFilter: "ALL",
    acctFilter: "ALL",
    radarStore: "ALL",
    period: (() => { try { const v = localStorage.getItem("TERASEHAT_PERIOD") || ""; return /^M:\d{4}-\d{2}$/.test(v) ? v : Number(v) || 30; } catch (_) { return 30; } })(),
    store: (() => { try { return localStorage.getItem("TERASEHAT_STORE") || "ALL"; } catch (_) { return "ALL"; } })(),
    raw: JSON.parse(JSON.stringify(EMPTY)),
    data: JSON.parse(JSON.stringify(EMPTY)),
    stores: [],
    user: null,
    auth: "checking", // checking | login | change | ok
    users: null,
    flash: "",
    loading: true
  };

  // Kode akses lama (satu kode untuk semua) sudah diganti login per user.
  try { localStorage.removeItem("TERASEHAT_STATE_V1"); localStorage.removeItem("TERASEHAT_SECRET"); } catch (_) {}

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && json.login) { state.auth = "login"; render(); throw new Error("Silakan login dulu"); }
    if (res.status === 403 && json.must_change) { state.auth = "change"; render(); throw new Error(json.error); }
    if (!res.ok || json.ok === false) throw new Error(json.error || ("HTTP " + res.status));
    return json;
  }

  function parseJsonArr(v) {
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(v || "[]"); return Array.isArray(p) ? p : []; } catch (_) { return []; }
  }

  // TOKO: data mentah berisi semua toko yang boleh dilihat user; state.data = toko yang sedang dipilih.
  const isManager = () => state.user && ["owner", "spv"].includes(state.user.role);
  const storeName = (code) => (state.stores.find(s => s.code === code) || {}).name || code || "-";
  function dataFor(code) {
    const out = {};
    Object.keys(EMPTY).forEach(k => { out[k] = code === "ALL" ? (state.raw[k] || []) : (state.raw[k] || []).filter(r => r.store_code === code); });
    return out;
  }
  function applyStore() {
    const codes = state.stores.map(s => s.code);
    if (state.store !== "ALL" && !codes.includes(state.store)) state.store = codes.length === 1 ? codes[0] : "ALL";
    if (state.store === "ALL" && codes.length === 1) state.store = codes[0];
    state.data = dataFor(state.store);
  }
  const visibleStores = () => state.store === "ALL" ? state.stores : state.stores.filter(s => s.code === state.store);

  async function loadState() {
    state.loading = true;
    try {
      const d = await api("/api/state");
      state.user = d.user;
      state.stores = d.stores || [];
      Object.keys(EMPTY).forEach(k => { state.raw[k] = d[k] || []; });
      state.salesSources = d.sales_sources || [];
      state.salesSyncedAt = d.sales_synced_at || null;
      applyStore();
      state.auth = "ok";
      state.error = "";
    } catch (e) {
      if (state.auth === "ok" || state.auth === "checking") state.error = e.message;
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

  // PERIODE DATA
  // Konten organik masuk periode kalau diposting di dalam periode.
  // Video iklan masuk kalau ada biaya iklan di periode itu (angka iklan diambil dari laporan GMV Max periode tsb).
  const PERIODS = [[7, "7 hari"], [10, "10 hari"], [30, "30 hari"], [90, "3 bulan"], [180, "6 bulan"]];
  // Periode bulanan disimpan sebagai "M:YYYY-MM"; laporan iklannya ada di ads_period_metrics dengan window_days = YYYYMM.
  const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const isMonth = (p) => typeof p === "string" && p.startsWith("M:");
  const monthKey = (ym) => Number(ym.replace("-", ""));
  const monthName = (ym) => `${BULAN[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  // Bulan berjalan = bulan dari tanggal kemarin (WIB), sama seperti laporan iklan.
  const yesterdayWib = () => new Date(Date.now() + 7 * 3600e3 - 86400e3).toISOString().slice(0, 10);
  function monthOptions() {
    const y = yesterdayWib();
    const set = new Set();
    let yy = Number(y.slice(0, 4)), mm = Number(y.slice(5, 7));
    for (let i = 0; i < 6; i++) {
      set.add(`${yy}-${String(mm).padStart(2, "0")}`);
      if (--mm === 0) { mm = 12; yy--; }
    }
    (state.data.ads_period_metrics || []).forEach(m => {
      if (m.window_days > 100000) set.add(`${String(m.window_days).slice(0, 4)}-${String(m.window_days).slice(4)}`);
    });
    return [...set].sort().reverse();
  }
  function periodLabel() {
    const P = state.period;
    if (isMonth(P)) {
      const ym = P.slice(2);
      return ym === yesterdayWib().slice(0, 7) ? `${monthName(ym)} (s/d kemarin)` : monthName(ym);
    }
    return ((PERIODS.find(p => p[0] === P) || [0, ""])[1]) + " terakhir";
  }
  function periodSelect() {
    return `<select class="input" id="sel-period" aria-label="Periode data">
      <optgroup label="Rentang">${PERIODS.map(([d, l]) =>
        `<option value="${d}" ${state.period === d ? "selected" : ""}>${l} terakhir</option>`).join("")}</optgroup>
      <optgroup label="Per bulan">${monthOptions().map(ym =>
        `<option value="M:${ym}" ${state.period === "M:" + ym ? "selected" : ""}>${monthName(ym)}</option>`).join("")}</optgroup>
    </select>`;
  }
  function periodRows(src) {
    const D = src || state.data;
    const P = state.period;
    // Laporan per jendela cuma berisi 50 video dengan biaya terbesar. Kalau video tidak ada di jendela P,
    // pakai jendela lebih pendek terdekat (biaya di periode panjang minimal sebesar itu).
    const metrics = {};
    const byWin = {};
    (D.ads_period_metrics || []).forEach(m => { (byWin[m.window_days] = byWin[m.window_days] || {})[m.item_id] = m; });
    if (isMonth(P)) {
      const ym = P.slice(2);
      const hasWindow = !!byWin[monthKey(ym)];
      Object.assign(metrics, byWin[monthKey(ym)] || {});
      const rows = [];
      (D.contents_ads || []).forEach(a => {
        const m = metrics[a.id];
        const r = { ...a };
        if (m) {
          Object.assign(r, {
            ad_spend_idr: m.cost, gmv_idr: m.gross_revenue, roas: m.roi, orders: m.orders, ctr_pct: m.ad_click_rate,
            ad_cvr_pct: m.ad_conversion_rate, hold_2s_pct: m.hold_2s_pct, hold_6s_pct: m.hold_6s_pct,
            completion_pct: m.completion_pct, ads_period: m.period,
          });
          if (Number(m.cost) >= 20000) { r.total_score = m.score; r.rank_tier = m.tier; }
        } else if (a.source === "gmv_max" || Number(a.ad_spend_idr || 0) > 0) {
          Object.assign(r, { ad_spend_idr: 0, gmv_idr: 0, roas: 0, orders: 0, ctr_pct: 0, hold_2s_pct: 0, hold_6s_pct: 0, completion_pct: 0 });
        }
        const posted = a.published_at && String(a.published_at).slice(0, 7) === ym;
        if (posted || (m && Number(m.cost) > 0)) rows.push(r);
      });
      return { rows, hasWindow };
    }
    const hasWindow = !!byWin[P];
    if (hasWindow) {
      PERIODS.map(p => p[0]).filter(w => w <= P).forEach(w => Object.assign(metrics, byWin[w] || {}));
    }
    const cutoff = new Date(Date.now() + 7 * 3600e3 - P * 86400e3).toISOString().slice(0, 10);
    const rows = [];
    (D.contents_ads || []).forEach(a => {
      const m = metrics[a.id];
      const r = { ...a };
      if (m) {
        Object.assign(r, {
          ad_spend_idr: m.cost, gmv_idr: m.gross_revenue, roas: m.roi, orders: m.orders, ctr_pct: m.ad_click_rate,
          ad_cvr_pct: m.ad_conversion_rate, hold_2s_pct: m.hold_2s_pct, hold_6s_pct: m.hold_6s_pct,
          completion_pct: m.completion_pct, ads_period: m.period,
        });
        if (Number(m.cost) >= 20000) { r.total_score = m.score; r.rank_tier = m.tier; }
      } else if (hasWindow && a.source === "gmv_max") {
        Object.assign(r, { ad_spend_idr: 0, gmv_idr: 0, roas: 0, orders: 0, ctr_pct: 0, hold_2s_pct: 0, hold_6s_pct: 0, completion_pct: 0 });
      }
      const posted = a.published_at && a.published_at >= cutoff;
      const adInPeriod = m ? Number(m.cost) > 0 : (!hasWindow && Number(a.ad_spend_idr || 0) > 0);
      if (posted || adInPeriod) rows.push(r);
    });
    return { rows, hasWindow };
  }
  // Total akun iklan (spend & GMV) dari laporan harian, untuk periode terpilih, berakhir kemarin (WIB).
  function accountTotals(src) {
    const D = src || state.data;
    const end = yesterdayWib();
    let start;
    if (isMonth(state.period)) {
      start = state.period.slice(2) + "-01";
    } else {
      start = new Date(Date.parse(end + "T00:00:00Z") - (state.period - 1) * 86400e3).toISOString().slice(0, 10);
    }
    const ym = isMonth(state.period) ? state.period.slice(2) : "";
    const stop = ym && ym < end.slice(0, 7)
      ? new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10) : end;
    const rows = (D.ads_daily_spend || []).filter(d => d.date >= start && d.date <= stop);
    const fmtD = (s) => `${Number(s.slice(8, 10))} ${BULAN[Number(s.slice(5, 7)) - 1].slice(0, 3)}`;
    return {
      days: rows.length,
      cost: rows.reduce((s, d) => s + Number(d.cost || 0), 0),
      gmv: rows.reduce((s, d) => s + Number(d.gross_revenue || 0), 0),
      range: `${fmtD(start)}–${fmtD(stop)}`,
    };
  }
  // Omzet total toko (dari sheet Dashboard Mitra) untuk periode terpilih. Sama seperti sheet, hari ini ikut dihitung.
  // CAC & ROAS dihitung seperti sheet: biaya iklan termasuk PPN 11% dibanding omzet toko, di rentang yang sama.
  function salesTotals(src) {
    const D = src || state.data;
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    let start, stop = today;
    if (isMonth(state.period)) {
      const ym = state.period.slice(2);
      start = ym + "-01";
      if (ym < today.slice(0, 7)) stop = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
    } else {
      start = new Date(Date.parse(today + "T00:00:00Z") - (state.period - 1) * 86400e3).toISOString().slice(0, 10);
    }
    const inRange = (d) => d.date >= start && d.date <= stop;
    const rows = (D.store_sales_daily || []).filter(inRange);
    const omzet = rows.reduce((s, d) => s + Number(d.omzet || 0), 0);
    const spendRows = (D.ads_daily_spend || []).filter(inRange);
    const spend = spendRows.reduce((s, d) => s + Number(d.cost || 0), 0) * 1.11;
    // CAC/ROAS hanya untuk toko yang akun iklannya sudah tersambung (biar tidak bias saat lihat semua toko).
    const adStores = new Set(spendRows.map(d => d.store_code));
    const omzetAds = rows.filter(d => adStores.has(d.store_code)).reduce((s, d) => s + Number(d.omzet || 0), 0);
    const fmtD = (s) => `${Number(s.slice(8, 10))} ${BULAN[Number(s.slice(5, 7)) - 1].slice(0, 3)}`;
    return {
      days: rows.length, omzet, spend,
      orders: rows.reduce((s, d) => s + Number(d.orders || 0), 0),
      qty: rows.reduce((s, d) => s + Number(d.qty || 0), 0),
      cac: omzetAds > 0 ? spend / omzetAds : 0, roas: spend > 0 ? omzetAds / spend : 0,
      partial: omzetAds < omzet && spend > 0,
      range: `${fmtD(start)}–${fmtD(stop)}`,
    };
  }
  function periodNote(hasWindow) {
    const label = periodLabel();
    if (isMonth(state.period)) return hasWindow ? `Periode: ${label}.`
      : `Periode: ${label}. Laporan iklan bulan ini belum ditarik, jadi angka iklan masih kosong (konten organik tetap tampil).`;
    return hasWindow ? `Periode: ${label}.`
      : `Periode: ${label}. Data iklan untuk periode ini belum ditarik, angka iklan masih pakai laporan 7 hari terakhir.`;
  }
  function tiktokUrl(a) {
    return String(a.video_url || `https://www.tiktok.com/@_/video/${a.id}`).replace("tiktok.com/@/video/", "tiktok.com/@_/video/");
  }
  function videoLink(a) {
    if (!/^\d+$/.test(String(a.id))) return a.script_code ? `<span class="badge badge-purple">${esc(a.script_code)}</span>` : "";
    return `<a class="badge badge-link" href="${esc(tiktokUrl(a))}" target="_blank" rel="noopener">Buka di TikTok ↗</a>`;
  }
  function accountName(a) {
    return a.creator_name && !["-", "@", ""].includes(a.creator_name) ? `<span class="badge badge-account">${esc(a.creator_name)}</span>` : "";
  }

  // BUDGET IKLAN per toko: budget harian per kampanye (dari jadwal cloud) dan perkiraan saldo (saldo diisi manual).
  const todayWib = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  function budgetStatus(code) {
    const D = dataFor(code);
    const today = todayWib();
    const camps = (D.ads_budget || []).filter(c => c.stat_date === today && c.operation_status === "ENABLE" && Number(c.daily_budget) > 0)
      .map(c => ({ ...c, pct: Number(c.spend_today) / Number(c.daily_budget) }));
    const daily = D.ads_daily_spend || [];
    const past = daily.filter(d => d.date < today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
    const avg = past.length ? past.reduce((s, d) => s + Number(d.cost || 0), 0) / past.length : 0;
    const bal = (D.ads_balance || [])[0];
    let balance = null;
    if (bal && bal.set_date) {
      const used = daily.filter(d => d.date >= bal.set_date).reduce((s, d) => s + Number(d.cost || 0), 0) - Number(bal.spend_at_set || 0);
      const est = Number(bal.balance_idr || 0) - Math.max(0, used);
      balance = { ...bal, est, used: Math.max(0, used), daysLeft: avg > 0 ? est / avg : null };
    }
    const prefix = state.stores.length > 1 ? `<b>${esc(storeName(code))}</b> · ` : "";
    const alerts = [];
    camps.forEach(c => {
      const more = c.auto_budget && Number(c.max_budget) > Number(c.daily_budget) ? ` Auto-budget aktif, bisa naik sendiri sampai ${rp(c.max_budget)}.` : "";
      if (c.pct >= 0.98) alerts.push({ level: "danger", text: `${prefix}Budget harian <b>${esc(c.campaign_name)}</b> habis: ${rp(c.spend_today)} dari ${rp(c.daily_budget)}. Iklan berhenti tayang sampai besok.${more}` });
      else if (c.pct >= 0.8) alerts.push({ level: "warn", text: `${prefix}Budget harian <b>${esc(c.campaign_name)}</b> tinggal ${rp(c.daily_budget - c.spend_today)} (${Math.round(c.pct * 100)}% terpakai).${more}` });
    });
    if (balance) {
      if (balance.est <= 0) alerts.unshift({ level: "danger", text: `${prefix}Saldo iklan kemungkinan <b>sudah habis</b> (perkiraan ${rp(balance.est)}). Cek dan top-up di TikTok Ads, lalu update saldo di Dashboard.` });
      else if (balance.daysLeft !== null && balance.daysLeft < Number(balance.warn_days || 3))
        alerts.unshift({ level: balance.daysLeft < 1 ? "danger" : "warn", text: `${prefix}Saldo iklan tinggal sekitar <b>${rp(balance.est)}</b>, cukup ±${balance.daysLeft < 1 ? "kurang dari 1" : balance.daysLeft.toFixed(1)} hari lagi (spend rata-rata ${rp(Math.round(avg))}/hari).` });
    }
    const checked = (D.ads_budget || []).map(c => c.checked_at).sort().pop() || "";
    const hasAds = !!(state.stores.find(s => s.code === code) || {}).advertiser_id || camps.length > 0 || daily.length > 0;
    return { code, camps, avg, balance, alerts, checked, today, hasAds };
  }
  function budgetBanner() {
    const alerts = visibleStores().flatMap(s => budgetStatus(s.code).alerts);
    if (!alerts.length) return "";
    return `<div class="alert-stack">${alerts.map(a => `
      <div class="alert-banner ${a.level === "danger" ? "alert-danger" : ""}">
        <span class="alert-dot"></span><div style="flex:1">${a.text}</div>
        ${state.tab !== "overview" ? `<button class="btn" style="height:28px;padding:0 10px;font-size:12px" data-go-tab="overview">Lihat budget</button>` : ""}
      </div>`).join("")}</div>`;
  }
  function budgetSection(code, withName) {
    const { camps, avg, balance, checked, hasAds } = budgetStatus(code);
    if (!hasAds) return withName ? `
      <div class="budget-store"><div class="budget-store-hd"><b>${esc(storeName(code))}</b></div>
        <div style="font-size:13px;color:var(--teks2)">Akun iklan toko ini belum tersambung ke dashboard.</div></div>` : "";
    const rows = camps.map(c => `
      <div class="budget-row">
        <div style="flex:1;min-width:160px">
          <div style="font-weight:600;font-size:13.5px">${esc(c.campaign_name)}</div>
          <div style="font-size:12px;color:var(--teks2)">${rp(c.spend_today)} dari ${rp(c.daily_budget)}${c.auto_budget ? ` • auto-budget s/d ${rp(c.max_budget)}` : ""} • omzet ${rp(c.revenue_today)}</div>
        </div>
        <div class="budget-bar"><span style="width:${Math.min(100, Math.round(c.pct * 100))}%;${c.pct >= 0.98 ? "background:var(--merah)" : ""}"></span></div>
        <div style="width:44px;text-align:right;font-weight:600;font-size:13px;${c.pct >= 0.98 ? "color:var(--merah)" : ""}">${Math.round(c.pct * 100)}%</div>
      </div>`).join("");
    const balHtml = balance
      ? `<div style="font-size:20px;font-weight:600;letter-spacing:-0.01em;${balance.est <= 0 ? "color:var(--merah)" : ""}">${rp(Math.round(balance.est))}</div>
         <div style="font-size:12px;color:var(--teks2)">Perkiraan. Diisi ${rp(balance.balance_idr)} tanggal ${esc(balance.set_date)}, sudah terpakai ${rp(Math.round(balance.used))}.
         ${balance.daysLeft !== null ? `Cukup ±${Math.max(0, balance.daysLeft).toFixed(1)} hari.` : ""} Peringatan muncul kalau sisa &lt; ${fmt(balance.warn_days)} hari.</div>`
      : `<div style="font-size:13px;color:var(--teks2)">Saldo belum diisi. API TikTok tidak memberikan saldo GMV Max, jadi isi sekali dari TikTok Ads Manager. Setelah itu dashboard menguranginya otomatis dengan spend harian.</div>`;
    return `
      <div class="budget-store">
        ${withName ? `<div class="budget-store-hd"><b>${esc(storeName(code))}</b><span>${checked ? "Dicek " + esc(checked.slice(0, 16)) + " UTC" : ""}</span></div>` : ""}
        ${rows || `<div style="font-size:13px;color:var(--teks2);margin-bottom:8px">Belum ada data budget kampanye aktif untuk hari ini.</div>`}
        <div class="budget-balance">
          <div style="flex:1;min-width:220px">
            <div class="kpi-lbl">SALDO AKUN IKLAN</div>
            ${balHtml}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            <button class="btn" data-set-balance="${esc(code)}">${balance ? "Update saldo" : "Isi saldo"}</button>
            ${avg ? `<span style="font-size:12px;color:var(--teks2)">Spend rata-rata 7 hari: ${rp(Math.round(avg))}/hari</span>` : ""}
          </div>
        </div>
      </div>`;
  }
  function budgetCard() {
    const stores = visibleStores();
    const multi = stores.length > 1;
    const first = budgetStatus(stores[0] ? stores[0].code : "");
    const body = stores.map(s => budgetSection(s.code, multi)).join("");
    if (!body.trim()) return `<div class="card"><h3 style="margin:0 0 6px">Budget iklan hari ini</h3><div style="font-size:13px;color:var(--teks2)">Akun iklan toko ini belum tersambung ke dashboard.</div></div>`;
    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <h3 style="margin:0">Budget iklan hari ini</h3>
          <span style="font-size:12px;color:var(--teks2)">${!multi && first.checked ? "Dicek " + esc(first.checked.slice(0, 16)) + " UTC • " : ""}dicek ulang jam 06, 12, 18, 21 WIB</span>
        </div>
        ${body}
      </div>`;
  }

  // PERBANDINGAN AKUN (owner, spv, dan adv yang pegang lebih dari 1 toko)
  function storeSummary(code) {
    const D = dataFor(code);
    const { rows } = periodRows(D);
    const acct = accountTotals(D);
    const sales = salesTotals(D);
    const gmv = acct.days ? acct.gmv : rows.reduce((s, a) => s + Number(a.gmv_idr || 0), 0);
    const spend = acct.days ? acct.cost : rows.reduce((s, a) => s + Number(a.ad_spend_idr || 0), 0);
    const orders = rows.reduce((s, a) => s + Number(a.orders || 0), 0);
    const organic = rows.filter(a => a.source !== "gmv_max");
    const views = organic.reduce((s, a) => s + Number(a.views || 0), 0);
    const b = budgetStatus(code);
    const budgetToday = b.camps.reduce((s, c) => s + Number(c.daily_budget || 0), 0);
    const spendToday = b.camps.reduce((s, c) => s + Number(c.spend_today || 0), 0);
    const guides = D.scripts_briefs || [];
    return {
      code, name: storeName(code), gmv, spend, orders, roas: spend > 0 ? gmv / spend : 0,
      omzet: sales.omzet, hasSales: sales.days > 0, cac: sales.cac,
      konten: rows.length, organik: organic.length, views,
      winning: rows.filter(a => a.rank_tier === "WINNING").length,
      adsAktif: rows.filter(a => ["DELIVERING", "LEARNING", "IN_QUEUE"].includes(a.delivery_status)).length,
      waiting: guides.filter(g => g.human_status === "waiting_check").length,
      approved: guides.filter(g => ["approved", "filming", "published"].includes(g.human_status)).length,
      budgetToday, spendToday, saldo: b.balance ? b.balance.est : null, hasAds: b.hasAds,
    };
  }
  function renderCompare() {
    const list = state.stores.map(s => storeSummary(s.code));
    const max = (k) => Math.max(1, ...list.map(x => x[k] || 0));
    const bar = (v, m) => `<div class="cmp-bar"><span style="width:${Math.round((v || 0) / m * 100)}%"></span></div>`;
    const label = periodLabel();
    const metric = (title, key, f) => `
      <div class="card">
        <h3 style="margin:0 0 12px">${title}</h3>
        ${list.map(x => `<div class="cmp-row"><div class="cmp-name">${esc(x.name)}</div>${bar(x[key], max(key))}<div class="cmp-val">${f(x)}</div></div>`).join("")}
      </div>`;
    return `
      <div class="topbar">
        <div>
          <h1>Perbandingan Akun</h1>
          <p>Semua toko dibandingkan di periode yang sama. Periode: ${label}.</p>
        </div>
        <div class="topbar-actions">${periodSelect()}</div>
      </div>
      <div class="card" style="overflow-x:auto">
        <table class="cmp-table">
          <thead><tr><th>Toko</th><th>Omzet toko</th><th>CAC</th><th>GMV iklan</th><th>Biaya iklan</th><th>ROAS</th><th>Pesanan</th><th>Video iklan aktif</th><th>Konten organik</th><th>Views organik</th><th>WINNING</th><th>Visual Guide (tunggu / jalan)</th><th>Budget hari ini</th><th>Saldo iklan</th></tr></thead>
          <tbody>${list.map(x => `
            <tr>
              <td><b>${esc(x.name)}</b></td>
              <td>${x.hasSales ? rp(x.omzet) : "–"}</td>
              <td>${x.hasSales && x.cac ? (x.cac * 100).toFixed(1).replace(".", ",") + "%" : "–"}</td>
              <td>${x.hasAds ? rp(x.gmv) : "–"}</td>
              <td>${x.hasAds ? rp(x.spend) : "–"}</td>
              <td>${x.hasAds ? x.roas.toFixed(2) + "x" : "–"}</td>
              <td>${x.hasAds ? fmt(x.orders) : "–"}</td>
              <td>${x.hasAds ? fmt(x.adsAktif) : "–"}</td>
              <td>${fmt(x.organik)}</td>
              <td>${fmt(x.views)}</td>
              <td>${fmt(x.winning)}</td>
              <td>${fmt(x.waiting)} / ${fmt(x.approved)}</td>
              <td>${x.budgetToday ? `${rp(x.spendToday)} dari ${rp(x.budgetToday)}` : "–"}</td>
              <td>${x.saldo === null ? "–" : rp(Math.round(x.saldo))}</td>
            </tr>`).join("")}</tbody>
        </table>
        <div style="font-size:12px;color:var(--teks2);margin-top:10px">"–" = akun iklan toko itu belum tersambung ke dashboard.</div>
      </div>
      ${renderKindSplit()}
      <div class="grid-2">
        ${metric("Omzet total toko (sheet)", "omzet", x => x.hasSales ? rp(x.omzet) : "–")}
        ${metric("GMV dari iklan", "gmv", x => x.hasAds ? rp(x.gmv) : "–")}
        ${metric("Biaya iklan", "spend", x => x.hasAds ? rp(x.spend) : "–")}
        ${metric("ROAS", "roas", x => x.hasAds ? x.roas.toFixed(2) + "x" : "–")}
        ${metric("Views konten organik", "views", x => fmt(x.views))}
      </div>`;
  }

  function renderKindSplit() {
    const rows = state.stores.flatMap(st => {
      const { rows } = periodRows(dataFor(st.code));
      return ACCOUNT_KINDS.map(([k, l]) => {
        const r = rows.filter(a => a.account_type === k);
        const gmv = r.reduce((s, a) => s + Number(a.gmv_idr || 0), 0), spend = r.reduce((s, a) => s + Number(a.ad_spend_idr || 0), 0);
        const views = r.reduce((s, a) => s + Number(a.views || 0), 0);
        return { store: st.name, kind: l, n: r.length, gmv, spend, roas: spend > 0 ? gmv / spend : 0, views,
          orders: r.reduce((s, a) => s + Number(a.orders || 0), 0) };
      });
    });
    return `
      <div class="card" style="overflow-x:auto">
        <h3 style="margin:0 0 4px">Per jenis akun</h3>
        <div style="font-size:12px;color:var(--teks2);margin-bottom:10px">Akun utama = wajah resmi toko. Akun pemasaran = akun internal untuk jualan. Afiliasi = kreator luar.</div>
        <table class="cmp-table">
          <thead><tr><th>Toko</th><th>Jenis akun</th><th>Jumlah video</th><th>GMV iklan</th><th>Biaya iklan</th><th>ROAS</th><th>Pesanan</th><th>Views</th></tr></thead>
          <tbody>${rows.map((x, i) => `
            <tr>
              <td>${i % 3 === 0 ? `<b>${esc(x.store)}</b>` : ""}</td>
              <td>${x.kind}</td><td>${fmt(x.n)}</td><td>${x.n ? rp(x.gmv) : "–"}</td><td>${x.n ? rp(x.spend) : "–"}</td>
              <td>${x.spend ? x.roas.toFixed(2) + "x" : "–"}</td><td>${x.n ? fmt(x.orders) : "–"}</td><td>${x.n ? fmt(x.views) : "–"}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>`;
  }

  // KELOLA USER (owner)
  const ROLE_LABEL = { owner: "Owner", spv: "Supervisor", adv: "Advertiser" };
  function storeChecks(name, selected) {
    return state.stores.map(s => `<label class="chk-inline"><input type="checkbox" name="${name}" value="${esc(s.code)}" ${selected.includes(s.code) ? "checked" : ""}> ${esc(s.name)}</label>`).join("");
  }
  function renderUsers() {
    if (!state.users) {
      api("/api/users").then(r => { state.users = r.users; render(); }).catch(e => { state.flash = "Gagal ambil user: " + e.message; render(); });
      return `<div class="topbar"><div><h1>Kelola User</h1><p>Memuat...</p></div></div>`;
    }
    const rows = state.users.map(u => {
      const stores = String(u.stores || "").split(",").filter(Boolean);
      return `
      <tr class="${u.active ? "" : "row-off"}">
        <td><b>${esc(u.name)}</b><div style="font-size:12px;color:var(--teks2)">${esc(u.username)}</div></td>
        <td>${ROLE_LABEL[u.role] || esc(u.role)}</td>
        <td>${u.role === "adv" ? (stores.map(c => esc(storeName(c))).join(", ") || "<span style='color:var(--merah)'>Belum ada toko</span>") : "Semua toko"}</td>
        <td>${u.active ? (u.must_change ? "Belum ganti password" : "Aktif") : "Nonaktif"}</td>
        <td style="font-size:12px;color:var(--teks2)">${u.last_login ? esc(u.last_login.slice(0, 16)) : "Belum pernah"}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm" data-user-edit="${u.id}">Ubah</button>
          <button class="btn btn-sm" data-user-reset="${u.id}">Reset password</button>
          ${u.id !== state.user.id ? `<button class="btn btn-sm" data-user-toggle="${u.id}">${u.active ? "Nonaktifkan" : "Aktifkan"}</button>` : ""}
        </td>
      </tr>
      ${state.editUser === u.id ? `
      <tr><td colspan="6">
        <div class="user-form">
          <input class="input" id="eu-name" value="${esc(u.name)}" placeholder="Nama">
          <select class="input" id="eu-role" ${u.id === state.user.id ? "disabled" : ""}>${Object.keys(ROLE_LABEL).map(r => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ROLE_LABEL[r]}</option>`).join("")}</select>
          <div class="chk-group">${storeChecks("eu-store", stores)}</div>
          <button class="btn btn-primary btn-sm" data-user-save="${u.id}">Simpan</button>
          <button class="btn btn-sm" data-user-cancel="1">Batal</button>
        </div>
        <div style="font-size:12px;color:var(--teks2);margin-top:6px">Pilihan toko hanya berlaku untuk Advertiser. Owner dan Supervisor otomatis lihat semua toko.</div>
      </td></tr>` : ""}`;
    }).join("");
    return `
      <div class="topbar">
        <div>
          <h1>Kelola User</h1>
          <p>Owner dan Supervisor lihat semua toko. Advertiser cuma lihat toko yang dicentang.</p>
        </div>
      </div>
      ${state.flash ? `<div class="alert-banner" style="margin-bottom:16px"><span class="alert-dot"></span><div style="flex:1">${state.flash}</div><button class="btn btn-sm" data-flash-close="1">Tutup</button></div>` : ""}
      <div class="card" style="overflow-x:auto">
        <table class="cmp-table">
          <thead><tr><th>Nama</th><th>Peran</th><th>Toko</th><th>Status</th><th>Login terakhir</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${renderStoreAccounts()}
      ${renderSalesSources()}
      <div class="card">
        <h3 style="margin:0 0 12px">Tambah user</h3>
        <div class="user-form">
          <input class="input" id="nu-username" placeholder="Username (huruf kecil)">
          <input class="input" id="nu-name" placeholder="Nama">
          <select class="input" id="nu-role">${Object.keys(ROLE_LABEL).map(r => `<option value="${r}" ${r === "adv" ? "selected" : ""}>${ROLE_LABEL[r]}</option>`).join("")}</select>
          <div class="chk-group">${storeChecks("nu-store", [])}</div>
          <button class="btn btn-primary btn-sm" id="btn-user-create">Tambah</button>
        </div>
        <div style="font-size:12px;color:var(--teks2);margin-top:6px">Password sementara dibuat otomatis dan tampil sekali. User wajib ganti password saat login pertama.</div>
      </div>`;
  }

  function renderStoreAccounts() {
    const acc = state.raw.store_accounts || [];
    const label = Object.fromEntries(ACCOUNT_KINDS);
    return `
      <div class="card">
        <h3 style="margin:0 0 4px">Akun TikTok tiap toko</h3>
        <div style="font-size:12px;color:var(--teks2);margin-bottom:12px">Video dari akun di daftar ini dihitung sebagai Akun utama atau Akun pemasaran. Video dari akun lain otomatis dihitung Afiliasi.</div>
        ${state.stores.map(st => {
          const list = acc.filter(a => a.store_code === st.code);
          return `<div class="acct-store"><b>${esc(st.name)}</b>
            <div class="acct-list">${list.length ? list.map(a => `<span class="badge badge-account">@${esc(a.handle)} · ${label[a.kind] || a.kind}
              <button class="acct-x" title="Hapus" data-acct-remove="${esc(a.handle)}">×</button></span>`).join("") : `<span style="font-size:12px;color:var(--teks2)">Belum ada akun</span>`}</div></div>`;
        }).join("")}
        <div class="user-form" style="margin-top:12px">
          <input class="input" id="sa-handle" placeholder="@username TikTok">
          <select class="input" id="sa-store">${state.stores.map(st => `<option value="${esc(st.code)}">${esc(st.name)}</option>`).join("")}</select>
          <select class="input" id="sa-kind"><option value="OFFICIAL">Akun utama</option><option value="MARKETING" selected>Akun pemasaran</option></select>
          <button class="btn btn-primary btn-sm" id="btn-acct-add">Tambah akun</button>
        </div>
      </div>`;
  }

  // Link sheet "Dashboard Mitra - Bahtera" per bulan (sumber omzet total toko).
  function renderSalesSources() {
    const src = state.salesSources || [];
    const thisMonth = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
    const missing = !src.some(s => s.month === thisMonth);
    return `
      <div class="card">
        <h3 style="margin:0 0 4px">Sheet omzet toko (Dashboard Mitra)</h3>
        <div style="font-size:12px;color:var(--teks2);margin-bottom:12px">Omzet total toko dibaca otomatis dari tab ORDER TIKTOK (Jenis Order = Real), paling lambat tiap 30 menit saat dashboard dibuka. Sheet harus bisa dibuka "siapa saja yang punya link". Sheet baru tiap bulan: tempel link-nya di sini.${state.salesSyncedAt ? ` Terakhir dibaca ${esc(state.salesSyncedAt)} UTC.` : ""}</div>
        ${missing ? `<div class="banner-error" style="font-size:13px;margin-bottom:10px">Link sheet bulan ${esc(monthName(thisMonth))} belum diisi, jadi omzet toko bulan ini belum terbaca.</div>` : ""}
        <table class="cmp-table" style="margin-bottom:12px"><thead><tr><th>Bulan</th><th>Sheet</th></tr></thead><tbody>
          ${src.map(s => `<tr><td>${esc(monthName(s.month))}</td><td><a href="https://docs.google.com/spreadsheets/d/${esc(s.sheet_id)}/edit" target="_blank" rel="noopener">Buka sheet ↗</a></td></tr>`).join("") || `<tr><td colspan="2">Belum ada</td></tr>`}
        </tbody></table>
        <div class="user-form">
          <input class="input" id="ss-month" type="month" value="${thisMonth}">
          <input class="input" id="ss-url" placeholder="Link Google Sheet bulan itu" style="min-width:280px">
          <button class="btn btn-primary btn-sm" id="btn-ss-save">Simpan &amp; baca</button>
          <button class="btn btn-sm" id="btn-ss-sync">Baca ulang sekarang</button>
        </div>
      </div>`;
  }

  // LOGIN & GANTI PASSWORD
  function renderLogin() {
    return `
      <div class="auth-wrap">
        <div class="card auth-card">
          <div class="brand" style="margin-bottom:18px"><div class="brand-logo">T</div><div><b>Terasehat Pipeline</b><span>Content & Ads Intelligence</span></div></div>
          <h2 style="margin:0 0 4px">Masuk</h2>
          <p style="margin:0 0 16px;color:var(--teks2);font-size:13px">Pakai username dan password dari owner.</p>
          <form id="form-login">
            <input class="input" name="username" placeholder="Username" autocomplete="username" required>
            <input class="input" name="password" type="password" placeholder="Password" autocomplete="current-password" required>
            ${state.authError ? `<div class="banner-error" style="font-size:13px">${esc(state.authError)}</div>` : ""}
            <button class="btn btn-primary" type="submit">Masuk</button>
          </form>
        </div>
      </div>`;
  }
  function renderChangePassword(forced) {
    return `
      <div class="${forced ? "auth-wrap" : ""}">
        <div class="card auth-card">
          <h2 style="margin:0 0 4px">Ganti password</h2>
          <p style="margin:0 0 16px;color:var(--teks2);font-size:13px">${forced ? "Ini login pertama kamu. Ganti password sementara dari owner dengan password sendiri." : "Minimal 8 karakter."}</p>
          <form id="form-password">
            <input class="input" name="old_password" type="password" placeholder="Password sekarang" autocomplete="current-password" required>
            <input class="input" name="new_password" type="password" placeholder="Password baru (min. 8 karakter)" autocomplete="new-password" minlength="8" required>
            <input class="input" name="new_password2" type="password" placeholder="Ulangi password baru" autocomplete="new-password" minlength="8" required>
            ${state.authError ? `<div class="banner-error" style="font-size:13px">${esc(state.authError)}</div>` : ""}
            <button class="btn btn-primary" type="submit">Simpan password</button>
            ${forced ? `<button class="btn" type="button" data-logout="1">Keluar</button>` : ""}
          </form>
        </div>
      </div>`;
  }

  // SIDEBAR: toko yang dipilih, user, menu sesuai peran
  function renderSidebar() {
    const box = document.getElementById("store-box");
    if (!box) return;
    if (state.auth !== "ok" || !state.user) { box.innerHTML = ""; return; }
    const vis = visibleStores();
    const acc = (state.raw.store_accounts || []).filter(a => vis.some(s => s.code === a.store_code));
    const handles = acc.filter(a => a.kind === "OFFICIAL").map(a => "@" + a.handle);
    const mkt = acc.filter(a => a.kind === "MARKETING").map(a => "@" + a.handle);
    const sel = state.stores.length > 1 ? `
      <select class="input store-select" id="sel-store" aria-label="Pilih toko">
        <option value="ALL" ${state.store === "ALL" ? "selected" : ""}>Semua toko (${state.stores.length})</option>
        ${state.stores.map(s => `<option value="${esc(s.code)}" ${state.store === s.code ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
      </select>` : `<div class="pipe-acct">${esc(storeName(state.stores[0] && state.stores[0].code))}</div>`;
    box.innerHTML = `
      <div class="pipe-hd"><span>TOKO</span><span class="dot-live">Loop Aktif</span></div>
      ${sel}
      <div class="pipe-sub">${handles.length ? "Utama: " + esc(handles.join(", ")) : "Akun utama belum didaftarkan"}</div>
      ${mkt.length ? `<div class="pipe-sub">Pemasaran: ${esc(mkt.join(", "))}</div>` : ""}
      <div class="pipe-sub" style="margin-top:6px;color:var(--color-ink)">Brain: Claude (06, 12, 18, 21 WIB)</div>`;
    const who = document.getElementById("user-box");
    if (who) who.innerHTML = `
      <div><b>${esc(state.user.name)}</b> · ${ROLE_LABEL[state.user.role] || esc(state.user.role)}</div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn btn-sm" data-go-tab="password">Ganti password</button>
        <button class="btn btn-sm" data-logout="1">Keluar</button>
      </div>`;
    const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? "" : "none"; };
    show("nav-compare", state.stores.length > 1);
    show("nav-users", state.user.role === "owner");
  }

  // 1. OVERVIEW PIPELINE (Diagram Alur Gambar 2 + KPI Toko Terasehat)
  function renderOverview() {
    const { rows: periodAds, hasWindow } = periodRows();
    const ads = [...periodAds].sort((a, b) => b.total_score - a.total_score);
    const videoGmv = ads.reduce((s, a) => s + Number(a.gmv_idr || 0), 0);
    const videoSpend = ads.reduce((s, a) => s + Number(a.ad_spend_idr || 0), 0);
    const totalOrders = ads.reduce((s, a) => s + Number(a.orders || 0), 0);
    const totalViews = ads.reduce((s, a) => s + Number(a.views || 0), 0);
    // Kartu utama pakai total akun iklan per hari (sama dengan angka di TikTok Ads Manager).
    // Kalau toko belum punya data harian akun iklan, jatuh ke jumlah per video.
    const acct = accountTotals();
    const sales = salesTotals();
    const totalGmv = acct.days ? acct.gmv : videoGmv;
    const totalSpend = acct.days ? acct.cost : videoSpend;
    const roas = totalSpend > 0 ? (totalGmv / totalSpend).toFixed(2) : "0.00";
    const winningCount = ads.filter(a => a.rank_tier === "WINNING").length;
    const waitingScripts = (state.data.scripts_briefs || []).filter(s => s.human_status === "waiting_check").length;

    const top3Html = ads.slice(0, 3).map((a, idx) => `
      <div style="padding:12px 14px;background:var(--l2);border-radius:var(--r-sm);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-weight:600">#${idx + 1}</span>
            ${tierBadge(a.rank_tier, a.total_score)}
            ${accountName(a)}
            ${videoLink(a)}
          </div>
          <div style="font-weight:600;font-size:13.5px;margin-bottom:3px">${esc(a.title)}</div>
          ${a.hook_3s ? `<div style="font-size:12px;color:var(--teks2)">Hook: <i>"${esc(a.hook_3s)}"</i></div>` : ""}
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
          <p>Data Seller Center dan TikTok, dibaca Claude, jadi Visual Guide buat tim kreator. ${periodNote(hasWindow)}</p>
        </div>
        <div class="topbar-actions">
          ${periodSelect()}
          <button class="btn btn-primary" data-go-tab="scripts">Review ${waitingScripts} Visual Guide</button>
        </div>
      </div>

      ${budgetCard()}

      <!-- Visualisasi Alur Closed-Loop Sesuai Gambar 2 -->
      <div class="card" style="background:var(--color-surface-alt)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <span class="badge badge-purple">Alur pipeline</span>
          <span style="font-size:12px;color:var(--teks2)">Klik kotak mana saja untuk pindah ke modul terkait</span>
        </div>
        <div class="kpi-grid" style="margin-bottom:0">
          <div class="kpi-card" style="cursor:pointer;border:1px solid var(--garis2)" data-go-tab="radar">
            <div class="kpi-lbl">1. INPUT DATA</div>
            <div style="font-weight:600;font-size:14px;margin-bottom:4px">TikTok Ads + ScrapeCreators</div>
            <div class="kpi-sub">Konten toko • Radar kompetitor • Omzet sheet</div>
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
          <div class="kpi-lbl">OMZET TOTAL TOKO</div>
          <div class="kpi-val" style="color:var(--naik)">${sales.days ? rp(sales.omzet) : "–"}</div>
          <div class="kpi-sub">${sales.days
            ? `${sales.range} · ${fmt(sales.orders)} pesanan${sales.spend > 0
                ? ` · CAC <b>${(sales.cac * 100).toFixed(1).replace(".", ",")}%</b> · ROAS <b>${sales.roas.toFixed(1).replace(".", ",")}</b>${sales.partial ? " (toko beriklan saja)" : ""}`
                : ""}`
            : "Belum ada data dari sheet Dashboard Mitra untuk periode ini"}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-lbl">${acct.days ? "GMV IKLAN (TOTAL AKUN)" : "TOTAL GMV (PER VIDEO)"}</div>
          <div class="kpi-val" style="color:var(--naik)">${rp(totalGmv)}</div>
          <div class="kpi-sub">${acct.days
            ? `${acct.range} · dari video teratas: <b>${rp(videoGmv)}</b>`
            : `📦 <b>${fmt(totalOrders)}</b> pesanan dari video iklan`}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-lbl">${acct.days ? "BIAYA IKLAN + PPN 11% (TOTAL AKUN)" : "BIAYA IKLAN (PER VIDEO)"}</div>
          <div class="kpi-val">${rp(acct.days ? Math.round(totalSpend * 1.11) : totalSpend)}</div>
          <div class="kpi-sub">ROAS: <b style="color:var(--lime)">${roas}x</b></div>
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
  // Status iklan per konten:
  // - Ads        = dapat biaya iklan (GMV Max) di periode laporan
  // - Materi iklan = pernah dipasang sebagai materi iklan (ada biaya, masuk laporan GMV Max,
  //                  atau ditandai "Digunakan di iklan" di Seller Center), walau biayanya 0
  const isAds = (a) => Number(a.ad_spend_idr || 0) > 0;
  const isAdMaterial = (a) => isAds(a) || a.source === "gmv_max" || /^\[ADS\]/.test(a.title || "");
  const isAffiliate = (a) => a.account_type === "AFFILIATE";
  const isActiveAd = (a) => ["DELIVERING", "LEARNING", "IN_QUEUE"].includes(a.delivery_status);
  const AD_FILTERS = [
    ["ALL", "Semua", () => true],
    ["ACTIVE", "Iklan aktif", isActiveAd],
    ["ADS", "Ads", isAds],
    ["NO_ADS", "Tanpa ads", (a) => !isAds(a)],
    ["MATERIAL", "Materi iklan", isAdMaterial],
    ["NOT_MATERIAL", "Bukan materi iklan", (a) => !isAdMaterial(a)],
    ["AFF_MATERIAL", "Materi iklan afiliasi", (a) => isAdMaterial(a) && isAffiliate(a)],
  ];
  // Ekosistem akun toko: Akun Utama (wajah resmi toko), Akun Pemasaran (internal, banyak video keranjang kuning), Afiliasi (pihak luar).
  const ACCOUNT_KINDS = [["OFFICIAL", "Akun utama"], ["MARKETING", "Akun pemasaran"], ["AFFILIATE", "Afiliasi"]];
  const ACCT_FILTERS = [["ALL", "Semua akun", () => true], ...ACCOUNT_KINDS.map(([k, l]) => [k, l, (a) => a.account_type === k])];
  function adBadge(a) {
    if (isActiveAd(a)) return `<span class="badge badge-fyp">Iklan aktif</span>`;
    if (isAds(a)) return `<span class="badge badge-mid">Ads (tidak tayang)</span>`;
    if (isAdMaterial(a)) return `<span class="badge badge-mid">Materi iklan</span>`;
    return `<span class="badge badge-low">Organik</span>`;
  }
  function accountBadge(a) {
    const label = Object.fromEntries(ACCOUNT_KINDS)[a.account_type];
    return label ? `<span class="badge badge-purple">${label}</span>` : "";
  }

  function renderRanking() {
    const { rows: all, hasWindow } = periodRows();
    const adFn = (AD_FILTERS.find(f => f[0] === state.adFilter) || AD_FILTERS[0])[2];
    const acctFn = (ACCT_FILTERS.find(f => f[0] === state.acctFilter) || ACCT_FILTERS[0])[2];
    let ads = all.filter(adFn).filter(acctFn).sort((a, b) =>
      state.adFilter === "ACTIVE" ? Number(b.ad_spend_idr || 0) - Number(a.ad_spend_idr || 0) : b.total_score - a.total_score);
    if (state.tierFilter !== "ALL") {
      ads = ads.filter(a => a.rank_tier === state.tierFilter);
    }
    const acctSegHtml = ACCT_FILTERS.map(([key, label, fn]) =>
      `<button class="seg-btn ${state.acctFilter === key ? "active" : ""}" data-acct-filter="${key}">${label} <span class="seg-count">${all.filter(adFn).filter(fn).length}</span></button>`
    ).join("");
    const segHtml = AD_FILTERS.map(([key, label, fn]) =>
      `<button class="seg-btn ${state.adFilter === key ? "active" : ""}" data-ad-filter="${key}">${label} <span class="seg-count">${all.filter(fn).length}</span></button>`
    ).join("");

    const rowsHtml = ads.map((a, idx) => `
      <tr>
        <td style="font-weight:700;color:var(--lime)">#${idx + 1}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
            ${adBadge(a)}${accountBadge(a)}${accountName(a)}${videoLink(a)}
          </div>
          <div style="margin-bottom:3px"><b style="color:var(--teks)">${esc(a.title)}</b>${/^TRS/.test(a.script_code || "") ? ` <span style="font-size:12px;color:var(--teks3)">${esc(a.creative_name || a.script_code)}</span>` : ""}</div>
          ${a.hook_3s ? `<div style="font-size:12px;color:var(--teks2)">Hook: <i>"${esc(a.hook_3s)}"</i></div>` : ""}
          <div style="font-size:12px;color:var(--teks3);margin-top:3px">${[
            a.published_at ? esc(a.published_at) : "",
            Number(a.duration_s) > 0 ? a.duration_s + " detik" : "",
          ].filter(Boolean).join(" · ")}</div>
          ${Number(a.hold_2s_pct) > 0 ? `<div style="font-size:12px;color:var(--color-mid-gray);margin-top:3px">Iklan: penonton bertahan 2 detik <b style="color:var(--color-ink)">${a.hold_2s_pct}%</b> · 6 detik <b style="color:var(--color-ink)">${a.hold_6s_pct}%</b> · sampai habis ${a.completion_pct}%${a.ads_period ? " · periode " + esc(a.ads_period) : ""}</div>` : ""}
          ${a.claude_evaluation ? `<div style="font-size:13px;color:var(--color-ink);margin-top:6px"><b>Evaluasi Claude:</b> ${esc(a.claude_evaluation)}</div>` : ""}
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
          <p>Data gabungan TikTok organik dan iklan GMV Max ${state.store === "ALL" ? "semua toko" : "toko " + esc(storeName(state.store))}, diurutkan dari skor tertinggi. ${periodNote(hasWindow)}</p>
        </div>
        <div class="topbar-actions">
          ${periodSelect()}
          <select class="input" id="sel-tier-filter">
            <option value="ALL" ${state.tierFilter === "ALL" ? "selected" : ""}>Semua tier</option>
            <option value="WINNING" ${state.tierFilter === "WINNING" ? "selected" : ""}>WINNING (Skor ≥75)</option>
            <option value="POTENSIAL" ${state.tierFilter === "POTENSIAL" ? "selected" : ""}>POTENSIAL (Skor 45-74)</option>
            <option value="BONCOS" ${state.tierFilter === "BONCOS" ? "selected" : ""}>BONCOS (<45)</option>
          </select>
        </div>
      </div>

      <div class="seg" role="tablist" aria-label="Filter status iklan">${segHtml}</div>
      <div class="seg" role="tablist" aria-label="Filter jenis akun" style="margin-top:8px">${acctSegHtml}</div>

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
            <tbody>${rowsHtml || `<tr><td colspan="10" style="color:var(--color-mid-gray);padding:24px 12px">Nggak ada konten di filter ini.</td></tr>`}</tbody>
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
              ${s.human_status === "approved"
              ? `<button class="btn" style="height:32px;padding:0 12px;font-size:13px" data-script-act="waiting_check" data-idx="${idx}">Batalkan approve</button>`
              : `<button class="btn btn-primary" style="height:32px;padding:0 12px;font-size:13px" data-script-act="approved" data-idx="${idx}">Approve</button>`}
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
              ${s.target_account ? `<span class="badge badge-account">Untuk ${Object.fromEntries(ACCOUNT_KINDS)[s.target_account] || esc(s.target_account)}</span>` : ""}
              ${state.store === "ALL" && state.stores.length > 1 ? `<span class="badge badge-account">${esc(storeName(s.store_code))}</span>` : ""}
              ${humanBadge(s.human_status)}
            </div>
            <h3 style="margin:0;font-size:16px">${esc(s.title)}</h3>
            <div style="font-size:12px;color:var(--teks3);margin-top:3px">📦 ${esc(s.product_focus)} • 📱 Akun: ${esc(s.account || "-")} • 🎞️ ${esc(s.format || "VID")} • 👤 ${esc(s.assigned_creator)}</div>
            <div style="font-size:12px;color:var(--lime);margin-top:2px">🧬 Dasar: ${esc(s.based_on_dna)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn" style="height:32px;padding:0 12px;font-size:13px" data-craft="${idx}">🎛️ Craft Prompt${s.craft_status === "claude" ? " ✓" : ""}</button>
            ${s.human_status === "approved"
              ? `<button class="btn" style="height:32px;padding:0 12px;font-size:13px" data-script-act="waiting_check" data-idx="${idx}">Batalkan approve</button>`
              : `<button class="btn btn-primary" style="height:32px;padding:0 12px;font-size:13px" data-script-act="approved" data-idx="${idx}">Approve</button>`}
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

  // 6. RADAR KOMPETITOR: catatan manual (+ Tambah) dan akun kompetitor yang dipantau otomatis 1x sehari.
  const RADAR_SRC = {
    ORGANIC: "🎬 Konten Organik", ADS: "📣 Iklan", PRODUCT: "🛒 Produk TikTok Shop", CREATOR: "🤝 Kontak Kreator",
    TIKTOK_ORGANIC: "🎬 Konten Organik", TIKTOK_ADS_LIB: "📣 Iklan", TIKTOK_SHOP: "🛒 Produk TikTok Shop", CREATOR_EMAIL: "🤝 Kontak Kreator",
  };
  const short = (n) => {
    n = Number(n || 0);
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".0", "").replace(".", ",") + "jt";
    if (n >= 1e4) return Math.round(n / 1e3) + "rb";
    return fmt(n);
  };
  function radarStats(r) {
    const parts = [];
    if (r.views) parts.push(short(r.views) + " views");
    if (r.likes) parts.push(fmt(r.likes) + " like");
    if (r.shares) parts.push(fmt(r.shares) + " share");
    if (r.followers) parts.push(short(r.followers) + " followers");
    return parts.join(" · ") || esc(r.metrics_summary || "");
  }
  function renderRadar() {
    const all = state.data.competitor_radar || [];
    const comps = state.data.competitors || [];
    const multi = state.store === "ALL" && state.stores.length > 1;
    const rs = multi && state.radarStore && state.radarStore !== "ALL" ? state.radarStore : "ALL";
    const rows = rs === "ALL" ? all : all.filter(r => r.store_code === rs);
    const tabs = multi ? `
      <div class="seg" style="margin-bottom:16px">
        <button class="seg-btn ${rs === "ALL" ? "active" : ""}" data-radar-store="ALL">Semua toko <span class="seg-count">${all.length}</span></button>
        ${state.stores.map(s => `<button class="seg-btn ${rs === s.code ? "active" : ""}" data-radar-store="${esc(s.code)}">${esc(s.code)} <span class="seg-count">${all.filter(r => r.store_code === s.code).length}</span></button>`).join("")}
      </div>` : "";
    const card = (r) => `
      <div class="brief-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="badge badge-purple">${RADAR_SRC[r.source] || esc(r.source)}</span>
            <span class="badge badge-account">${esc(r.store_code)}</span>
            ${r.added_by === "Otomatis" ? `<span class="badge badge-mid">Dipantau otomatis</span>` : ""}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:12.5px;color:var(--teks2)">${radarStats(r)}</span>
            <button class="btn btn-sm btn-secondary" data-radar-edit="${esc(r.id)}">Edit</button>
          </div>
        </div>
        <h3 style="margin:0 0 4px;font-size:16px">${esc(r.brand_or_creator)}${r.handle ? ` <span style="color:var(--teks2);font-weight:500">(@${esc(r.handle)})</span>` : ""}</h3>
        ${r.contact_email ? `<div style="font-size:12.5px;margin-bottom:6px">📧 <code>${esc(r.contact_email)}</code></div>` : ""}
        ${r.title_or_hook ? `<div style="background:var(--l2);padding:10px 12px;border-radius:var(--r-sm);margin:8px 0;font-weight:500">${esc(r.title_or_hook)}</div>` : ""}
        <div style="font-size:13px;line-height:1.55">${r.ai_takeaway
          ? `💡 <b>Rekomendasi untuk ${esc(storeName(r.store_code))}:</b> ${esc(r.ai_takeaway)}`
          : `<span style="color:var(--teks2)">💡 Rekomendasi diisi Claude di jadwal berikutnya (06, 12, 18, 21 WIB).</span>`}</div>
        ${r.ref_url ? `<a href="${esc(r.ref_url)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:13px;color:var(--color-ink)">Buka sumber ↗</a>` : ""}
      </div>`;
    const watchStores = visibleStores();
    const watch = `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline">
          <h3 style="margin:0;font-size:15px">Akun kompetitor yang dipantau</h3>
          <span style="font-size:12px;color:var(--teks2)">Ditarik otomatis 1x sehari: 2 video terlaris dari 10 video terbaru · 1 kredit ScrapeCreators per akun</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:12px 0">
          ${comps.length ? comps.map(c => `<span class="badge badge-purple" title="${c.last_error ? "Gagal: " + esc(c.last_error) : c.last_scan_at ? "Terakhir ditarik " + esc(c.last_scan_at) + " UTC" : "Belum ditarik"}">
              ${watchStores.length > 1 ? esc(c.store_code) + " · " : ""}@${esc(c.handle)}${c.name ? " (" + esc(c.name) + ")" : ""}${c.last_error ? " ⚠️" : ""}
              <button data-watch-remove="${c.id}" aria-label="Berhenti pantau @${esc(c.handle)}" style="border:0;background:none;cursor:pointer;padding:0 0 0 4px;color:inherit">✕</button>
            </span>`).join("") : `<span style="font-size:13px;color:var(--teks2)">Belum ada. Tambahkan akun TikTok kompetitor terbaik, Claude akan menganalisis videonya.</span>`}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${watchStores.length > 1 ? `<select class="input" id="cw-store" style="max-width:180px">${watchStores.map(s => `<option value="${esc(s.code)}">${esc(s.name)}</option>`).join("")}</select>` : `<input type="hidden" id="cw-store" value="${esc((watchStores[0] || {}).code || "")}">`}
          <input class="input" id="cw-handle" placeholder="@username atau link akun TikTok" style="max-width:260px">
          <input class="input" id="cw-name" placeholder="Nama brand (opsional)" style="max-width:200px">
          <button class="btn" id="btn-watch-add">+ Pantau</button>
        </div>
      </div>`;
    return `
      <div class="topbar">
        <div>
          <h1>Radar Kompetitor</h1>
          <p>Catat iklan kompetitor, produk yang sedang naik di TikTok Shop, dan kontak kreator afiliasi. Claude memakai catatan ini sebagai bahan belajar dan menulis rekomendasinya.</p>
        </div>
        <button class="btn btn-primary" data-radar-edit="">+ Tambah</button>
      </div>
      ${watch}
      ${tabs}
      ${rows.length ? rows.map(card).join("") : `<div class="card" style="color:var(--teks2)">Belum ada catatan kompetitor. Klik <b>+ Tambah</b> atau pantau akun kompetitor di atas.</div>`}
    `;
  }

  // Craft Prompt: tim memilih arahan, prompt video langsung disusun (draf), lalu disempurnakan Claude di jadwal berikutnya.
  const CRAFT_OPTS = {
    durasi: [["20", "20 detik"], ["30", "30 detik"], ["45", "45 detik"]],
    gaya_visual: ["Promo bersih (foto produk jadi bintang)", "Teks bergerak (kinetic typography)", "Kartun berwarna cerah",
      "Ilustrasi datar minimalis", "Editorial majalah", "Video asli talent (UGC)"],
    suasana: ["hangat", "edukatif", "ceria", "tenang", "meyakinkan", "energik", "santai"],
    pembuka: ["Pertanyaan yang dekat dengan keseharian", "Situasi sehari-hari", "Fakta singkat yang aman", "Kebiasaan lama vs coba yang baru"],
    bahasa: ["Santai seperti teman", "Hangat untuk keluarga", "Ringkas dan lugas", "Sopan dan rapi"],
    target: ["Lansia", "Ibu dan keluarga", "Pekerja kantoran", "Umum"],
    cta: ["Cek keranjang kuning", "Cek keranjang kuning, ada paket hemat", "Coba dulu, cek keranjang kuning"],
  };

  function openCraft(idx) {
    const s = state.data.scripts_briefs[idx];
    if (!s) return;
    let saved = {};
    try { saved = JSON.parse(s.craft_json || "{}") || {}; } catch (_) {}
    const c = { durasi: "30", suasana: [], cta: CRAFT_OPTS.cta[0], ...saved };
    let dirty = false, expanded = false;
    const box = document.getElementById("app-modal-content");
    box.classList.add("modal-wide");
    const chips = (key, multi) => (CRAFT_OPTS[key]).map(o => {
      const [val, label] = Array.isArray(o) ? o : [o, o];
      const on = multi ? c[key].includes(val) : String(c[key] || "") === val;
      return `<button type="button" class="chip${on ? " on" : ""}" data-ck="${key}" data-cv="${esc(val)}">${esc(label)}</button>`;
    }).join("");
    const group = (title, key, multi, hint) => `<div class="craft-group"><div class="craft-label">${title}${hint ? ` <span>${hint}</span>` : ""}</div><div class="chips">${chips(key, multi)}</div></div>`;
    const statusLine = () => {
      if (dirty) return `<b>Ada perubahan yang belum disimpan. Klik Simpan untuk menyusun prompt baru.</b>`;
      if (s.craft_status === "claude") return `✓ Disusun Claude${s.craft_updated_at ? " • " + esc(s.craft_updated_at.slice(0, 16)) + " UTC" : ""}`;
      if (s.craft_status === "draft") return `Draf otomatis dari pilihanmu. Claude menyempurnakannya di jadwal berikutnya (06:00, 12:00, 18:00, 21:00 WIB).`;
      return "";
    };
    const draw = () => {
      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px">
          <div>
            <h2 style="margin:0;font-size:18px">Craft Prompt · ${esc(s.script_code)}</h2>
            <p style="margin:4px 0 0;font-size:12.5px;color:var(--teks2);max-width:720px">Pilih arahan, lalu klik Simpan. Prompt langsung disusun dari pilihanmu, adegan Visual Guide, dan pola Winning DNA. Di jadwal berikutnya Claude menyempurnakannya (dialog per adegan, waktu pas durasi). Aturan klaim aman tetap berlaku.</p>
          </div>
          <button class="btn" id="cp-close">Tutup</button>
        </div>
        <div class="craft-grid">
          <div>
            ${group("Durasi total", "durasi")}
            ${group("Gaya visual", "gaya_visual")}
            ${group("Suasana", "suasana", true, "(maks 3)")}
            ${group("Pembuka (3 detik pertama)", "pembuka")}
            ${group("Gaya bahasa", "bahasa")}
            ${group("Untuk siapa", "target")}
            ${group("Penutup (CTA)", "cta")}
            <div class="craft-group"><div class="craft-label">Catatan tambahan <span>(opsional)</span></div>
              <textarea class="input craft-text" id="cp-catatan" rows="3" placeholder="Contoh: warna dominan hijau, tekankan sarapan praktis 2 menit">${esc(c.catatan || "")}</textarea></div>
            <div class="craft-group"><div class="craft-label">Hindari <span>(opsional)</span></div>
              <textarea class="input craft-text" id="cp-hindari" rows="2" placeholder="Contoh: jangan sebut harga, jangan pakai emoji">${esc(c.hindari || "")}</textarea></div>
          </div>
          <div>
            <div class="craft-panel">
              <div style="font-weight:700;margin-bottom:8px">Prompt dari Claude</div>
              <pre class="craft-prompt${expanded ? " full" : ""}">${s.craft_prompt ? esc(s.craft_prompt) : "Belum ada prompt. Pilih arahan di kiri, lalu klik Simpan & susun prompt."}</pre>
              <div class="craft-status">${statusLine()}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
                <button class="btn btn-primary" id="cp-save">Simpan & susun prompt</button>
                <button class="btn" id="cp-copy" ${s.craft_prompt ? "" : "disabled"}>Salin prompt</button>
                <button class="btn" id="cp-full" ${s.craft_prompt ? "" : "disabled"}>${expanded ? "Ringkas tampilan" : "Lihat prompt lengkap video"}</button>
              </div>
            </div>
          </div>
        </div>`;
      bind();
    };
    const readText = () => {
      c.catatan = document.getElementById("cp-catatan").value;
      c.hindari = document.getElementById("cp-hindari").value;
    };
    const modal = document.getElementById("app-modal");
    const close = () => { modal.classList.remove("open"); box.classList.remove("modal-wide"); };
    const bind = () => {
      document.getElementById("cp-close").onclick = close;
      box.querySelectorAll("[data-ck]").forEach(b => b.onclick = () => {
        readText();
        const k = b.dataset.ck, v = b.dataset.cv;
        if (k === "suasana") {
          if (c.suasana.includes(v)) c.suasana = c.suasana.filter(x => x !== v);
          else if (c.suasana.length < 3) c.suasana = [...c.suasana, v];
          else return;
        } else c[k] = c[k] === v && !["durasi", "cta"].includes(k) ? "" : v;
        dirty = true; draw();
      });
      ["cp-catatan", "cp-hindari"].forEach(id => document.getElementById(id).oninput = () => {
        if (!dirty) { dirty = true; box.querySelector(".craft-status").innerHTML = statusLine(); }
      });
      document.getElementById("cp-save").onclick = async (e) => {
        readText();
        e.target.disabled = true; e.target.textContent = "Menyusun...";
        try {
          const r = await api("/api/update", { type: "craft_save", script_code: s.script_code, craft: c });
          s.craft_json = JSON.stringify(r.craft); s.craft_prompt = r.prompt; s.craft_status = r.craft_status;
          s.craft_updated_at = new Date().toISOString().replace("T", " ").slice(0, 19);
          Object.assign(c, r.craft); dirty = false; draw(); render();
        } catch (err) { e.target.disabled = false; e.target.textContent = "Simpan & susun prompt"; alert("Gagal simpan: " + err.message); }
      };
      document.getElementById("cp-copy").onclick = async (e) => {
        try { await navigator.clipboard.writeText(s.craft_prompt || ""); e.target.textContent = "Tersalin ✓"; }
        catch (_) { e.target.textContent = "Gagal menyalin"; }
        setTimeout(() => { e.target.textContent = "Salin prompt"; }, 1500);
      };
      document.getElementById("cp-full").onclick = () => { readText(); expanded = !expanded; draw(); };
    };
    draw();
    modal.classList.add("open");
  }

  function openRadarForm(id) {
    const r = id ? (state.raw.competitor_radar || []).find(x => x.id === id) : null;
    const stores = r ? state.stores : visibleStores();
    const v = (k) => esc(r ? (r[k] ?? "") : "");
    const n = (k) => r && r[k] ? Number(r[k]) : "";
    const src = r ? ({ TIKTOK_ORGANIC: "ORGANIC", TIKTOK_ADS_LIB: "ADS", TIKTOK_SHOP: "PRODUCT", CREATOR_EMAIL: "CREATOR" }[r.source] || r.source) : "ORGANIC";
    const lbl = (t, inner) => `<label class="radar-field" style="display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--teks2);margin-bottom:10px">${t}${inner}</label>`;
    document.getElementById("app-modal-content").classList.remove("modal-wide");
    document.getElementById("app-modal-content").innerHTML = `
      <h2 style="margin:0 0 16px;font-size:18px">${r ? "Edit catatan kompetitor" : "Tambah catatan kompetitor"}</h2>
      <div class="grid-2" style="gap:0 12px">
        ${lbl("Toko", `<select class="input" id="rf-store">${stores.map(s => `<option value="${esc(s.code)}" ${(r ? r.store_code : state.radarStore) === s.code ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>`)}
        ${lbl("Jenis", `<select class="input" id="rf-source">${["ORGANIC", "ADS", "PRODUCT", "CREATOR"].map(k => `<option value="${k}" ${src === k ? "selected" : ""}>${RADAR_SRC[k]}</option>`).join("")}</select>`)}
        ${lbl("Nama brand / kreator *", `<input class="input" id="rf-brand" value="${v("brand_or_creator")}" placeholder="Tropicana Slim">`)}
        ${lbl("Username TikTok", `<input class="input" id="rf-handle" value="${v("handle")}" placeholder="@tropicanaslim">`)}
      </div>
      ${lbl("Hook / judul / produk", `<input class="input" id="rf-hook" value="${v("title_or_hook")}" placeholder="Kalimat pembuka video, judul iklan, atau nama produk">`)}
      <div class="grid-2" style="gap:0 12px">
        ${lbl("Views", `<input class="input" id="rf-views" inputmode="numeric" value="${n("views")}">`)}
        ${lbl("Like", `<input class="input" id="rf-likes" inputmode="numeric" value="${n("likes")}">`)}
        ${lbl("Share", `<input class="input" id="rf-shares" inputmode="numeric" value="${n("shares")}">`)}
        ${lbl("Followers", `<input class="input" id="rf-followers" inputmode="numeric" value="${n("followers")}">`)}
      </div>
      ${lbl("Link sumber", `<input class="input" id="rf-url" value="${v("ref_url")}" placeholder="https://www.tiktok.com/@.../video/...">`)}
      ${lbl("Email kontak (untuk kreator)", `<input class="input" id="rf-email" value="${v("contact_email")}">`)}
      ${lbl("Rekomendasi (kosongkan biar Claude yang isi)", `<textarea class="input" id="rf-take" rows="3" style="height:auto;padding-top:8px">${v("ai_takeaway")}</textarea>`)}
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:8px">
        <div>${r ? `<button class="btn" id="rf-delete" style="color:var(--color-ember)">Hapus</button>` : ""}</div>
        <div style="display:flex;gap:8px"><button class="btn" id="rf-cancel">Batal</button><button class="btn btn-primary" id="rf-save">Simpan</button></div>
      </div>`;
    const modal = document.getElementById("app-modal");
    modal.classList.add("open");
    const close = () => modal.classList.remove("open");
    const g = (k) => document.getElementById(k).value;
    document.getElementById("rf-cancel").onclick = close;
    document.getElementById("rf-save").onclick = async (e) => {
      e.target.disabled = true;
      try {
        await api("/api/radar", { action: "save", id: r ? r.id : "", store_code: g("rf-store"), source: g("rf-source"),
          brand_or_creator: g("rf-brand"), handle: g("rf-handle"), title_or_hook: g("rf-hook"), views: g("rf-views"),
          likes: g("rf-likes"), shares: g("rf-shares"), followers: g("rf-followers"), ref_url: g("rf-url"),
          contact_email: g("rf-email"), ai_takeaway: g("rf-take") });
        close(); await loadState();
      } catch (err) { e.target.disabled = false; alert("Gagal simpan: " + err.message); }
    };
    const del = document.getElementById("rf-delete");
    if (del) del.onclick = async () => {
      if (!confirm(`Hapus catatan ${r.brand_or_creator}?`)) return;
      try { await api("/api/radar", { action: "delete", id: r.id }); close(); await loadState(); }
      catch (err) { alert("Gagal hapus: " + err.message); }
    };
  }

  function bindRadar(container) {
    container.querySelectorAll("[data-radar-store]").forEach(b => b.onclick = () => { state.radarStore = b.dataset.radarStore; render(); });
    container.querySelectorAll("[data-radar-edit]").forEach(b => b.onclick = () => openRadarForm(b.dataset.radarEdit));
    container.querySelectorAll("[data-watch-remove]").forEach(b => b.onclick = async () => {
      const c = (state.data.competitors || []).find(x => x.id === Number(b.dataset.watchRemove));
      if (!c || !confirm(`Berhenti memantau @${c.handle}? Catatan yang sudah ada tetap disimpan.`)) return;
      try { await api("/api/radar", { action: "watch_remove", id: c.id }); await loadState(); }
      catch (e) { alert("Gagal: " + e.message); }
    });
    const add = document.getElementById("btn-watch-add");
    if (add) add.onclick = async () => {
      add.disabled = true; add.textContent = "Menarik video...";
      try {
        const r = await api("/api/radar", { action: "watch_add", store_code: document.getElementById("cw-store").value,
          handle: document.getElementById("cw-handle").value, name: document.getElementById("cw-name").value });
        await loadState();
        if (r.scan && r.scan.error) alert("Akun disimpan, tapi video belum bisa ditarik: " + r.scan.error);
      } catch (e) { alert("Gagal: " + e.message); add.disabled = false; add.textContent = "+ Pantau"; }
    };
  }

  function render() {
    const container = document.getElementById("view-container");
    document.body.classList.toggle("auth-mode", state.auth !== "ok");
    renderSidebar();
    if (state.auth === "checking") { container.innerHTML = `<div class="card" style="color:var(--teks2)">Memuat...</div>`; return; }
    if (state.auth === "login") { container.innerHTML = renderLogin(); bindAuthForms(); return; }
    if (state.auth === "change") { container.innerHTML = renderChangePassword(true); bindAuthForms(); return; }

    updateSidebarBadges();
    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === state.tab);
    });

    if (state.tab === "users" && state.user.role !== "owner") state.tab = "overview";
    if (state.tab === "compare" && state.stores.length < 2) state.tab = "overview";
    if (state.tab === "overview") container.innerHTML = renderOverview();
    else if (state.tab === "ranking") container.innerHTML = renderRanking();
    else if (state.tab === "dna") container.innerHTML = renderDna();
    else if (state.tab === "scripts") container.innerHTML = renderScripts();
    else if (state.tab === "checklist") container.innerHTML = renderChecklist();
    else if (state.tab === "radar") container.innerHTML = renderRadar();
    else if (state.tab === "compare") container.innerHTML = renderCompare();
    else if (state.tab === "users") container.innerHTML = renderUsers();
    else if (state.tab === "password") container.innerHTML = renderChangePassword(false);
    if (!state.loading && !["users", "password"].includes(state.tab)) container.insertAdjacentHTML("afterbegin", budgetBanner());
    if (state.loading || state.error) {
      container.insertAdjacentHTML("afterbegin", `<div class="card" style="margin-bottom:12px;color:${state.error ? "var(--color-ember)" : "var(--color-mid-gray)"}">${state.error ? "⚠️ Gagal ambil data: " + esc(state.error) + ` <button class="btn" id="btn-reload" style="margin-left:8px">Coba lagi</button>` : "Memuat data dari database..."}</div>`);
      const r = document.getElementById("btn-reload");
      if (r) r.onclick = () => loadState();
    }
    bindAuthForms();
    bindUserAdmin(container);
    bindRadar(container);

    document.querySelectorAll("[data-go-tab]").forEach(el => {
      el.onclick = () => {
        state.tab = el.dataset.goTab;
        window.scrollTo({ top: 0, behavior: "smooth" });
        render();
      };
    });


    const selPeriod = document.getElementById("sel-period");
    if (selPeriod) selPeriod.onchange = (e) => {
      state.period = isMonth(e.target.value) ? e.target.value : Number(e.target.value);
      try { localStorage.setItem("TERASEHAT_PERIOD", String(state.period)); } catch (_) {}
      render();
    };
    const selTier = document.getElementById("sel-tier-filter");
    if (selTier) selTier.onchange = (e) => { state.tierFilter = e.target.value; render(); };
    container.querySelectorAll("[data-acct-filter]").forEach(b => {
      b.onclick = () => { state.acctFilter = b.dataset.acctFilter; render(); };
    });
    container.querySelectorAll("[data-ad-filter]").forEach(b => {
      b.onclick = () => { state.adFilter = b.dataset.adFilter; render(); };
    });

    container.querySelectorAll("[data-craft]").forEach(btn => { btn.onclick = () => openCraft(Number(btn.dataset.craft)); });

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

    container.querySelectorAll("[data-set-balance]").forEach(btn => btn.onclick = async () => {
      const code = btn.dataset.setBalance;
      const cur = (dataFor(code).ads_balance || [])[0];
      const v = window.prompt(`Saldo akun iklan ${storeName(code)} sekarang (Rupiah, lihat di TikTok Ads Manager):`, cur ? String(Math.round(cur.balance_idr)) : "");
      if (v === null) return;
      const bal = Number(String(v).replace(/[^\d]/g, ""));
      if (!String(v).trim() || !Number.isFinite(bal)) { alert("Isi angka saldo, contoh 500000"); return; }
      const w = window.prompt("Kasih peringatan kalau saldo cukup kurang dari berapa hari?", String(cur ? cur.warn_days : 3));
      if (w === null) return;
      try {
        await api("/api/update", { type: "ads_balance", store_code: code, balance_idr: bal, warn_days: Number(w) || 3 });
        await loadState();
      } catch (e) { alert("Gagal simpan: " + e.message); }
    });

    const btnSelfLearn = document.getElementById("btn-run-self-learning");
    if (btnSelfLearn) {
      btnSelfLearn.onclick = () => {
        alert("Self-Learning jalan otomatis di cloud jam 06:00, 12:00, 18:00, dan 21:00 WIB. Hasilnya muncul di sini setelah jadwal berikutnya selesai.");
      };
    }
  }

  function bindAuthForms() {
    const fl = document.getElementById("form-login");
    if (fl) fl.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(fl);
      try {
        const r = await api("/api/login", { username: f.get("username"), password: f.get("password") });
        state.authError = "";
        state.user = r.user;
        state.users = null;
        state.auth = r.user.must_change ? "change" : "checking";
        render();
        if (!r.user.must_change) await loadState();
      } catch (err) { state.authError = err.message; state.auth = "login"; render(); }
    };
    const fp = document.getElementById("form-password");
    if (fp) fp.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(fp);
      if (f.get("new_password") !== f.get("new_password2")) { state.authError = "Password baru tidak sama"; render(); return; }
      try {
        await api("/api/password", { old_password: f.get("old_password"), new_password: f.get("new_password") });
        state.authError = "";
        const wasForced = state.auth === "change";
        state.auth = "checking";
        if (!wasForced) { state.tab = "overview"; alert("Password sudah diganti."); }
        await loadState();
      } catch (err) { state.authError = err.message; render(); }
    };
    document.querySelectorAll("[data-logout]").forEach(b => b.onclick = async () => {
      try { await api("/api/logout", {}); } catch (_) {}
      state.user = null; state.users = null; state.raw = JSON.parse(JSON.stringify(EMPTY)); state.data = JSON.parse(JSON.stringify(EMPTY));
      state.auth = "login"; state.tab = "overview"; render();
    });
    const ss = document.getElementById("sel-store");
    if (ss) ss.onchange = (e) => {
      state.store = e.target.value;
      try { localStorage.setItem("TERASEHAT_STORE", state.store); } catch (_) {}
      applyStore();
      render();
    };
  }

  function bindUserAdmin(container) {
    const reloadUsers = async (msg) => { state.flash = msg || ""; state.users = null; state.editUser = null; render(); };
    const checked = (name) => [...container.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
    const fc = container.querySelector("[data-flash-close]");
    if (fc) fc.onclick = () => { state.flash = ""; render(); };
    const addAcct = document.getElementById("btn-acct-add");
    if (addAcct) addAcct.onclick = async () => {
      try {
        await api("/api/store-accounts", { action: "add", handle: document.getElementById("sa-handle").value,
          store_code: document.getElementById("sa-store").value, kind: document.getElementById("sa-kind").value });
        await loadState(); state.flash = "Akun ditambahkan. Label video ikut diperbarui."; render();
      } catch (e) { alert("Gagal: " + e.message); }
    };
    container.querySelectorAll("[data-acct-remove]").forEach(b => b.onclick = async () => {
      if (!confirm(`Hapus @${b.dataset.acctRemove} dari daftar akun toko? Videonya akan dihitung sebagai Afiliasi.`)) return;
      try { await api("/api/store-accounts", { action: "remove", handle: b.dataset.acctRemove }); await loadState(); }
      catch (e) { alert("Gagal: " + e.message); }
    });
    const ssShow = (r) => (r.result || []).map(x => x.error ? `${x.month}: ${x.error}` : `${x.month}: ${x.days} hari, omzet ${rp(x.omzet)}`).join("<br>");
    const ssSave = document.getElementById("btn-ss-save");
    if (ssSave) ssSave.onclick = async () => {
      try {
        const r = await api("/api/sales-sync", { month: document.getElementById("ss-month").value, sheet_url: document.getElementById("ss-url").value });
        await loadState(); state.flash = "Sheet tersimpan.<br>" + ssShow(r); render();
      } catch (e) { alert("Gagal: " + e.message); }
    };
    const ssSync = document.getElementById("btn-ss-sync");
    if (ssSync) ssSync.onclick = async () => {
      try { const r = await api("/api/sales-sync", {}); await loadState(); state.flash = "Omzet toko dibaca ulang.<br>" + ssShow(r); render(); }
      catch (e) { alert("Gagal: " + e.message); }
    };
    const create = document.getElementById("btn-user-create");
    if (create) create.onclick = async () => {
      const body = { action: "create", username: document.getElementById("nu-username").value, name: document.getElementById("nu-name").value,
        role: document.getElementById("nu-role").value, stores: checked("nu-store") };
      if (body.role === "adv" && !body.stores.length) { alert("Advertiser harus punya minimal 1 toko."); return; }
      try {
        const r = await api("/api/users", body);
        reloadUsers(`User <b>${esc(r.username)}</b> dibuat. Password sementara: <code>${esc(r.temp_password)}</code>. Kirim ke orangnya lewat jalur pribadi; dia wajib ganti saat login pertama. Password ini tidak ditampilkan lagi.`);
      } catch (e) { alert("Gagal: " + e.message); }
    };
    container.querySelectorAll("[data-user-edit]").forEach(b => b.onclick = () => { state.editUser = Number(b.dataset.userEdit); render(); });
    container.querySelectorAll("[data-user-cancel]").forEach(b => b.onclick = () => { state.editUser = null; render(); });
    container.querySelectorAll("[data-user-save]").forEach(b => b.onclick = async () => {
      const role = document.getElementById("eu-role").value;
      const stores = checked("eu-store");
      if (role === "adv" && !stores.length) { alert("Advertiser harus punya minimal 1 toko."); return; }
      try {
        await api("/api/users", { action: "update", id: Number(b.dataset.userSave), name: document.getElementById("eu-name").value, role, stores });
        reloadUsers("Perubahan user disimpan.");
      } catch (e) { alert("Gagal: " + e.message); }
    });
    container.querySelectorAll("[data-user-reset]").forEach(b => b.onclick = async () => {
      const u = state.users.find(x => x.id === Number(b.dataset.userReset));
      if (!confirm(`Reset password ${u.name}? Dia akan keluar dari semua perangkat dan wajib pakai password sementara baru.`)) return;
      try {
        const r = await api("/api/users", { action: "reset", id: u.id });
        reloadUsers(`Password <b>${esc(r.username)}</b> direset. Password sementara: <code>${esc(r.temp_password)}</code>. Tidak ditampilkan lagi.`);
      } catch (e) { alert("Gagal: " + e.message); }
    });
    container.querySelectorAll("[data-user-toggle]").forEach(b => b.onclick = async () => {
      const u = state.users.find(x => x.id === Number(b.dataset.userToggle));
      if (u.active && !confirm(`Nonaktifkan ${u.name}? Dia langsung keluar dan tidak bisa login.`)) return;
      try {
        await api("/api/users", { action: "update", id: u.id, active: !u.active });
        reloadUsers(u.active ? `${esc(u.name)} dinonaktifkan.` : `${esc(u.name)} diaktifkan lagi.`);
      } catch (e) { alert("Gagal: " + e.message); }
    });
  }

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.onclick = () => {
      state.tab = btn.dataset.tab;
      if (state.tab === "users") state.users = null;
      window.scrollTo({ top: 0, behavior: "smooth" });
      render();
    };
  });

  document.getElementById("app-modal").onclick = (e) => {
    if (e.target.id === "app-modal") { e.target.classList.remove("open"); document.getElementById("app-modal-content").classList.remove("modal-wide"); }
  };

  render();
  loadState();
})();
