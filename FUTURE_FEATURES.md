# Files giữ lại - Sẽ build và sử dụng sau khi cleanup

## 🎮 GAMIFICATION
- `services/gamification/achievementEngine.js` — engine xử lý thành tích, rank up
- `services/gamification/gamificationRewardService.js` — hệ thống reward
- `services/gamification/realtime/realtimeLeaderboardService.js` — push realtime khi BXH thay đổi
- `services/gamification/realtime/realtimeMissionService.js` — push realtime khi hoàn thành mission
- `services/gamification/realtime/realtimeRewardService.js` — push realtime khi nhận reward
- `services/gamification/realtime/realtimeComboService.js` — combo multiplier (x2, x3 điểm)

## 🔔 NOTIFICATION SYSTEM
- `services/notification/notificationTemplates.js` — templates: leaderboard, flash sales, voucher, game reward
- `services/notification/notificationEngine.js` — engine gửi thông báo
- `services/notification/notificationDispatcher.js` — dispatch thông báo đến user
- `services/notification/notificationCooldownService.js` — tránh spam thông báo
- `services/notification/notificationQueueService.js` — queue thông báo
- `services/notification/notificationPreferenceService.js` — user tự chọn loại thông báo muốn nhận
- `services/notification/notificationRetryService.js` — retry khi gửi thất bại

## 📦 ORDER PIPELINE
- `services/order/orderOrchestratorService.js` — orchestrate: voucher + reward + notification sau order
- `services/order/orderCRMService.js` — sync member lên iPOS sau order
- `services/order/orderCampaignService.js` — cập nhật campaign spending (flash sales)
- `services/order/orderNotificationService.js` — gửi thông báo khi tạo order
- `services/order/orderRealtimeService.js` — push realtime đến admin khi có order mới
- `services/order/orderRewardService.js` — cộng XP/điểm khi user đặt hàng
- `services/order/orderVoucherService.js` — validate + apply voucher khi checkout

## 🎟 VOUCHER
- `services/playerService.js` — quản lý player data
- `services/voucherValidationService.js` — validate voucher khi checkout
- `services/voucherUsageService.js` — track voucher usage
- `services/iposVoucherSyncService.js` — sync voucher với iPOS CRM

## 📊 ANALYTICS
- `services/analytics/` — tracking & reporting (giữ nguyên)

## 🗺 KẾ HOẠCH BUILD SAU:
1. **Notification system** — thăng hạng thành viên, thăng BXH game, flash sales
2. **Leaderboard realtime** — Socket.IO push khi BXH thay đổi
3. **Combo system** — multiplier điểm khi đặt hàng/chơi game liên tiếp
4. **Voucher checkout** — apply voucher khi đặt hàng
5. **Order pipeline** — orchestrate đầy đủ sau khi thanh toán
6. **iPOS voucher sync** — voucher từ app sync về iPOS CRM
