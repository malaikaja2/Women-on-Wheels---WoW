(function () {
  "use strict";
  const role = String(document.body.dataset.callRole || (document.body.dataset.driverPage ? "driver" : "")).toLowerCase();
  if (!["passenger", "driver"].includes(role)) return;
  const $ = id => document.getElementById(id);
  const terminal = new Set(["ended", "declined", "missed", "cancelled", "failed"]);
  let activeCase = "", activeRide = "", incomingUnsub = null, timer = null, seconds = 0, muted = false, speaker = true;

  function mount() {
    if ($("lfCallPanel")) return;
    document.body.insertAdjacentHTML("beforeend", `<div class="lf-call-overlay" id="lfCallOverlay"></div><section class="lf-call-panel" id="lfCallPanel" aria-hidden="true" role="dialog" aria-modal="true"><header><strong>${role === "passenger" ? "Call Driver" : "Call Passenger"}</strong><button type="button" id="lfCallClose" aria-label="Close">×</button></header><div class="lf-call-body"><span class="lf-call-lock">Private in-app voice call</span><strong id="lfCallStatus">Ready to call</strong><span id="lfCallTimer">00:00</span></div><div class="lf-call-actions"><button id="lfCallAnswer" hidden>Accept</button><button id="lfCallDecline" class="danger" hidden>Decline</button><button id="lfCallMute" hidden>Mute</button><button id="lfCallSpeaker" hidden>Speaker On</button><button id="lfCallEnd" class="danger" hidden>End Call</button></div></section>`);
    $("lfCallClose").onclick = close;
    $("lfCallOverlay").onclick = close;
    $("lfCallAnswer").onclick = async () => { try { state("connecting"); await WowRideCall.answer(); } catch (e) { state("failed"); alert(e.message); } };
    $("lfCallDecline").onclick = () => WowRideCall.decline().catch(() => {});
    $("lfCallEnd").onclick = () => WowRideCall.end().catch(() => {});
    $("lfCallMute").onclick = () => { muted = !muted; WowRideCall.mute(muted); $("lfCallMute").textContent = muted ? "Unmute" : "Mute"; };
    $("lfCallSpeaker").onclick = () => { speaker = !speaker; WowRideCall.speaker(speaker); $("lfCallSpeaker").textContent = speaker ? "Speaker On" : "Speaker Off"; };
  }
  function open() { mount(); $("lfCallOverlay").classList.add("is-open"); $("lfCallPanel").classList.add("is-open"); $("lfCallPanel").setAttribute("aria-hidden", "false"); }
  function close() { if (WowRideCall?.hasActiveCall?.()) return; $("lfCallOverlay")?.classList.remove("is-open"); $("lfCallPanel")?.classList.remove("is-open"); $("lfCallPanel")?.setAttribute("aria-hidden", "true"); stopTimer(); }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  function startTimer() { stopTimer(); seconds = 0; timer = setInterval(() => { seconds++; $("lfCallTimer").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }, 1000); }
  function state(status, incoming = false) {
    mount();
    const live = status === "active", done = terminal.has(status);
    $("lfCallStatus").textContent = incoming ? "Incoming Lost & Found call" : status === "ringing" ? "Ringing…" : ["accepted", "connecting"].includes(status) ? "Connecting…" : live ? "Connected" : status === "reconnecting" ? "Reconnecting…" : done ? "Call ended" : "Calling…";
    $("lfCallAnswer").hidden = !incoming; $("lfCallDecline").hidden = !incoming; $("lfCallMute").hidden = !live; $("lfCallSpeaker").hidden = !live; $("lfCallEnd").hidden = incoming || done;
    if (live && !timer) startTimer();
    if (done) { stopTimer(); setTimeout(close, 700); }
  }
  async function init(caseId, rideId) {
    if (activeCase === caseId && activeRide === rideId) return;
    activeCase = caseId; activeRide = rideId;
    await WowRideCall.init({ rideId, lostFoundCaseId: caseId, role, platform: `${role}_lost_found_web`, onIncoming: () => { open(); state("ringing", true); }, onState: (s, d) => state(s, s === "ringing" && d?.receiverRole === role) });
  }
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-lf-call]");
    if (!button) return;
    event.preventDefault(); open();
    try { await init(button.dataset.caseId, button.dataset.rideId); state("calling"); await WowRideCall.start(); }
    catch (e) { state("failed"); alert(e.message || "This Lost & Found call is unavailable."); }
  });
  async function watchIncoming() {
    try {
      const { db, uid } = await WowFirestore.ready();
      incomingUnsub = db.collection("lostFoundCalls").where("receiverId", "==", uid).limit(10).onSnapshot(snapshot => {
        const call = snapshot.docs.map(doc => doc.data() || {}).filter(x => x.status === "ringing" && x.receiverId === uid).sort((a, b) => Number(b.ringingAt?.seconds || 0) - Number(a.ringingAt?.seconds || 0))[0];
        if (call?.lostFoundCaseId && call?.rideId) init(String(call.lostFoundCaseId), String(call.rideId)).catch(() => {});
      });
    } catch (e) { console.warn("[WOW Lost & Found Call] listener unavailable", e?.code || e?.message); }
  }
  window.addEventListener("pagehide", () => { incomingUnsub?.(); WowRideCall?.stop?.(); stopTimer(); });
  mount(); watchIncoming();
})();
