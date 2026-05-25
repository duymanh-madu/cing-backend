const modules =
  new Map();

/**
 * =====================================================
 * REGISTER MODULE
 * =====================================================
 */

function registerModule({

  module,

  owner,

}) {

  modules.set(

    module,

    {

      module,

      owner,

      registered_at:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * GET MODULES
 * =====================================================
 */

function getModules() {

  return Array.from(
    modules.values()
  );

}

/**
 * =====================================================
 * CHECK MODULE
 * =====================================================
 */

function hasModule(
  module
) {

  return modules.has(
    module
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  registerModule,

  getModules,

  hasModule,

};