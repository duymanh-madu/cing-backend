const express =
  require("express");

const router =
  express.Router();

const {
  createOrder,
} = require(
  "../services/orderService"
);

const supabase =
  require("../supabase");

const { normalizePhone } =
  require("../utils/phoneIdentity");

/**
 * ============================================
 * ORDER STATUS ENUM
 * ============================================
 */

const ORDER_STATUSES = [

  "pending",

  "confirmed",

  "preparing",

  "shipping",

  "completed",

  "cancelled",

];

/**
 * ============================================
 * TEST
 * ============================================
 */

router.get(
  "/test",

  async (req, res) => {

    return res.json({

      success: true,

      route:
        "order routes working",

    });

  }
);

/**
 * ============================================
 * CREATE ORDER
 * ============================================
 */

router.post(

  "/create",

  async (req, res) => {

    try {

      /**
       * BODY
       */

      const body =
        req.body || {};

      /**
       * VALIDATE
       */

      if (
        !body.user_id
      ) {

        return res
          .status(400)
          .json({

            success: false,

            error:
              "Missing user_id",

          });

      }

      if (
        !Array.isArray(
          body.items
        ) ||

        body.items.length === 0
      ) {

        return res
          .status(400)
          .json({

            success: false,

            error:
              "Items invalid",

          });

      }

      /**
       * CREATE
       */

      const result =

        await createOrder(
          body
        );

      return res.json(
        result
      );

    } catch (error) {

      console.error(
        error
      );

      return res
        .status(500)
        .json({

          success: false,

          error:
            error.message,

        });

    }

  }

);

/**
 * ============================================
 * GET USER ORDERS
 * ============================================
 */

router.get(

  "/user/:userId",

  async (req, res) => {

    try {

      const {
        userId,
      } = req.params;

      /**
       * VALIDATE
       */

      if (!userId) {

        return res
          .status(400)
          .json({

            success: false,

            error:
              "Missing userId",

          });

      }

      /**
       * QUERY
       */

      const {
        data,
        error,
      } = await supabase

        .from("orders")

        .select("*")

        .eq(
          "user_id",
          userId
        )

        .order(
          "id",
          {
            ascending: false,
          }
        );

      if (error) {

        throw new Error(
          error.message
        );

      }

      return res.json({

        success: true,

        orders:
          data || [],

      });

    } catch (error) {

      console.error(
        error
      );

      return res
        .status(500)
        .json({

          success: false,

          error:
            error.message,

        });

    }

  }

);

/**
 * ============================================
 * UPDATE ORDER STATUS
 * ============================================
 */

router.post(

  "/update-status",

  async (req, res) => {

    try {

      const {

        order_id,

        status,

        status_text,

      } = req.body || {};

      /**
       * VALIDATE
       */

      if (
        !order_id ||
        !status
      ) {

        return res
          .status(400)
          .json({

            success: false,

            error:
              "Missing fields",

          });

      }

      /**
       * INVALID STATUS
       */

      if (

        !ORDER_STATUSES.includes(
          status
        )

      ) {

        return res
          .status(400)
          .json({

            success: false,

            error:
              "Invalid status",

          });

      }

      /**
       * UPDATE
       */

      const {
        error,
      } = await supabase

        .from("orders")

        .update({

          status,

          status_text:

            status_text ||

            status,

          updated_at:
            new Date(),

        })

        .eq(
          "id",
          order_id
        );

      if (error) {

        throw new Error(
          error.message
        );

      }

      /**
       * EVENT LOG
       */

      await supabase

        .from(
          "analytics_events"
        )

        .insert({

          event_name:
            "order_status_updated",

          user_id: null,

          metadata: {

            order_id,

            status,

          },

        });

      return res.json({

        success: true,

      });

    } catch (error) {

      console.error(
        error
      );

      return res
        .status(500)
        .json({

          success: false,

          error:
            error.message,

        });

    }

  }

);

/**
 * ============================================
 * EXPORT
 * ============================================
 */


const supabaseClient = require("../supabase");

