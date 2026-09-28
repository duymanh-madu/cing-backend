const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../');
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');
const sql = read('db/migrations/20260927_cing_game_economy_admin_report_v1.sql');
const mirror = read('supabase/migrations/20260927213000_cing_game_economy_admin_report_v1.sql');

test('report migration mirrors match exactly',()=>assert.equal(sql,mirror));
test('read only, service role only, old wallet RPC preserved',()=>{
  assert.match(sql,/stable\s+as \$function\$/);
  assert.match(sql,/revoke all on function public\.cing_game_economy_admin_report_v1/);
  assert.match(sql,/to service_role;/);
  assert.doesNotMatch(sql,/create or replace function public\.cing_wallet_admin_summary_v1/);
  assert.doesNotMatch(sql,/create or replace function public\.cing_wallet_admin_transactions_v1/);
});
test('four distinct authoritative purchase sources; no topups or V1 plays',()=>{
  for (const name of ['cing_wallet_transactions','cing_points_revive_credit_purchases','cing_game_gift_purchases'])
    assert.match(sql,new RegExp(name));
  assert.match(sql,/wt\.reference_type = 'revive_credit_purchase'/);
  assert.match(sql,/wt\.reference_type = 'game_gift_purchase'/);
  assert.match(sql,/wt\.transaction_type = 'payment'/);
  assert.doesNotMatch(sql,/transaction_type = 'topup'/);
  assert.doesNotMatch(sql,/cing_game_play_transactions/);
});
test('gross Wallet VND distinct from points; no net revenue claim',()=>{
  assert.match(sql,/'gross_wallet_vnd'/);
  assert.match(sql,/'loyalty_points_used'/);
  assert.match(sql,/'is_net_revenue', false/);
  assert.match(sql,/WALLET_GIFT_LEDGER_MISMATCH/);
});
test('admin route retains permission and both feature gates are OFF by default',()=>{
  const route = read('routes/adminWalletRoutes.js');
  const controller = read('controllers/admin/adminWalletController.js');
  assert.match(route,/"\/game-revenue"[\s\S]*?"wallet\.reporting\.read"/);
  assert.match(controller,/CING_GAME_REVENUE_ADMIN_HTTP_ENABLED !== "true"/);
  const fe = fs.readFileSync(path.resolve(root,'../cing-game-center-v2-frontend/src/features/admin/components/AdminWallet.jsx'),'utf8');
  assert.match(fe,/VITE_CING_GAME_REVENUE_ADMIN_UI_ENABLED === "true"/);
});
