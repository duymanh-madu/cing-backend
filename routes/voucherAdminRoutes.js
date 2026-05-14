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