// Endpoint Penarik Data ScrapeCreators:
// 1. TikTok Profile & Videos (+ Transkrip WebVTT)
// 2. TikTok Shop & TikTok Ads Library
// 3. Find Creator Emails (https://docs.scrapecreators.com/v1/find-creator-emails)

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const mode = body.mode || "tiktok_account"; // tiktok_account | ads_library | tiktok_shop | creator_emails
    const handle = (body.handle || "terasehat2").replace(/^@/, "").trim();
    const keyword = (body.keyword || "herbal kesehatan").trim();
    const apiKey = env.SCRAPECREATORS_API_KEY;
    // Toko pemilik akun TikTok ini (dari body, atau dicari di tabel stores). Data scrape hanya masuk ke toko itu.
    let storeCode = String(body.store_code || "").toUpperCase();
    if (!storeCode && env.DB) {
      const rows = (await env.DB.prepare("SELECT code, tiktok_handles FROM stores").all()).results || [];
      const hit = rows.find((r) => JSON.parse(r.tiktok_handles || "[]").map((h) => String(h).toLowerCase()).includes(handle.toLowerCase()));
      storeCode = hit ? hit.code : "";
    }
    if (!storeCode && (body.mode || "tiktok_account") === "tiktok_account") {
      return Response.json({ ok: false, error: `Akun @${handle} belum terdaftar di toko mana pun (tabel stores).` }, { status: 400 });
    }

    if (!apiKey) {
      return Response.json({ ok: false, error: "SCRAPECREATORS_API_KEY belum diset di environment Cloudflare." }, { status: 503 });
    }

    const headers = { "x-api-key": apiKey, "User-Agent": "Mozilla/5.0" };

    if (mode === "tiktok_account") {
      // Cuma 1 request (1 kredit): 10 video terbaru. Data profil tidak ditarik biar hemat kredit.
      const vidRes = await fetch(`https://api.scrapecreators.com/v3/tiktok/profile/videos?handle=${encodeURIComponent(handle)}&region=${encodeURIComponent(body.region || "ID")}&sort_by=${body.sort_by === "popular" ? "popular" : "latest"}`, { headers });
      const vids = await vidRes.json();
      const awemes = vids.aweme_list || [];

      let avgViews = awemes.length
        ? Math.max(1, Math.round(awemes.reduce((s, v) => s + ((v.statistics && v.statistics.play_count) || 0), 0) / awemes.length))
        : 1;
      // Bandingkan dengan rata-rata seluruh video akun di database, bukan cuma 10 video terbaru,
      // biar video sepi tidak dapat skor tinggi hanya karena tetangganya juga sepi.
      if (env.DB) {
        const hist = await env.DB.prepare(
          "SELECT AVG(views) AS a, COUNT(*) AS n FROM contents_ads WHERE creator_name = ?1"
        ).bind("@" + handle).first();
        if (hist && hist.n >= 20 && hist.a > avgViews) avgViews = Math.round(hist.a);
      }

      const items = await Promise.all(awemes.slice(0, 15).map(async (v) => {
        const st = v.statistics || {};
        const views = st.play_count || 0;
        const isCarousel = !!v.image_post_info;
        const likes = st.digg_count || 0;
        const comments = st.comment_count || 0;
        const shares = st.share_count || 0;
        const saves = st.collect_count || 0;
        const er = views > 0 ? Math.round(((likes + comments + shares + saves) / views) * 10000) / 100 : 0;
        const outlier = Math.round((views / avgViews) * 100) / 100;
        const desc = (v.desc || "").trim();

        // Cek kode creative di caption (TRS146-NB-YOUMILK-VID-DD-H1, juga format lama TRS-101)
        const codeMatch = desc.match(/\bTRS-?(\d{2,})((?:-[A-Z0-9]+)*)/i);
        const scriptCode = codeMatch ? "TRS" + codeMatch[1] : "";
        const creativeName = codeMatch ? ("TRS" + codeMatch[1] + (codeMatch[2] || "")).toUpperCase() : "";

        // Ekstrak subtitle Bahasa Indonesia
        let hook3s = "";
        let transcriptFull = "";
        const caps = (v.video && v.video.cla_info && v.video.cla_info.caption_infos) || [];
        const idCap = caps.find(c => (c.lang || "").includes("ind")) || caps[0];
        if (idCap && idCap.url) {
          try {
            const subResp = await fetch(idCap.url);
            const rawVtt = await subResp.text();
            const lines = rawVtt.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("WEBVTT") && !l.includes("-->") && !/^\d+$/.test(l));
            transcriptFull = lines.join(" ");
            hook3s = transcriptFull.split(/\s+/).slice(0, 22).join(" ");
          } catch (_) {}
        }

        // Hitung skor organik awal (0-100)
        // Engagement baru dihitung penuh setelah 1.000 views; video sepi tidak boleh menang karena 1 share.
        const conf = Math.min(1, views / 1000);
        const score = Math.min(100, Math.round(outlier * 28 + (er * 4 + (shares / Math.max(views, 1)) * 2000) * conf));
        const tier = score >= 75 ? "WINNING" : (score >= 45 ? "POTENSIAL" : "BONCOS");

        return {
          id: v.aweme_id,
          script_code: scriptCode || ("VID-" + String(v.aweme_id).slice(-4)),
          creative_name: creativeName,
          title: (isCarousel ? "[CAR] " : "[VID] ") + (desc.split("#")[0].trim().slice(0, 90) || "(Tanpa judul)"),
          creator_name: "@" + handle,
          published_at: v.create_time ? new Date(v.create_time * 1000).toISOString().slice(0, 10) : "",
          duration_s: Math.round(((v.video && v.video.duration) || 0) / 100) / 10,
          views,
          likes,
          comments,
          shares,
          saves,
          er_pct: er,
          outlier_score: outlier,
          hook_3s: hook3s || desc.slice(0, 100),
          transcript_full: transcriptFull,
          total_score: score,
          rank_tier: tier,
          video_url: `https://www.tiktok.com/@${handle}/video/${v.aweme_id}`,
          is_carousel: isCarousel
        };
      }));

      // Simpan ke D1. Metrik Seller Center (GMV, ROAS, dll.) yang sudah ada tidak ditimpa.
      if (env.DB) {
        for (const it of items) {
          await env.DB.prepare(`
            INSERT INTO contents_ads
            (id, account_type, script_code, creative_name, title, creator_name, published_at, duration_s, views, likes, comments, shares, saves,
             er_pct, outlier_score, hook_3s, transcript_full, total_score, rank_tier, video_url, source, store_code, updated_at)
            VALUES (?1, 'OWN', ?2, ?3, ?4, ?19, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, 'tiktok_scrape', ?20, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              script_code = excluded.script_code, creative_name = excluded.creative_name,
              title = excluded.title, duration_s = excluded.duration_s,
              views = excluded.views, likes = excluded.likes, comments = excluded.comments,
              shares = excluded.shares, saves = excluded.saves, er_pct = excluded.er_pct,
              outlier_score = excluded.outlier_score, hook_3s = excluded.hook_3s,
              transcript_full = CASE WHEN excluded.transcript_full != '' THEN excluded.transcript_full ELSE contents_ads.transcript_full END,
              total_score = CASE WHEN contents_ads.gmv_idr > 0 THEN contents_ads.total_score ELSE excluded.total_score END,
              rank_tier = CASE WHEN contents_ads.gmv_idr > 0 THEN contents_ads.rank_tier ELSE excluded.rank_tier END,
              video_url = excluded.video_url, account_type = COALESCE(contents_ads.account_type, 'OWN'),
              store_code = COALESCE(contents_ads.store_code, excluded.store_code), updated_at = datetime('now')
          `).bind(
            String(it.id), it.script_code, it.creative_name, it.title, it.published_at, it.duration_s,
            it.views, it.likes, it.comments, it.shares, it.saves, it.er_pct, it.outlier_score,
            it.hook_3s, it.transcript_full, it.total_score, it.rank_tier, it.video_url, it.creator_name, storeCode
          ).run();
        }
      }

      return Response.json({
        ok: true,
        handle,
        store_code: storeCode,
        credits_remaining: vids.credits_remaining,
        items
      });
    }

    return Response.json({ ok: true, mode, keyword, message: "ScrapeCreators endpoint siap." });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
