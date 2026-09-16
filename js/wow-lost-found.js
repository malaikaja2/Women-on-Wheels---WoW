(function (global) {
  "use strict";

  const CASES = "lost_found_cases";
  const FieldValue = () => firebase.firestore.FieldValue;
  const completed = (value) => ["completed", "ride_completed"].includes(String(value || "").toLowerCase());
  const clean = (value, max = 600) => String(value || "").trim().slice(0, max);
  const caseNumber = () => {
    const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `WOW-LF-${day}-${suffix}`;
  };

  async function ready() {
    if (!global.WowFirestore) throw new Error("Firebase is unavailable.");
    const context = await global.WowFirestore.ready();
    if (!context.auth.currentUser) throw new Error("Please sign in.");
    return context;
  }

  function sorted(snapshot) {
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
  }

  function watchPassenger(uid, callback, error) {
    return firebase.firestore().collection(CASES).where("passengerId", "==", uid)
      .limit(30)
      .onSnapshot((snapshot) => callback(sorted(snapshot)), error);
  }

  function watchDriver(uid, callback, error) {
    return firebase.firestore().collection(CASES).where("driverId", "==", uid)
      .limit(30)
      .onSnapshot((snapshot) => callback(sorted(snapshot)), error);
  }

  function watchCase(id, callback, error) {
    return firebase.firestore().collection(CASES).doc(id)
      .onSnapshot((doc) => callback(doc.exists ? { id: doc.id, ...doc.data() } : null), error);
  }

  function watchTimeline(id, callback, error) {
    return firebase.firestore().collection(CASES).doc(id).collection("timeline")
      .orderBy("createdAt", "asc")
      .limit(100)
      .onSnapshot((snapshot) => callback(sorted(snapshot).reverse()), error);
  }

  async function notify(id, data) {
    const { db } = await ready();
    await db.collection("notifications").doc(id).set({
      notificationId: id,
      type: "lost_found",
      read: false,
      createdAt: FieldValue().serverTimestamp(),
      ...data
    }, { merge: true });
  }

  async function createCase(rideId, input, reporterRole) {
    const { db, uid } = await ready();
    const rideRef = db.collection("rides").doc(String(rideId));
    const caseRef = db.collection(CASES).doc();
    const timelineRef = caseRef.collection("timeline").doc();
    const readableId = caseNumber();
    let created;

    await db.runTransaction(async (tx) => {
      const rideSnap = await tx.get(rideRef);
      if (!rideSnap.exists) throw new Error("Completed ride not found.");
      const ride = rideSnap.data() || {};
      if (!completed(ride.status)) throw new Error("Lost & Found is available only for completed rides.");
      const passengerId = clean(ride.passengerId || ride.passengerUid, 160);
      const driverId = clean(ride.assignedDriverId || ride.driverId || ride.driverUid, 160);
      const expected = reporterRole === "driver" ? driverId : passengerId;
      if (!expected || expected !== uid) throw new Error("You are not authorized for this completed ride.");
      if (!clean(input.itemName, 80) || !clean(input.category || input.itemCategory, 80) || !clean(input.description || input.itemDescription)) {
        throw new Error("Item name, category and description are required.");
      }

      created = {
        caseId: readableId,
        rideId: String(rideId),
        completedRideId: String(rideId),
        passengerId,
        driverId,
        vehicleId: clean(ride.vehicleId || ride.assignedVehicleId || ride.vehicle_id, 160),
        passengerName: clean(ride.passengerName || "Passenger", 100),
        driverName: clean(ride.driverName || "Driver", 100),
        rideDate: ride.completedAt || ride.completed_at || ride.updatedAt || ride.createdAt,
        ridePickup: clean(ride.pickupAddress || ride.pickupName || ride.pickup, 240),
        rideDropoff: clean(ride.destinationAddress || ride.dropoffAddress || ride.dropoff, 240),
        itemName: clean(input.itemName, 80),
        category: clean(input.category || input.itemCategory, 80),
        description: clean(input.description || input.itemDescription),
        color: clean(input.color || input.itemColor, 50),
        imageUrl: clean(input.imageUrl, 350000),
        lastSeenLocation: clean(input.lastSeenLocation || input.possibleLostLocation, 180),
        passengerNotes: reporterRole === "passenger" ? clean(input.additionalNotes || input.passengerNotes) : "",
        driverNotes: reporterRole === "driver" ? clean(input.additionalNotes || input.driverNotes) : "",
        driverResponse: reporterRole === "driver" ? "I Found the Item" : "",
        status: reporterRole === "driver" ? "Item Found" : "Reported",
        reporterRole,
        returnLocation: "",
        returnTime: "",
        createdAt: FieldValue().serverTimestamp(),
        updatedAt: FieldValue().serverTimestamp()
      };
      tx.set(caseRef, created);
      tx.set(timelineRef, {
        eventType: reporterRole === "driver" ? "driver_reported_found_item" : "passenger_reported_lost_item",
        performedBy: uid,
        performedByRole: reporterRole,
        description: reporterRole === "driver" ? "Driver reported an item found after a completed ride." : "Passenger reported a lost item.",
        createdAt: FieldValue().serverTimestamp()
      });
    });

    const shared = { rideId: String(rideId), caseId: caseRef.id, readableCaseId: readableId };
    if (reporterRole === "passenger") {
      await Promise.all([
        notify(`${caseRef.id}_driver_reported`, {
          ...shared, passengerUid: created.passengerId, driverUid: created.driverId, receiverUid: created.driverId,
          title: "Lost item reported", message: "A passenger reported a lost item from your completed ride."
        }),
        notify(`${caseRef.id}_admin_reported`, {
          ...shared, passengerUid: created.passengerId, driverUid: created.driverId, receiverUid: "admin", receiverRole: "admin",
          title: "New Lost & Found case", message: `${readableId}: ${created.itemName}`
        })
      ]);
    } else {
      await Promise.all([
        notify(`${caseRef.id}_passenger_found`, {
          ...shared, passengerUid: created.passengerId, driverUid: created.driverId, receiverUid: created.passengerId,
          title: "Item found after your ride", message: `Your driver reported finding ${created.itemName}.`
        }),
        notify(`${caseRef.id}_admin_found`, {
          ...shared, passengerUid: created.passengerId, driverUid: created.driverId, receiverUid: "admin", receiverRole: "admin",
          title: "Driver reported a found item", message: `${readableId}: ${created.itemName}`
        })
      ]);
    }
    return caseRef.id;
  }

  const report = (rideId, input) => createCase(rideId, input, "passenger");
  const reportFound = (rideId, input) => createCase(rideId, input, "driver");

  async function driverRespond(id, response, details = {}) {
    const { db, uid } = await ready();
    const ref = db.collection(CASES).doc(id);
    const event = ref.collection("timeline").doc();
    let updated;
    const choices = {
      item_found: ["I Found the Item", "Item Found"],
      item_not_found: ["I Did Not Find the Item", "Item Not Found"],
      check_later: ["I Will Check Later", "Driver Responded"]
    };
    if (!choices[response]) throw new Error("Choose a valid response.");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().driverId !== uid) throw new Error("This case is not assigned to you.");
      const [driverResponse, status] = choices[response];
      updated = { ...snap.data(), driverResponse, status };
      tx.update(ref, {
        driverResponse,
        driverNotes: clean(details.notes),
        driverImageUrl: clean(details.imageUrl, 350000),
        status,
        returnLocation: response === "item_found" ? clean(details.returnLocation, 180) : "",
        returnTime: response === "item_found" ? clean(details.returnTime, 100) : "",
        driverRespondedAt: FieldValue().serverTimestamp(),
        updatedAt: FieldValue().serverTimestamp()
      });
      tx.set(event, {
        eventType: "driver_responded", performedBy: uid, performedByRole: "driver",
        description: driverResponse, createdAt: FieldValue().serverTimestamp()
      });
    });
    await notify(`${id}_driver_${response}`, {
      rideId: updated.rideId, caseId: id, readableCaseId: updated.caseId,
      passengerUid: updated.passengerId, driverUid: uid, receiverUid: updated.passengerId,
      title: "Lost & Found case updated", message: choices[response][0]
    });
  }

  async function scheduleReturn(id, details = {}) {
    const { db, uid } = await ready();
    const date = clean(details.date, 20);
    const time = clean(details.time, 20);
    const location = clean(details.location, 180);
    if (!date || !time || !location) throw new Error("Meeting date, time and location are required.");
    const meetingDate = new Date(`${date}T${time}`);
    if (Number.isNaN(meetingDate.getTime()) || meetingDate.getTime() <= Date.now()) throw new Error("Choose a future return meeting time.");
    const ref = db.collection(CASES).doc(id);
    let current;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists || String(snap.data().driverId || "") !== uid) throw new Error("This case is not assigned to you.");
      current = snap.data() || {};
      const currentStatus = String(current.status || "").toLowerCase().replaceAll(" ", "_");
      if (!["item_found", "found", "driver_responded"].includes(currentStatus)) throw new Error("A return can be scheduled only after the item is found.");
      tx.update(ref, {
        status: "Return Arranged",
        returnLocation: location,
        returnTime: `${date} ${time}`,
        returnDate: date,
        returnMeeting: {
          date, time, location,
          passengerConfirmed: false,
          driverConfirmed: false,
          status: "awaiting_passenger_confirmation",
          proposedBy: "driver",
          proposedAt: FieldValue().serverTimestamp()
        },
        updatedAt: FieldValue().serverTimestamp()
      });
      tx.set(ref.collection("timeline").doc(), {
        eventType: "return_arranged", performedBy: uid, performedByRole: "driver",
        description: "Driver proposed a return meeting.", createdAt: FieldValue().serverTimestamp()
      });
    });
    await notify(`${id}_return_arranged`, {
      rideId: current.rideId, caseId: id, readableCaseId: current.caseId,
      passengerUid: current.passengerId, driverUid: uid, receiverUid: current.passengerId,
      receiverRole: "passenger", title: "Return meeting proposed",
      message: "Your driver proposed a return meeting. Open the Lost & Found case to confirm it."
    });
  }

  async function confirmReturnMeeting(id) {
    const { db, uid } = await ready();
    const ref = db.collection(CASES).doc(id);
    let data;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists || String(snap.data().driverId || "") !== uid) throw new Error("This case is not assigned to you.");
      data = snap.data() || {};
      const meeting = data.returnMeeting || {};
      if (!meeting.date || !meeting.time || !meeting.location) throw new Error("A complete return meeting must be scheduled first.");
      tx.update(ref, {
        "returnMeeting.driverConfirmed": true,
        "returnMeeting.driverConfirmedAt": FieldValue().serverTimestamp(),
        "returnMeeting.status": meeting.passengerConfirmed ? "confirmed" : "awaiting_passenger_confirmation",
        updatedAt: FieldValue().serverTimestamp()
      });
      tx.set(ref.collection("timeline").doc(), {
        eventType: "return_meeting_driver_confirmed", performedBy: uid, performedByRole: "driver",
        description: "Driver confirmed the return meeting.", createdAt: FieldValue().serverTimestamp()
      });
    });
    await notify(`${id}_driver_meeting_confirmed`, {
      rideId: data.rideId, caseId: id, readableCaseId: data.caseId,
      passengerUid: data.passengerId, driverUid: uid, receiverUid: data.passengerId,
      receiverRole: "passenger", title: "Driver confirmed return meeting",
      message: "Your driver confirmed the Lost & Found return meeting."
    });
  }

  async function updateStatus(id, status, role) {
    const { db, uid } = await ready();
    const ref = db.collection(CASES).doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Case not found.");
    const data = snap.data() || {};
    if (role === "passenger" && data.passengerId !== uid) throw new Error("Not authorized.");
    if (role === "driver" && data.driverId !== uid) throw new Error("Not authorized.");
    await ref.update({
      status,
      updatedAt: FieldValue().serverTimestamp(),
      ...(["Returned", "Closed"].includes(status) ? { returnedAt: FieldValue().serverTimestamp() } : {}),
      ...(status === "Closed" ? { closedAt: FieldValue().serverTimestamp() } : {})
    });
    await ref.collection("timeline").add({ eventType: status.toLowerCase().replaceAll(" ", "_"), performedBy: uid, performedByRole: role, description: `Case status changed to ${status}.`, createdAt: FieldValue().serverTimestamp() });
    if (role === "passenger" && ["Return Scheduled", "Closed"].includes(status)) {
      const scheduled = status === "Return Scheduled";
      notify(`${id}_passenger_${scheduled ? "return_scheduled" : "item_received"}`, {
        rideId: data.rideId,
        caseId: id,
        readableCaseId: data.caseId,
        passengerUid: data.passengerId,
        driverUid: data.driverId,
        receiverUid: data.driverId,
        receiverRole: "driver",
        title: scheduled ? "Return scheduled" : "Lost & Found case closed",
        message: scheduled
          ? "The passenger accepted the return. Check the case for the return location and time."
          : "The passenger confirmed the item was received. The case is now closed."
      }).catch(error => console.warn("[WOW Lost & Found] driver notification skipped", error?.code || error?.message));
    }
  }

  async function passengerAction(id, action) {
    if (action === "accept_return") {
      const { db, uid } = await ready();
      const ref = db.collection(CASES).doc(id);
      let data;
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists || String(snap.data().passengerId || "") !== uid) throw new Error("Not authorized.");
        data = snap.data() || {};
        const meeting = data.returnMeeting || {};
        if (!meeting.location || !meeting.date || !meeting.time) throw new Error("The driver has not proposed a complete return meeting.");
        tx.update(ref, {
          status: "Return Scheduled",
          "returnMeeting.passengerConfirmed": true,
          "returnMeeting.status": "confirmed",
          "returnMeeting.passengerConfirmedAt": FieldValue().serverTimestamp(),
          updatedAt: FieldValue().serverTimestamp()
        });
        tx.set(ref.collection("timeline").doc(), {
          eventType: "return_scheduled", performedBy: uid, performedByRole: "passenger",
          description: "Passenger confirmed the return meeting.", createdAt: FieldValue().serverTimestamp()
        });
      });
      await notify(`${id}_passenger_return_scheduled`, {
        rideId: data.rideId, caseId: id, readableCaseId: data.caseId,
        passengerUid: data.passengerId, driverUid: data.driverId, receiverUid: data.driverId,
        receiverRole: "driver", title: "Return meeting confirmed",
        message: "The passenger confirmed the Lost & Found return meeting."
      });
      return;
    }
    if (action === "item_received") return updateStatus(id, "Closed", "passenger");
    if (action === "close") return updateStatus(id, "Closed", "passenger");
    throw new Error("This action is not available.");
  }

  async function markReturned(id) {
    const { db, uid } = await ready();
    const ref = db.collection(CASES).doc(id);
    const snap = await ref.get();
    if (!snap.exists || String(snap.data().driverId || "") !== uid) throw new Error("Not authorized.");
    const data = snap.data() || {};
    const meeting = data.returnMeeting || {};
    if (meeting.driverConfirmed === false || meeting.passengerConfirmed !== true) throw new Error("Both passenger and driver must confirm the return meeting first.");
    return updateStatus(id, "Returned", "driver");
  }
  async function closeCase(id) {
    const { db, uid } = await ready();
    const snap = await db.collection(CASES).doc(id).get();
    if (!snap.exists || String(snap.data().driverId || "") !== uid) throw new Error("Not authorized.");
    if (String(snap.data().status || "").toLowerCase() !== "returned") throw new Error("Only a returned-item case can be closed.");
    return updateStatus(id, "Closed", "driver");
  }
  const evaluateDeadline = async () => {};

  global.WowLostFound = {
    collection: CASES, report, reportFound, watchPassenger, watchDriver,
    watchCase, watchTimeline, driverRespond, scheduleReturn, confirmReturnMeeting,
    passengerAction, markReturned, closeCase,
    updateStatus, evaluateDeadline
  };
})(window);
