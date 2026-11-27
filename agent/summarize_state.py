"""Ringkas /api/state jadi input kecil buat Claude Brain (hemat kuota).

Pakai: python3 agent/summarize_state.py /tmp/state.json TS > /tmp/summary_TS.json
Argumen kedua = kode toko. Ringkasan hanya berisi data toko itu (Brain jalan per toko).
"""
import json
import re
import sys

KEEP = ["id", "account_type", "creator_name", "script_code", "creative_name", "title", "published_at", "duration_s", "views", "shares",
        "saves", "er_pct", "outlier_score", "gmv_idr", "orders", "ad_spend_idr", "roas", "ctr_pct",
        "hook_3s", "total_score", "rank_tier", "claude_evaluation", "source", "ads_period",
        "product_clicks", "ad_cvr_pct", "hold_2s_pct", "hold_6s_pct", "completion_pct"]


def slim(row, with_transcript=False):
    out = {k: row.get(k) for k in KEEP if row.get(k) not in (None, "")}
    if with_transcript and row.get("transcript_full"):
        out["transcript"] = row["transcript_full"][:1200]
    return out


def trs_numbers(rows, *keys):
    for r in rows:
        for k in keys:
            for m in re.finditer(r"TRS-?(\d{2,})", str(r.get(k) or ""), re.I):
                yield int(m.group(1))


def per_kind(ads):
    out = {}
    for kind in ("OFFICIAL", "MARKETING", "AFFILIATE"):
        rows = [a for a in ads if a.get("account_type") == kind]
        spend = sum(a.get("ad_spend_idr") or 0 for a in rows)
        gmv = sum(a.get("gmv_idr") or 0 for a in rows)
        out[kind] = {
            "jumlah_video": len(rows), "biaya_iklan": spend, "gmv": gmv, "roas": round(gmv / spend, 2) if spend else 0,
            "views": sum(a.get("views") or 0 for a in rows),
            "top_3": [slim(a) for a in sorted(rows, key=lambda x: -(x.get("total_score") or 0))[:3]],
        }
    return out


def radar(rows):
    """Catatan kompetitor: yang belum punya rekomendasi dulu (wajib diisi Brain), lalu yang terbaru sebagai bahan belajar."""
    keys = ("id", "source", "brand_or_creator", "handle", "title_or_hook", "views", "likes", "shares", "followers", "ai_takeaway", "added_by")
    slim_r = lambda r: {k: r.get(k) for k in keys if r.get(k) not in (None, "", 0)}
    todo = [slim_r(r) for r in rows if not (r.get("ai_takeaway") or "").strip()][:8]
    done = [slim_r(r) for r in sorted([r for r in rows if (r.get("ai_takeaway") or "").strip()], key=lambda r: -(r.get("views") or 0))[:5]]
    return {"perlu_rekomendasi": todo, "sudah_dianalisis": done}


def main(path, store):
    d = json.load(open(path))
    all_ads, all_scripts = d.get("contents_ads", []), d.get("scripts_briefs", [])
    mine = lambda rows: [r for r in rows if (r.get("store_code") or "") == store]
    ads = sorted(mine(all_ads), key=lambda x: x.get("total_score") or 0, reverse=True)
    scripts = mine(all_scripts)
    toko = next((s for s in d.get("stores", []) if s.get("code") == store), {"code": store})
    ads_paid = [a for a in ads if (a.get("ad_spend_idr") or 0) >= 20000]
    # Nomor TRS dipakai bersama semua toko, jadi dihitung dari seluruh data.
    nums = list(trs_numbers(all_ads, "script_code", "creative_name")) + list(trs_numbers(all_scripts, "script_code", "creative_name"))

    summary = {
        "store_code": store,
        "toko": {"kode": store, "nama": toko.get("name"), "akun_tiktok": toko.get("tiktok_handles"),
                 "iklan_tersambung": bool(toko.get("advertiser_id"))},
        "akun_toko": [{k: a.get(k) for k in ("handle", "kind", "display_name")} for a in mine(d.get("store_accounts", []))],
        "per_jenis_akun": per_kind(ads),
        "jumlah_konten": len(ads),
        "konten_dengan_data_penjualan": sum(1 for a in ads if (a.get("gmv_idr") or 0) > 0),
        "top_5": [slim(a, True) for a in ads[:5]],
        "bottom_5": [slim(a, True) for a in ads[-5:]] if len(ads) > 5 else [],
        "visual_guides": [
            {k: s.get(k) for k in ("script_code", "creative_name", "title", "human_status", "human_notes", "created_at")}
            for s in scripts[:30]
        ],
        "jumlah_waiting_check": sum(1 for s in scripts if s.get("human_status") == "waiting_check"),
        "winning_dna": [
            {k: x.get(k) for k in ("id", "category", "title", "formula_hook", "confidence_score")}
            for x in mine(d.get("winning_dna", []))
        ],
        "iklan_gmv_max": {
            "catatan": "hold_2s_pct = % penonton iklan yang bertahan 2 detik (kekuatan hook). roas = omzet/biaya.",
            "roi_terbaik": [slim(a, True) for a in sorted(ads_paid, key=lambda x: -(x.get("roas") or 0))[:5]],
            "roi_terburuk": [slim(a, True) for a in sorted(ads_paid, key=lambda x: (x.get("roas") or 0))[:5]],
            "total_biaya": sum(a.get("ad_spend_idr") or 0 for a in ads_paid),
            "total_omzet": sum(a.get("gmv_idr") or 0 for a in ads_paid),
        },
        "craft_prompt_diminta": [
            {"script_code": s.get("script_code"), "creative_name": s.get("creative_name"), "title": s.get("title"),
             "product_focus": s.get("product_focus"), "format": s.get("format"), "target_account": s.get("target_account"),
             "based_on_dna": s.get("based_on_dna"), "segments": json.loads(s.get("visual_guide_json") or "[]"),
             "catatan_syuting": s.get("creative_guide"), "pilihan_tim": json.loads(s.get("craft_json") or "{}"),
             "draf_prompt": s.get("craft_prompt")}
            for s in scripts if s.get("craft_json") and s.get("craft_status") == "draft"
        ][:6],
        "radar_kompetitor": radar(mine(d.get("competitor_radar", []))),
        "nomor_trs_berikutnya": max([146] + nums) + 1,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("Pakai: summarize_state.py STATE.json KODE_TOKO")
    main(sys.argv[1], sys.argv[2].upper())
