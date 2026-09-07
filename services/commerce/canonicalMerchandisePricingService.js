"use strict";

const {
  getActiveMenuItems,
} = require(
  "../menu/menuRepository"
);


const MAX_CART_LINES = 100;
const MAX_LINE_QUANTITY = 100;
const MAX_SELECTED_OPTIONS_PER_LINE = 100;


function pricingError(
  code,
  details = null
) {

  const error =
    new Error(code);

  error.code =
    code;

  if (details !== null) {
    error.details =
      details;
  }

  return error;

}


function normalizeMoney(
  value,
  code
) {

  const numeric =
    Number(value);

  if (
    !Number.isSafeInteger(numeric) ||
    numeric < 0
  ) {

    throw pricingError(
      code
    );

  }

  return numeric;

}


function normalizePositiveInteger(
  value,
  code,
  maximum
) {

  const numeric =
    Number(value);

  if (
    !Number.isSafeInteger(numeric) ||
    numeric < 1 ||
    numeric > maximum
  ) {

    throw pricingError(
      code
    );

  }

  return numeric;

}


function normalizeStoreItemId(
  value
) {

  const id =
    String(
      value ?? ""
    ).trim();

  if (
    !/^ITEM-[A-Za-z0-9_-]+$/i.test(id)
  ) {

    throw pricingError(
      "COMMERCE_PRICING_ITEM_ID_INVALID"
    );

  }

  return id;

}


function resolveBaseStoreItemId(
  item
) {

  /*
   * Financial identity must be an iPOS ITEM-* identity.
   *
   * Do not fall back to names, cart UUIDs, client prices,
   * or Foodbook numeric IDs.
   */
  const candidates = [

    item?.store_item_id,

    item?.item_id,

    (
      typeof item?.id === "string" &&
      /^ITEM-/i.test(
        item.id.trim()
      )
    )
      ? item.id
      : null,

  ];


  const selected =
    candidates.find(
      value =>
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    );


  return normalizeStoreItemId(
    selected
  );

}


function collectSelectedOptionIds(
  item
) {

  /*
   * New canonical cart contract:
   *
   * customization_option_ids: ["ITEM-...", ...]
   *
   * Transitional support is allowed only when existing
   * topping/customization objects already carry real ITEM-*
   * identities.
   *
   * Legacy frontend slugs such as "kem_cheese" are not
   * financial identities and therefore fail closed.
   */

  const raw = [];


  if (
    Array.isArray(
      item?.customization_option_ids
    )
  ) {

    raw.push(
      ...item.customization_option_ids
    );

  }


  if (
    Array.isArray(
      item?.selected_option_ids
    )
  ) {

    raw.push(
      ...item.selected_option_ids
    );

  }


  if (
    Array.isArray(
      item?.toppings
    )
  ) {

    for (
      const topping
      of item.toppings
    ) {

      if (
        topping &&
        typeof topping === "object"
      ) {

        raw.push(
          topping.store_item_id ??
          topping.item_id ??
          topping.id
        );

      } else {

        raw.push(
          topping
        );

      }

    }

  }


  if (
    raw.length >
      MAX_SELECTED_OPTIONS_PER_LINE
  ) {

    throw pricingError(
      "COMMERCE_PRICING_TOO_MANY_OPTIONS"
    );

  }


  const normalized =
    raw
      .filter(
        value =>
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
      )
      .map(
        normalizeStoreItemId
      );


  const unique =
    new Set(
      normalized
    );


  if (
    unique.size !==
      normalized.length
  ) {

    throw pricingError(
      "COMMERCE_PRICING_DUPLICATE_OPTION"
    );

  }


  return normalized;

}


function normalizeCustomizationGroups(
  menuItem
) {

  const groups =
    Array.isArray(
      menuItem?.raw_data?.customizations
    )
      ? menuItem.raw_data.customizations
      : Array.isArray(
          menuItem?.customizations
        )
        ? menuItem.customizations
        : [];


  return groups.map(
    (
      group,
      groupIndex
    ) => {

      const name =
        String(
          group?.name ??
          `GROUP_${groupIndex}`
        ).trim();


      const minPermitted =
        Number(
          group?.min_permitted ??
          0
        );


      const maxPermitted =
        Number(
          group?.max_permitted ??
          0
        );


      if (
        !Number.isSafeInteger(
          minPermitted
        ) ||
        minPermitted < 0
      ) {

        throw pricingError(
          "COMMERCE_PRICING_GROUP_MIN_INVALID",
          {
            base_store_item_id:
              menuItem.store_item_id,
            group:
              name,
          }
        );

      }


      if (
        !Number.isSafeInteger(
          maxPermitted
        ) ||
        maxPermitted <
          minPermitted
      ) {

        throw pricingError(
          "COMMERCE_PRICING_GROUP_MAX_INVALID",
          {
            base_store_item_id:
              menuItem.store_item_id,
            group:
              name,
          }
        );

      }


      const rawOptions =
        Array.isArray(
          group?.options
        )
          ? group.options
          : [];


      const options =
        rawOptions.map(
          option => {

            const id =
              normalizeStoreItemId(
                option?.id
              );


            const status =
              String(
                option?.status ??
                ""
              )
                .trim()
                .toUpperCase();


            const taPrice =
              normalizeMoney(
                option?.ta_price ?? 0,
                "COMMERCE_PRICING_OPTION_PRICE_INVALID"
              );


            const otsPrice =
              normalizeMoney(
                option?.ots_price ??
                taPrice,
                "COMMERCE_PRICING_OPTION_PRICE_INVALID"
              );


            return {

              id,

              name:
                String(
                  option?.name ??
                  id
                ).trim(),

              status,

              ta_price:
                taPrice,

              ots_price:
                otsPrice,

              item_type_id:
                option?.item_type_id ??
                null,

              sequence_id:
                option?.sequence_id ??
                null,

            };

          }
        );


      return {

        name,

        min_permitted:
          minPermitted,

        max_permitted:
          maxPermitted,

        options,

      };

    }
  );

}


