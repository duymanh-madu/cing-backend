const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const provider =
  fs.readFileSync(
    "services/payment/providers/momoProvider.js",
    "utf8"
  );

const orchestrator =
  fs.readFileSync(
    "services/payment/paymentOrchestratorService.js",
    "utf8"
  );

test(
  "MoMo provider preserves hosted URL and exposes native handoff URLs",
  () => {
    assert.match(
      provider,
      /paymentUrl:[\s\S]*result\.payUrl[\s\S]*result\.shortLink[\s\S]*result\.deeplink/
    );

    assert.match(
      provider,
      /deeplink:[\s\S]*result\.deeplink/
    );

    assert.match(
      provider,
      /deeplinkMiniApp:[\s\S]*result\.deeplinkMiniApp/
    );
  }
);

test(
  "payment orchestrator exposes MoMo native Mini App handoff contract",
  () => {
    assert.match(
      orchestrator,
      /paymentUrl:[\s\S]*providerResult\.paymentUrl/
    );

    assert.match(
      orchestrator,
      /deeplink:[\s\S]*providerResult\.deeplink/
    );

    assert.match(
      orchestrator,
      /deeplinkMiniApp:[\s\S]*providerResult\.deeplinkMiniApp/
    );

    assert.match(
      orchestrator,
      /qrContent:[\s\S]*providerResult\.qrContent/
    );
  }
);
