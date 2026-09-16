(function () {
  "use strict";

  function normalize(value) {
    const text = String(value ?? "").trim().toLowerCase();
    if (!text) return "";
    if (text.includes("scooty") || text.includes("scooter")) return "scooty";
    if (text.includes("bike") || text.includes("motorbike") || text.includes("motorcycle")) return "bike";
    if (text.includes("car") || text.includes("auto")) return "car";
    return "";
  }

  function label(value) {
    const type = normalize(value);
    if (type === "car") return "Car";
    if (type === "bike") return "Bike";
    if (type === "scooty") return "Scooty";
    return "Vehicle information unavailable";
  }

  function requestedType(ride) {
    if (!ride || typeof ride !== "object") return "";
    const candidates = [
      ride.requestedVehicleType, ride.vehicleType, ride.vehicle_type,
      ride.selectedVehicle, ride.requestedVehicle, ride.rideType
    ];
    for (const candidate of candidates) {
      const type = normalize(candidate);
      if (type) return type;
    }
    return "";
  }

  function driverVehicle(profile) {
    const row = profile && typeof profile === "object" ? profile : {};
    const nested = row.vehicleInfo && typeof row.vehicleInfo === "object" ? row.vehicleInfo : {};
    const vehicleObject = row.vehicle && typeof row.vehicle === "object" ? row.vehicle : {};
    const details = row.vehicleDetails && typeof row.vehicleDetails === "object" ? row.vehicleDetails : {};
    const candidates = [
      row.driverVehicleType, row.vehicleType, row.vehicle_type, nested.type,
      vehicleObject.type, vehicleObject.vehicleType, details.type, details.vehicleType,
      row.vehicleCategory, row.vehicleClass, typeof row.vehicle === "string" ? row.vehicle : ""
    ];
    let type = "";
    for (const candidate of candidates) {
      type = normalize(candidate);
      if (type) break;
    }
    return {
      type,
      name: String(row.driverVehicleName || row.vehicleName || row.vehicleModel || row.carModel || nested.model || vehicleObject.model || details.model || "").trim(),
      number: String(row.driverVehicleNumber || row.vehicleNumber || row.vehicleNo || row.plateNumber || row.registrationNumber || nested.number || vehicleObject.number || details.number || "").trim()
    };
  }

  window.WowVehicle = Object.freeze({ normalize, label, requestedType, driverVehicle });
})();
