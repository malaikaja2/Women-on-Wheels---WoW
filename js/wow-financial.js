(function () {
  "use strict";
  const FALLBACK_RATE = 0.30;
  const successful = new Set(["paid", "completed", "success", "successful", "confirmed", "cash_collected", "collected", "received"]);
  const refunded = new Set(["refunded", "reversed"]);

  function normalize(value) { return String(value ?? "").trim().toLowerCase(); }
  function number(value) {
    if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
    if (typeof value !== "string") return null;
    let text = value.trim();
    if (!text || /^(nan|infinity|null|undefined|\[object object\])$/i.test(text)) return null;
    text = text.replace(/^\s*(rs\.?|pkr)\s*/i, "").replace(/[,\s]/g, "");
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
  }
  function selectedFare(ride) {
    const row = ride && typeof ride === "object" ? ride : {};
    for (const field of ["finalFare", "acceptedFare", "agreedFare", "totalFare", "fare"]) {
      if (!Object.prototype.hasOwnProperty.call(row, field)) continue;
      const value = number(row[field]);
      return { field, raw: row[field], value: value !== null && value > 0 ? value : null };
    }
    return { field: "", raw: null, value: null };
  }
  function split(fare, rate = FALLBACK_RATE) {
    const value = number(fare) ?? 0;
    let configured = number(rate);
    if (configured === null || configured <= 0) configured = FALLBACK_RATE;
    if (configured > 1 && configured <= 100) configured /= 100;
    if (configured <= 0 || configured >= 1) configured = FALLBACK_RATE;
    const wowCommission = Math.round(value * configured * 100) / 100;
    return { finalFare: value, commissionRate: configured, wowCommission, driverEarning: Math.round((value - wowCommission) * 100) / 100 };
  }
  function isPaymentSuccessful(status) { return successful.has(normalize(status)); }
  function isRefunded(status) { return refunded.has(normalize(status)); }
  function hasCommissionMetadata(ride, payment = {}) {
    return [payment, ride].some((row) => {
      if (!row || typeof row !== "object") return false;
      if (row.commissionCalculatedAt) return true;
      if (["driverEarning", "driverShare", "platformCommission", "adminCommission", "wowCommission"]
        .some((field) => Object.prototype.hasOwnProperty.call(row, field) && number(row[field]) !== null)) return true;
      const rate = number(row.commissionRate);
      return rate !== null && rate > 0;
    });
  }
  function money(value) {
    const parsed = number(value) ?? 0;
    return "Rs. " + parsed.toLocaleString("en-PK", { minimumFractionDigits: Number.isInteger(parsed) ? 0 : 2, maximumFractionDigits: 2 });
  }
  window.WowFinancial = Object.freeze({ FALLBACK_RATE, normalize, number, selectedFare, split, isPaymentSuccessful, isRefunded, hasCommissionMetadata, money });
})();