function buildCatalogIndexes(
  menuItems
) {

  const byStoreItemId =
    new Map();


  for (
    const item
    of menuItems
  ) {

    const id =
      normalizeStoreItemId(
        item.store_item_id ??
        item.item_id
      );


    if (
      byStoreItemId.has(id)
    ) {

      throw pricingError(
        "COMMERCE_PRICING_DUPLICATE_CATALOG_ID",
        {
          store_item_id:
            id,
        }
      );

    }


    byStoreItemId.set(
      id,
      item
    );

  }


  return {
    byStoreItemId,
  };

}


function validateAndPriceSelections({
  baseItem,
  selectedOptionIds,
  catalogByStoreItemId,
}) {

  const groups =
    normalizeCustomizationGroups(
      baseItem
    );


  const optionToGroup =
    new Map();


  for (
    const group
    of groups
  ) {

    for (
      const option
      of group.options
    ) {

      if (
        optionToGroup.has(
          option.id
        )
      ) {

        throw pricingError(
          "COMMERCE_PRICING_OPTION_GRAPH_AMBIGUOUS",
          {
            base_store_item_id:
              baseItem.store_item_id,
            option_id:
              option.id,
          }
        );

      }


      optionToGroup.set(
        option.id,
        {
          group,
          option,
        }
      );

    }

  }


  const selectedByGroup =
    new Map();


  const selections = [];


  for (
    const optionId
    of selectedOptionIds
  ) {

    const relation =
      optionToGroup.get(
        optionId
      );


    if (!relation) {

      throw pricingError(
        "COMMERCE_PRICING_OPTION_NOT_ALLOWED",
        {
          base_store_item_id:
            baseItem.store_item_id,
          option_id:
            optionId,
        }
      );

    }


    const {
      group,
      option,
    } = relation;


    if (
      option.status !==
        "ACTIVE"
    ) {

      throw pricingError(
        "COMMERCE_PRICING_OPTION_INACTIVE",
        {
          base_store_item_id:
            baseItem.store_item_id,
          option_id:
            optionId,
        }
      );

    }


    const currentCount =
      selectedByGroup.get(
        group.name
      ) || 0;


    selectedByGroup.set(
      group.name,
      currentCount + 1
    );


    /*
     * raw_data.customizations is the authoritative
     * base -> allowed option relationship.
     *
     * For options that also exist as active standalone
     * menu_items (notably TOPPING), cross-check the price
     * against that synchronized catalog row.
     */
    const catalogOption =
      catalogByStoreItemId.get(
        optionId
      );


    let canonicalPrice =
      option.ta_price;


    if (catalogOption) {

      if (
        catalogOption.active === false
      ) {

        throw pricingError(
          "COMMERCE_PRICING_OPTION_CATALOG_INACTIVE",
          {
            base_store_item_id:
              baseItem.store_item_id,
            option_id:
              optionId,
          }
        );

      }


      const catalogPrice =
        normalizeMoney(
          catalogOption.price,
          "COMMERCE_PRICING_OPTION_CATALOG_PRICE_INVALID"
        );


      if (
        catalogPrice !==
          option.ta_price
      ) {

        throw pricingError(
          "COMMERCE_PRICING_OPTION_PRICE_CONFLICT",
          {
            base_store_item_id:
              baseItem.store_item_id,
            option_id:
              optionId,
            graph_price:
              option.ta_price,
            catalog_price:
              catalogPrice,
          }
        );

      }


      canonicalPrice =
        catalogPrice;

    }


    selections.push({

      group:
        group.name,

      store_item_id:
        option.id,

      name:
        option.name,

      price:
        canonicalPrice,

      item_type_id:
        option.item_type_id,

      sequence_id:
        option.sequence_id,

    });

  }


  for (
    const group
    of groups
  ) {

    const selectedCount =
      selectedByGroup.get(
        group.name
      ) || 0;


    if (
      selectedCount <
        group.min_permitted
    ) {

      throw pricingError(
        "COMMERCE_PRICING_GROUP_MIN_NOT_MET",
        {
          base_store_item_id:
            baseItem.store_item_id,
          group:
            group.name,
          selected:
            selectedCount,
          minimum:
            group.min_permitted,
        }
      );

    }


    if (
      selectedCount >
        group.max_permitted
    ) {

      throw pricingError(
        "COMMERCE_PRICING_GROUP_MAX_EXCEEDED",
        {
          base_store_item_id:
            baseItem.store_item_id,
          group:
            group.name,
          selected:
            selectedCount,
          maximum:
            group.max_permitted,
        }
      );

    }

  }


  const customizationTotal =
    selections.reduce(
      (
        total,
        selection
      ) =>
        total +
        selection.price,
      0
    );


  return {

    selections,

    customization_total:
      customizationTotal,

  };

}


