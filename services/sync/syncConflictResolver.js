class SyncConflictResolver {

  resolve(ipos, crm) {

    return {
      customerId: ipos.customerId,
      phone: ipos.phone,

      // iPOS ALWAYS wins financial data
      totalSpend: ipos.totalSpend ?? crm.totalSpend ?? 0,
      tier: ipos.tier ?? crm.tier,

      // CRM wins UI metadata
      name: crm?.name || ipos.name,
      avatar: crm?.avatar || null,

      updatedAt: Date.now(),
      source: "IPOS_PRIORITY_RESOLVED"
    };

  }

}

module.exports = new SyncConflictResolver();
