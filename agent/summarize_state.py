"""Ringkas /api/state jadi input kecil buat Claude Brain (hemat kuota).

Pakai: python3 agent/summarize_state.py /tmp/state.json > /tmp/summary.json
"""
import json
import re
import sys

KEEP = ["id", "script_code", "creative_name", "title", "published_at", "duration_s", "views", "shares",
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


def main(path):
    d = json.load(open(path))
    ads = sorted(d.get("contents_ads", []), key=lambda x: x.get("total_score") or 0, reverse=True)
    scripts = d.get("scripts_briefs", [])
    ads_paid = [a for a in ads if (a.get("ad_spend_idr") or 0) >= 20000]
    nums = list(trs_numbers(ads, "script_code", "creative_name")) + list(trs_numbers(scripts, "script_code", "creative_name"))

    summary = {
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
            for x in d.get("winning_dna", [])
        ],
        "iklan_gmv_max": {
            "catatan": "hold_2s_pct = % penonton iklan yang bertahan 2 detik (kekuatan hook). roas = omzet/biaya.",
            "roi_terbaik": [slim(a, True) for a in sorted(ads_paid, key=lambda x: -(x.get("roas") or 0))[:5]],
            "roi_terburuk": [slim(a, True) for a in sorted(ads_paid, key=lambda x: (x.get("roas") or 0))[:5]],
            "total_biaya": sum(a.get("ad_spend_idr") or 0 for a in ads_paid),
            "total_omzet": sum(a.get("gmv_idr") or 0 for a in ads_paid),
        },
        "radar_kompetitor": d.get("competitor_radar", [])[:5],
        "nomor_trs_berikutnya": max([146] + nums) + 1,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main(sys.argv[1])
