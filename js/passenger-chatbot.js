(function () {
  "use strict";

  const MAX_HISTORY = 6;
  const state = {
    panel: null,
    overlay: null,
    body: null,
    input: null,
    send: null,
    fab: null,
    close: null,
    reset: null,
    quick: null,
    sending: false,
    controller: null,
    history: [],
    lastMessage: "",
    lastIntent: "",
    role: /driver/i.test(location.pathname) ? "driver" : "passenger",
    historyLoaded: false,
    historyLoading: null,
    unread: 0,
  };

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("pagehide", abortRequest);

  function init() {
    ensureUi();
    bind();
    renderWelcome();
  }

  function ensureUi() {
    let panel = document.getElementById("botPanel");
    let overlay = document.getElementById("botOverlay");
    let fab = document.getElementById("homeChatbot") || document.getElementById("wowChatbotFab");

    if (!panel) {
      panel = document.createElement("section");
      panel.id = "botPanel";
      panel.className = "wow-chatbot-panel";
      panel.setAttribute("aria-hidden", "true");
      panel.innerHTML =
        '<div class="wow-chatbot-head">' +
          '<div class="wow-chatbot-title"><span class="wow-chatbot-avatar">WOW</span><div><strong>WOW Assistant</strong><span>Secure ride support · Available</span></div></div>' +
          '<div class="wow-chatbot-head-actions"><button type="button" class="wow-chatbot-minimize" aria-label="Minimize" title="Minimize">−</button><button type="button" class="wow-chatbot-reset" aria-label="Clear conversation" title="Clear conversation">↻</button>' +
          '<button type="button" class="wow-chatbot-close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
        '</div>' +
        '<div class="wow-chatbot-body" id="botBody" aria-live="polite"></div>' +
        '<div class="wow-chatbot-quick"></div>' +
        '<div class="wow-chatbot-input"><label class="sr-only" for="botInput">Ask WOW Assistant</label><textarea id="botInput" rows="1" maxlength="500" autocomplete="off" placeholder="Ask about your ride..."></textarea><button id="sendBot" class="wow-chatbot-send" type="button" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M3 12l18-9-6 18-3-7-9-2Z"/></svg></button></div>';
      document.body.appendChild(panel);
    }
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "botOverlay";
      overlay.className = "wow-chatbot-overlay";
      document.body.appendChild(overlay);
    }
    if (!fab) {
      fab = document.createElement("button");
      fab.id = "wowChatbotFab";
      fab.type = "button";
      fab.className = "wow-chatbot-fab";
      fab.setAttribute("aria-label", "Open WOW Assistant");
      fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3a7 7 0 0 0-7 7v4a3 3 0 0 0 3 3h2v2h4v-2h2a3 3 0 0 0 3-3v-4a7 7 0 0 0-7-7Zm-2 6h4v2h-4Zm6 0h2v2h-2Z"/></svg>';
      document.body.appendChild(fab);
    }

    panel.classList.add("wow-chatbot-normalized");
    overlay.classList.add("wow-chatbot-overlay");
    const body = panel.querySelector("#botBody") || panel.querySelector(".bot-body");
    body?.classList.add("wow-chatbot-scroll");
    const head = panel.querySelector(".wow-chatbot-head") || panel.querySelector(".bot-header");
    if (head && !head.querySelector(".wow-chatbot-reset")) {
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "wow-chatbot-reset";
      reset.setAttribute("aria-label", "Reset conversation");
      reset.title = "Reset conversation";
      reset.textContent = "↻";
      head.appendChild(reset);
    }
    const quick = panel.querySelector(".wow-chatbot-quick") || panel.querySelector(".bot-quick");
    panel.querySelector("#cancelBot")?.remove();
    const input = panel.querySelector("#botInput");
    const send = panel.querySelector("#sendBot");
    const close = panel.querySelector("#closeBot") || panel.querySelector(".wow-chatbot-close");
    state.panel = panel;
    state.overlay = overlay;
    state.body = body;
    state.input = input;
    state.send = send;
    state.fab = fab;
    state.close = close;
    state.reset = panel.querySelector(".wow-chatbot-reset");
    state.minimize = panel.querySelector(".wow-chatbot-minimize");
    state.quick = quick;
    if (input) {
      input.maxLength = 500;
      input.autocomplete = "off";
    }
    renderSuggestions();
  }

  function bind() {
    state.fab?.addEventListener("click", capture(openPanel), true);
    state.close?.addEventListener("click", capture(closePanel), true);
    state.overlay?.addEventListener("click", capture(closePanel), true);
    state.reset?.addEventListener("click", capture(resetConversation), true);
    state.minimize?.addEventListener("click", capture(closePanel), true);
    state.send?.addEventListener("click", capture(() => sendMessage()), true);
    state.input?.addEventListener("input", updateSend);
    state.input?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      sendMessage();
    }, true);
    state.quick?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-question]");
      if (!button) return;
      event.preventDefault();
      sendMessage(button.dataset.question || "", true);
    });
    updateSend();
  }

  function capture(callback) {
    return function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      callback();
    };
  }

  async function loadHistory() {
    if (state.historyLoaded) return;
    state.historyLoaded = true;
    renderSuggestions();
  }

  async function sendMessage(override, fromQuickAction = false) {
    const message = String(override || state.input?.value || "").trim();
    if (!message || state.sending) return;
    state.lastMessage = message;
    state.sending = true;
    if (state.input) state.input.value = "";
    updateSend();
    appendMessage("user", message);
    showTyping();
    let reply = "";
    let actions = [];
    try {
      const user = window.firebase?.auth ? firebase.auth().currentUser : null;
      if (!user) throw new Error("authentication_required");
      const token = await user.getIdToken();
      state.controller = new AbortController();
      const response = await fetch("php/wow_assistant_api.php", {
        method: "POST",
        credentials: "same-origin",
        signal: state.controller.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          message,
          history: state.history,
          role: state.role,
          sourcePlatform: state.role + "_website",
          conversationId: user.uid + "-" + new Date().toISOString().slice(0, 10),
          userRequestedSupport: fromQuickAction && normalize(message) === "contact support"
        })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "assistant_unavailable");
      reply = String(data.reply || "");
      state.lastIntent = String(data.intent || state.lastIntent || "");
      actions = Array.isArray(data.actions) ? data.actions : [];
    } catch (error) {
      if (error?.name === "AbortError") return;
      reply = localAnswer(message);
    } finally {
      state.controller = null;
    }
    hideTyping();
    appendMessage("bot", reply);
    renderActions(actions);
    state.history.push(
      { role: "user", content: message },
      { role: "assistant", content: reply }
    );
    state.history = state.history.slice(-MAX_HISTORY);
    state.sending = false;
    updateSend();
    renderSuggestions();
  }

  function localAnswer(input) {
    const text = normalize(input);
    const driver = state.role === "driver";
    const has = (...terms) => terms.some((term) => text.includes(term));
    let intent = "";

    if (/^(hi|hello|hey|helo|hii)\b/.test(text)) return "Hello! I can help with rides, payments, maps, SOS, chat, calling, profiles, notifications, history, earnings, and Lost and Found.";
    if (has("assalam", "salam", "salaam")) return "Walaikum Assalam! Welcome to Women on Wheels. How may I help you today?";
    if (has("good morning")) return "Good morning! How may I help you today?";
    if (has("good afternoon")) return "Good afternoon! How may I help you today?";
    if (has("good evening")) return "Good evening! How may I help you today?";
    if (has("how are you")) return "I am doing well and ready to help with Women on Wheels.";
    if (has("who are you", "what can you do")) return "I am the Women on Wheels assistant. I provide passenger or driver guidance directly in this website without sending your question to an external AI service.";
    if (has("thank", "shukriya")) return "You are welcome! Is there anything else I can help you with?";
    if (has("bye", "allah hafiz")) return "Allah Hafiz! Stay safe and travel comfortably.";

    if (has("how to use", "app kaise", "website kaise", "guide me")) intent = "help";
    else if (has("sos", "emergency", "unsafe", "danger", "madad")) intent = "sos";
    else if (has("lost", "found item", "saman", "cheez mil")) intent = "lost";
    else if (has("book", "booking", "ride chahiye", "ride kaise")) intent = "booking";
    else if (has("schedule", "scheduled", "later ride", "baad mein")) intent = "schedule";
    else if (has("carpool", "car pool", "shared ride")) intent = "carpool";
    else if (has("payment", "easypaisa", "jazzcash", "nayapay", "cash", "card")) intent = "payment";
    else if (has("fare", "price", "cost", "kiraya", "kitna")) intent = "fare";
    else if (has("counter", "offer", "accept ride", "decline ride")) intent = "offer";
    else if (has("location", "map", "gps", "route", "track", "driver kahan")) intent = "location";
    else if (has("chat", "message", "call", "phone number")) intent = "communication";
    else if (has("notification", "alert")) intent = "notification";
    else if (has("cancel")) intent = "cancel";
    else if (has("history", "previous ride", "last ride")) intent = "history";
    else if (has("earning", "kamai", "commission")) intent = "earnings";
    else if (has("online", "offline", "request nahi", "request not")) intent = "requests";
    else if (has("start ride", "arrived", "complete ride", "finish ride")) intent = "lifecycle";
    else if (has("profile", "password", "login", "register", "verification", "cnic", "licence", "license")) intent = "account";
    else if (has("rating", "review", "feedback")) intent = "rating";
    else if (has("support", "complaint", "not working", "failed", "error", "nahi ho")) intent = "support";
    else if (/^(it|that|this|wo|woh|isko|usko|can i|kya main)\b/.test(text)) intent = state.lastIntent || "";
    state.lastIntent = intent || state.lastIntent;

    const answers = {
      help: driver
        ? "Driver guide: complete verification, wait for approval, go Online and Available, review requests, accept or counter-offer, navigate to pickup, mark Arrived, Start Ride, then Complete Ride and check Earnings or History."
        : "Passenger guide: sign in, select pickup and destination, choose Car, Bike, Scooty or Carpool, review fare, book now or schedule, accept a driver offer, track the driver, complete payment, then rate the ride.",
      sos: "For immediate danger, open the active ride and press SOS. Confirm the countdown so your ride and current location reach the safety system, and contact local emergency services when needed.",
      lost: driver
        ? "Open Lost and Found and report an item found on a completed ride. Add clear details; the report is shared with the relevant passenger without exposing private contact information."
        : "Open Lost and Found from My Requests or ride history, select the completed ride, describe the item, and submit. Driver responses will appear in My Requests and notifications.",
      booking: driver
        ? "Drivers do not create passenger bookings. Go Online and Available to receive matching real ride requests."
        : "Choose pickup and destination, select Car, Bike or Scooty, review the fare and offer, choose instant, scheduled or carpool where available, then tap Book Ride.",
      schedule: "Choose Schedule for Later, enter the future date and time yourself, confirm pickup, destination, vehicle and fare, then view the request under My Requests.",
      carpool: "Carpool is available for cars because multiple passengers and seats must be managed safely. Select Carpool during booking and review the shared route, seats and fare before confirming.",
      payment: "Payment appears after ride completion. Choose an available method such as Cash, Easypaisa, JazzCash or NayaPay and follow the displayed confirmation; never share wallet PINs or credentials.",
      fare: "Fare uses the selected route, distance, vehicle and booking type. Review the estimate before submitting; an accepted counter-offer becomes the agreed fare.",
      offer: driver
        ? "Open a live request to accept, decline, or send a counter-offer within the displayed range. A counter-offer does not assign the ride until the passenger accepts it."
        : "Open the current request, review the driver, vehicle, rating and price, then accept or decline the counter-offer. Accepting confirms the assigned driver.",
      location: "Enable GPS and location permission, keep internet active, and reopen the active ride map. Before pickup the route goes toward pickup; after Start Ride it goes from the vehicle to the destination. Zoom in to see streets, local areas and nearby labels.",
      communication: "Chat and private in-app calling become available only after a driver is assigned to an active ride. Personal phone numbers are not required or displayed.",
      notification: "Allow browser notifications and keep internet active. Passenger accounts receive passenger alerts and driver accounts receive driver alerts; refresh the signed-in session if updates remain delayed.",
      cancel: "Use Cancel Ride on the active request, choose the correct reason, and confirm. Cancellation may be unavailable after the ride has started.",
      history: "Open Ride History to see completed and cancelled rides. Active, completed and cancelled rides are separated so old rides do not remain current.",
      earnings: driver ? "Open Earnings to view totals from completed rides, payment records and admin commission. Pending or cancelled rides are not counted." : "Driver earnings and admin commission are private. Passengers can view their own ride fares and payment history.",
      requests: driver ? "Confirm your account is approved, then switch Online and Available on the driver dashboard. Keep GPS and internet enabled and check that the request vehicle matches yours." : "Your booking remains in Finding Driver while nearby approved drivers are checked. Keep internet and location active and verify the request is still current.",
      lifecycle: driver ? "For an assigned ride: navigate to pickup, mark Arrived, start only when the passenger is onboard, then Complete Ride at the destination. Completion stops live tracking and moves it to history." : "The driver updates Arrived, Started and Completed. Follow those stages on the active ride screen; after completion you continue to payment and rating.",
      account: driver ? "Create a driver account, submit your profile, CNIC, licence and vehicle details, then wait for admin approval. Use Edit Profile only for permitted fields." : "Use Sign Up or Login for your passenger account. Reset a forgotten password from the login screen and update allowed details from Edit Profile.",
      rating: "Ratings and reviews become available after a completed ride. Keep feedback factual, respectful and focused on service and safety.",
      support: "Check internet, GPS and permissions, confirm you are signed into the correct role, and reopen the relevant current ride. Retry once, then use Contact Support with the ride code and a short description—never share passwords or payment PINs."
    };
    return answers[intent] || "I could not fully understand your question. Please rephrase it, or ask about ride booking, scheduled rides, payments, driver requests, maps, SOS, chat, calling, Lost and Found, notifications, profiles, earnings, or ride history.";
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  }

  function renderWelcome() {
    if (!state.body || state.body.children.length) return;
    appendMessage("bot", "Hi! I am the Women on Wheels assistant. Ask me about WOW, booking, driver registration, tracking, payments, safety, or account help.");
  }

  function appendMessage(type, text, retry) {
    if (!state.body) return;
    const wrap = document.createElement("div");
    wrap.className = (state.body.classList.contains("bot-body") ? "bot-bubble " : "wow-chatbot-msg ") + type;
    const content = document.createElement("span");
    content.textContent = String(text || "");
    wrap.appendChild(content);
    const timestamp = document.createElement("time");
    timestamp.className = "wow-chatbot-time";
    timestamp.dateTime = new Date().toISOString();
    timestamp.textContent = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date());
    wrap.appendChild(timestamp);
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wow-chatbot-retry";
      button.textContent = "Retry";
      button.addEventListener("click", () => sendMessage(state.lastMessage));
      wrap.appendChild(button);
    }
    state.body.appendChild(wrap);
    state.body.scrollTop = state.body.scrollHeight;
    if (type === "bot" && !state.panel?.classList.contains("is-open")) {
      state.unread += 1;
      state.fab?.setAttribute("data-unread", String(Math.min(state.unread, 9)));
      state.fab?.classList.add("has-unread");
    }
  }

  function showTyping() {
    hideTyping();
    if (!state.body) return;
    const bubble = document.createElement("div");
    bubble.id = "wowChatbotTyping";
    bubble.className = (state.body.classList.contains("bot-body") ? "bot-bubble bot " : "wow-chatbot-msg bot ") + "wow-chatbot-typing";
    bubble.innerHTML = "Thinking <span></span><span></span><span></span>";
    state.body.appendChild(bubble);
    state.body.scrollTop = state.body.scrollHeight;
  }

  function hideTyping() {
    document.getElementById("wowChatbotTyping")?.remove();
    document.getElementById("botTyping")?.remove();
  }

  function renderSuggestions() {
    if (!state.quick) return;
    const driver = state.role === "driver";
    const list = driver
      ? ["What is WOW?", "Driver Registration", "Driver Verification", "View Ride Requests", "My Earnings", "Safety & SOS", "Account Help", "Contact Support"]
      : ["What is WOW?", "Book a Ride", "Track My Ride", "Payments", "Safety & SOS", "Lost and Found", "Account Help", "Contact Support"];
    state.quick.innerHTML = list.map((text) => '<button type="button" class="quick-chip wow-chatbot-chip" data-question="' + escapeHtml(text) + '">' + escapeHtml(text) + "</button>").join("");
  }

  function renderActions(actions) {
    if (!state.body || !Array.isArray(actions) || !actions.length) return;
    const wrap = document.createElement("div");
    wrap.className = "wow-chatbot-actions";
    actions.slice(0, 3).forEach((action) => {
      if (!action?.label || !safeRoute(action.route)) return;
      const link = document.createElement("a");
      link.className = "wow-chatbot-action";
      const params = action.rideId ? "?rideId=" + encodeURIComponent(action.rideId) : "";
      link.href = action.route + params;
      link.textContent = action.label;
      wrap.appendChild(link);
    });
    if (wrap.children.length) state.body.appendChild(wrap);
  }

  function safeRoute(route) {
    return typeof route === "string" && /^[a-z0-9_-]+\.html$/i.test(route);
  }

  function resetConversation() {
    abortRequest();
    state.history = [];
    state.body.innerHTML = "";
    renderWelcome();
  }

  function openPanel() {
    state.unread = 0;
    state.fab?.removeAttribute("data-unread");
    state.fab?.classList.remove("has-unread");
    document.body.classList.add("wow-chatbot-open");
    state.overlay?.classList.add("is-open");
    state.panel?.classList.add("is-open");
    state.panel?.setAttribute("aria-hidden", "false");
    loadHistory();
    setTimeout(() => state.input?.focus(), 50);
  }

  function closePanel() {
    document.body.classList.remove("wow-chatbot-open");
    state.overlay?.classList.remove("is-open");
    state.panel?.classList.remove("is-open");
    state.panel?.setAttribute("aria-hidden", "true");
    state.fab?.focus();
  }

  function updateSend() {
    if (state.send) state.send.disabled = state.sending || !String(state.input?.value || "").trim();
  }

  function abortRequest() {
    state.controller?.abort();
    state.controller = null;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  window.WowChatbot = Object.freeze({
    open: openPanel,
    close: closePanel,
    ask: sendMessage,
  });
})();
