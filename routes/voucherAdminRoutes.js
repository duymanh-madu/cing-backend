const express =
  require("express");

const router =
  express.Router();

const authMiddleware =
  require(
    "../middlewares/authMiddleware"
  );

const adminMiddleware =
  require(
    "../middlewares/adminMiddleware"
  );

const {

  issueVoucher,

} = require(
  "../services/voucherDistributionService"
);

const supabase =
  require("../supabase");

/**
 * ============================================
 * ISSUE VOUCHER
 * ============================================
 */

// GET /admin/vouchers/list
router.get("/list", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const supabase = require("../supabase");
    const { data } = await supabase.from("vouchers").select("*").order("created_at", { ascending:false }).limit(100);
    res.json({ success:true, data: data||[] });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

// POST /admin/vouchers/create
router.post("/create", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const supabase = require("../supabase");
    const { code, type, value, min_order, max_uses, expires_at, description } = req.body;
    if (!code || !type || !value) return res.status(400).json({ success:false, message:"Thiếu thông tin" });
    const { data, error } = await supabase.from("vouchers").insert({
      code: code.toUpperCase(), type, value: Number(value),
      min_order: Number(min_order)||0,
      max_uses: Number(max_uses)||null,
      used_count: 0,
      expires_at: expires_at||null,
      description: description||"",
      is_active: true,
      created_at: new Date().toISOString(),
    }).select().single();
    if (error) return res.status(400).json({ success:false, error:error.message });
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

router.post(

  "/issue",

  authMiddleware,

  adminMiddleware,

  async (
    req,
    res
  ) => {

    try {

      const {

        user_id,

        template_id,

      } = req.body;

      /**
       * TEMPLATE
       */

      const {

        data: template,

      } = await supabase

        .from(
          "voucher_templates"
        )

        .select("*")

        .eq(
          "id",
          template_id
        )

        .maybeSingle();

      if (!template) {

        throw new Error(
          "Template not found"
        );

      }

      const result =

        await issueVoucher({

          user_id,

          template,

        });

      res.json(result);

    } catch (error) {

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }

);

module.exports =
  router;