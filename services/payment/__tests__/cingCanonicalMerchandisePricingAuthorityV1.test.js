"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  priceCanonicalCartFromCatalog,
} = require(
  "../../commerce/canonicalMerchandisePricingService"
);


function baseMenuItem() {

  return {

    foodbook_id:
      "25823529",

    store_item_id:
      "ITEM-VCD8",

    name:
      "BẠC XỈU",

    category:
      "COFFEE",

    price:
      38000,

    active:
      true,

    raw_data: {

      customizations: [

        {

          name:
            "TOPPING",

          min_permitted:
            0,

          max_permitted:
            20,

          options: [

            {
              id:
                "ITEM-Y5MT",
              name:
                "TRÂN CHÂU ĐEN",
              status:
                "ACTIVE",
              ta_price:
                10000,
              ots_price:
                10000,
              item_type_id:
                "TOPPING",
              sequence_id:
                25823562,
            },

          ],

        },

        {

          name:
            "ĐƯỜNG",

          min_permitted:
            0,

          max_permitted:
            1,

          options: [

            {
              id:
                "ITEM-D92U",
              name:
                "70% ĐƯỜNG",
              status:
                "ACTIVE",
              ta_price:
                0,
              ots_price:
                0,
              item_type_id:
                "ITEM_TYPE_OTHER",
              sequence_id:
                25823614,
            },

          ],

        },

      ],

    },

  };

}


function toppingMenuItem() {

  return {

    foodbook_id:
      "25823562",

    store_item_id:
      "ITEM-Y5MT",

    name:
      "TRÂN CHÂU ĐEN",

    category:
      "TOPPING",

    price:
      10000,

    active:
      true,

    raw_data:
      {},

  };

}


test(
  "server ignores submitted base price and computes from catalog",
  () => {

    const result =
      priceCanonicalCartFromCatalog({

        items: [
          {
            item_id:
              "ITEM-VCD8",
            price:
              1,
            qty:
              2,
          },
        ],

        menuItems: [
          baseMenuItem(),
          toppingMenuItem(),
        ],

      });


    assert.equal(
      result.items[0].base_price,
      38000
    );

    assert.equal(
      result.items[0].price,
      38000
    );

    assert.equal(
      result.subtotal,
      76000
    );

  }
);


test(
  "allowed topping price comes from synchronized authority",
  () => {

    const result =
      priceCanonicalCartFromCatalog({

        items: [
          {
            store_item_id:
              "ITEM-VCD8",

            qty:
              1,

            customization_option_ids: [
              "ITEM-Y5MT",
            ],

            price:
              1,

            toppings: [],
          },
        ],

        menuItems: [
          baseMenuItem(),
          toppingMenuItem(),
        ],

      });


    assert.equal(
      result.items[0].base_price,
      38000
    );

    assert.equal(
      result.items[0].customization_total,
      10000
    );

    assert.equal(
      result.items[0].price,
      48000
    );

    assert.equal(
      result.subtotal,
      48000
    );

  }
);


test(
  "zero-price customization remains canonical",
  () => {

    const result =
      priceCanonicalCartFromCatalog({

        items: [
          {
            item_id:
              "ITEM-VCD8",

            customization_option_ids: [
              "ITEM-D92U",
            ],
          },
        ],

        menuItems: [
          baseMenuItem(),
          toppingMenuItem(),
        ],

      });


    assert.equal(
      result.items[0].customization_total,
      0
    );

    assert.equal(
      result.subtotal,
      38000
    );

  }
);


test(
  "option not present in base customization graph fails closed",
  () => {

    assert.throws(
      () =>
        priceCanonicalCartFromCatalog({

          items: [
            {
              item_id:
                "ITEM-VCD8",

              customization_option_ids: [
                "ITEM-NOT-ALLOWED",
              ],
            },
          ],

          menuItems: [
            baseMenuItem(),
            toppingMenuItem(),
          ],

        }),
      error =>
        error.code ===
          "COMMERCE_PRICING_OPTION_NOT_ALLOWED"
    );

  }
);


