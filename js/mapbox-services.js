const WOW_MAPBOX_ACCESS_TOKEN = String(
  window.WOW_MAPBOX_ACCESS_TOKEN
  || document.querySelector('meta[name="mapbox-token"]')?.content
  || ""
).trim();

(function initWowMapbox(global) {
  const center = { lat: 24.8607, lng: 67.0011 };
  const bounds = {
    west: 66.45,
    south: 24.45,
    east: 67.65,
    north: 25.35
  };
  const pakistanBounds = { west: 60.8, south: 23.4, east: 77.2, north: 37.2 };
  const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
  const SEARCH_CACHE_LIMIT = 60;
  const DIRECTIONS_CACHE_TTL_MS = 2 * 60 * 1000;
  const DIRECTIONS_CACHE_LIMIT = 30;
  const searchCache = new Map();
  const directionsCache = new Map();
  const inFlightRequests = new Map();
  const searchSessions = {};
  const mapByContainer = new WeakMap();

  function ready() {
    return Boolean(global.mapboxgl);
  }

  function configure() {
    if (!ready()) return false;
    if (!WOW_MAPBOX_ACCESS_TOKEN || !WOW_MAPBOX_ACCESS_TOKEN.startsWith("pk.")) {
      console.error("WomenOnWheels Mapbox access token is missing or invalid.");
      return false;
    }
    global.mapboxgl.accessToken = WOW_MAPBOX_ACCESS_TOKEN;
    return true;
  }

  function createMap(container, options = {}) {
    if (!configure() || !container) return null;
    const existing = mapByContainer.get(container);
    if (existing) return existing;
    const map = new global.mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [options.center?.lng ?? center.lng, options.center?.lat ?? center.lat],
      zoom: options.zoom ?? 11,
      minZoom: options.minZoom ?? 7,
      maxZoom: options.maxZoom ?? 22.5,
      bounds: options.bounds ? [[bounds.west, bounds.south], [bounds.east, bounds.north]] : undefined,
      fitBoundsOptions: options.bounds ? { padding: 24 } : undefined,
      attributionControl: false,
      scrollZoom: true,
      doubleClickZoom: true,
      touchZoomRotate: true,
      cooperativeGestures: false
    });
    map.addControl(new global.mapboxgl.NavigationControl(), "top-right");
    const applyDetail = () => improveLocationDetail(map);
    map.on("style.load", applyDetail);
    if (typeof map.isStyleLoaded === "function" && map.isStyleLoaded()) applyDetail();
    mapByContainer.set(container, map);
    return map;
  }

  function improveLocationDetail(map) {
    if (!map || typeof map.getStyle !== "function") return;
    const layers = map.getStyle()?.layers || [];
    layers.forEach((layer) => {
      const id = String(layer.id || "").toLowerCase();
      if (layer.type === "fill-extrusion" && /building/.test(id)) {
        try { map.setLayoutProperty(layer.id, "visibility", "visible"); } catch {}
        return;
      }
      if (layer.type !== "symbol") return;
      const isLocationLabel = /poi|transit|neighborhood|settlement|place-label|airport/.test(id);
      if (!isLocationLabel) return;
      try {
        map.setLayoutProperty(layer.id, "visibility", "visible");
        const currentMinZoom = Number(layer.minzoom);
        if (/poi|transit|neighborhood|locality/.test(id) && (!Number.isFinite(currentMinZoom) || currentMinZoom > 10)) {
          map.setLayerZoomRange(layer.id, 10, Number.isFinite(Number(layer.maxzoom)) ? Math.max(22.5, Number(layer.maxzoom)) : 24);
        }
        if (/poi|transit/.test(id)) {
          map.setLayoutProperty(layer.id, "text-padding", 1);
          map.setLayoutProperty(layer.id, "icon-padding", 1);
        }
      } catch (error) {
        console.debug("[WOW Map] Could not enhance label layer", layer.id, error?.message || error);
      }
    });
    map.resize();
  }

  function pointFromText(text, fallback = center) {
    const value = String(text || "");
    const hash = value.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    return {
      lat: fallback.lat + (((hash % 17) - 8) * 0.0042),
      lng: fallback.lng + ((((hash >> 2) % 17) - 8) * 0.0042)
    };
  }

  function normalizePoint(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === "string") return null;
    if (Array.isArray(value) && value.length >= 2) {
      const lng = Number(value[0]);
      const lat = Number(value[1]);
      return Number.isFinite(lat) && Number.isFinite(lng) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90 ? { lat, lng } : fallback;
    }
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90 ? { lat, lng } : fallback;
  }

  function featureToPlace(feature) {
    if (!feature || !Array.isArray(feature.center)) return null;
    const contextParts = Array.isArray(feature.context)
      ? feature.context.map((row) => row && row.text).filter(Boolean)
      : [];
    const title = String(feature.text || feature.place_name || "Location").trim();
    const streetAddress = [feature.address, title].filter(Boolean).join(" ").trim();
    const labelParts = [streetAddress || title, ...contextParts].filter(Boolean);
    const label = String(feature.place_name || labelParts.join(", ") || title).trim();
    return {
      label,
      address: label,
      title,
      subtitle: contextParts.slice(0, 4).join(", "),
      type: Array.isArray(feature.place_type) ? feature.place_type[0] || "" : "",
      mapboxId: feature.id || "",
      lat: Number(feature.center[1]),
      lng: Number(feature.center[0])
    };
  }

  function createSessionToken() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return "wow-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  function getSearchSessionToken(sessionKey = "default") {
    const key = String(sessionKey || "default");
    if (!searchSessions[key]) {
      searchSessions[key] = createSessionToken();
    }
    return searchSessions[key];
  }

  function clearSearchSession(sessionKey = "default") {
    delete searchSessions[String(sessionKey || "default")];
  }

  function cacheKey(prefix, query, limit, proximity = center) {
    return [
      prefix,
      String(query || "").trim().toLowerCase(),
      String(limit || 5),
      bounds.west,
      bounds.south,
      bounds.east,
      bounds.north,
      Number(proximity.lng).toFixed(3),
      Number(proximity.lat).toFixed(3)
    ].join("|");
  }

  function getCachedSearch(key) {
    const hit = searchCache.get(key);
    if (!hit || Date.now() - hit.createdAt > SEARCH_CACHE_TTL_MS) {
      searchCache.delete(key);
      return null;
    }
    searchCache.delete(key);
    searchCache.set(key, hit);
    return hit.value.map((place) => ({ ...place }));
  }

  function setCachedSearch(key, value) {
    searchCache.set(key, { createdAt: Date.now(), value: (value || []).map((place) => ({ ...place })) });
    while (searchCache.size > SEARCH_CACHE_LIMIT) {
      const oldest = searchCache.keys().next().value;
      searchCache.delete(oldest);
    }
  }

  async function fetchJson(url, label) {
    if (inFlightRequests.has(url)) {
      console.info("[WOW Perf] Reusing in-flight request:", label);
      return inFlightRequests.get(url);
    }
    const startedAt = performance.now();
    const request = fetch(url).then(async (res) => {
      if (!res.ok) {
        const responseText = await res.text().catch(() => "");
        console.error("WomenOnWheels Mapbox request failed:", {
          operation: label,
          status: res.status,
          statusText: res.statusText,
          response: responseText.slice(0, 500)
        });
        const error = new Error(res.status === 401 || res.status === 403
          ? "Mapbox access token is invalid or unauthorized."
          : label + " failed (HTTP " + res.status + ")");
        error.status = res.status;
        throw error;
      }
      return res.json();
    }).finally(() => {
      inFlightRequests.delete(url);
      console.info("[WOW Perf] Mapbox", label, "timeMs:", elapsed(startedAt));
    });
    inFlightRequests.set(url, request);
    return request;
  }

  function directionKey(start, end) {
    return [
      Number(start.lng).toFixed(5),
      Number(start.lat).toFixed(5),
      Number(end.lng).toFixed(5),
      Number(end.lat).toFixed(5)
    ].join("|");
  }

  function getCachedDirection(key) {
    const hit = directionsCache.get(key);
    if (!hit || Date.now() - hit.createdAt > DIRECTIONS_CACHE_TTL_MS) {
      directionsCache.delete(key);
      return null;
    }
    directionsCache.delete(key);
    directionsCache.set(key, hit);
    return {
      coordinates: hit.value.coordinates.map((row) => row.slice()),
      path: hit.value.path.map((point) => ({ ...point })),
      distanceMeters: hit.value.distanceMeters,
      durationSeconds: hit.value.durationSeconds
    };
  }

  function setCachedDirection(key, value) {
    directionsCache.set(key, {
      createdAt: Date.now(),
      value: {
        coordinates: value.coordinates.map((row) => row.slice()),
        path: value.path.map((point) => ({ ...point })),
        distanceMeters: value.distanceMeters,
        durationSeconds: value.durationSeconds
      }
    });
    while (directionsCache.size > DIRECTIONS_CACHE_LIMIT) {
      const oldest = directionsCache.keys().next().value;
      directionsCache.delete(oldest);
    }
  }

  function searchBoxSuggestionToPlace(item) {
    if (!item) return null;
    const coords = item.coordinates || {};
    const context = item.context || {};
    const lng = Number(coords.longitude ?? coords.lng);
    const lat = Number(coords.latitude ?? coords.lat);
    const title = item.name || item.text || item.full_address || "Location";
    const subtitle = item.place_formatted || item.full_address || [
      context.neighborhood?.name,
      context.place?.name,
      context.region?.name
    ].filter(Boolean).join(", ");
    return {
      label: item.full_address || [title, subtitle].filter(Boolean).join(", ") || title,
      address: item.full_address || [title, subtitle].filter(Boolean).join(", ") || title,
      title,
      subtitle,
      type: item.feature_type || item.maki || "",
      mapboxId: item.mapbox_id || item.id || "",
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      source: "searchbox"
    };
  }

  function searchBoxFeatureToPlace(feature) {
    if (!feature) return null;
    const coordinates = feature.geometry && Array.isArray(feature.geometry.coordinates) ? feature.geometry.coordinates : null;
    if (!coordinates) return null;
    const props = feature.properties || {};
    const context = props.context || {};
    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const title = props.name || props.full_address || "Location";
    const subtitle = props.place_formatted || [
      context.neighborhood?.name,
      context.place?.name,
      context.region?.name
    ].filter(Boolean).join(", ");
    return {
      label: props.full_address || [title, subtitle].filter(Boolean).join(", ") || title,
      address: props.full_address || [title, subtitle].filter(Boolean).join(", ") || title,
      title,
      subtitle,
      type: props.feature_type || "",
      mapboxId: props.mapbox_id || "",
      lat,
      lng,
      source: "searchbox"
    };
  }

  function isInsideKarachi(point) {
    const p = normalizePoint(point);
    return Boolean(
      p &&
      p.lng >= bounds.west &&
      p.lng <= bounds.east &&
      p.lat >= bounds.south &&
      p.lat <= bounds.north
    );
  }

  function isInsidePakistan(point) {
    const p = normalizePoint(point);
    return Boolean(p && p.lng >= pakistanBounds.west && p.lng <= pakistanBounds.east
      && p.lat >= pakistanBounds.south && p.lat <= pakistanBounds.north);
  }

  async function geocode(query, limit = 5, options = {}) {
    const text = String(query || "").trim();
    if (!text) return [];
    if (!WOW_MAPBOX_ACCESS_TOKEN || !WOW_MAPBOX_ACCESS_TOKEN.startsWith("pk.")) {
      console.error("WomenOnWheels Mapbox geocoding skipped: missing or invalid access token.");
      throw new Error("Mapbox token missing");
    }
    const proximity = normalizePoint(options.proximity, center) || center;
    const key = cacheKey("geocode", text, limit, proximity);
    const cached = getCachedSearch(key);
    if (cached) return cached;
    const types = String(options.types || "poi,address,place,locality,neighborhood,district");
    const url = "https://api.mapbox.com/geocoding/v5/mapbox.places/"
      + encodeURIComponent(text)
      + ".json?country=pk&language=en&autocomplete=true&fuzzyMatch=true"
      + "&types=" + encodeURIComponent(types)
      + "&proximity=" + [proximity.lng, proximity.lat].join(",")
      + "&limit=" + encodeURIComponent(String(limit))
      + "&access_token=" + encodeURIComponent(WOW_MAPBOX_ACCESS_TOKEN);
    const data = await fetchJson(url, "geocoding");
    const places = Array.isArray(data.features) ? data.features.map(featureToPlace).filter(Boolean) : [];
    setCachedSearch(key, places);
    return places.map((place) => ({ ...place }));
  }

  async function searchBoxSuggest(query, options = {}) {
    const text = String(query || "").trim();
    const limit = Math.max(1, Math.min(8, Number(options.limit || 5)));
    if (!text) return [];
    if (!WOW_MAPBOX_ACCESS_TOKEN || !WOW_MAPBOX_ACCESS_TOKEN.startsWith("pk.")) {
      console.error("WomenOnWheels Mapbox Search Box skipped: missing or invalid access token.");
      throw new Error("Mapbox token missing");
    }
    const sessionToken = getSearchSessionToken(options.sessionKey || "default");
    const proximity = normalizePoint(options.proximity, center) || center;
    const key = cacheKey("searchbox-suggest", text, limit, proximity);
    const cached = getCachedSearch(key);
    if (cached) return cached;

    const url = "https://api.mapbox.com/search/searchbox/v1/suggest"
      + "?q=" + encodeURIComponent(text)
      + "&country=pk&language=en"
      + "&proximity=" + [proximity.lng, proximity.lat].join(",")
      + "&limit=" + encodeURIComponent(String(limit))
      + "&session_token=" + encodeURIComponent(sessionToken)
      + "&access_token=" + encodeURIComponent(WOW_MAPBOX_ACCESS_TOKEN);
    const data = await fetchJson(url, "search suggest");
    const places = Array.isArray(data.suggestions)
      ? data.suggestions.map(searchBoxSuggestionToPlace).filter(Boolean)
      : [];
    setCachedSearch(key, places);
    return places.map((place) => ({ ...place }));
  }

  async function searchBoxRetrieve(mapboxId, options = {}) {
    const id = String(mapboxId || "").trim();
    if (!id) return null;
    if (!WOW_MAPBOX_ACCESS_TOKEN || !WOW_MAPBOX_ACCESS_TOKEN.startsWith("pk.")) {
      console.error("WomenOnWheels Mapbox retrieve skipped: missing or invalid access token.");
      throw new Error("Mapbox token missing");
    }
    const sessionToken = getSearchSessionToken(options.sessionKey || "default");
    const url = "https://api.mapbox.com/search/searchbox/v1/retrieve/"
      + encodeURIComponent(id)
      + "?session_token=" + encodeURIComponent(sessionToken)
      + "&access_token=" + encodeURIComponent(WOW_MAPBOX_ACCESS_TOKEN);
    const data = await fetchJson(url, "search retrieve");
    const place = searchBoxFeatureToPlace(data.features && data.features[0]);
    return place;
  }

  async function photonSearch(query, options = {}) {
    const text = String(query || "").trim();
    const limit = Math.max(1, Math.min(10, Number(options.limit || 8)));
    if (text.length < 2) return [];
    const proximity = normalizePoint(options.proximity, center) || center;
    const key = cacheKey("photon", text, limit, proximity);
    const cached = getCachedSearch(key);
    if (cached) return cached;
    const url = "https://photon.komoot.io/api/?q=" + encodeURIComponent(text)
      + "&lat=" + encodeURIComponent(proximity.lat)
      + "&lon=" + encodeURIComponent(proximity.lng)
      + "&limit=" + encodeURIComponent(limit)
      + "&lang=en";
    const data = await fetchJson(url, "POI fallback search");
    const places = (Array.isArray(data.features) ? data.features : []).map((feature) => {
      const props = feature.properties || {};
      const coordinates = feature.geometry && feature.geometry.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
      const title = String(props.name || props.street || props.locality || props.city || "Location");
      const parts = [props.street, props.housenumber, props.district, props.city, props.state, props.country]
        .filter(Boolean).map(String);
      const address = [title, ...parts.filter((part) => part.toLowerCase() !== title.toLowerCase())].join(", ");
      return { title, label: address, address, subtitle: parts.join(", "), type: props.osm_value || props.type || "poi", mapboxId: "", lat: Number(coordinates[1]), lng: Number(coordinates[0]), source: "photon" };
    }).filter((place) => place && isInsidePakistan(place));
    setCachedSearch(key, places);
    return places.map((place) => ({ ...place }));
  }

  async function reverseGeocode(point) {
    const p = normalizePoint(point);
    if (!p) return "";
    if (!WOW_MAPBOX_ACCESS_TOKEN || !WOW_MAPBOX_ACCESS_TOKEN.startsWith("pk.")) {
      console.error("WomenOnWheels reverse geocoding skipped: missing or invalid Mapbox access token.");
      throw new Error("Mapbox token missing");
    }
    const url = "https://api.mapbox.com/geocoding/v5/mapbox.places/"
      + encodeURIComponent(p.lng + "," + p.lat)
      + ".json?country=pk&language=en&types=address,poi,place,locality,neighborhood"
      + "&limit=1&access_token=" + encodeURIComponent(WOW_MAPBOX_ACCESS_TOKEN);
    const data = await fetchJson(url, "reverse geocoding");
    const place = featureToPlace(data.features && data.features[0]);
    return place ? place.label : "";
  }

  async function directions(origin, destination) {
    const start = normalizePoint(origin);
    const end = normalizePoint(destination);
    if (!start || !end) throw routeError("InvalidInput", "Route endpoints are invalid.");
    if (Math.abs(start.lng - end.lng) < 0.000001 && Math.abs(start.lat - end.lat) < 0.000001) {
      throw routeError("InvalidInput", "Pickup and destination cannot be identical.");
    }
    if (!WOW_MAPBOX_ACCESS_TOKEN || !WOW_MAPBOX_ACCESS_TOKEN.startsWith("pk.")) {
      console.error("WomenOnWheels directions skipped: missing or invalid Mapbox access token.");
      throw new Error("Mapbox token missing");
    }
    const key = directionKey(start, end);
    const cached = getCachedDirection(key);
    if (cached) return cached;
    const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`;
    const url = "https://api.mapbox.com/directions/v5/mapbox/driving/"
      + coords
      + "?alternatives=false&geometries=geojson&overview=full&steps=true"
      + "&access_token=" + encodeURIComponent(WOW_MAPBOX_ACCESS_TOKEN);
    console.info("[WOW Mapbox] directions request", {
      pickupLongitude: start.lng,
      pickupLatitude: start.lat,
      destinationLongitude: end.lng,
      destinationLatitude: end.lat,
      url: url.replace(/access_token=[^&]+/, "access_token=[redacted]")
    });
    let response;
    let data = {};
    try {
      response = await fetch(url);
      data = await response.json().catch(() => ({}));
    } catch (error) {
      console.error("[WOW Mapbox] directions network failure", { message: error?.message || String(error) });
      throw routeError("NetworkError", "Unable to connect to the routing service.");
    }
    console.info("[WOW Mapbox] directions response", {
      httpStatus: response.status,
      code: data.code || "",
      message: data.message || "",
      routeCount: Array.isArray(data.routes) ? data.routes.length : 0
    });
    if (!response.ok || data.code !== "Ok") {
      const code = data.code || (response.status === 401 ? "Unauthorized" : response.status === 403 ? "Forbidden" : response.status === 429 ? "TooManyRequests" : "HttpError");
      throw routeError(code, data.message || `Directions request failed (HTTP ${response.status}).`, response.status);
    }
    const route = Array.isArray(data.routes) ? data.routes[0] : null;
    if (!route || !route.geometry || !Array.isArray(route.geometry.coordinates)) {
      throw routeError("MissingGeometry", "The routing service returned no route geometry.");
    }
    const result = {
      coordinates: route.geometry.coordinates,
      path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      distanceMeters: Number(route.distance || 0),
      durationSeconds: Number(route.duration || 0)
    };
    setCachedDirection(key, result);
    return result;
  }

  function routeError(code, message, status = 0) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
  }

  function removeLayerAndSource(map, id) {
    if (!map) return;
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  }

  function drawRoute(map, id, coordinates, color = "#1a73e8", width = 5) {
    if (!map || !Array.isArray(coordinates) || !coordinates.length) return;
    const draw = () => {
      const data = {
        type: "Feature",
        geometry: { type: "LineString", coordinates }
      };
      const source = map.getSource(id);
      if (source && typeof source.setData === "function") source.setData(data);
      else map.addSource(id, { type: "geojson", data });
      if (!map.getLayer(id)) {
        map.addLayer({
          id,
          type: "line",
          source: id,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": color, "line-width": width, "line-opacity": 0.95 }
        });
      }
    };
    if (typeof map.isStyleLoaded === "function" && map.isStyleLoaded()) draw();
    else map.once("style.load", draw);
  }

  function createLabelMarker(map, point, color, label, options = {}) {
    if (!ready() || !map) return null;
    const p = normalizePoint(point, center);
    const el = document.createElement("div");
    el.textContent = label || "";
    el.title = options.title || options.popupText || label || "Map marker";
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.style.width = (options.size || 20) + "px";
    el.style.height = (options.size || 20) + "px";
    el.style.borderRadius = "50%";
    el.style.display = "grid";
    el.style.placeItems = "center";
    el.style.background = color || "#1a73e8";
    el.style.color = "#fff";
    el.style.border = "2px solid #fff";
    el.style.fontSize = "10px";
    el.style.fontWeight = "700";
    el.style.boxShadow = "0 4px 12px rgba(0,0,0,.22)";
    const marker = new global.mapboxgl.Marker({ element: el, draggable: Boolean(options.draggable) })
      .setLngLat([p.lng, p.lat])
      .addTo(map);
    if (options.popupText) {
      marker.setPopup(new global.mapboxgl.Popup({ offset: 18 }).setText(String(options.popupText)));
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          marker.togglePopup();
        }
      });
    }
    return marker;
  }

  function createImageMarker(map, point, iconUrl, size = 28) {
    if (!ready() || !map) return null;
    const p = normalizePoint(point, center);
    const el = document.createElement("img");
    el.src = iconUrl;
    el.alt = "";
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.objectFit = "contain";
    el.style.filter = "drop-shadow(0 4px 10px rgba(0,0,0,.24))";
    return new global.mapboxgl.Marker({ element: el })
      .setLngLat([p.lng, p.lat])
      .addTo(map);
  }

  function setMarkerPoint(marker, point) {
    const p = normalizePoint(point);
    if (marker && p) marker.setLngLat([p.lng, p.lat]);
  }

  function fitMap(map, points, padding = 56) {
    if (!ready() || !map) return;
    const clean = (points || []).map((p) => normalizePoint(p)).filter(Boolean);
    if (!clean.length) return;
    const boundsObj = new global.mapboxgl.LngLatBounds();
    clean.forEach((p) => boundsObj.extend([p.lng, p.lat]));
    if (clean.length === 1) {
      map.easeTo({ center: [clean[0].lng, clean[0].lat], zoom: 13 });
      return;
    }
    map.fitBounds(boundsObj, { padding, maxZoom: 15 });
  }

  function elapsed(startedAt) {
    return Math.round((performance.now() - startedAt) * 10) / 10;
  }

  global.WowMapbox = {
    center,
    bounds,
    pakistanBounds,
    ready,
    createMap,
    pointFromText,
    normalizePoint,
    isInsideKarachi,
    isInsidePakistan,
    geocode,
    searchBoxSuggest,
    searchBoxRetrieve,
    photonSearch,
    clearSearchSession,
    reverseGeocode,
    directions,
    drawRoute,
    clearRoute: removeLayerAndSource,
    createLabelMarker,
    createImageMarker,
    setMarkerPoint,
    fitMap
  };
})(window);
