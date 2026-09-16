(function () {
  const config = {
    apiKey: "AIzaSyB0YdbIDXWqg18_6fFSPo_A_gkHpgLfHHI",
    authDomain: "women-on-wheels-f8970.firebaseapp.com",
    projectId: "women-on-wheels-f8970",
    storageBucket: "women-on-wheels-f8970.firebasestorage.app"
  };

  let readyPromise = null;

  function hasSdk() {
    return window.firebase && firebase.apps && firebase.auth && firebase.firestore;
  }

  async function ensureReady() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      const startedAt = performance.now();
      if (!hasSdk()) throw new Error("Firebase SDK unavailable");
      if (!firebase.apps.length) firebase.initializeApp(config);
      const auth = firebase.auth();
      // Firebase auth is deliberately session-scoped so passenger and driver
      // tabs can be signed in as different users. Do not replace that tab's
      // user with the shared PHP session user: doing so makes a passenger tab
      // silently become the driver after both accounts are opened.
      const tokenStartedAt = performance.now();
      if (!auth.currentUser) {
        await new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          const unsubscribe = auth.onAuthStateChanged(() => {
            unsubscribe();
            finish();
          });
          setTimeout(finish, 1500);
        });
      }
      if (!auth.currentUser) {
        const res = await fetch("php/firebase_custom_token.php", {
          cache: "no-store",
          credentials: "same-origin"
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data || !data.ok || !data.token || !data.uid) {
          throw new Error(data && data.error ? data.error : "firebase_auth_unavailable");
        }
        if (String(data.project_id || "") !== config.projectId) {
          throw new Error("firebase_project_mismatch");
        }
        await auth.signInWithCustomToken(data.token);
      }
      if (!auth.currentUser) throw new Error("firebase_uid_mismatch");
      console.info("[WOW Perf] Firebase session verification timeMs:", elapsed(tokenStartedAt));
      const db = firebase.firestore();
      const uid = auth.currentUser.uid;
      const role = localStorage.getItem("wow_user_role") || localStorage.getItem("wow_role") || "unknown";
      console.info("[WOW Firebase] ready", { projectId: config.projectId, uid, role });
      console.info("[WOW Perf] Firebase ready timeMs:", elapsed(startedAt));
      return {
        firebase,
        auth,
        db,
        uid,
        FieldValue: firebase.firestore.FieldValue
      };
    })();
    return readyPromise;
  }

  function elapsed(startedAt) {
    return Math.round((performance.now() - startedAt) * 10) / 10;
  }

  window.WowFirestore = {
    ready: ensureReady,
    config
  };
  window.WowRideSchema = Object.freeze({
    collection: "rides",
    offers: "offers",
    status: Object.freeze({
      requested: "requested",
      searching: "searching",
      accepted: "driver_assigned",
      driverArriving: "driver_arriving",
      arrived: "arrived",
      inProgress: "started",
      completed: "completed",
      cancelled: "cancelled",
      assigned: "driver_assigned",
      started: "started"
    }),
    requestStatus: Object.freeze({ open: "open", matched: "matched", closed: "closed" }),
    offerStatus: Object.freeze({ pending: "pending", accepted: "accepted", declined: "declined", expired: "expired", rejected: "rejected" })
  });
})();
