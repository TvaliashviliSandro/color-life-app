// Ads and purchases.
// In the Android app: real AdMob rewarded ads and Google Play Billing.
// On the web / iPhone version: neither exists, so the clearly-labelled test mocks stay.
import { STORE } from "./config.js";

export const NATIVE = !!window.Capacitor?.isNativePlatform?.();

// ---------- Rewarded ads (AdMob) ----------
let AdMob = null, adsReady = false, adLoaded = false;

export async function initAds() {
  if (!NATIVE) return;
  AdMob = window.Capacitor.Plugins.AdMob;
  if (!AdMob) return;
  try {
    // EU/UK users must give consent before ads; Google's consent form handles it.
    let consent = await AdMob.requestConsentInfo();
    if (consent.isConsentFormAvailable && consent.status === "REQUIRED") consent = await AdMob.showConsentForm();
    if (!consent.canRequestAds) return;
    await AdMob.initialize({ maxAdContentRating: "General" });
    adsReady = true;
    preloadAd();
  } catch (e) {
    console.warn("Ads unavailable", e);
  }
}

async function preloadAd() {
  if (!adsReady) return;
  try {
    await AdMob.prepareRewardVideoAd({ adId: STORE.rewardedAdUnit, isTesting: STORE.testAds });
    adLoaded = true;
  } catch (e) {
    adLoaded = false;
  }
}

// Shows a rewarded ad. Resolves true only if the player watched it to the reward.
export async function showRewardedAd() {
  if (!adsReady) return false;
  if (!adLoaded) await preloadAd();
  if (!adLoaded) return false;
  return new Promise(async (resolve) => {
    let rewarded = false, finished = false;
    const handles = [];
    const done = () => {
      if (finished) return;
      finished = true;
      handles.forEach((h) => h.remove());
      adLoaded = false;
      preloadAd();                       // get the next one ready
      resolve(rewarded);
    };
    handles.push(await AdMob.addListener("onRewardedVideoAdReward", () => { rewarded = true; }));
    handles.push(await AdMob.addListener("onRewardedVideoAdDismissed", done));
    handles.push(await AdMob.addListener("onRewardedVideoAdFailedToShow", done));
    AdMob.showRewardVideoAd().catch(done);
  });
}

// ---------- Coin packs (Google Play Billing) ----------
export const PACKS = [
  { id: "coins_500", coins: 500, mockPrice: "$0.99" },
  { id: "coins_1200", coins: 1200, mockPrice: "$1.99", tag: "Popular" },
  { id: "coins_3000", coins: 3000, mockPrice: "$4.99", tag: "Best value" },
  { id: "coins_7000", coins: 7000, mockPrice: "$9.99" },
];
let store = null;

// onGrant(pack, transactionId) is called once per completed purchase.
export function initBilling(onGrant, onUpdate) {
  if (!NATIVE) return;
  document.addEventListener("deviceready", () => {
    const Cdv = window.CdvPurchase;
    if (!Cdv) return;
    store = Cdv.store;
    store.register(PACKS.map((p) => ({ id: p.id, type: Cdv.ProductType.CONSUMABLE, platform: Cdv.Platform.GOOGLE_PLAY })));
    store.when()
      .productUpdated(() => onUpdate?.())
      .approved((tx) => {
        for (const item of tx.products) {
          const pack = PACKS.find((p) => p.id === item.id);
          if (pack) onGrant(pack, tx.transactionId);
        }
        tx.finish();                     // consumable: can be bought again
      });
    store.initialize([Cdv.Platform.GOOGLE_PLAY]).then(() => onUpdate?.());
  }, false);
}

// The real price from Google Play (in the player's currency), or null if not loaded / not set up yet.
export function priceOf(pack) {
  if (!NATIVE) return pack.mockPrice;
  return store?.get(pack.id)?.pricing?.price || null;
}

// Starts Google Play's purchase sheet. Resolves "ok", "cancelled" or "unavailable".
export async function buyPack(pack) {
  const product = store?.get(pack.id);
  const offer = product?.getOffer?.();
  if (!offer) return "unavailable";
  const err = await offer.order();
  if (!err) return "ok";
  return err.code === window.CdvPurchase.ErrorCode.PAYMENT_CANCELLED ? "cancelled" : "unavailable";
}
