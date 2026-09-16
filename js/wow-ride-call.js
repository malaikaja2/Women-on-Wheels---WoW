(function initWowRideCall(global) {
  "use strict";

  const OPEN_RIDE_STATUSES = new Set([
    "driver_assigned", "accepted", "driver_en_route", "driver_arriving",
    "arriving", "arrived", "started", "ride_started", "ongoing",
    "in_progress", "active", "on_trip"
  ]);
  const BUSY_CALL_STATUSES = new Set(["initiated", "ringing", "accepted", "connecting", "connected", "active", "reconnecting"]);
  const TERMINAL_CALL_STATUSES = new Set(["declined", "missed", "ended", "cancelled", "failed"]);
  const OPEN_LOST_FOUND_STATUSES = new Set([
    "open", "reported", "driver_contacted", "driver_responded",
    "item_found", "return_arranged", "return_scheduled"
  ]);
  const RING_TIMEOUT_MS = 30000;
  const DEFAULT_ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

  let db = null;
  let FieldValue = null;
  let auth = null;
  let rideId = "";
  let lostFoundCaseId = "";
  let callCollection = "rideCalls";
  let role = "";
  let uid = "";
  let deviceId = "";
  let platform = "web";
  let callId = "";
  let callRef = null;
  let peer = null;
  let localStream = null;
  let remoteAudio = null;
  let callUnsub = null;
  let contextUnsub = null;
  let candidateUnsubs = [];
  let timeoutId = null;
  let ringtoneTimer = null;
  let audioContext = null;
  let stateHandler = null;
  let incomingHandler = null;
  let currentCall = null;
  let started = false;
  let reconnectTimeoutId = null;

  function unlockRingtoneAudio() {
    try {
      audioContext = audioContext || new (global.AudioContext || global.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    } catch {}
  }

  // Browsers only allow audible incoming-call alerts after a user gesture.
  // Prime the shared audio context on the passenger's first interaction so a
  // later Firestore incoming-call event can ring immediately.
  global.addEventListener("pointerdown", unlockRingtoneAudio, { once: true, capture: true });
  global.addEventListener("keydown", unlockRingtoneAudio, { once: true, capture: true });

  function uniqueId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }

  function getDeviceId() {
    const key = "wow_call_device_id";
    let value = sessionStorage.getItem(key);
    if (!value) {
      value = `web_${uniqueId()}`;
      sessionStorage.setItem(key, value);
    }
    return value;
  }

  function log(event, details = {}) {
    console.info("[WOW Call]", event, {
      callId: callId || currentCall?.callId || "",
      rideId,
      lostFoundCaseId,
      callerUid: currentCall?.callerId || "",
      receiverUid: currentCall?.receiverId || "",
      platform,
      ...details
    });
  }

  function emit(status, data = currentCall || {}) {
    stateHandler?.(status, data);
    log("state", { status });
  }

  async function loadContext(id, userRole) {
    const ready = await global.WowFirestore.ready();
    db = ready.db;
    FieldValue = ready.FieldValue;
    auth = ready.auth;
    uid = auth?.currentUser?.uid || ready.uid || "";
    if (!uid) throw new Error("Please sign in again.");
    let lostFoundCase = null;
    if (lostFoundCaseId) {
      const caseSnapshot = await db.collection("lost_found_cases").doc(lostFoundCaseId).get();
      if (!caseSnapshot.exists) throw new Error("Lost & Found case is unavailable.");
      lostFoundCase = caseSnapshot.data() || {};
      if (String(lostFoundCase.rideId || "") !== String(id)) throw new Error("Invalid Lost & Found call context.");
      const caseStatus = String(lostFoundCase.status || "").trim().toLowerCase().replace(/\s+/g, "_");
      if (!OPEN_LOST_FOUND_STATUSES.has(caseStatus)) throw new Error("Calling is disabled for this Lost & Found case.");
    }
    const snapshot = await db.collection("rides").doc(String(id)).get();
    if (!snapshot.exists) throw new Error("No active ride found.");
    const ride = snapshot.data() || {};
    const passengerId = String(ride.passengerId || ride.passengerUid || "");
    const driverId = String(ride.assignedDriverId || ride.driverUid || ride.driverId || "");
    if (!driverId) throw new Error(userRole === "passenger" ? "Unable to find the assigned driver." : "Unable to find the assigned passenger.");
    const expected = userRole === "passenger" ? passengerId : driverId;
    if (expected !== uid) throw new Error("Calling is available only during an active ride.");
    if (lostFoundCase) {
      if (!["completed", "ride_completed"].includes(String(ride.status || "").toLowerCase())) {
        throw new Error("Lost & Found calling requires a completed ride.");
      }
      if (String(lostFoundCase.passengerId || "") !== passengerId || String(lostFoundCase.driverId || "") !== driverId) {
        throw new Error("Lost & Found participants do not match this ride.");
      }
    } else if (!OPEN_RIDE_STATUSES.has(String(ride.status || "").toLowerCase())) {
      if (["completed", "cancelled"].includes(String(ride.status || "").toLowerCase())) throw new Error("This ride has already ended.");
      throw new Error("Calling is available only during an active ride.");
    }
    return {
      ride,
      passengerId,
      driverId,
      receiverId: userRole === "passenger" ? driverId : passengerId,
      receiverRole: userRole === "passenger" ? "driver" : "passenger",
      callerDisplayName: userRole === "passenger" ? (ride.passengerName || "Passenger") : (ride.driverName || "Driver")
    };
  }

  async function init(options) {
    stop();
    rideId = String(options?.rideId || "").trim();
    lostFoundCaseId = String(options?.lostFoundCaseId || "").trim();
    callCollection = lostFoundCaseId ? "lostFoundCalls" : "rideCalls";
    role = String(options?.role || "").trim();
    platform = String(options?.platform || "web");
    stateHandler = options?.onState;
    incomingHandler = options?.onIncoming;
    if (!rideId || !["passenger", "driver"].includes(role)) throw new Error("Calling is available only during an active ride.");
    deviceId = getDeviceId();
    await loadContext(rideId, role);
    callRef = db.collection(callCollection).doc(lostFoundCaseId || rideId);
    if (lostFoundCaseId) {
      contextUnsub = db.collection("lost_found_cases").doc(lostFoundCaseId).onSnapshot((snapshot) => {
        const data = snapshot.data() || {};
        const status = String(data.status || "").trim().toLowerCase().replace(/\s+/g, "_");
        if ((!snapshot.exists || !OPEN_LOST_FOUND_STATUSES.has(status)) && hasActiveCall()) {
          finish("ended", { failureReason: "lost_found_case_closed" }).catch(() => cleanupMedia());
        }
      });
    }
    callUnsub = callRef.onSnapshot((snapshot) => {
      if (!snapshot.exists) return;
      const data = snapshot.data() || {};
      if (data.rideId !== rideId || ![data.callerId, data.receiverId].includes(uid)) return;
      currentCall = data;
      callId = String(data.callId || "");
      const status = String(data.status || "");
      emit(status, data);
      if (status === "ringing" && data.receiverId === uid && !data.acceptedByDeviceId) {
        startRinging();
        incomingHandler?.(data);
        notifyIncoming(data);
      } else if (status === "ringing" && data.callerId === uid) {
        startRinging();
      }
      if (data.acceptedByDeviceId && data.receiverId === uid && data.acceptedByDeviceId !== deviceId) {
        stopRinging();
        cleanupMedia();
      }
      if (TERMINAL_CALL_STATUSES.has(status)) {
        stopRinging();
        cleanupMedia();
      }
      if (["completed", "cancelled"].includes(String(data.rideStatus || ""))) cleanupMedia();
    }, (error) => {
      console.error("[WOW Call] listener failed", error);
      emit("failed", { failureReason: "listener_failed" });
    });
    log("listener attached", { deviceId });
  }

  async function requestIceServers() {
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("php/rtc_ice_config.php", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rideId, callId, lostFoundCaseId })
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(result.iceServers) && result.iceServers.length) {
        log("ICE configuration received");
        return result.iceServers;
      }
    } catch (error) {
      console.warn("[WOW Call] secure ICE configuration unavailable", error?.message || error);
    }
    return DEFAULT_ICE;
  }

  async function prepareMedia() {
    if (!global.isSecureContext && !["localhost", "127.0.0.1", "::1"].includes(location.hostname)) {
      throw new Error("Secure HTTPS is required for private voice calling.");
    }
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Unable to connect the call.");
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      log("microphone permission granted");
    } catch (error) {
      log("microphone permission denied", { error: error?.name || "media_error" });
      throw new Error("Microphone permission is required for private voice calling.");
    }
    peer = new RTCPeerConnection({ iceServers: await requestIceServers() });
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
    remoteAudio = document.getElementById("wowRemoteCallAudio") || document.createElement("audio");
    remoteAudio.id = "wowRemoteCallAudio";
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
    if (!remoteAudio.parentNode) document.body.appendChild(remoteAudio);
    peer.ontrack = (event) => { remoteAudio.srcObject = event.streams[0]; };
    peer.onconnectionstatechange = async () => {
      const connection = peer?.connectionState || "closed";
      if (connection === "connected") {
        if (reconnectTimeoutId) global.clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
        await updateState("active", { connectedAt: FieldValue.serverTimestamp() }).catch(() => {});
        log("RTC channel joined");
      } else if (connection === "disconnected") {
        emit("reconnecting");
        await updateState("reconnecting").catch(() => {});
        if (reconnectTimeoutId) global.clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = global.setTimeout(() => {
          if (peer?.connectionState !== "connected") {
            finish("failed", { failureReason: "connection_lost" }).catch(() => {});
          }
        }, 10000);
      } else if (connection === "failed") {
        await finish("failed", { failureReason: "connection_lost" }).catch(() => {});
      }
    };
  }

  function listenCandidates(collectionName) {
    const unsub = callRef.collection(collectionName).limit(50).onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added" || !peer) return;
        const data = change.doc.data() || {};
        if (data.callId && data.callId !== callId) return;
        const candidate = typeof data.candidate === "string" ? data : data.candidate;
        peer.addIceCandidate(new RTCIceCandidate(
          typeof candidate === "string"
            ? { candidate, sdpMid: data.sdpMid, sdpMLineIndex: data.sdpMLineIndex }
            : candidate
        )).catch((error) => console.warn("[WOW Call] ICE candidate rejected", error));
      });
    });
    candidateUnsubs.push(unsub);
  }

  async function addCandidate(collectionName, candidate) {
    const payload = candidate.toJSON();
    await callRef.collection(collectionName).add({
      callId,
      senderId: uid,
      candidate: payload.candidate,
      sdpMid: payload.sdpMid,
      sdpMLineIndex: payload.sdpMLineIndex,
      usernameFragment: payload.usernameFragment || null,
      createdAt: FieldValue.serverTimestamp()
    });
  }

  async function start() {
    if (started) return;
    started = true;
    const ctx = await loadContext(rideId, role);
    callId = uniqueId();
    await prepareMedia();
    peer.onicecandidate = (event) => { if (event.candidate) addCandidate("callerCandidates", event.candidate).catch((error) => log("candidate write failed", { error: error?.message })); };
    const offer = await peer.createOffer({ offerToReceiveAudio: true });
    await peer.setLocalDescription(offer);
    await db.runTransaction(async (transaction) => {
      const rideRef = db.collection("rides").doc(rideId);
      const rideSnapshot = await transaction.get(rideRef);
      const caseRef = lostFoundCaseId ? db.collection("lost_found_cases").doc(lostFoundCaseId) : null;
      const caseSnapshot = caseRef ? await transaction.get(caseRef) : null;
      const callSnapshot = await transaction.get(callRef);
      if (!rideSnapshot.exists) throw new Error("No active ride found.");
      const liveRide = rideSnapshot.data() || {};
      if (lostFoundCaseId) {
        const liveCase = caseSnapshot?.data() || {};
        const caseStatus = String(liveCase.status || "").trim().toLowerCase().replace(/\s+/g, "_");
        if (!caseSnapshot?.exists || String(liveCase.rideId || "") !== rideId || !OPEN_LOST_FOUND_STATUSES.has(caseStatus)) {
          throw new Error("Calling is disabled for this Lost & Found case.");
        }
        if (!["completed", "ride_completed"].includes(String(liveRide.status || "").toLowerCase())) {
          throw new Error("Lost & Found calling requires a completed ride.");
        }
      } else if (!OPEN_RIDE_STATUSES.has(String(liveRide.status || "").toLowerCase())) {
        throw new Error("This ride has already ended.");
      }
      if (callSnapshot.exists && BUSY_CALL_STATUSES.has(String((callSnapshot.data() || {}).status || ""))) {
        throw new Error("Another call is already active for this ride.");
      }
      transaction.set(callRef, {
        callId,
        rideId,
        lostFoundCaseId: lostFoundCaseId || null,
        callContext: lostFoundCaseId ? "lost_found" : "ride",
        callerId: uid,
        callerRole: role,
        callerDisplayName: ctx.callerDisplayName,
        receiverId: ctx.receiverId,
        receiverRole: ctx.receiverRole,
        status: "ringing",
        provider: "webrtc",
        providerChannelId: `${rideId}_${callId}`,
        callerPlatform: platform,
        receiverPlatform: null,
        callerDeviceId: deviceId,
        acceptedByDeviceId: null,
        activeParticipantDevices: [deviceId],
        offer: { type: offer.type, sdp: offer.sdp },
        answer: null,
        missed: false,
        declined: false,
        failureReason: null,
        createdAt: FieldValue.serverTimestamp(),
        ringingAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });
    currentCall = { callId, rideId, callerId: uid, receiverId: ctx.receiverId, status: "ringing" };
    listenCandidates("calleeCandidates");
    const answerUnsub = callRef.onSnapshot((snapshot) => {
      const data = snapshot.data() || {};
      if (data.callId !== callId || !data.answer || peer?.currentRemoteDescription) return;
      peer?.setRemoteDescription(new RTCSessionDescription(data.answer)).catch((error) => log("remote answer failed", { error: error?.message }));
    });
    candidateUnsubs.push(answerUnsub);
    timeoutId = global.setTimeout(() => timeoutCall(callId), RING_TIMEOUT_MS);
    emit("ringing", currentCall);
    log("outgoing call created");
  }

  async function answer() {
    const ctx = await loadContext(rideId, role);
    void ctx;
    const snapshot = await callRef.get();
    const data = snapshot.data() || {};
    if (data.receiverId !== uid || data.status !== "ringing") throw new Error("The other user is currently unavailable.");
    callId = String(data.callId || "");
    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(callRef);
      const live = fresh.data() || {};
      if (live.callId !== callId || live.status !== "ringing" || live.receiverId !== uid) throw new Error("The other user is currently unavailable.");
      transaction.update(callRef, {
        status: "accepted",
        acceptedByDeviceId: deviceId,
        receiverPlatform: platform,
        activeParticipantDevices: FieldValue.arrayUnion(deviceId),
        answeredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });
    stopRinging();
    await prepareMedia();
    await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
    peer.onicecandidate = (event) => { if (event.candidate) addCandidate("calleeCandidates", event.candidate).catch((error) => log("candidate write failed", { error: error?.message })); };
    listenCandidates("callerCandidates");
    const answerDescription = await peer.createAnswer();
    await peer.setLocalDescription(answerDescription);
    await callRef.update({
      answer: { type: answerDescription.type, sdp: answerDescription.sdp },
      status: "connecting",
      updatedAt: FieldValue.serverTimestamp()
    });
    log("call accepted", { receiverPlatform: platform });
  }

  async function updateState(status, extra = {}) {
    if (!callRef || !callId) return;
    const snapshot = await callRef.get();
    const data = snapshot.data() || {};
    if (data.callId !== callId || ![data.callerId, data.receiverId].includes(uid)) return;
    await callRef.update({ status, updatedAt: FieldValue.serverTimestamp(), ...extra });
  }

  async function decline() {
    const snapshot = await callRef.get();
    const data = snapshot.data() || {};
    if (data.receiverId !== uid || data.status !== "ringing") return;
    callId = String(data.callId || "");
    await finish("declined", { declined: true });
    log("call declined");
  }

  async function end() {
    await finish("ended");
  }

  async function finish(status, extra = {}) {
    stopRinging();
    if (callRef && callId) {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(callRef);
        const data = snapshot.data() || {};
        if (data.callId !== callId || ![data.callerId, data.receiverId].includes(uid) || TERMINAL_CALL_STATUSES.has(data.status)) return;
        transaction.update(callRef, {
          status,
          endedBy: uid,
          endedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ...extra
        });
      });
    }
    cleanupMedia();
    log("RTC channel left", { status });
  }

  async function timeoutCall(expectedCallId) {
    timeoutId = null;
    if (!callRef) return;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(callRef);
      const data = snapshot.data() || {};
      if (data.callId !== expectedCallId || data.status !== "ringing") return;
      transaction.update(callRef, {
        status: "missed",
        missed: true,
        endedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }).catch((error) => log("call timeout update failed", { error: error?.message }));
    cleanupMedia();
    log("call timeout");
  }

  function mute(value) {
    localStream?.getAudioTracks().forEach((track) => { track.enabled = !value; });
    callRef?.set({
      participantMedia: {
        [uid]: { muted: !!value, updatedAt: FieldValue.serverTimestamp() }
      }
    }, { merge: true }).catch(() => {});
    log(value ? "microphone muted" : "microphone unmuted");
  }

  function speaker(value) {
    if (!remoteAudio) return false;
    remoteAudio.muted = !value;
    log(value ? "speaker enabled" : "speaker disabled");
    return true;
  }

  async function setAudioOutput(deviceIdValue) {
    if (!remoteAudio || typeof remoteAudio.setSinkId !== "function") return false;
    await remoteAudio.setSinkId(deviceIdValue);
    return true;
  }

  function notifyIncoming(data) {
    log("incoming notification received");
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      const notification = new Notification(data.callerRole === "driver" ? "Your driver is calling" : "Your passenger is calling", {
        body: lostFoundCaseId ? "Private Lost & Found call" : "Private Women on Wheels ride call",
        tag: `wow-call-${data.callId}`
      });
      notification.onclick = () => { global.focus(); notification.close(); };
    }
  }

  function stopRinging() {
    if (timeoutId) global.clearTimeout(timeoutId);
    timeoutId = null;
    if (ringtoneTimer) global.clearInterval(ringtoneTimer);
    ringtoneTimer = null;
  }

  function startRinging() {
    if (ringtoneTimer) return;
    unlockRingtoneAudio();
    const beep = () => {
      try {
        audioContext = audioContext || new (global.AudioContext || global.webkitAudioContext)();
        if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.frequency.value = 720;
        gain.gain.value = 0.08;
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.22);
      } catch {}
    };
    beep();
    ringtoneTimer = global.setInterval(beep, 1500);
  }

  function cleanupMedia() {
    if (reconnectTimeoutId) global.clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
    candidateUnsubs.splice(0).forEach((unsub) => { try { unsub(); } catch {} });
    try { peer?.close(); } catch {}
    peer = null;
    localStream?.getTracks().forEach((track) => track.stop());
    localStream = null;
    if (remoteAudio) remoteAudio.srcObject = null;
    started = false;
  }

  function stop() {
    stopRinging();
    if (callUnsub) {
      try { callUnsub(); } catch {}
      log("listener removed");
    }
    callUnsub = null;
    if (contextUnsub) {
      try { contextUnsub(); } catch {}
    }
    contextUnsub = null;
    cleanupMedia();
    currentCall = null;
    callId = "";
  }

  function hasActiveCall() {
    return !!currentCall && BUSY_CALL_STATUSES.has(String(currentCall.status || ""));
  }

  global.WowRideCall = { init, start, answer, decline, end, mute, speaker, setAudioOutput, hasActiveCall, stop };
})(window);
