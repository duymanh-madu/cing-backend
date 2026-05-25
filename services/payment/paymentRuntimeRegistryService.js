const runtimeRegistry = {

  active_payments: 0,

  paid_payments: 0,

  failed_payments: 0,

  retry_queue_size: 0,

};

function incrementRuntimeMetric(
  key
) {

  if (
    typeof runtimeRegistry[
      key
    ] !== "number"
  ) {

    return;

  }

  runtimeRegistry[
    key
  ] += 1;

}

function setRuntimeMetric(
  key,
  value
) {

  runtimeRegistry[
    key
  ] = value;

}

function getRuntimeRegistry() {

  return runtimeRegistry;

}

module.exports = {

  incrementRuntimeMetric,

  setRuntimeMetric,

  getRuntimeRegistry,

};