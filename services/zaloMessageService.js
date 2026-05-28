const axios  = require('axios');
const supabase = require('../supabase');

/**
 * Lấy Zalo OA access token từ DB
 */
async function getZaloToken() {
  const { data } = await supabase.from('app_configs')
    .select('zalo_oa_access_token').eq('id', 1).single();
  return data?.zalo_oa_access_token;
}

/**
 * Gửi tin nhắn Zalo OA đến 1 user (cần zalo_user_id)
 */
async function sendZaloOAMessage({ zalo_user_id, title, message }) {
  try {
    const token = await getZaloToken();
    if (!token) throw new Error('No Zalo OA token');

    const res = await axios.post(
      'https://openapi.zalo.me/v3.0/oa/message/cs',
      {
        recipient: { user_id: zalo_user_id },
        message: {
          text: `${title}\n\n${message}`,
        }
      },
      { headers: { access_token: token } }
    );
    return { success: true, data: res.data };
  } catch(e) {
    return { success: false, error: e.response?.data?.message || e.message };
  }
}

/**
 * Gửi tin nhắn theo UID (số điện thoại)
 * Zalo Business API - cần được duyệt
 */
async function sendByUID({ phone, title, message }) {
  try {
    // Tìm zalo_user_id từ phone
    const { data: player } = await supabase.from('players')
      .select('zalo_user_id, zalo_name')
      .eq('user_id', phone).single();

    if (!player?.zalo_user_id) {
      return { success: false, error: 'User chưa có zalo_user_id', channel: 'uid' };
    }

    return sendZaloOAMessage({ zalo_user_id: player.zalo_user_id, title, message });
  } catch(e) {
    return { success: false, error: e.message };
  }
}

/**
 * Gửi ZBS - Zalo Broadcast Service
 * Gửi hàng loạt đến followers OA
 */
async function sendZBS({ title, message, follower_ids = [] }) {
  try {
    const token = await getZaloToken();
    if (!token) throw new Error('No Zalo OA token');

    // Nếu có danh sách follower_ids cụ thể
    if (follower_ids.length > 0) {
      let sent = 0, failed = 0;
      for (const uid of follower_ids) {
        const r = await sendZaloOAMessage({ zalo_user_id: uid, title, message });
        if (r.success) sent++; else failed++;
        await new Promise(r => setTimeout(r, 100)); // Rate limit
      }
      return { success: true, sent, failed, channel: 'zbs' };
    }

    // Broadcast đến tất cả followers có zalo_user_id
    const { data: followers } = await supabase.from('players')
      .select('zalo_user_id')
      .not('zalo_user_id', 'is', null)
      .eq('zalo_follow_oa', true);

    if (!followers?.length) return { success: true, sent: 0, message: 'Chưa có followers', channel: 'zbs' };

    let sent = 0, failed = 0;
    for (const f of followers) {
      const r = await sendZaloOAMessage({ zalo_user_id: f.zalo_user_id, title, message });
      if (r.success) sent++; else failed++;
      await new Promise(r => setTimeout(r, 100));
    }
    return { success: true, sent, failed, channel: 'zbs' };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

module.exports = { sendZaloOAMessage, sendByUID, sendZBS };
