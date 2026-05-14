/**
 * =====================================================
 * REALTIME METRICS STORE
 * =====================================================
 */

const realtimeMetrics = {

  published_events: 0,

  delivered_events: 0,

  failed_events: 0,

  channels: {},

};

/**
 * =====================================================
 * TRACK PUBLISHED
 * =====================================================
 */

function trackRealtimePublished({

  channel,

}) {

  realtimeMetrics.published_events += 1;

  if (
    !realtimeMetrics.channels[
      channel
    ]
  ) {

    realtimeMetrics.channels[
      channel
    ] = {

      published: 0,

      delivered: 0,

      failed: 0,

    };

  }

  realtimeMetrics.channels[
    channel
  ].published += 1;

}

/**
 * =====================================================
 * TRACK DELIVERED
 * =====================================================
 */

function trackRealtimeDelivered({

  channel,

}) {

  realtimeMetrics.delivered_events += 1;

  if (
    !realtimeMetrics.channels[
      channel
    ]
  ) {

    realtimeMetrics.channels[
      channel
    ] = {

      published: 0,

      delivered: 0,

      failed: 0,

    };

  }

  realtimeMetrics.channels[
    channel
  ].delivered += 1;

}

/**
 * =====================================================
 * TRACK FAILED
 * =====================================================
 */

function trackRealtimeFailed({

  channel,

}) {

  realtimeMetrics.failed_events += 1;

  if (
    !realtimeMetrics.channels[
      channel
    ]
  ) {

    realtimeMetrics.channels[
      channel
    ] = {

      published: 0,

      delivered: 0,

      failed: 0,

    };

  }

  realtimeMetrics.channels[
    channel
  ].failed += 1;

}

/**
 * =====================================================
 * GET METRICS
 * =====================================================
 */

function getRealtimeMetrics() {

  return realtimeMetrics;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  trackRealtimePublished,

  trackRealtimeDelivered,

  trackRealtimeFailed,

  getRealtimeMetrics,

};