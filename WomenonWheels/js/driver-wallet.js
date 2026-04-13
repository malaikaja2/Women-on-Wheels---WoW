(function () {
  const FINANCE_KEY = "wow_driver_finance";
  const LEGACY_KEY = "wow_driver_earnings";
  const HISTORY_KEY = "wow_driver_history";
  const DEFAULTS = {
    cashCollected: 0,
    onlineEarned: 45320,
    walletBalance: 45320,
    totalWithdrawn: 0,
    todayCash: 0,
    todayOnline: 1840,
    weekCash: 0,
    weekOnline: 12490,
    withdrawals: []
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadJSON(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") || clone(fallback);
    } catch {
      return clone(fallback);
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeFinance(raw) {
    if (!raw || typeof raw !== "object") return clone(DEFAULTS);
    if ("cashCollected" in raw || "onlineEarned" in raw || "walletBalance" in raw || "withdrawals" in raw) {
      return {
        cashCollected: toNumber(raw.cashCollected),
        onlineEarned: toNumber(raw.onlineEarned),
        walletBalance: toNumber(raw.walletBalance),
        totalWithdrawn: toNumber(raw.totalWithdrawn),
        todayCash: toNumber(raw.todayCash),
        todayOnline: toNumber(raw.todayOnline),
        weekCash: toNumber(raw.weekCash),
        weekOnline: toNumber(raw.weekOnline),
        withdrawals: Array.isArray(raw.withdrawals) ? raw.withdrawals.map(item => ({
          amount: toNumber(item.amount),
          date: String(item.date || item.dateTime || item.when || "Just now")
        })) : []
      };
    }

    const total = toNumber(raw.total);
    const today = toNumber(raw.today);
    const week = toNumber(raw.week);
    return {
      cashCollected: 0,
      onlineEarned: total,
      walletBalance: total,
      totalWithdrawn: 0,
      todayCash: 0,
      todayOnline: today,
      weekCash: 0,
      weekOnline: week,
      withdrawals: []
    };
  }

  function loadFinance() {
    const legacy = loadJSON(LEGACY_KEY, DEFAULTS);
    const stored = loadJSON(FINANCE_KEY, null);
    const source = stored || legacy;
    const finance = normalizeFinance(source);
    saveFinance(finance);
    return finance;
  }

  function saveFinance(finance) {
    const normalized = normalizeFinance(finance);
    saveJSON(FINANCE_KEY, normalized);
    saveJSON(LEGACY_KEY, {
      today: normalized.todayCash + normalized.todayOnline,
      week: normalized.weekCash + normalized.weekOnline,
      total: normalized.cashCollected + normalized.onlineEarned
    });
    return normalized;
  }

  function getSummary() {
    const finance = loadFinance();
    return {
      cashCollected: finance.cashCollected,
      onlineEarned: finance.onlineEarned,
      walletBalance: finance.walletBalance,
      totalWithdrawn: finance.totalWithdrawn,
      today: finance.todayCash + finance.todayOnline,
      week: finance.weekCash + finance.weekOnline,
      total: finance.cashCollected + finance.onlineEarned
    };
  }

  function choosePaymentMethod(fare) {
    const amount = toNumber(fare);
    if (amount <= 0) return "online";
    return Math.random() < 0.45 ? "cash" : "online";
  }

  function recordRidePayment(fare, paymentMethod) {
    const amount = toNumber(fare);
    const method = paymentMethod === "cash" ? "cash" : "online";
    const finance = loadFinance();
    if (method === "cash") {
      finance.cashCollected += amount;
      finance.todayCash += amount;
      finance.weekCash += amount;
    } else {
      finance.onlineEarned += amount;
      finance.walletBalance += amount;
      finance.todayOnline += amount;
      finance.weekOnline += amount;
    }
    saveFinance(finance);
    return getSummary();
  }

  function recordWithdrawal(amount) {
    const value = toNumber(amount);
    const finance = loadFinance();
    if (value <= 0) {
      throw new Error("Please enter a valid withdrawal amount.");
    }
    if (value > finance.walletBalance) {
      throw new Error("Withdrawal amount exceeds available wallet balance.");
    }
    finance.walletBalance -= value;
    finance.totalWithdrawn += value;
    finance.withdrawals.unshift({
      amount: value,
      date: new Date().toLocaleString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })
    });
    saveFinance(finance);
    return finance;
  }

  function getWithdrawals() {
    return loadFinance().withdrawals;
  }

  function getHistory() {
    return loadJSON(HISTORY_KEY, []);
  }

  function saveHistory(history) {
    saveJSON(HISTORY_KEY, history);
  }

  window.DriverWallet = {
    loadFinance,
    saveFinance,
    getSummary,
    choosePaymentMethod,
    recordRidePayment,
    recordWithdrawal,
    getWithdrawals,
    getHistory,
    saveHistory
  };
})();
