const express  = require('express');
const router   = express.Router();
const supabase = require('../supabase');
const foodbook = require('../services/foodbook');

/**
 * POST /webhook/foodbook
 * Nhận event từ Foodbook khi có thay đổi
 */
router.post('/foodbook', async (req, res) => {
  res.json({ ok: true }); // Trả về ngay để Foodbook không timeout

  const { event_id, event } = req.body;
  console.log('[WEBHOOK] Foodbook event:', event_id, event);

  try {
    // Event 12: item_changed - menu thay đổi
    if (event_id === 12 || event === 'item_changed') {
      console.log('[WEBHOOK] Menu changed - refreshing cache...');

      // Xóa Redis cache menu để force fetch mới
      const Redis = require('ioredis');
      const redis = new Redis(process.env.REDIS_URL);
      
      // Xóa tất cả cache menu
      const keys = await redis.keys('menu:*');
      if (keys.length > 0) await redis.del(...keys);
      console.log('[WEBHOOK] Cleared', keys.length, 'menu cache keys');
      
      redis.disconnect();

      // Broadcast Socket.IO để frontend biết refresh menu
      const io = global._ioInstance;
      if (io) {
        io.emit('menu.updated', { 
          timestamp: new Date().toISOString(),
          message: 'Menu đã được cập nhật'
        });
        console.log('[WEBHOOK] Broadcasted menu.updated');
      }
    }
  } catch(e) {
    console.error('[WEBHOOK] Error:', e.message);
  }
});

module.exports = router;