function priceCanonicalCartFromCatalog({
  items,
  menuItems,
}) {

  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {

    throw pricingError(
      "COMMERCE_PRICING_ITEMS_REQUIRED"
    );

  }


  if (
    items.length >
      MAX_CART_LINES
  ) {

    throw pricingError(
      "COMMERCE_PRICING_TOO_MANY_LINES"
    );

  }


  if (
    !Array.isArray(menuItems) ||
    menuItems.length === 0
  ) {

    throw pricingError(
      "COMMERCE_PRICING_CATALOG_EMPTY"
    );

  }


  const {
    byStoreItemId,
  } = buildCatalogIndexes(
    menuItems
  );


  const canonicalItems =
    items.map(
      (
        submittedItem,
        lineIndex
      ) => {

        const storeItemId =
          resolveBaseStoreItemId(
            submittedItem
          );


        const baseItem =
          byStoreItemId.get(
            storeItemId
          );


        if (!baseItem) {

          throw pricingError(
            "COMMERCE_PRICING_ITEM_NOT_FOUND",
            {
              line:
                lineIndex,
              store_item_id:
                storeItemId,
            }
          );

        }


        if (
          baseItem.active === false
        ) {

          throw pricingError(
            "COMMERCE_PRICING_ITEM_INACTIVE",
            {
              line:
                lineIndex,
              store_item_id:
                storeItemId,
            }
          );

        }


        const quantity =
          normalizePositiveInteger(
            submittedItem?.quantity ??
            submittedItem?.qty ??
            1,
            "COMMERCE_PRICING_QUANTITY_INVALID",
            MAX_LINE_QUANTITY
          );


        const basePrice =
          normalizeMoney(
            baseItem.price,
            "COMMERCE_PRICING_BASE_PRICE_INVALID"
          );


        const selectedOptionIds =
          collectSelectedOptionIds(
            submittedItem
          );


        const {
          selections,
          customization_total:
            customizationTotal,
        } =
          validateAndPriceSelections({
            baseItem,
            selectedOptionIds,
            catalogByStoreItemId:
              byStoreItemId,
          });


        const unitPrice =
          basePrice +
          customizationTotal;


        if (
          !Number.isSafeInteger(
            unitPrice
          )
        ) {

          throw pricingError(
            "COMMERCE_PRICING_UNIT_TOTAL_OVERFLOW"
          );

        }


        const lineTotal =
          unitPrice *
          quantity;


        if (
          !Number.isSafeInteger(
            lineTotal
          )
        ) {

          throw pricingError(
            "COMMERCE_PRICING_LINE_TOTAL_OVERFLOW"
          );

        }


        /*
         * Only non-financial presentation fields are allowed
         * through from the client.
         */
        const note =
          String(
            submittedItem?.note ??
            ""
          )
            .trim()
            .slice(
              0,
              500
            );


        return {

          id:
            storeItemId,

          item_id:
            storeItemId,

          store_item_id:
            storeItemId,

          foodbook_id:
            baseItem.foodbook_id ??
            null,

          name:
            baseItem.name,

          category:
            baseItem.category,

          quantity,

          qty:
            quantity,

          base_price:
            basePrice,

          customization_option_ids:
            selections.map(
              selection =>
                selection.store_item_id
            ),

          customizations:
            selections,

          customization_total:
            customizationTotal,

          price:
            unitPrice,

          unit_price:
            unitPrice,

          line_total:
            lineTotal,

          note,

        };

      }
    );


  const subtotal =
    canonicalItems.reduce(
      (
        total,
        item
      ) =>
        total +
        item.line_total,
      0
    );


  if (
    !Number.isSafeInteger(
      subtotal
    ) ||
    subtotal < 0
  ) {

    throw pricingError(
      "COMMERCE_PRICING_SUBTOTAL_INVALID"
    );

  }


  return {

    items:
      canonicalItems,

    subtotal,

  };

}


async function resolveCanonicalMerchandisePricing({
  items,
}) {

  const menuItems =
    await getActiveMenuItems();


  return priceCanonicalCartFromCatalog({
    items,
    menuItems,
  });

}


module.exports = {

  resolveCanonicalMerchandisePricing,

  priceCanonicalCartFromCatalog,

};
