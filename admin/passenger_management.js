(function () {
  "use strict";
  const API = "dashboard_data.php";
  const ACTION_API = "admin_actions.php";
  const state = { page: 1, pageSize: 15, loading: false, rows: [], pagination: {}, details: new Map(), selected: null, timer: null };
  const el = {};

  document.addEventListener("DOMContentLoaded", init, { once: true });
  window.addEventListener("pagehide", () => window.clearTimeout(state.timer), { once: true });

  function init() {
    ["pmTotalPassengers","pmActivePassengers","pmBlockedPassengers","passengerSearch","passengerSearchClear","passengerStatusFilter","passengerRefresh","passengerHeaderExport","passengerToolbarExport","passengerTableBody","pmResultCount","pmPrevPage","pmNextPage","pmPageLabel","passengerDetailBackdrop","pmModalClose","pmModalAvatar","pmModalName","pmModalStatus","pmModalId","pmPersonalGrid","pmAccountGrid","pmRideStats","pmRecentRides","pmCompleteHistory","pmSafetySection","pmSafetyGrid","pmDetailError","pmModalActions"].forEach(id => el[id] = document.getElementById(id));
    el.passengerSearch?.addEventListener("input", () => { el.passengerSearchClear.hidden = !el.passengerSearch.value; debounceLoad(); });
    el.passengerSearchClear?.addEventListener("click", () => { el.passengerSearch.value = ""; el.passengerSearchClear.hidden = true; loadPage(1); el.passengerSearch.focus(); });
    el.passengerStatusFilter?.addEventListener("change", () => loadPage(1));
    el.passengerRefresh?.addEventListener("click", () => { state.details.clear(); loadPage(state.page); });
    document.getElementById("refreshNow")?.addEventListener("click", () => loadPage(state.page));
    [el.passengerHeaderExport, el.passengerToolbarExport].forEach(button => button?.addEventListener("click", exportCsv));
    el.pmPrevPage?.addEventListener("click", () => loadPage(Math.max(1, state.page - 1)));
    el.pmNextPage?.addEventListener("click", () => loadPage(state.page + 1));
    el.passengerTableBody?.addEventListener("click", handleTableClick);
    el.pmModalClose?.addEventListener("click", closeModal);
    el.passengerDetailBackdrop?.addEventListener("click", event => { if (event.target === el.passengerDetailBackdrop) closeModal(); });
    el.pmModalActions?.addEventListener("click", handleModalAction);
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !el.passengerDetailBackdrop?.hidden) closeModal(); });
    document.addEventListener("click", event => { if (!event.target.closest(".pm-actions") && !event.target.closest(".pm-menu")) closeMenus(); });
    window.addEventListener("scroll", closeMenus, true);
    const requestedPassenger = new URLSearchParams(location.search).get("passenger") || "";
    if (requestedPassenger) el.passengerSearch.value = requestedPassenger;
    loadPage(1).then(() => { if (requestedPassenger && state.rows.some(row => String(row.passenger_id || row.uid) === requestedPassenger)) openPassenger(requestedPassenger); });
  }

  function debounceLoad() { window.clearTimeout(state.timer); state.timer = window.setTimeout(() => loadPage(1), 350); }
  function params(extra) {
    const p = new URLSearchParams({ mode: "passengers", page: String(state.page), page_size: String(state.pageSize), q: el.passengerSearch?.value.trim() || "", status: el.passengerStatusFilter?.value || "all" });
    Object.entries(extra || {}).forEach(([key,value]) => p.set(key, String(value)));
    return p;
  }
  async function loadPage(page) {
    if (state.loading) return;
    state.page = page; state.loading = true; setLoading(true);
    try {
      const response = await fetch(API + "?" + params(), { headers: { Accept: "application/json" }, credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error("load_failed");
      state.rows = Array.isArray(data.passengers) ? data.passengers : [];
      state.pagination = data.pagination || {};
      renderSummary(data.summary || {}); renderRows(); renderPagination();
    } catch (_) { renderError("Passenger records could not be loaded. Check your connection and try again."); }
    finally { state.loading = false; setLoading(false); }
  }
  function setLoading(loading) {
    el.passengerRefresh?.toggleAttribute("disabled", loading);
    if (loading) el.passengerTableBody.innerHTML = '<tr class="pm-loading-row"><td colspan="8"><div class="pm-table-skeleton"></div><div class="pm-table-skeleton short"></div></td></tr>';
  }
  function renderSummary(s) {
    setText("pmTotalPassengers", s.total); setText("pmActivePassengers", s.active); setText("pmBlockedPassengers", s.blocked);
    [el.pmTotalPassengers,el.pmActivePassengers,el.pmBlockedPassengers].forEach(node => node?.classList.remove("pm-skeleton-text"));
  }
  function renderRows() {
    if (!state.rows.length) { el.passengerTableBody.innerHTML = '<tr><td colspan="8" class="pm-empty-state"><strong>No passengers found</strong>No passengers match the selected search or status filter.<br><button class="pm-secondary" type="button" data-pm-reset>Clear filters</button></td></tr>'; return; }
    el.passengerTableBody.innerHTML = state.rows.map(rowHtml).join("");
  }
  function rowHtml(p) {
    const id = esc(p.passenger_id || p.uid || ""), status = norm(p.status || "pending"), cnic = p.masked_cnic || "Not provided", rating = validRating(p.rating);
    return '<tr data-passenger-id="'+id+'">'+
      '<td class="pm-col-passenger" data-label="Passenger"><span class="pm-avatar">'+esc(initials(p.name))+'</span><div><strong class="pm-name" title="'+esc(p.name)+'">'+esc(p.name || "Passenger")+'</strong><span class="pm-sub" title="'+esc(p.location_hint)+'">'+esc(p.location_hint || "Location not provided")+'</span></div></td>'+
      '<td class="pm-col-contact" data-label="Contact"><span class="pm-contact-row" title="'+esc(p.email)+'">&#9993;&nbsp; '+esc(p.email || "Not provided")+'</span><span class="pm-contact-row" title="'+esc(p.phone)+'">&#9742;&nbsp; '+esc(p.phone || "Not provided")+'</span></td>'+
      '<td data-label="CNIC"><span class="pm-cnic-value">'+esc(cnic)+'</span></td>'+
      '<td class="pm-col-rides" data-label="Total Rides">'+Number(p.total_rides||0).toLocaleString()+' rides</td>'+
      '<td data-label="Rating"><span class="pm-rating '+(rating!==null?'has-rating':'')+'">'+(rating===null?'Not rated':rating.toFixed(1)+' &#9733;')+'</span></td>'+
      '<td data-label="Status"><span class="pm-status '+esc(status)+'">'+esc(title(status))+'</span></td>'+
      '<td class="pm-last-active" data-label="Last Active" title="'+esc(formatDate(p.last_active))+'">'+esc(relativeTime(p.last_active))+'</td>'+
      '<td class="pm-actions-cell" data-label="Actions"><div class="pm-actions"><button class="pm-view" type="button" data-pm-view="'+id+'">View</button><button class="pm-menu-toggle" type="button" data-pm-menu aria-label="Passenger actions" aria-expanded="false">&#8942;</button><div class="pm-menu" hidden>'+menuHtml(p)+'</div></div></td></tr>';
  }
  function menuHtml(p) {
    const status=norm(p.status), id=esc(p.passenger_id||p.uid||""), parts=[];
    if (status==="blocked") parts.push(actionButton(id,"unblocked","Unblock Passenger")); else parts.push(actionButton(id,"blocked","Block Passenger","danger"));
    parts.push('<a href="rides.php?passenger='+encodeURIComponent(id)+'">View Ride History</a>','<a href="ratings_reviews.php?passenger='+encodeURIComponent(id)+'">View Ratings and Reviews</a>'); return parts.join("");
  }
  function actionButton(id,status,label,klass){return '<button type="button" class="'+(klass||'')+'" data-pm-action="'+status+'" data-id="'+id+'">'+label+'</button>';}
  function renderPagination() {
    const p=state.pagination,total=Number(p.total||0),from=total?((Number(p.page||1)-1)*Number(p.page_size||15)+1):0,to=Math.min(total,from+state.rows.length-1);
    el.pmResultCount.textContent=total?`Showing ${from}–${to} of ${total} passengers`:"0 passengers"; el.pmPageLabel.textContent=`Page ${p.page||1} of ${p.total_pages||1}`; el.pmPrevPage.disabled=!p.has_prev; el.pmNextPage.disabled=!p.has_next;
  }
  function renderError(message){el.passengerTableBody.innerHTML='<tr><td colspan="8" class="pm-empty-state"><strong>Passenger data unavailable</strong>'+esc(message)+'<br><button class="pm-secondary" type="button" data-pm-retry>Retry</button></td></tr>'; el.pmResultCount.textContent="Unable to load passengers";}
  function handleTableClick(event) {
    const reset=event.target.closest("[data-pm-reset]"); if(reset){el.passengerSearch.value="";el.passengerStatusFilter.value="all";loadPage(1);return;}
    if(event.target.closest("[data-pm-retry]")){loadPage(state.page);return;}
    const view=event.target.closest("[data-pm-view]"); if(view){openPassenger(view.dataset.pmView);return;}
    const toggle=event.target.closest("[data-pm-menu]"); if(toggle){const menu=toggle.parentElement.querySelector(".pm-menu"),open=menu.hidden;closeMenus();if(open){menu.hidden=false;const rect=toggle.getBoundingClientRect(),width=190,height=menu.offsetHeight;menu.style.left=Math.max(8,Math.min(innerWidth-width-8,rect.right-width))+"px";menu.style.top=(rect.bottom+height+8>innerHeight?Math.max(8,rect.top-height-6):rect.bottom+6)+"px";}toggle.setAttribute("aria-expanded",String(open));return;}
    const action=event.target.closest("[data-pm-action]"); if(action){changeStatus(action.dataset.id,action.dataset.pmAction);}
  }
  function closeMenus(){document.querySelectorAll(".pm-menu:not([hidden])").forEach(menu=>menu.hidden=true);document.querySelectorAll("[data-pm-menu]").forEach(b=>b.setAttribute("aria-expanded","false"));}
  function exportCsv(){const url=API+"?"+params({export:"csv",page:1});window.location.assign(url);}

  async function openPassenger(id) {
    const row=state.rows.find(p=>String(p.passenger_id||p.uid)===String(id)); if(!row)return;
    state.selected=row; renderModalBase(row); el.passengerDetailBackdrop.hidden=false; document.body.classList.add("pm-modal-open"); el.pmModalClose.focus();
    if(state.details.has(id)){renderDetail(state.details.get(id));return;}
    el.pmRecentRides.innerHTML='<div class="pm-table-skeleton"></div><div class="pm-table-skeleton short"></div>';
    try{const response=await fetch(API+"?"+new URLSearchParams({mode:"passenger_detail",uid:id}),{headers:{Accept:"application/json"},credentials:"same-origin"});const data=await response.json();if(!response.ok||data.ok!==true)throw new Error();state.details.set(id,data);renderDetail(data);}catch(_){el.pmDetailError.hidden=false;el.pmDetailError.innerHTML='Passenger details could not be loaded. <button class="pm-secondary" type="button" data-pm-retry-detail>Retry</button>';el.pmRecentRides.innerHTML='<div class="pm-empty-state">No ride history available.</div>';}
  }
  function renderModalBase(p){el.pmDetailError.hidden=true;el.pmModalAvatar.textContent=initials(p.name);el.pmModalName.textContent=p.name||"Passenger";el.pmModalId.textContent="ID: "+shortId(p.passenger_id||p.uid);setStatus(el.pmModalStatus,p.status);el.pmPersonalGrid.innerHTML=detailItems([["Full Name",p.name],["Email Address",p.email],["Phone Number",p.phone],["CNIC",p.masked_cnic||"Not provided"],["Location",p.location_hint],["Registration Date",formatDate(p.created_at)],["Last Active",relativeTime(p.last_active)]]);el.pmAccountGrid.innerHTML=detailItems([["Account Status",title(p.status)],["Blocked Status",p.status==="blocked"?"Blocked":"Not blocked"]]);renderActions(p);}
  function renderDetail(data){const p=data.passenger||state.selected,stats=data.ride_summary||{};renderModalBase(p);el.pmRideStats.innerHTML=stat("Total Rides",stats.total_rides)+stat("Completed Rides",stats.completed_rides)+stat("Cancelled Rides",stats.cancelled_rides)+stat("Average Rating",validRating(stats.average_rating)===null?"Not rated":Number(stats.average_rating).toFixed(1))+stat("Total Spending","Rs. "+money(stats.total_spending));const rides=Array.isArray(data.recent_rides)?data.recent_rides:[];el.pmRecentRides.innerHTML=rides.length?'<div class="pm-rides-list">'+rides.map(r=>'<article class="pm-ride-row"><strong>'+esc(r.ride_id||"—")+'</strong><div class="pm-route" title="'+esc((r.pickup||"")+" → "+(r.dropoff||""))+'"><strong>'+esc(r.pickup||"Pickup unavailable")+'</strong><span>to '+esc(r.dropoff||"Drop-off unavailable")+'</span></div><div>'+esc(formatDate(r.date))+'<br>Rs. '+money(r.fare)+'</div><div><span class="pm-status '+esc(norm(r.status))+'">'+esc(title(r.status))+'</span><br>'+esc(r.driver||"Unassigned")+'</div></article>').join("")+'</div>':'<div class="pm-empty-state">No ride history available.</div>';el.pmCompleteHistory.href="rides.php?passenger="+encodeURIComponent(p.passenger_id||p.uid||"");const safety=data.safety||{},entries=[["SOS Alerts",safety.sos_alerts],["Complaints Submitted",safety.complaints],["Lost and Found Cases",safety.lost_found],["Reports Against Passenger",safety.reports_against]].filter(x=>Number(x[1])>0);el.pmSafetySection.hidden=!entries.length;el.pmSafetyGrid.innerHTML=entries.map(x=>'<article><strong>'+Number(x[1])+'</strong><span>'+esc(x[0])+'</span></article>').join("");}
  function renderActions(p){const status=norm(p.status),id=esc(p.passenger_id||p.uid||"");let actions='<a class="pm-secondary" href="rides.php?passenger='+encodeURIComponent(id)+'">View Ride History</a><a class="pm-secondary" href="notifications.php?passenger='+encodeURIComponent(id)+'">Send Notification</a>';actions+=status==="blocked"?'<button class="pm-secondary" data-pm-action="unblocked" data-id="'+id+'">Unblock Passenger</button>':'<button class="pm-secondary danger" data-pm-action="blocked" data-id="'+id+'">Block Passenger</button>';el.pmModalActions.innerHTML=actions+'<button class="pm-secondary" type="button" data-pm-close>Close</button>';}
  function handleModalAction(event){if(event.target.closest("[data-pm-close]")){closeModal();return;}if(event.target.closest("[data-pm-retry-detail]")){openPassenger(state.selected.passenger_id||state.selected.uid);return;}const a=event.target.closest("[data-pm-action]");if(a)changeStatus(a.dataset.id,a.dataset.pmAction);}
  async function changeStatus(id,status){closeMenus();const verb={blocked:"block",unblocked:"unblock"}[status]||status;if(!window.confirm(`Are you sure you want to ${verb} this passenger?`))return;try{const response=await fetch(ACTION_API,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},credentials:"same-origin",body:JSON.stringify({action:"passenger_status",id,status})});const data=await response.json();if(!response.ok||data.ok!==true)throw new Error();state.details.delete(id);closeModal();await loadPage(state.page);}catch(_){window.alert("This action could not be completed. Please try again.");}}
  function closeModal(){if(!el.passengerDetailBackdrop)return;el.passengerDetailBackdrop.hidden=true;document.body.classList.remove("pm-modal-open");}
  function detailItems(items){return items.map(([label,value])=>'<article class="pm-detail-item"><span>'+esc(label)+'</span><strong title="'+esc(value||"Not provided")+'">'+esc(value||"Not provided")+'</strong></article>').join("");}
  function stat(label,value){return '<article class="pm-ride-stat"><strong>'+esc(String(value??0))+'</strong><span>'+esc(label)+'</span></article>';}
  function setText(id,value){const n=document.getElementById(id);if(n)n.textContent=Number(value||0).toLocaleString();}
  function setStatus(node,status){const s=norm(status||"pending");node.className="pm-status "+s;node.textContent=title(s)+" Passenger";}
  function initials(name){return String(name||"P").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase()||"P";}
  function shortId(id){const s=String(id||"");return s.length>10?"PAS-"+s.slice(-6).toUpperCase():s||"—";}
  function norm(v){return String(v||"").trim().toLowerCase().replace(/\s+/g,"_");}
  function title(v){return norm(v).split("_").map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(" ")||"Pending";}
  function validRating(v){const n=Number(v);return Number.isFinite(n)&&n>0&&n<=5?n:null;}
  function money(v){return Number(v||0).toLocaleString(undefined,{maximumFractionDigits:2});}
  function formatDate(v){if(!v)return"Not available";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString([],{dateStyle:"medium",timeStyle:"short"});}
  function relativeTime(v){if(!v)return"Not available";const ms=new Date(v).getTime();if(!Number.isFinite(ms))return String(v);const sec=Math.round((Date.now()-ms)/1000),future=sec<0,n=Math.abs(sec);let unit="second",value=n;if(n>=31536000){unit="year";value=Math.floor(n/31536000);}else if(n>=604800){unit="week";value=Math.floor(n/604800);}else if(n>=86400){unit="day";value=Math.floor(n/86400);}else if(n>=3600){unit="hour";value=Math.floor(n/3600);}else if(n>=60){unit="minute";value=Math.floor(n/60);}return value+" "+unit+(value===1?"":"s")+(future?" from now":" ago");}
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
})();
