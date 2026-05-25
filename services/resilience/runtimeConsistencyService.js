const consistencyReports =
  [];

/**
 * =====================================================
 * CREATE CONSISTENCY REPORT
 * =====================================================
 */

function createConsistencyReport({

  domain,

  status,

  metadata = {},

}) {

  consistencyReports.unshift({

    domain,

    status,

    metadata,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET CONSISTENCY REPORTS
 * =====================================================
 */

function getConsistencyReports() {

  return consistencyReports;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  createConsistencyReport,

  getConsistencyReports,

};