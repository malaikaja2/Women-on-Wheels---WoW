(async function () {
  'use strict';
  const el = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const stamp = value => value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  const when = value => { const date = stamp(value); return date ? date.toLocaleString('en-PK') : 'Instant ride'; };
  const money = value => `Rs. ${Number(value || 0).toLocaleString('en-PK')}`;
  let rows = [];
  let db;

  function filtered() {
    const text = String(el('cpSearch').value || '').toLowerCase();
    const status = el('cpStatus').value;
    return rows.filter(ride => {
      const haystack = [ride.rideCode, ride.pickupAddress, ride.dropoffAddress, ride.driverName, ...(ride.passengers || []).map(p => p.name)].join(' ').toLowerCase();
      return (!text || haystack.includes(text)) && (status === 'all' || String(ride.status || '').toLowerCase().includes(status));
    });
  }

  function render() {
    const list = filtered();
    const active = rows.filter(ride => ['available', 'full', 'accepted', 'arrived', 'started', 'ongoing'].includes(String(ride.status || '')));
    const complete = rows.filter(ride => ['completed', 'ride_completed'].includes(String(ride.status || '')));
    el('cpActive').textContent = active.length;
    el('cpCompleted').textContent = complete.length;
    el('cpPassengers').textContent = rows.reduce((sum, ride) => sum + (ride.passengers || []).length, 0);
    el('cpRevenue').textContent = money(complete.reduce((sum, ride) => sum + Number(ride.finalFare || ride.sharedFare || ride.fare || 0), 0));
    el('cpCount').textContent = `${list.length} carpool rides`;
    el('cpBody').innerHTML = list.length ? list.map(ride => `<tr><td><strong>${esc(ride.rideCode || ride.id)}</strong><small>${esc(when(ride.createdAt))}</small></td><td>${esc((ride.passengers || []).map(p => p.name || 'Passenger').join(', ') || ride.passengerName || 'Passenger')}</td><td>${esc(ride.driverName || 'Waiting for driver')}</td><td>${esc(ride.pickupAddress || ride.pickup || '')}<br>→ ${esc(ride.dropoffAddress || ride.dropoff || '')}</td><td>${(ride.passengers || []).length}/${Number(ride.totalSeats || 0)}<small>${Number(ride.availableSeats || 0)} left</small></td><td>${money(ride.sharedFare || ride.estimatedFare || ride.fare)}<small>${money(ride.savings)} saved</small></td><td><span class="cp-badge">${esc(String(ride.status || 'available').replaceAll('_', ' '))}</span></td><td><button class="cp-view" data-view="${esc(ride.id)}">View</button> <button class="danger" data-cancel="${esc(ride.id)}">Cancel</button></td></tr>`).join('') : '<tr><td colspan="8" class="cp-empty">No carpool rides match the selected filters.</td></tr>';
  }

  async function load() {
    try {
      let snapshot;
      const query = db.collection('rides').where('rideType', '==', 'carpool');
      try {
        snapshot = await query.orderBy('createdAt', 'desc').limit(100).get();
      } catch {
        snapshot = await query.limit(100).get();
      }
      rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      render();
    } catch (error) {
      el('cpBody').innerHTML = `<tr><td colspan="8" class="cp-empty">${esc(error.message || 'Unable to load carpools.')}</td></tr>`;
    }
  }

  async function cancel(id) {
    if (!confirm('Cancel this carpool ride?')) return;
    await db.runTransaction(async tx => {
      const ref = db.collection('rides').doc(id); const snapshot = await tx.get(ref);
      if (!snapshot.exists || snapshot.data().rideType !== 'carpool') throw new Error('Carpool no longer exists.');
      tx.update(ref, { status: 'cancelled', requestStatus: 'closed', cancelledAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
    await load();
  }

  function open(id) {
    const ride = rows.find(item => item.id === id); if (!ride) return;
    el('cpModalId').textContent = ride.rideCode || id;
    el('cpModalStatus').textContent = String(ride.status || 'available').replaceAll('_', ' ');
    el('cpModalType').textContent = 'Carpool'; el('cpModalCreated').textContent = `Created: ${when(ride.createdAt)}`;
    el('cpRoute').innerHTML = `<article><span>Pickup</span><strong>${esc(ride.pickupAddress || ride.pickup || '')}</strong></article><article><span>Destination</span><strong>${esc(ride.dropoffAddress || ride.dropoff || '')}</strong></article>`;
    el('cpModalPassengers').innerHTML = (ride.passengers || []).map(p => `<article><strong>${esc(p.name || 'Passenger')}</strong><small>${esc(p.pickupStatus || 'waiting')}</small></article>`).join('');
    el('cpDriver').innerHTML = `<article><span>Driver</span><strong>${esc(ride.driverName || 'Not assigned')}</strong></article>`;
    el('cpSeats').innerHTML = `<article><span>Seats</span><strong>${(ride.passengers || []).length} occupied · ${Number(ride.availableSeats || 0)} left</strong></article>`;
    el('cpFare').innerHTML = `<article><span>Fare share</span><strong>${money(ride.sharedFare || ride.estimatedFare || ride.fare)}</strong></article>`;
    el('cpBackdrop').hidden = false;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    ['cpSearch', 'cpStatus', 'cpDate', 'cpPayment'].forEach(id => el(id)?.addEventListener('input', render));
    el('cpRefresh').addEventListener('click', load); el('cpClear').addEventListener('click', () => { el('cpSearch').value = ''; render(); });
    el('cpClose').addEventListener('click', () => el('cpBackdrop').hidden = true);
    el('cpBackdrop').addEventListener('click', event => { if (event.target === el('cpBackdrop')) el('cpBackdrop').hidden = true; });
    el('cpBody').addEventListener('click', event => { const button = event.target.closest('button'); if (!button) return; if (button.dataset.view) open(button.dataset.view); if (button.dataset.cancel) cancel(button.dataset.cancel).catch(error => alert(error.message)); });
    db = await window.WowAdminFirebase.getDb();
    load();
  });
})();
