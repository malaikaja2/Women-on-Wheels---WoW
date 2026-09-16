(function (global) {
    'use strict';

    const FINAL_STATUSES = new Set(['paid', 'completed', 'success', 'successful', 'confirmed', 'cash_collected', 'collected', 'received']);
    const ONLINE_METHODS = new Set(['easypaisa', 'jazzcash', 'nayapay']);
    const COMPLETED_RIDE_STATUSES = new Set(['completed', 'ride_completed']);

    function firebaseHandles() {
        if (!global.firebase || !firebase.auth || !firebase.firestore) {
            throw new Error('Firebase is not available.');
        }
        return { auth: firebase.auth(), db: firebase.firestore() };
    }

    function currentUser() {
        const user = firebaseHandles().auth.currentUser;
        if (!user) throw new Error('Please sign in to continue.');
        return user;
    }

    function normalizeMethod(value) {
        return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
    }

    function fareOf(ride) {
        return global.WowFinancial?.selectedFare(ride).value || 0;
    }

    function participantIds(ride) {
        return {
            passengerId: String(ride.passengerId || ride.userId || '').trim(),
            driverId: String(ride.assignedDriverId || ride.driverId || ride.acceptedDriverId || ride.driverUid || '').trim()
        };
    }

    function validateRide(ride, rideId, user, role, requireCompleted) {
        if (!ride || !rideId) throw new Error('Ride details are unavailable.');
        const ids = participantIds(ride);
        if (!ids.passengerId || !ids.driverId) {
            throw new Error('This ride is not linked to an assigned passenger and driver.');
        }
        if (role === 'passenger' && ids.passengerId !== user.uid) {
            throw new Error('You cannot pay for another passenger’s ride.');
        }
        if (role === 'driver' && ids.driverId !== user.uid) {
            throw new Error('Only the assigned driver can confirm this payment.');
        }
        const status = String(ride.status || '').toLowerCase();
        if (status === 'cancelled' || status === 'canceled') {
            throw new Error('A cancelled ride cannot be paid.');
        }
        if (requireCompleted && !COMPLETED_RIDE_STATUSES.has(status)) {
            throw new Error('Final payment is available after the ride is completed.');
        }
        const amount = fareOf(ride);
        if (!amount) throw new Error('The final ride fare is unavailable.');
        return { ids, amount };
    }

    function baseRecord(rideId, ride, method, status, existing) {
        const ids = participantIds(ride);
        const split = revenueSplit(fareOf(ride));
        return {
            paymentId: rideId,
            rideId,
            passengerId: ids.passengerId,
            driverId: ids.driverId,
            passengerName: String(ride.passengerName || ride.userName || 'Passenger'),
            amount: split.finalFare,
            finalFare: split.finalFare,
            currency: 'PKR',
            paymentMethod: method,
            paymentStatus: status,
            transactionId: existing && existing.transactionId ? existing.transactionId : '',
            paymentProvider: method === 'cash' ? 'cash' : method,
            commissionRate: 30,
            commissionPercent: 30,
            commissionStatus: existing && existing.commissionStatus ? existing.commissionStatus : 'pending',
            commissionCalculatedAt: existing && existing.commissionCalculatedAt
                ? existing.commissionCalculatedAt
                : firebase.firestore.FieldValue.serverTimestamp(),
            ...split,
            createdAt: existing && existing.createdAt
                ? existing.createdAt
                : firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
    }

    function transactionId() {
        const random = Math.floor(100000 + Math.random() * 900000);
        return `WOW-PAY-${new Date().getFullYear()}-${random}`;
    }

    function revenueSplit(amount) {
        const split = global.WowFinancial?.split(amount, 0.30) || { finalFare: 0, wowCommission: 0, driverEarning: 0 };
        return {
            finalFare: split.finalFare,
            platformCommission: split.wowCommission,
            adminCommission: split.wowCommission,
            wowCommission: split.wowCommission,
            driverEarning: split.driverEarning,
            driverShare: split.driverEarning
        };
    }

    function watch(rideId, onValue, onError) {
        const { db } = firebaseHandles();
        if (!rideId) return function () {};
        return db.collection('payments').doc(rideId).onSnapshot(
            (snapshot) => onValue(snapshot.exists ? snapshot.data() : null),
            onError || console.error
        );
    }

    async function selectCash(rideId) {
        const { db } = firebaseHandles();
        const user = currentUser();
        return db.runTransaction(async (tx) => {
            const rideRef = db.collection('rides').doc(rideId);
            const paymentRef = db.collection('payments').doc(rideId);
            const [rideSnap, paymentSnap] = await Promise.all([tx.get(rideRef), tx.get(paymentRef)]);
            if (!rideSnap.exists) throw new Error('Ride not found.');
            const ride = rideSnap.data();
            validateRide(ride, rideId, user, 'passenger', true);
            const existing = paymentSnap.exists ? paymentSnap.data() : null;
            if (existing && FINAL_STATUSES.has(existing.paymentStatus)) {
                throw new Error('This ride has already been paid.');
            }
            const record = baseRecord(rideId, ride, 'cash', 'pending', existing);
            tx.set(paymentRef, record, { merge: true });
            tx.update(rideRef, {
                paymentMethod: 'cash',
                paymentStatus: 'pending',
                paymentUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return record;
        });
    }

    async function beginOnline(rideId, method) {
        const normalized = normalizeMethod(method);
        if (!ONLINE_METHODS.has(normalized)) throw new Error('Choose a valid payment method.');
        const { db } = firebaseHandles();
        const user = currentUser();
        return db.runTransaction(async (tx) => {
            const rideRef = db.collection('rides').doc(rideId);
            const paymentRef = db.collection('payments').doc(rideId);
            const [rideSnap, paymentSnap] = await Promise.all([tx.get(rideRef), tx.get(paymentRef)]);
            if (!rideSnap.exists) throw new Error('Ride not found.');
            const ride = rideSnap.data();
            validateRide(ride, rideId, user, 'passenger', true);
            const existing = paymentSnap.exists ? paymentSnap.data() : null;
            if (existing && FINAL_STATUSES.has(existing.paymentStatus)) {
                throw new Error('This ride has already been paid.');
            }
            if (existing && existing.attemptStatus === 'processing') {
                throw new Error('A payment attempt is already processing.');
            }
            const record = baseRecord(rideId, ride, normalized, 'pending', existing);
            record.transactionId = '';
            record.attemptStatus = 'processing';
            tx.set(paymentRef, record, { merge: true });
            tx.update(rideRef, {
                paymentMethod: normalized,
                paymentStatus: 'pending',
                paymentAttemptStatus: 'processing',
                paymentUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return record;
        });
    }

    async function finishOnline(rideId, shouldFail) {
        const { db } = firebaseHandles();
        const user = currentUser();
        return db.runTransaction(async (tx) => {
            const rideRef = db.collection('rides').doc(rideId);
            const paymentRef = db.collection('payments').doc(rideId);
            const [rideSnap, paymentSnap] = await Promise.all([tx.get(rideRef), tx.get(paymentRef)]);
            if (!rideSnap.exists || !paymentSnap.exists) throw new Error('Payment attempt not found.');
            const ride = rideSnap.data();
            validateRide(ride, rideId, user, 'passenger', true);
            const payment = paymentSnap.data();
            if (FINAL_STATUSES.has(payment.paymentStatus)) throw new Error('This ride has already been paid.');
            if (payment.paymentStatus !== 'pending' || payment.attemptStatus !== 'processing') throw new Error('This payment is not processing.');
            const status = shouldFail ? 'pending' : 'paid';
            const split = revenueSplit(payment.amount);
            const updates = {
                paymentStatus: status,
                attemptStatus: shouldFail ? 'failed' : 'succeeded',
                transactionId: shouldFail ? '' : transactionId(),
                failureReason: shouldFail ? 'Payment was declined.' : '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (!shouldFail) Object.assign(updates, split, {
                commissionRate: 30,
                commissionStatus: 'collected',
                rideStatus: String(ride.status || 'completed'),
                paidAt: firebase.firestore.FieldValue.serverTimestamp(),
                commissionCalculatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            tx.update(paymentRef, updates);
            tx.update(rideRef, {
                paymentMethod: payment.paymentMethod,
                paymentStatus: status,
                paymentAttemptStatus: shouldFail ? 'failed' : 'succeeded',
                paymentTransactionId: updates.transactionId,
                paymentUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return Object.assign({}, payment, updates);
        });
    }

    async function payOnline(rideId, method, paymentPin) {
        // The PIN is inspected in memory and is never persisted or logged.
        const pin = String(paymentPin || '');
        if (!/^\d{4}$/.test(pin)) throw new Error('Enter a valid 4-digit payment PIN.');
        await beginOnline(rideId, method);
        await new Promise((resolve) => global.setTimeout(resolve, 650));
        return finishOnline(rideId, pin === '0000');
    }

    async function cancelAttempt(rideId) {
        const { db } = firebaseHandles();
        const user = currentUser();
        return db.runTransaction(async (tx) => {
            const rideRef = db.collection('rides').doc(rideId);
            const paymentRef = db.collection('payments').doc(rideId);
            const [rideSnap, paymentSnap] = await Promise.all([tx.get(rideRef), tx.get(paymentRef)]);
            if (!rideSnap.exists) throw new Error('Ride not found.');
            validateRide(rideSnap.data(), rideId, user, 'passenger', false);
            if (paymentSnap.exists && FINAL_STATUSES.has(paymentSnap.data().paymentStatus)) {
                throw new Error('A completed payment cannot be cancelled.');
            }
            if (!paymentSnap.exists) return;
            tx.update(paymentRef, {
                paymentStatus: 'pending',
                attemptStatus: 'cancelled',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            tx.update(rideRef, {
                paymentStatus: 'pending',
                paymentAttemptStatus: 'cancelled',
                paymentUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
    }

    async function collectCash(rideId) {
        const { db } = firebaseHandles();
        const user = currentUser();
        return db.runTransaction(async (tx) => {
            const rideRef = db.collection('rides').doc(rideId);
            const paymentRef = db.collection('payments').doc(rideId);
            const [rideSnap, paymentSnap] = await Promise.all([tx.get(rideRef), tx.get(paymentRef)]);
            if (!rideSnap.exists || !paymentSnap.exists) throw new Error('Cash payment record not found.');
            validateRide(rideSnap.data(), rideId, user, 'driver', true);
            const payment = paymentSnap.data();
            if (FINAL_STATUSES.has(payment.paymentStatus)) throw new Error('Cash has already been confirmed.');
            if (payment.paymentMethod !== 'cash' || payment.paymentStatus !== 'pending') {
                throw new Error('This payment is not awaiting cash collection.');
            }
            const split = revenueSplit(payment.amount);
            tx.update(paymentRef, {
                paymentStatus: 'paid',
                attemptStatus: 'succeeded',
                ...split,
                commissionRate: 30,
                commissionStatus: 'pending',
                rideStatus: String(rideSnap.data().status || 'completed'),
                collectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                paidAt: firebase.firestore.FieldValue.serverTimestamp(),
                collectedBy: user.uid,
                commissionCalculatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            tx.update(rideRef, {
                paymentStatus: 'paid',
                paymentAttemptStatus: 'succeeded',
                paymentUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
    }

    async function prepareCompletion(rideId) {
        const { db } = firebaseHandles();
        const user = currentUser();
        return db.runTransaction(async (tx) => {
            const rideRef = db.collection('rides').doc(rideId);
            const paymentRef = db.collection('payments').doc(rideId);
            const [rideSnap, paymentSnap] = await Promise.all([tx.get(rideRef), tx.get(paymentRef)]);
            if (!rideSnap.exists) throw new Error('Ride not found.');
            const ride = rideSnap.data() || {};
            const validated = validateRide(ride, rideId, user, 'driver', true);
            const existing = paymentSnap.exists ? paymentSnap.data() : null;
            if (existing && FINAL_STATUSES.has(existing.paymentStatus)) return existing;
            const method = normalizeMethod(ride.paymentMethod || existing?.paymentMethod || 'cash');
            if (method !== 'cash' && !ONLINE_METHODS.has(method)) throw new Error('A valid payment method is required.');
            const record = baseRecord(rideId, ride, method, 'pending', existing);
            record.amount = validated.amount;
            record.attemptStatus = 'awaiting_payment';
            tx.set(paymentRef, record, { merge: true });
            tx.update(rideRef, {
                paymentMethod: method,
                paymentStatus: 'pending',
                paymentAttemptStatus: 'awaiting_payment',
                paymentUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return record;
        });
    }

    global.WowPayment = {
        normalizeMethod,
        fareOf,
        watch,
        selectCash,
        payOnline,
        cancelAttempt,
        collectCash,
        prepareCompletion,
        isPaid: (payment) => Boolean(payment && FINAL_STATUSES.has(payment.paymentStatus))
        ,revenueSplit
    };
    global.WowDemoPayment = global.WowPayment;
})(window);
