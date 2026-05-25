const governanceRules = {

  allowManualVerify:
    true,

  allowForceExpire:
    true,

  allowReplayProtection:
    true,

  allowAutoExpire:
    true,

};

function getGovernanceRules() {

  return governanceRules;

}

function updateRule({

  key,

  value,

}) {

  governanceRules[
    key
  ] = value;

}

module.exports = {

  getGovernanceRules,

  updateRule,

};