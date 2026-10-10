const express =
  require("express");

const router =
  express.Router();

const {
  requirePanelPermission,
} = require(
  "../middlewares/adminPanelPermissionMiddleware"
);

const {
  getPromotion,
  updatePromotion,
  getSummary,
  getTransactions,
  getGameRevenue,
  createAdjustment,
  getAdjustmentCustomers,
} = require(
  "../controllers/admin/adminWalletController"
);

router.get(
  "/promotion",
  requirePanelPermission(
    "wallet.promotion.read"
  ),
  getPromotion
);

router.put(
  "/promotion",
  requirePanelPermission(
    "wallet.promotion.update"
  ),
  updatePromotion
);

router.get(
  "/customers",
  requirePanelPermission(
    "wallet.balance.adjust"
  ),
  getAdjustmentCustomers
);

router.post(
  "/adjustments",
  requirePanelPermission(
    "wallet.balance.adjust"
  ),
  createAdjustment
);

router.get(
  "/transactions",
  requirePanelPermission(
    "wallet.reporting.read"
  ),
  getTransactions
);

router.get(
  "/game-revenue",
  requirePanelPermission("wallet.reporting.read"),
  getGameRevenue
);

router.get(
  "/summary",
  requirePanelPermission(
    "wallet.reporting.read"
  ),
  getSummary
);

router.get(
  "/coin-report",
  requirePanelPermission("wallet.reporting.read"),
  async (req,res)=>{
    try{
      const {readCoinReport}=require(
        "../services/plaza/plazaCoinAdminReportV17"
      );
      res.json({success:true,data:await readCoinReport(req.query)});
    }catch(error){
      const status=error.statusCode===400?400:503;
      res.status(status).json({
        success:false,
        code:status===400
          ?error.message
          :"PLAZA_COIN_REPORT_UNAVAILABLE"
      });
    }
  }
);

module.exports =
  router;
