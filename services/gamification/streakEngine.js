const DAY_MS =
  86400000;

function calculateStreak({

  lastLoginAt,

  currentStreak,

}) {

  if (
    !lastLoginAt
  ) {

    return 1;

  }

  const now =
    Date.now();

  const diff =
    now -
    new Date(
      lastLoginAt
    ).getTime();

  const days =
    Math.floor(
      diff / DAY_MS
    );

  if (days === 1) {

    return (
      currentStreak +
      1
    );

  }

  if (days > 1) {

    return 1;

  }

  return currentStreak;

}

module.exports = {

  calculateStreak,

};