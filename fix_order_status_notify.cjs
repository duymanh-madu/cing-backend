const fs = require('fs');

// 1. Thêm API /orders/active/:phone vào orderRoutes
const f1 = 'routes/orderRoutes.js';
let c1 = fs.readFileSync(f1, 'utf8');

const oldHistory = `router.get("/history/:phone", async (req, res) => {`;
const newActive = `// GET /orders/active/:phone — đơn đang xử lý
router.get("/active/:phone", async (req, res) => {
  try {
    const phoneNorm = normalizePhone(req.params.phone);
    const { data: orders } = await supabase.from("orders")
      .select("id,order_code,created_at,total_amount,status,items,shipping_address,note")
      .or(\`customer_phone.eq.\${phoneNorm},customer_phone.eq.84\${phoneNorm.slice(1)}\`)
      .not("status","in","(completed,cancelled,pending_payment)")
      .order("created_at",{ascending:false})
      .limit(10);

    // Lấy delivery tracking
    const ids = (orders||[]).map(o=>o.id);
    let deliveryMap = {};
    if (ids.length > 0) {
      const { data: trackings } = await supabase.from("delivery_tracking")
        .select("order_id,status,shipper_name,shipper_phone,note,updated_at")
        .in("order_id",ids).not("status","in","(completed,cancelled)");
      (trackings||[]).forEach(t => { deliveryMap[t.order_id] = t; });
    }

    const result = (orders||[]).map(o => ({
      ...o,
      delivery: deliveryMap[o.id] || null,
    }));

    res.json({ success:true, data:result });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

router.get("/history/:phone", async (req, res) => {`;

if (!c1.includes(oldHistory)) { console.log('ERROR: history not found'); process.exit(1); }
c1 = c1.replace(oldHistory, newActive);
fs.writeFileSync(f1, c1, 'utf8');
console.log('✅ /orders/active/:phone endpoint added');

// 2. Thêm notification khi đổi trạng thái đơn trong adminDeliveryRoutes
const f2 = 'routes/adminDeliveryRoutes.js';
let c2 = fs.readFileSync(f2, 'utf8');

const STATUS_MESSAGES = {
  assigned:   { title:"🛵 Shipper đang đến lấy hàng", msg:"Đơn hàng của bạn đã được gán shipper và sẽ sớm được giao!" },
  picked_up:  { title:"📦 Shipper đã lấy hàng", msg:"Đơn hàng của bạn đang trên đường giao đến bạn!" },
  delivering: { title:"🛵 Đang giao hàng", msg:"Shipper đang trên đường giao hàng đến bạn, vui lòng chú ý điện thoại!" },
  delivered:  { title:"✅ Giao hàng thành công", msg:"Đơn hàng của bạn đã được giao thành công. Cảm ơn bạn!" },
  failed:     { title:"❌ Giao hàng thất bại", msg:"Rất tiếc, giao hàng thất bại. Chúng tôi sẽ liên hệ lại với bạn." },
  completed:  { title:"🎉 Đơn hàng hoàn thành", msg:"Cảm ơn bạn đã tin tưởng Cing Hu Tang Kinh Bắc!" },
};

// Thêm notification sau khi assign shipper thành công
const oldAssignRes = `    res.json({ success:true, message:\`Đã gán shipper \${shipper_name}\`, data });`;
const newAssignRes = `    // Gửi thông báo cho khách
    try {
      const { data: ord } = await supabase.from("orders").select("customer_phone,order_code").eq("id",order_id).single();
      if (ord?.customer_phone) {
        const { broadcastNotification } = require("../services/notificationService");
        await broadcastNotification({
          template_key: "CAMPAIGN_BROADCAST",
          target_user_ids: [ord.customer_phone],
          custom: {
            title: "🛵 Shipper đang đến lấy hàng",
            message: \`Đơn \${ord.order_code} đã được gán shipper \${shipper_name}. Hàng sẽ sớm được giao!\`,
          },
        });
      }
    } catch(e) { console.warn("[DELIVERY] Notify failed:", e.message); }

    res.json({ success:true, message:\`Đã gán shipper \${shipper_name}\`, data });`;

if (!c2.includes(oldAssignRes)) { console.log('ERROR: assign res not found'); process.exit(1); }
c2 = c2.replace(oldAssignRes, newAssignRes);

// Thêm notification khi cập nhật status
const oldStatusUpdate = `    res.json({ success:true, data:updated });`;
const newStatusUpdate = `    // Gửi thông báo cho khách khi đổi trạng thái
    try {
      const notifMap = {
        picked_up:  { title:"📦 Shipper đã lấy hàng", msg:"Đơn hàng đang trên đường giao đến bạn!" },
        delivering: { title:"🛵 Đang giao hàng", msg:"Shipper đang trên đường, vui lòng chú ý điện thoại!" },
        delivered:  { title:"✅ Giao hàng thành công", msg:"Đơn hàng đã được giao thành công. Cảm ơn bạn!" },
        failed:     { title:"❌ Giao hàng thất bại", msg:"Rất tiếc, giao hàng thất bại. Chúng tôi sẽ liên hệ lại!" },
        completed:  { title:"🎉 Đơn hàng hoàn thành", msg:"Cảm ơn bạn đã tin tưởng Cing Hu Tang Kinh Bắc!" },
      };
      const notif = notifMap[status];
      if (notif && updated?.orders?.customer_phone) {
        const { broadcastNotification } = require("../services/notificationService");
        await broadcastNotification({
          template_key: "CAMPAIGN_BROADCAST",
          target_user_ids: [updated.orders.customer_phone],
          custom: { title: notif.title, message: notif.msg },
        });
      }
    } catch(e) { console.warn("[DELIVERY] Status notify failed:", e.message); }

    res.json({ success:true, data:updated });`;

if (!c2.includes(oldStatusUpdate)) { console.log('ERROR: status update res not found'); process.exit(1); }
c2 = c2.replace(oldStatusUpdate, newStatusUpdate);
fs.writeFileSync(f2, c2, 'utf8');
console.log('✅ Delivery status notifications added');
