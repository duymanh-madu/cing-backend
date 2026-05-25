const runtimeContents =
  [];

/**
 * =====================================================
 * CREATE RUNTIME CONTENT
 * =====================================================
 */

function createRuntimeContent({

  code,

  content_type,

  payload,

  enabled = true,

}) {

  runtimeContents.push({

    code,

    content_type,

    payload,

    enabled,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET RUNTIME CONTENTS
 * =====================================================
 */

function getRuntimeContents() {

  return runtimeContents.filter(

    (
      item
    ) => item.enabled

  );

}

/**
 * =====================================================
 * GET CONTENT BY CODE
 * =====================================================
 */

function getRuntimeContentByCode(
  code
) {

  return runtimeContents.find(

    (
      item
    ) =>

      item.code ===
        code

  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  createRuntimeContent,

  getRuntimeContents,

  getRuntimeContentByCode,

};