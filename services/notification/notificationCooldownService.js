const cooldownMap =
  new Map();

function isCooldownActive({

  userId,

  event,

  cooldownSeconds,

}) {

  const key =
    `${userId}:${event}`;

  const existing =
    cooldownMap.get(key);

  if (!existing) {

    return false;

  }

  const now =
    Date.now();

  const diff =
    (now - existing) / 1000;

  return (
    diff <
    cooldownSeconds
  );

}

function activateCooldown({

  userId,

  event,

}) {

  const key =
    `${userId}:${event}`;

  cooldownMap.set(
    key,
    Date.now()
  );

}

module.exports = {

  isCooldownActive,

  activateCooldown,

};