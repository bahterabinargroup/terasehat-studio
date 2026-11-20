// Jenis akun tiap video: OFFICIAL (akun utama toko), MARKETING (akun pemasaran toko), AFFILIATE (pihak luar).
// Sumber kebenaran = tabel store_accounts. Dipanggil setelah data baru masuk.
export async function classifyAccounts(env, storeCode) {
  const where = storeCode ? "WHERE store_code = ?1" : "";
  const st = env.DB.prepare(`
    UPDATE contents_ads SET account_type = COALESCE(
      (SELECT sa.kind FROM store_accounts sa WHERE sa.store_code = contents_ads.store_code AND '@' || sa.handle = lower(contents_ads.creator_name)),
      CASE WHEN account_type = 'OFFICIAL' THEN 'OFFICIAL' ELSE 'AFFILIATE' END)
    ${where}`);
  await (storeCode ? st.bind(storeCode) : st).run();
}