router.get("/by-transaction/:transactionCode", async (req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("payment_transaction_id", req.params.transactionCode)
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/latest/:userId", async (req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("user_id", req.params.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports =
  router;

// GET /orders/active/:phone — đơn đang xử lý
router.get("/active/:phone", async (req, res) => {
  try {
    const phoneNorm = normalizePhone(req.params.phone);
    const { data: orders } = await supabase.from("orders")
      .select("id,order_code,created_at,total_amount,status,items,shipping_address,note")
      .or(`customer_phone.eq.${phoneNorm},customer_phone.eq.84${phoneNorm.slice(1)}`)
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

router.get("/history/:phone", async (req, res) => {
  try {
    const { phone } = req.params;
    const { page = 1 } = req.query;
    const foodbook = require("../services/foodbook");
    const supabase = require("../supabase");

    // Chuẩn hóa phone
    const phoneNorm = normalizePhone(phone);

    // 1. Lấy từ iPOS CRM
    let iposOrders = [];
    try {
      const result = await foodbook.getMemberTransactions(phoneNorm, Number(page));
      const logs = result.data?.raw_response?.data?.sale_logs || [];
      if (logs.length > 0) console.log("[HISTORY] Sample log keys:", Object.keys(logs[0]), "channels:", JSON.stringify(logs[0].channels));
      iposOrders = logs.map(t => ({
        id:       "ipos_" + t.tran_id,
        tran_no:  t.tran_no,
        date:     t.tran_date,
        amount:   t.bill_amount || t.total_amount || 0,
        items:    t.sale_details?.map(d => ({
          name:     d.Description,
          quantity: d.Quantity,
          price:    d.Price_Sale,
        })) || [],
        payment:  t.payment_info?.[0]?.name || "Tiền mặt",
        type:     t.sale_type,
        pos_name: t.pos_name,
        note:     t.note || t.description || "",
        source:   "ipos",
      }));
    } catch(e) { console.warn("[HISTORY] iPOS error:", e.message); }

    // 2. Lấy từ Supabase orders (đặt qua app)
    let appOrders = [];
    try {
      const { data: dbOrders } = await supabase
        .from("orders")
        .select("id, order_code, created_at, total_amount, status, payment_method, items, type")
        .or(`customer_phone.eq.${phoneNorm},customer_phone.eq.84${phoneNorm.slice(1)}`)
        .order("created_at", { ascending: false })
        .limit(50);

      // Lấy delivery tracking cho các đơn app
      const appOrderIds = (dbOrders||[]).map(o => o.id);
      let deliveryMap = {};
      if (appOrderIds.length > 0) {
        const { data: trackings } = await supabase.from("delivery_tracking")
          .select("order_id,status,shipper_name,shipper_phone,updated_at,note")
          .in("order_id", appOrderIds);
        (trackings||[]).forEach(t => { deliveryMap[t.order_id] = t; });
      }

      appOrders = (dbOrders || []).map(o => ({
        id:       "app_" + o.id,
        tran_no:  o.order_code || o.id,
        date:     o.created_at,
        amount:   o.total_amount || 0,
        delivery: deliveryMap[o.id] || null,
        order_status: o.status,
        shipping_address: o.shipping_address || "",
        items:    Array.isArray(o.items) ? o.items.map(i => ({
          name:     i.name || i.product_name,
          quantity: i.quantity,
          price:    i.price,
        })) : [],
        payment:  o.payment_method || "App",
        type:     o.type || "APP",
        pos_name: null,
        status:   o.status,
        source:   "app",
      }));
    } catch(e) { console.warn("[HISTORY] App orders error:", e.message); }

    // 3. Lọc bỏ iPOS orders đặt qua app (có note chứa APP_CINGHUTANG)
    const filteredIposOrders = iposOrders;

    // Merge + sort theo ngày
    const all = [...appOrders, ...filteredIposOrders].sort((a, b) => {
      const da = new Date(a.date || 0);
      const db = new Date(b.date || 0);
      return db - da;
    });

    res.json({ success: true, data: all, total: all.length, ipos_count: iposOrders.length, app_count: appOrders.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
