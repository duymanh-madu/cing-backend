const processedEvents =
  new Set();

function generateReplayKey({

  transaction_code,

  provider_transaction_id,

}) {

  return `${transaction_code}:${provider_transaction_id}`;

}

function isReplayEvent(
  payload
) {

  const key =
    generateReplayKey(
      payload
    );

  return processedEvents.has(
    key
  );

}

function registerReplayEvent(
  payload
) {

  const key =
    generateReplayKey(
      payload
    );

  processedEvents.add(
    key
  );

}

module.exports = {

  isReplayEvent,

  registerReplayEvent,

};