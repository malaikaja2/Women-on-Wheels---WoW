(function initWowLiveTracking(global) {
  const instances = new Map();
  // Driver location follows the active ride. Passenger location is shared only
  // during pickup assistance and is stopped as soon as the ride starts.
  const TRACKABLE = new Set(["driver_assigned", "accepted", "driver_en_route", "driver_arriving", "arriving", "arrived", "ride_started", "started", "ongoing", "in_progress", "on_trip", "active"]);
  const PICKUP_SHARING = new Set(["driver_assigned", "accepted", "driver_selected", "driver_en_route", "driver_arriving", "arriving", "arrived"]);
  const TERMINAL = new Set(["completed", "ride_completed", "cancelled", "canceled", "ride_cancelled", "driver_cancelled", "passenger_cancelled", "rejected", "expired", "no_show", "noshow"]);
  const WRITE_INTERVAL_MS = 9000;
  const STALE_MS = 25000;
  const ROUTE_INTERVAL_MS = 20000;
  const ROUTE_MOVE_METERS = 40;
  const WRITE_MOVE_METERS = 10;
  const WRITE_HEARTBEAT_MS = 45000;
  const HEADING_DELTA = 20;

  function finitePoint(data) {
    const lat = Number(data?.latitude ?? data?.lat ?? data?._latitude);
    const lng = Number(data?.longitude ?? data?.lng ?? data?._longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng }
      : null;
  }

  function rideLocation(ride, role) {
    const nested = role === "passenger"
      ? (ride?.passenger_location ?? ride?.passengerLocation)
      : (ride?.driver_location ?? ride?.driverLocation ?? ride?.currentDriverLocation);
    const nestedPoint = finitePoint(nested);
    if (nestedPoint) return nestedPoint;
    return finitePoint(role === "passenger"
      ? { latitude: ride?.passengerLatitude, longitude: ride?.passengerLongitude }
      : { latitude: ride?.driverLatitude, longitude: ride?.driverLongitude });
  }

  function millis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (value.seconds) return Number(value.seconds) * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function distanceMeters(a, b) {
    if (!a || !b) return Infinity;
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const x = Math.sin(dLat / 2) ** 2
      + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function pointKey(point) {
    const p = finitePoint(point);
    return p ? `${p.lng.toFixed(5)},${p.lat.toFixed(5)}` : "";
  }

  function headingChanged(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) >= HEADING_DELTA;
  }

  function number(value) {
    if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : 0;
    if (typeof value !== "string") return 0;
    const parsed = Number(value.trim().replace(/^\s*(rs\.?|pkr)\s*/i, "").replace(/[,\s]/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  function completedFare(ride) {
    const row = ride && typeof ride === "object" ? ride : {};
    for (const field of ["finalFare", "acceptedFare", "agreedFare", "driverOffer", "passengerOffer", "fare", "estimatedFare"]) {
      const value = number(row[field]);
      if (value > 0) return Math.round(value * 100) / 100;
    }
    return 0;
  }

  function revenueSplit(fare) {
    const finalFare = Math.round(number(fare) * 100) / 100;
    const driverEarning = Math.round(finalFare * 0.70 * 100) / 100;
    return { finalFare, driverEarning };
  }

  function friendlyGeoError(error) {
    if (!global.isSecureContext && !["localhost", "127.0.0.1", "::1"].includes(location.hostname)) {
      return "Secure HTTPS connection is required for live tracking.";
    }
    if (error?.code === 1) {
      console.warn("[WOW Tracking] location permission denied");
      return "Location permission is required for live ride tracking.";
    }
    if (error?.code === 2) {
      console.warn("[WOW Tracking] GPS unavailable");
      return "Please enable GPS to continue live tracking.";
    }
    if (error?.code === 3) return "Waiting for live location update...";
    return "Waiting for live location update...";
  }

  class Tracker {
    constructor(options) {
      this.options = options;
      this.role = options.role;
      this.rideId = String(options.rideId || "");
      this.watchId = null;
      this.rideUnsub = null;
      this.locationUnsubs = [];
      this.staleTimer = null;
      this.lastWrite = null;
      this.lastWriteAt = 0;
      this.lastRoutePoint = null;
      this.lastRouteAt = 0;
      this.lastRouteDestinationKey = "";
      this.lastRideStatus = "";
      this.lastInactiveStatus = "";
      this.ride = null;
      this.uid = "";
      this.db = null;
      this.FieldValue = null;
      this.mapEntries = new Map();
      this.locations = { passenger: null, driver: null };
      this.lastRoute = null;
      this.lastRouteOriginKey = "";
      this.stopped = false;
      this.onlineHandler = () => this.setStatus("Reconnecting to live tracking...");
      this.offlineHandler = () => this.setStatus("Offline. Showing last known locations.");
    }

    async init() {
      if (!this.rideId || !["passenger", "driver"].includes(this.role)) throw new Error("Invalid live tracking context.");
      if (!global.WowFirestore) throw new Error("Firebase live tracking is unavailable.");
      const ready = await global.WowFirestore.ready();
      this.db = ready.db;
      this.FieldValue = ready.FieldValue;
      this.GeoPoint = ready.firebase?.firestore?.GeoPoint || global.firebase?.firestore?.GeoPoint;
      this.uid = ready.uid || ready.auth?.currentUser?.uid || "";
      if (!this.uid) throw new Error("Authentication is required for live tracking.");
      global.addEventListener("online", this.onlineHandler);
      global.addEventListener("offline", this.offlineHandler);
      this.listenRide();
      console.info("[WOW Tracking] tracker initialized", { rideId: this.rideId, role: this.role, uid: this.uid });
      return this;
    }

    listenRide() {
      const ref = this.db.collection("rides").doc(this.rideId);
      console.info("[WOW Tracking] ride listener attached", { rideId: this.rideId, role: this.role });
      this.rideUnsub = ref.onSnapshot((snapshot) => {
        if (!snapshot.exists) return this.fail("Ride no longer exists.");
        const ride = snapshot.data() || {};
        const participant = this.role === "passenger" ? ride.passengerId : ride.assignedDriverId;
        if (String(participant || "") !== this.uid) return this.fail("This account is not authorized for this ride.");
        this.ride = ride;
        const status = String(ride.status || "").toLowerCase();
        console.info("[WOW Tracking] ride update", {
          rideId: this.rideId,
          driverId: ride.assignedDriverId || "",
          passengerId: ride.passengerId || "",
          status
        });
        const phaseChanged = this.lastRideStatus && this.lastRideStatus !== status;
        this.lastRideStatus = status;
        if (phaseChanged) {
          this.lastRouteAt = 0;
          this.lastRoutePoint = null;
          this.lastRouteDestinationKey = "";
        }
        this.options.onRideStatus?.(status, ride);
        this.applyRideDocumentLocation("passenger", rideLocation(ride, "passenger"));
        this.applyRideDocumentLocation("driver", rideLocation(ride, "driver"));
        if (phaseChanged || !this.locationUnsubs.length) this.listenLocations(status);
        if (TRACKABLE.has(status)) {
          if (this.role === "driver" || PICKUP_SHARING.has(status)) this.startWatch();
          else {
            this.stopWatch();
            this.markLocationInactive();
          }
          this.setStatus(navigator.onLine ? "Live tracking active" : "Offline. Showing last known locations.");
          if (phaseChanged) {
            const routeOrigin = this.role === "passenger" ? this.locations.driver?.point : this.locations.driver?.point;
            if (routeOrigin) this.maybeUpdateRoute(routeOrigin);
          }
        } else {
          this.stopWatch();
          if (TERMINAL.has(status)) {
            this.removeMarkers();
            this.stop(true);
          }
          else this.setStatus("Live tracking is waiting for an active ride.");
        }
      }, (error) => this.fail("Live ride connection failed: " + (error?.message || "Firestore error")));
    }

    applyRideDocumentLocation(role, raw) {
      if (!TRACKABLE.has(String(this.ride?.status || "").toLowerCase())) return;
      const point = finitePoint(raw);
      if (!point) return;
      this.locations[role] = { point, updatedMs: millis(this.ride?.last_updated) };
      this.updateMarker(role, point);
      this.options.onLocation?.(role, this.locations[role]);
    }

    listenLocations(status) {
      this.locationUnsubs.splice(0).forEach((unsub) => { try { unsub(); } catch {} });
      const roles = this.role === "passenger"
        ? ["driver"]
        : (PICKUP_SHARING.has(status) ? ["passenger"] : []);
      if (this.role === "driver" && !PICKUP_SHARING.has(status)) {
        this.mapEntries.forEach((entry) => {
          if (entry.markerAnimations.passenger) global.cancelAnimationFrame(entry.markerAnimations.passenger);
          entry.markerAnimations.passenger = null;
          try { entry.markers.passenger?.remove?.(); } catch {}
          entry.markers.passenger = null;
          entry.renderedPoints.passenger = null;
        });
        this.locations.passenger = null;
      }
      roles.forEach((role) => {
        const unsub = this.db.collection("rides").doc(this.rideId).collection("liveLocations").doc(role)
          .onSnapshot((snapshot) => {
            if (!snapshot.exists) return;
            const data = snapshot.data() || {};
            if (data.isActive === false || data.active === false) return;
            const point = finitePoint(data);
            if (!point) return;
            this.locations[role] = { ...data, point, updatedMs: millis(data.updatedAt) };
            this.updateMarker(role, point);
            if (this.role === "passenger" && role === "driver" && TRACKABLE.has(String(this.ride?.status || ""))) {
              this.maybeUpdateRoute(point);
            }
            this.updateStaleState();
            this.options.onLocation?.(role, this.locations[role]);
          }, (error) => this.fail("Live location connection failed: " + (error?.message || "Firestore error")));
        this.locationUnsubs.push(unsub);
      });
      if (!this.staleTimer) this.staleTimer = global.setInterval(() => this.updateStaleState(), 5000);
      console.info("[WOW Tracking] location listeners attached", { rideId: this.rideId, role: this.role });
    }

    startWatch() {
      if (this.watchId !== null || this.stopped) return;
      if (!global.isSecureContext && !["localhost", "127.0.0.1", "::1"].includes(location.hostname)) {
        this.fail("Secure HTTPS connection is required for live tracking.");
        return;
      }
      if (!navigator.geolocation) return this.fail("This browser does not support live location.");
      this.setStatus("Waiting for GPS signal...");
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this.handlePosition(position),
        (error) => this.fail(friendlyGeoError(error)),
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 }
      );
      console.info("[WOW Tracking] location watcher started", { rideId: this.rideId, role: this.role, uid: this.uid });
    }

    async handlePosition(position) {
      const status = String(this.ride?.status || "").toLowerCase();
      if (!this.ride || !TRACKABLE.has(status) || this.stopped
        || (this.role === "passenger" && !PICKUP_SHARING.has(status))) return;
      const point = finitePoint({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      if (!point) return;
      this.locations[this.role] = { ...(this.locations[this.role] || {}), point, updatedMs: Date.now() };
      this.updateMarker(this.role, point);
      const now = Date.now();
      const elapsed = now - this.lastWriteAt;
      const moved = distanceMeters(this.lastWrite, point);
      const heading = Number(position.coords.heading);
      const shouldWrite = elapsed >= WRITE_INTERVAL_MS
        && (!this.lastWrite
          || moved >= WRITE_MOVE_METERS
          || elapsed >= WRITE_HEARTBEAT_MS
          || headingChanged(this.lastWrite.heading, heading));
      if (!shouldWrite) return;
      const roleId = this.role === "passenger" ? this.ride.passengerId : this.ride.assignedDriverId;
      if (String(roleId || "") !== this.uid) return this.fail("Live location authorization changed.");
      try {
        const rideRef = this.db.collection("rides").doc(this.rideId);
        const locationRef = rideRef.collection("liveLocations").doc(this.role);
        const timestamp = this.FieldValue.serverTimestamp();
        const batch = this.db.batch();
        batch.set(locationRef, {
          rideId: this.rideId,
          userId: this.uid,
          role: this.role,
          latitude: point.lat,
          longitude: point.lng,
          heading: Number.isFinite(heading) ? heading : null,
          speed: Number.isFinite(Number(position.coords.speed)) ? Number(position.coords.speed) : null,
          accuracy: Number.isFinite(Number(position.coords.accuracy)) ? Number(position.coords.accuracy) : null,
          active: true,
          isActive: true,
          isSharing: true,
          rideStatus: status,
          updatedAt: timestamp
        }, { merge: true });
        if (this.role === "driver") {
          const geo = this.GeoPoint ? new this.GeoPoint(point.lat, point.lng) : { latitude: point.lat, longitude: point.lng };
          batch.set(rideRef, {
            driver_location: geo,
            last_updated: timestamp
          }, { merge: true });
        }
        await batch.commit();
        this.lastWriteAt = now;
        this.lastWrite = { ...point, heading };
        this.setStatus("Live tracking active");
        console.info(`[WOW Tracking] ${this.role === "driver" ? "Driver" : "Passenger"} Location Updated`, {
          rideId: this.rideId,
          driverId: this.ride.assignedDriverId || "",
          passengerId: this.ride.passengerId || "",
          latitude: point.lat,
          longitude: point.lng,
          accuracy: Number(position.coords.accuracy),
          heading: Number.isFinite(heading) ? heading : null,
          speed: Number(position.coords.speed),
          timestamp: new Date(now).toISOString(),
          status: this.ride.status
        });
        if (this.role === "driver") this.maybeUpdateRoute(point);
      } catch (error) {
        this.fail("Location update failed. Reconnecting to live tracking.");
        console.error("[WOW Tracking] location write failed", error);
      }
    }

    primaryEntry() {
      const map = this.options.getMap?.();
      if (!map || !global.WowMapbox) return null;
      const routeLayerId = this.options.routeLayerId || ("wow-live-route-" + this.role);
      return this.attachMap("primary", map, { routeLayerId, silent: true });
    }

    mapList() {
      this.primaryEntry();
      return Array.from(this.mapEntries.values()).filter((entry) => entry?.map);
    }

    attachMap(key = "primary", map, config = {}) {
      if (!map || !global.WowMapbox) return null;
      const id = String(key || "primary");
      let entry = this.mapEntries.get(id);
      if (entry && entry.map === map) {
        entry.routeLayerId = config.routeLayerId || entry.routeLayerId;
        return entry;
      }
      if (entry) this.detachMap(id);
      entry = {
        key: id,
        map,
        routeLayerId: config.routeLayerId || this.options.routeLayerId || ("wow-live-route-" + this.role + "-" + id),
        markers: { passenger: null, driver: null },
        markerAnimations: { passenger: null, driver: null },
        renderedPoints: { passenger: null, driver: null },
        fitted: false,
        follow: true,
        handlers: []
      };
      const disableFollow = (event) => {
        if (!event?.originalEvent) return;
        entry.follow = false;
        this.options.onFollowChange?.(false, entry.key);
      };
      ["dragstart", "zoomstart", "rotatestart", "pitchstart"].forEach((eventName) => {
        map.on(eventName, disableFollow);
        entry.handlers.push([eventName, disableFollow]);
      });
      map.on("error", () => this.setStatus("Map tiles are reconnecting. Live tracking remains active."));
      this.mapEntries.set(id, entry);
      ["passenger", "driver"].forEach((role) => {
        const point = this.locations[role]?.point;
        if (point) this.updateMarkerOnEntry(entry, role, point, false);
      });
      if (this.lastRoute?.coordinates?.length) {
        global.WowMapbox.drawRoute(map, entry.routeLayerId, this.lastRoute.coordinates, "#6c2bd9", 6);
      }
      const points = Object.values(this.locations).map((row) => row?.point).filter(Boolean);
      if (points.length) this.fitEntry(entry, points);
      if (!config.silent) this.options.onFollowChange?.(entry.follow, entry.key);
      return entry;
    }

    detachMap(key = "primary") {
      const entry = this.mapEntries.get(String(key || "primary"));
      if (!entry) return;
      entry.handlers.forEach(([eventName, handler]) => {
        try { entry.map.off(eventName, handler); } catch {}
      });
      this.clearEntry(entry, true);
      this.mapEntries.delete(entry.key);
    }

    clearEntry(entry, clearRoute = false) {
      ["passenger", "driver"].forEach((role) => {
        if (entry.markerAnimations[role]) global.cancelAnimationFrame(entry.markerAnimations[role]);
        entry.markerAnimations[role] = null;
        try { entry.markers[role]?.remove?.(); } catch {}
        entry.markers[role] = null;
      });
      if (clearRoute && global.WowMapbox) global.WowMapbox.clearRoute(entry.map, entry.routeLayerId);
    }

    updateMarker(role, point) {
      if (!global.WowMapbox) return;
      this.mapList().forEach((entry) => this.updateMarkerOnEntry(entry, role, point, true));
    }

    updateMarkerOnEntry(entry, role, point, animate) {
      if (!entry?.map || !point) return;
      const marker = entry.markers[role];
      if (!marker) {
        const own = role === this.role;
        const label = role === "passenger" ? (own ? "You" : "P") : (own ? "You" : "D");
        entry.markers[role] = global.WowMapbox.createLabelMarker(entry.map, point, role === "passenger" ? "#8e44ad" : "#1687ff", label, { size: own ? 30 : 26 });
        entry.renderedPoints[role] = point;
      } else if (animate) {
        this.animateMarker(entry, role, point);
      } else {
        global.WowMapbox.setMarkerPoint(marker, point);
        entry.renderedPoints[role] = point;
      }
      const points = Object.values(this.locations).map((row) => row?.point).filter(Boolean);
      if (!entry.fitted && points.length >= 1) this.fitEntry(entry, points);
      const followRole = "driver";
      if (entry.follow && role === followRole && entry.fitted) {
        try {
          entry.map.easeTo({
            center: [point.lng, point.lat],
            zoom: Math.max(entry.map.getZoom ? entry.map.getZoom() : 14, this.role === "driver" ? 15 : 14),
            duration: 650
          });
        } catch {}
      }
    }

    animateMarker(entry, role, target) {
      const marker = entry.markers[role];
      const start = finitePoint(marker?.getLngLat?.()) || entry.renderedPoints[role] || this.locations[role]?.renderedPoint;
      if (!marker || !start || typeof marker.setLngLat !== "function") {
        global.WowMapbox.setMarkerPoint(marker, target);
        return;
      }
      if (entry.markerAnimations[role]) global.cancelAnimationFrame(entry.markerAnimations[role]);
      const startedAt = performance.now();
      const duration = 900;
      const step = (now) => {
        if (this.stopped || !entry.markers[role]) return;
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = {
          lat: start.lat + (target.lat - start.lat) * eased,
          lng: start.lng + (target.lng - start.lng) * eased
        };
        marker.setLngLat([current.lng, current.lat]);
        if (progress < 1) entry.markerAnimations[role] = global.requestAnimationFrame(step);
        else {
          entry.markerAnimations[role] = null;
          entry.renderedPoints[role] = target;
          if (this.locations[role]) this.locations[role].renderedPoint = target;
        }
      };
      entry.markerAnimations[role] = global.requestAnimationFrame(step);
    }

    fitEntry(entry, points) {
      const clean = (points || []).filter(Boolean);
      if (!entry?.map || !clean.length || !global.WowMapbox) return;
      global.WowMapbox.fitMap(entry.map, clean, 64);
      entry.fitted = true;
    }

    removeMarkers() {
      this.mapEntries.forEach((entry) => this.clearEntry(entry, true));
    }

    async maybeUpdateRoute(origin) {
      const destination = finitePoint(this.options.getDestination?.(this.ride));
      if (!destination || !global.WowMapbox || !this.mapList().length) return;
      const now = Date.now();
      const destinationKey = pointKey(destination);
      const originKey = pointKey(origin);
      const destinationChanged = destinationKey !== this.lastRouteDestinationKey;
      const movedEnough = distanceMeters(this.lastRoutePoint, origin) >= ROUTE_MOVE_METERS;
      if (!destinationChanged && this.lastRoute?.coordinates?.length
        && (!movedEnough || now - this.lastRouteAt < ROUTE_INTERVAL_MS)) {
        this.drawStoredRoute();
        return;
      }
      if (!destinationChanged && now - this.lastRouteAt < ROUTE_INTERVAL_MS && !movedEnough) return;
      this.lastRouteAt = now;
      this.lastRoutePoint = origin;
      this.lastRouteDestinationKey = destinationKey;
      this.lastRouteOriginKey = originKey;
      try {
        const route = await global.WowMapbox.directions(origin, destination);
        if (this.stopped || !TRACKABLE.has(String(this.ride?.status || ""))) return;
        this.lastRoute = route;
        this.drawStoredRoute();
        console.info("[WOW Tracking] route updated", {
          rideId: this.rideId,
          role: this.role,
          status: this.ride?.status || "",
          distanceKm: route.distanceMeters / 1000,
          etaMinutes: Math.max(1, Math.ceil(route.durationSeconds / 60))
        });
        this.options.onRoute?.({ distanceKm: route.distanceMeters / 1000, etaMinutes: Math.max(1, Math.ceil(route.durationSeconds / 60)) });
      } catch (error) {
        this.setStatus("Route is being recalculated.");
        this.lastRouteAt = Math.min(this.lastRouteAt, Date.now() - ROUTE_INTERVAL_MS + 3000);
        this.options.onRouteError?.(error);
      }
    }

    drawStoredRoute() {
      if (!this.lastRoute?.coordinates?.length || !global.WowMapbox) return;
      this.mapList().forEach((entry) => {
        global.WowMapbox.drawRoute(entry.map, entry.routeLayerId, this.lastRoute.coordinates, "#6c2bd9", 6);
      });
    }

    recenter(key = "") {
      const points = Object.values(this.locations).map((row) => row?.point).filter(Boolean);
      const entries = key ? [this.mapEntries.get(String(key))].filter(Boolean) : this.mapList();
      entries.forEach((entry) => {
        entry.follow = true;
        this.fitEntry(entry, points.length ? points : [this.locations.driver?.point, this.locations.passenger?.point].filter(Boolean));
      });
      this.options.onFollowChange?.(true, key || "all");
    }

    setFollow(enabled = true, key = "") {
      const entries = key ? [this.mapEntries.get(String(key))].filter(Boolean) : this.mapList();
      entries.forEach((entry) => { entry.follow = Boolean(enabled); });
      if (enabled) this.recenter(key);
      else this.options.onFollowChange?.(false, key || "all");
    }

    updateStaleState() {
      const peer = this.role === "passenger" ? "driver" : "passenger";
      const peerLabel = peer === "driver" ? "Driver" : "Passenger";
      const updated = this.locations[peer]?.updatedMs || 0;
      if (!updated) return this.options.onPeerState?.(`Waiting for ${peerLabel.toLowerCase()} live location.`, true);
      const seconds = Math.max(0, Math.floor((Date.now() - updated) / 1000));
      this.options.onPeerState?.(
        seconds > STALE_MS / 1000
          ? `${peerLabel} location is temporarily unavailable. Last seen ${seconds}s ago.`
          : `${peerLabel} location updated ${seconds}s ago.`,
        seconds > STALE_MS / 1000
      );
    }

    setStatus(message) {
      this.options.onStatus?.(message);
    }

    fail(message) {
      this.setStatus(message);
    }

    stop(terminal = false) {
      if (this.stopped) return;
      this.stopped = true;
      if (terminal) this.removeMarkers();
      this.markLocationInactive();
      Array.from(this.mapEntries.keys()).forEach((key) => this.detachMap(key));
      this.stopWatch();
      if (this.rideUnsub) this.rideUnsub();
      this.rideUnsub = null;
      this.locationUnsubs.splice(0).forEach((unsub) => { try { unsub(); } catch {} });
      if (this.staleTimer) global.clearInterval(this.staleTimer);
      this.staleTimer = null;
      global.removeEventListener("online", this.onlineHandler);
      global.removeEventListener("offline", this.offlineHandler);
      if (terminal) this.setStatus("Live tracking stopped.");
      instances.delete(this.role + ":" + this.rideId);
      console.info("[WOW Tracking] listeners removed", { rideId: this.rideId, role: this.role, terminal });
    }

    markLocationInactive() {
      if (!this.db || !this.FieldValue || !this.uid || !this.rideId) return;
      const status = String(this.ride?.status || this.lastRideStatus || "inactive").toLowerCase();
      if (this.lastInactiveStatus === status) return;
      const point = finitePoint(this.locations[this.role]?.point || this.lastWrite);
      if (!point) return;
      this.lastInactiveStatus = status;
      this.db.collection("rides").doc(this.rideId).collection("liveLocations").doc(this.role).set({
        rideId: this.rideId,
        userId: this.uid,
        role: this.role,
        latitude: point.lat,
        longitude: point.lng,
        active: false,
        isActive: false,
        isSharing: false,
        rideStatus: status,
        updatedAt: this.FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => {});
    }

    stopWatch() {
      if (this.watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(this.watchId);
        console.info("[WOW Tracking] location watcher stopped", { rideId: this.rideId, role: this.role });
      }
      this.watchId = null;
    }
  }

  async function start(options) {
    const key = String(options?.role || "") + ":" + String(options?.rideId || "");
    if (instances.has(key)) return instances.get(key);
    const tracker = new Tracker(options || {});
    instances.set(key, tracker);
    try { return await tracker.init(); }
    catch (error) { instances.delete(key); options?.onStatus?.(error?.message || "Live tracking could not start."); throw error; }
  }

  async function transition(rideId, target) {
    const { db, uid, FieldValue } = await global.WowFirestore.ready();
    const ref = db.collection("rides").doc(String(rideId || ""));
    const driverRef = db.collection("drivers").doc(String(uid || ""));
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const driverSnapshot = await transaction.get(driverRef);
      if (!snapshot.exists) throw new Error("Ride not found.");
      const ride = snapshot.data() || {};
      if (String(ride.assignedDriverId || "") !== String(uid || "")) throw new Error("Only the assigned driver can update this ride.");
      const earningRef = target === "completed"
        ? db.collection("driverEarnings").doc(String(uid || "")).collection("rides").doc(ref.id)
        : null;
      const earningSnapshot = earningRef ? await transaction.get(earningRef) : null;
      const driver = driverSnapshot.exists ? (driverSnapshot.data() || {}) : {};
      const currentRideId = String(driver.currentRideId || "").trim();
      const canUpdateDriver = driverSnapshot.exists && (!currentRideId || currentRideId === ref.id);
      const markDriverBusy = () => {
        if (!canUpdateDriver) return;
        transaction.set(driverRef, {
          currentRideId: ref.id,
          isAvailable: false,
          status: "busy",
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      };
      const releaseDriver = () => {
        if (!canUpdateDriver) return;
        const isOnline = driver.isOnline === true;
        transaction.set(driverRef, {
          currentRideId: null,
          isAvailable: isOnline,
          status: isOnline ? "online" : "offline",
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      };
      if (target === "arrived") {
        if (!["driver_assigned", "accepted", "driver_arriving"].includes(String(ride.status || ""))) throw new Error("Ride cannot be marked arrived from its current status.");
        transaction.update(ref, { status: "arrived", arrivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        markDriverBusy();
      } else if (target === "started") {
        if (String(ride.status || "") !== "arrived") throw new Error("Mark the driver arrived before starting the ride.");
        const scheduledSource = ride.scheduledAt || ride.scheduledDateTime || ride.scheduleAt;
        let scheduledMillis = 0;
        if (scheduledSource?.toMillis) scheduledMillis = scheduledSource.toMillis();
        else if (scheduledSource?.seconds) scheduledMillis = Number(scheduledSource.seconds) * 1000;
        else if (scheduledSource) scheduledMillis = new Date(scheduledSource).getTime();
        if (!Number.isFinite(scheduledMillis) || scheduledMillis <= 0) scheduledMillis = 0;
        if (!scheduledMillis && ride.scheduledDate) {
          scheduledMillis = new Date(`${ride.scheduledDate}T${ride.scheduledTime || "23:59"}`).getTime();
        }
        if (scheduledMillis > Date.now()) {
          throw new Error(`This scheduled ride can start at ${new Date(scheduledMillis).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.`);
        }
        transaction.update(ref, { status: "started", requestStatus: "matched", startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        markDriverBusy();
      } else if (target === "completed") {
        if (ride.status !== "started") throw new Error("Only a started ride can be completed.");
        const split = revenueSplit(completedFare(ride));
        transaction.update(ref, {
          status: "completed",
          rideStatus: "completed",
          requestStatus: "completed",
          finalFare: split.finalFare,
          driverEarning: split.driverEarning,
          paymentStatus: String(ride.paymentStatus || "").toLowerCase() === "paid" ? "paid" : "pending",
          paymentAttemptStatus: String(ride.paymentStatus || "").toLowerCase() === "paid" ? "succeeded" : "awaiting_payment",
          paymentUpdatedAt: FieldValue.serverTimestamp(),
          completedAt: FieldValue.serverTimestamp(),
          passenger_location: FieldValue.delete(),
          driver_location: FieldValue.delete(),
          last_updated: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp()
        });
        if (earningRef && earningSnapshot && !earningSnapshot.exists && split.finalFare > 0) {
          transaction.set(earningRef, {
            rideId: ref.id,
            driverId: String(uid || ""),
            fare: split.finalFare,
            earning: split.driverEarning,
            commissionRate: 30,
            status: "earned",
            createdAt: FieldValue.serverTimestamp(),
            completedAt: FieldValue.serverTimestamp()
          });
        }
        releaseDriver();
      }
    });
  }

  global.WowLiveTracking = {
    start,
    arriveRide: (rideId) => transition(rideId, "arrived"),
    startRide: (rideId) => transition(rideId, "started"),
    completeRide: (rideId) => transition(rideId, "completed"),
    stop(role, rideId) { instances.get(String(role) + ":" + String(rideId))?.stop(); },
    recenter(role, rideId, mapKey = "") { instances.get(String(role) + ":" + String(rideId))?.recenter(mapKey); },
    follow(role, rideId, enabled = true, mapKey = "") { instances.get(String(role) + ":" + String(rideId))?.setFollow(enabled, mapKey); }
  };
})(window);