test(
  "frontend legacy slug cannot become financial option identity",
  () => {

    assert.throws(
      () =>
        priceCanonicalCartFromCatalog({

          items: [
            {
              item_id:
                "ITEM-VCD8",

              toppings: [
                {
                  id:
                    "tran_chau_den",
                  price:
                    1,
                },
              ],
            },
          ],

          menuItems: [
            baseMenuItem(),
            toppingMenuItem(),
          ],

        }),
      error =>
        error.code ===
          "COMMERCE_PRICING_ITEM_ID_INVALID"
    );

  }
);


test(
  "duplicate customization option fails closed",
  () => {

    assert.throws(
      () =>
        priceCanonicalCartFromCatalog({

          items: [
            {
              item_id:
                "ITEM-VCD8",

              customization_option_ids: [
                "ITEM-Y5MT",
                "ITEM-Y5MT",
              ],
            },
          ],

          menuItems: [
            baseMenuItem(),
            toppingMenuItem(),
          ],

        }),
      error =>
        error.code ===
          "COMMERCE_PRICING_DUPLICATE_OPTION"
    );

  }
);


test(
  "group max_permitted is enforced",
  () => {

    const base =
      baseMenuItem();

    base.raw_data
      .customizations[1]
      .options.push({
        id:
          "ITEM-GEWT",
        name:
          "50% ĐƯỜNG",
        status:
          "ACTIVE",
        ta_price:
          0,
        ots_price:
          0,
        item_type_id:
          "ITEM_TYPE_OTHER",
        sequence_id:
          25823615,
      });


    assert.throws(
      () =>
        priceCanonicalCartFromCatalog({

          items: [
            {
              item_id:
                "ITEM-VCD8",

              customization_option_ids: [
                "ITEM-D92U",
                "ITEM-GEWT",
              ],
            },
          ],

          menuItems: [
            base,
            toppingMenuItem(),
          ],

        }),
      error =>
        error.code ===
          "COMMERCE_PRICING_GROUP_MAX_EXCEEDED"
    );

  }
);


test(
  "inactive customization fails closed",
  () => {

    const base =
      baseMenuItem();

    base.raw_data
      .customizations[0]
      .options[0]
      .status =
        "INACTIVE";


    assert.throws(
      () =>
        priceCanonicalCartFromCatalog({

          items: [
            {
              item_id:
                "ITEM-VCD8",

              customization_option_ids: [
                "ITEM-Y5MT",
              ],
            },
          ],

          menuItems: [
            base,
            toppingMenuItem(),
          ],

        }),
      error =>
        error.code ===
          "COMMERCE_PRICING_OPTION_INACTIVE"
    );

  }
);


test(
  "catalog/graph price disagreement fails closed",
  () => {

    const topping =
      toppingMenuItem();

    topping.price =
      9000;


    assert.throws(
      () =>
        priceCanonicalCartFromCatalog({

          items: [
            {
              item_id:
                "ITEM-VCD8",

              customization_option_ids: [
                "ITEM-Y5MT",
              ],
            },
          ],

          menuItems: [
            baseMenuItem(),
            topping,
          ],

        }),
      error =>
        error.code ===
          "COMMERCE_PRICING_OPTION_PRICE_CONFLICT"
    );

  }
);


test(
  "submitted names and prices cannot overwrite canonical item snapshot",
  () => {

    const result =
      priceCanonicalCartFromCatalog({

        items: [
          {
            item_id:
              "ITEM-VCD8",

            name:
              "FREE DRINK",

            price:
              0,

            qty:
              1,
          },
        ],

        menuItems: [
          baseMenuItem(),
          toppingMenuItem(),
        ],

      });


    assert.equal(
      result.items[0].name,
      "BẠC XỈU"
    );

    assert.equal(
      result.items[0].price,
      38000
    );

  }
);
