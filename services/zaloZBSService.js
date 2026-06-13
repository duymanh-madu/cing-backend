const axios   = require('axios');
const supabase = require('../supabase');

// Template IDs - admin sẽ config trong DB
// Zalo ZBS API endpoint
const ZBS_API = 'https://openapi.zalo.me/v2.0/oa/message/promotion';

async function getZaloToken() {
  const { data } = await supabase.from('app_configs')
    .select('zalo_oa_access_token').eq('id', 1).single();
  return data?.zalo_oa_access_token;
}

/**
 * Gửi ZBS message đến 1 user
 */
async function sendZBSMessage({ zalo_user_id, template_id, template_data }) {
  try {
    const token = await getZaloToken();
    if (!token) throw new Error('No Zalo OA token');

    const res = await axios.post(ZBS_API, {
      recipient: { user_id: zalo_user_id },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'promotion',
            elements: [{
              template_id,
              data: template_data,
            }]
          }
        }
      }
    }, { headers: { access_token: token } });

    console.log('[ZBS] API response:', JSON.stringify(res.data));
    return { success: res.data?.error === 0, data: res.data };
  } catch(e) {
    console.error('[ZBS] API error:', e.response?.data || e.message);
    return { success: false, error: e.response?.data || e.message };
  }
}

/**
 * Gửi ZBS broadcast đến danh sách users
 * Tự động map biến từ player data
 */
async function sendZBSBroadcast({ user_ids, template_id, extra_vars = {}, store_name = 'Cing Hu Tang Kinh Bắc' }) {
  // Lấy thông tin users
  const { data: players, error: qErr } = await supabase.from('players')
    .select('user_id, zalo_name, zalo_user_id, crm_tier, total_points, crm_spend_alltime, crm_orders_alltime, first_activated_at, crm_synced_at')
    .in('user_id', user_ids)
    .not('zalo_user_id', 'is', null);
  if (qErr) console.error('[ZBS] Query error:', qErr.message);

  console.log('[ZBS] Query user_ids:', user_ids, 'Found:', players?.length, 'players:', players?.map(p=>({uid:p.user_id,zid:p.zalo_user_id})));
  if (!players?.length) return { success: true, sent: 0, failed: 0, message: 'Không có user có zalo_user_id' };

  // Lấy birthday từ customers table (players không có cột này)
  const birthdayMap = new Map();
  try {
    const { data: customers } = await supabase.from('customers')
      .select('phone, birthday')
      .in('phone', user_ids)
      .not('birthday', 'is', null);
    for (const c of (customers || [])) birthdayMap.set(c.phone, c.birthday);
  } catch(e) { console.warn('[ZBS] Birthday lookup failed:', e.message); }

  const TIER_NAMES = {
    member: 'Thành Viên', loyal: 'Hội Viên Thân Thiết',
    silver: 'Hội Viên Bạc', gold: 'Hội Viên Vàng',
    diamond: 'Hội Viên Kim Cương', partner: 'Đối Tác',
    loyal_partner: 'Đối Tác Thân Thiết',
  };

  let sent = 0, failed = 0, errors = [];

  for (const p of players) {
    // Map biến tự động từ player data
    const template_data = {
      customer_name:            p.zalo_name || 'Quý khách',
      customer_phone:           p.user_id || '',
      membership_type:          TIER_NAMES[p.crm_tier] || 'Thành Viên',
      membership_point:         String(p.total_points || 0),
      membership_point_amount:  new Intl.NumberFormat('vi-VN').format(p.total_points || 0),
      membership_payment_amount: new Intl.NumberFormat('vi-VN').format(p.crm_spend_alltime || 0),
      visit_times:              String(p.crm_orders_alltime || 0),
      store_name:               store_name,
      first_visit:              p.first_activated_at ? new Date(p.first_activated_at).toLocaleDateString('vi-VN') : '',
      last_visit:               p.crm_synced_at ? new Date(p.crm_synced_at).toLocaleDateString('vi-VN') : '',
      birthday:                 birthdayMap.get(p.user_id) || '',
      // Extra vars từ admin (voucher_code, campaign_name, etc.)
      ...extra_vars,
    };

    const result = await sendZBSMessage({
      zalo_user_id: p.zalo_user_id,
      template_id,
      template_data,
    });

    if (result.success) sent++;
    else { failed++; errors.push({ user: p.user_id, error: result.error }); }

    // Rate limit - Zalo giới hạn gửi
    await new Promise(r => setTimeout(r, 200));
  }

  return { success: true, sent, failed, errors: errors.slice(0, 5) };
}

module.exports = { sendZBSMessage, sendZBSBroadcast };
