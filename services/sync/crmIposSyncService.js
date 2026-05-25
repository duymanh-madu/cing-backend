/**
 * CRM + iPOS SYNC SERVICE
 * SOURCE OF TRUTH = iPOS
 */

class CrmIposSyncService {

  merge(ipos, crm) {

    if (!ipos) return crm;

    return {
      customerId: ipos.customerId,
      phone: ipos.phone,

      // iPOS wins for financial data
      totalSpend: ipos.totalSpend || 0,
      lastOrderAt: ipos.lastOrderAt || null,

      // CRM wins for UI metadata
      name: crm?.name || ipos.name,
      avatar: crm?.avatar || null,

      // computed tier
      tier: ipos.tier,

      updatedAt: Date.now(),
      source: "IPOS_SYNC_ENGINE"
    };

  }

}

module.exports = new CrmIposSyncService();
