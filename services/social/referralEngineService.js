const referrals =
  [];

/**
 * =====================================================
 * REGISTER REFERRAL
 * =====================================================
 */

function registerReferral({

  inviter_user_id,

  invited_user_id,

  referral_code,

}) {

  referrals.push({

    inviter_user_id,

    invited_user_id,

    referral_code,

    rewarded: false,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * REWARD REFERRAL
 * =====================================================
 */

function rewardReferral({

  invited_user_id,

}) {

  const referral =
    referrals.find(

      (
        item
      ) =>

        item.invited_user_id ===
          invited_user_id

    );

  if (!referral) {

    return null;

  }

  referral.rewarded =
    true;

  referral.rewarded_at =
    Date.now();

  return referral;

}

/**
 * =====================================================
 * GET REFERRALS
 * =====================================================
 */

function getReferrals() {

  return referrals;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  registerReferral,

  rewardReferral,

  getReferrals,

};