#!/usr/bin/env bash
# ============================================================================
# GARAP-TERASEHAT.SH — Worker Lokal Penghubung Cloudflare <-> Claude Pro
# Dijalankan 2x sehari (09:00 & 21:00 WIB) atau manual dari laptop Owner.
# ============================================================================
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

DASHBOARD_URL="${DASHBOARD_URL:-https://terasehat-studio.pages.dev}"
echo "🔄 [1/4] Menarik data terbaru TikTok & TikTok Shop via ScrapeCreators..."
curl -s -X POST "$DASHBOARD_URL/api/scrape" -H "x-pipeline-secret: $PIPELINE_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"handle\":\"${TIKTOK_HANDLE:-terasehat}\"}" >/tmp/terasehat_scrape.json || true

echo "📊 [2/4] Mengambil ringkasan Ranking Top-to-Bottom (Winner vs Boncos) dari Dashboard..."
STATE_JSON=$(curl -s "$DASHBOARD_URL/api/state" -H "x-pipeline-secret: $PIPELINE_SECRET")
echo "$STATE_JSON" > /tmp/terasehat_state.json

# Ringkas hanya Top 5 & Bottom 5 agar kuota Claude Pro tetap super hemat
SUMMARY=$(python3 - <<'EOF'
import json
try:
    d = json.load(open("/tmp/terasehat_state.json"))
    ads = sorted(d.get("contents_ads", []), key=lambda x: x.get("total_score", 0), reverse=True)
    top5 = ads[:5]
    bot3 = ads[-3:] if len(ads) > 5 else []
    print(json.dumps({"top_winning": top5, "bottom_boncos": bot3, "radar": d.get("competitor_radar", [])[:4]}, ensure_ascii=False, indent=2))
except Exception as e:
    print("{}")
EOF
)

if command -v claude >/dev/null 2>&1; then
  echo "🧠 [3/4] Menjalankan Claude Pro (Self-Learning DNA + Generate Script Baru)..."
  PROMPT_HEADER=$(cat agent/PROMPT_BRAIN_CLAUDE.md)
  CLAUDE_OUT=$(claude -p "${PROMPT_HEADER}

Berikut adalah ringkasan performa terbaru Terasehat:
${SUMMARY}

Hasilkan output JSON murni sesuai instruksi." --output-format text 2>/dev/null || true)

  if [ -n "$CLAUDE_OUT" ]; then
    # Ambil JSON murni dari output Claude (buang ```json fence / teks pembuka kalau ada)
    printf "%s" "$CLAUDE_OUT" | python3 -c '
import sys, json
t = sys.stdin.read()
s, e = t.find("{"), t.rfind("}")
try:
    json.dump(json.loads(t[s:e+1]), sys.stdout, ensure_ascii=False)
except Exception:
    sys.stdout.write(t)
' > /tmp/terasehat_brain_out.json
    echo "🚀 [4/4] Mengirim Winning DNA, Script Baru (Check by Human), & Checklist ke Dashboard Cloudflare..."
    curl -s -X POST "$DASHBOARD_URL/api/brain-sync" -H "x-pipeline-secret: $PIPELINE_SECRET" \
      -H "Content-Type: application/json" \
      --data-binary @/tmp/terasehat_brain_out.json >/dev/null || true
    echo "✅ Siklus Self-Learning Claude selesai & Dashboard telah diperbarui!"
  else
    echo "⚠️ Output Claude kosong, lewati update."
  fi
else
  echo "ℹ️ Claude CLI belum aktif di terminal ini. Install dengan: npm install -g @anthropic-ai/claude-code"
fi
