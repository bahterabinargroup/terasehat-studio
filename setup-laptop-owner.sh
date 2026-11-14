#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "🚀 SETUP OTOMATIS PIPELINE TERASEHAT (LAPTOP OWNER)"
echo "=========================================================="

if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ File .env dibuat dari .env.example"
fi

set -a
source .env
set +a

echo ""
echo "1️⃣ Mengecek koneksi login Cloudflare Wrangler..."
if ! npx --yes wrangler whoami >/dev/null 2>&1; then
  echo "👉 Silakan login ke akun Cloudflare di jendela browser yang terbuka:"
  npx --yes wrangler login
fi

echo ""
echo "2️⃣ Membuat / mengecek Database Cloudflare D1 (terasehat-db)..."
D1_OUT=$(npx --yes wrangler d1 create terasehat-db 2>&1 || true)
DB_ID=$(echo "$D1_OUT" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n 1 || true)

if [ -z "$DB_ID" ]; then
  DB_ID=$(npx --yes wrangler d1 list 2>&1 | grep "terasehat-db" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n 1 || true)
fi

if [ -n "$DB_ID" ]; then
  echo "✅ Database D1 ditemukan: $DB_ID"
  python3 -c "
p = open('wrangler.toml').read()
import re
p = re.sub(r'database_id\s*=\s*\"[^\"]*\"', f'database_id = \"$DB_ID\"', p)
open('wrangler.toml', 'w').write(p)
"
  echo "✅ wrangler.toml di-update dengan database_id"
fi

echo ""
echo "3️⃣ Menjalankan migrasi tabel schema.sql ke Cloudflare D1..."
npx --yes wrangler d1 execute terasehat-db --remote --file=./schema.sql

echo ""
echo "4️⃣ Membuat Project Cloudflare Pages (terasehat-studio) & Deploy Dashboard..."
npx --yes wrangler pages project create terasehat-studio --production-branch main >/dev/null 2>&1 || true
npx --yes wrangler pages deploy public --project-name terasehat-studio --branch main --commit-dirty=true

echo ""
echo "5️⃣ Memasang Secret SCRAPECREATORS_API_KEY ke Cloudflare Pages..."
if [ -n "$SCRAPECREATORS_API_KEY" ]; then
  printf "%s" "$SCRAPECREATORS_API_KEY" | npx --yes wrangler pages secret put SCRAPECREATORS_API_KEY --project-name terasehat-studio || true
fi

echo ""
echo "=========================================================="
echo "🎉 SELESAI! Dashboard Pipeline Terasehat sudah aktif!"
echo "👉 Untuk menjalankan evaluasi AI Claude Brain kapan saja:"
echo "   bash agent/garap-terasehat.sh"
echo "=========================================================="
