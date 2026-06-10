const fs = require('fs');
const file = 'routes/iposWebhookRoutes.js';
let content = fs.readFileSync(file, 'utf8');

const old = `      // 5. Sync spending vào Supabase → leaderboard cập nhật ngay
      // Nếu đã có instant sync từ MoMo IPN trong vòng 10 phút → bỏ qua
      try {
        let skipSync = false;

        // Check 1: foodbook_code trong notify_order_online
        const foodbookCode = body.notify_order_online?.foodbook_code
          || body.sale_manager?.foodbook_code
          || body.membership_log?.foodbook_code;
        if (foodbookCode) {
          const { data: existingOrder } = await supabase
            .from("orders")
            .select("spending_synced")
            .eq("order_code", "ORD-" + foodbookCode)
            .maybeSingle();
          if (existingOrder?.spending_synced === true) {
            skipSync = true;
            console.log(\`[FOODBOOK] Skip: order already synced for \${p0}\`);
          }
        }

        // Check 2: players table có crm_synced_at trong vòng 10 phút không
        if (!skipSync) {
          const { data: player } = await supabase
            .from("players")
            .select("crm_synced_at")
            .eq("user_id", p0)
            .maybeSingle();
          if (player?.crm_synced_at) {
            const syncedAt = new Date(player.crm_synced_at).getTime();
            const tenMinAgo = Date.now() - 10 * 60 * 1000;
            if (syncedAt > tenMinAgo) {
              skipSync = true;
              console.log(\`[FOODBOOK] Skip: instant sync was \${Math.round((Date.now()-syncedAt)/1000)}s ago for \${p0}\`);
            }
          }
        }

        if (!skipSync) {
          await syncSingleUserSpending(p0);
          console.log(\`[FOODBOOK] Spending synced for \${p0} - event: \${event}\`);
        }
      } catch (syncErr) {
        console.warn(\`[FOODBOOK] Spending sync failed for \${p0}:\`, syncErr.message);
      }`;

const newStr = `      // 5. Spending đã được xử lý bởi instant sync (MoMo IPN section 3b)
      // iPos webhook chỉ dùng để update tier/hạng — không sync spending ở đây`;

if (!content.includes(old)) { console.log('ERROR: pattern not found'); process.exit(1); }
content = content.replace(old, newStr);
fs.writeFileSync(file, content, 'utf8');
console.log('✅ iPos webhook no longer syncs spending');
