/* Final app.js (no API key required - uses embed iframe for map when Maps JS not available)
   - slideshow uses provided fallback images when monastery images are missing
   - chat uses /api/chatbot (backend optional)
   - map will be an embedded Google Maps iframe centered on Sikkim if Google Maps JS isn't loaded
*/

let map = null, pano = null, markers = [], monasteries = [], nearbyMarkersMap = {}, currentMon = null;
const lang = localStorage.getItem('lang') || 'en';

async function tLoad() {
  try {
    const r = await fetch(`/translations/${lang}.json`);
    return await r.json();
  } catch (e) {
    return {};
  }
}
let translations = {};

const defaultImages = [
  "https://upload.wikimedia.org/wikipedia/commons/a/af/Phodong_monastery_-_north_sikkim.jpg",
  "https://www.tourmyindia.com/states/sikkim/images/pemayangtse-monastery1.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Phensong_Monastery.jpg/1280px-Phensong_Monastery.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/7/7f/Kathog_Monastery_alias_Kartok_Monastery_at_Pakyong_in_East_Sikkim.jpg",
  "https://vushii.com/uploads/633916600_Sinon%20Monastery.jpg",
  "https://sikkimtourism.org/wp-content/uploads/2022/04/Gonjang-Monastery-700x500.jpg",
  "https://www.omastrology.com/indian-monasteries/images/hee-gyathang-monastery.jpg",
  "https://www.trawell.in/admin/images/upload/288555281Namchi_Ngadak_Monastery_Main.jpg",
  "https://thumbs.dreamstime.com/b/chawayng-ani-monastery-buddhist-monastery-chawayng-ani-monastery-buddhist-monastery-sikkim-392589286.jpg"
];

tLoad().then(j => translations = j);
function t(k, d) { return translations[k] || d || k; }

async function fetchMonasteries(q = '') {
  const url = q ? `/api/monasteries?q=${encodeURIComponent(q)}` : '/api/monasteries';
  try {
    const r = await fetch(url);
    const j = await r.json();
    monasteries = Array.isArray(j) ? j : (j.items || []);
  } catch (e) {
    monasteries = []; // fallback empty
  }
  renderList();
  plotMarkers();
  buildSlideshow();
}

/* MAP: if Google Maps JS not present we embed an iframe centered on Sikkim */
function ensureMapEmbed() {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;
  // If Google Maps JS is available and map already initialized, do nothing
  if (window.google && window.google.maps && map) return;
  // Insert an embedded Google Maps iframe centered on Sikkim (no API key required)
  // Zoom default to 8 to show region
  mapEl.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.width = '100%';
  iframe.height = '100%';
  iframe.style.border = 0;
  iframe.loading = 'lazy';
  iframe.referrerPolicy = 'no-referrer-when-downgrade';
  iframe.src = 'https://www.google.com/maps?q=Sikkim,India&z=8&output=embed';
  mapEl.appendChild(iframe);
}

/* plotMarkers and other google.maps functions are guarded — they will no-op if google.maps isn't available */
function plotMarkers() {
  // If the Google Maps JS API is not loaded, skip marker plotting (map is iframe)
  if (!window.google || !window.google.maps) return;
  if (!map) {
    // initialize a simple map centered on Sikkim if available
    map = new google.maps.Map(document.getElementById('map'), { center: { lat: 27.533, lng: 88.512 }, zoom: 8 });
  }
  markers.forEach(m => m.setMap(null));
  markers = [];
  monasteries.forEach((m, i) => {
    if (!m || typeof m.latitude !== 'number' || typeof m.longitude !== 'number') return;
    const marker = new google.maps.Marker({
      map,
      position: { lat: m.latitude, lng: m.longitude },
      title: m.name || ''
    });
    marker.addListener('click', () => {
      renderDetails(m);
      showStreetView(m);
      currentMon = m;
    });
    markers.push(marker);
  });
}

function renderList() {
  const el = document.getElementById('list');
  if (!el) return;
  el.innerHTML = '';
  monasteries.forEach((m, i) => {
    const d = document.createElement('div');
    d.className = 'item';
    d.dataset.index = i;
    const name = (m.translations || []).find(x => x.lang === lang)?.name || m.name || 'Monastery';
    d.innerHTML = `<div><div class='name'>${escapeHtml(name)}</div><div>${escapeHtml(m.description || '')}</div></div>`;
    d.onclick = () => focusMonastery(i);
    el.appendChild(d);
  });
}

function focusMonastery(i) {
  const m = monasteries[i];
  if (!m) return;
  currentMon = m;
  if (window.google && window.google.maps && map && typeof map.panTo === 'function') {
    map.panTo({ lat: m.latitude, lng: m.longitude });
    map.setZoom(14);
  } else {
    // If embed iframe used, just scroll details into view
    document.getElementById('details')?.scrollIntoView({ behavior: 'smooth' });
  }
  renderDetails(m);
  showStreetView(m);
  initMiniMap(m);
}

function renderDetails(m) {
  const el = document.getElementById('details');
  if (!el) return;
  const name = (m.translations || []).find(x => x.lang === lang)?.name || m.name || 'Monastery';
  const body = (m.translations || []).find(x => x.lang === lang)?.history || m.history || m.description || '';
  el.innerHTML = `<h2>${escapeHtml(name)}</h2><p>${escapeHtml(body)}</p>
    <div>
      <button onclick="openTour()" class="btn">${t('open_tour','Open Tour')}</button>
      <button onclick="downloadTour()" class="btn">${t('download_tour','Download Tour')}</button>
      <button onclick="openStory()" class="btn">${t('story_mode','Story Mode')}</button>
    </div>`;
}

function showStreetView(m) {
  // Street View requires Google Maps JS; if absent, hide or skip
  if (!window.google || !window.google.maps) {
    // nothing to show; keep pannellum / fallback images for panoramas
    return;
  }
  if (!pano) {
    const panoEl = document.getElementById('pano') || document.getElementById('pannellum-container');
    if (panoEl) pano = new google.maps.StreetViewPanorama(panoEl, { visible: false });
  }
  const svs = new google.maps.StreetViewService();
  const latLng = { lat: m.latitude, lng: m.longitude };
  svs.getPanorama({ location: latLng, radius: 500 }, (data, status) => {
    if (status === 'OK') {
      const loc = data.location.latLng;
      pano.setPosition(loc);
      pano.setPov({ heading: m.streetViewHeading || 0, pitch: m.streetViewPitch || 0 });
      pano.setVisible(true);
    } else {
      if (pano && typeof pano.setVisible === 'function') pano.setVisible(false);
    }
  });
}

function buildSlideshow() {
  const slidesEl = document.getElementById('slides');
  if (!slidesEl) return;

  slidesEl.innerHTML = monasteries.map((m, idx) => {
    const src = (m.images && m.images.length && m.images[0]) ? m.images[0] : (defaultImages[idx % defaultImages.length] || '/assets/rumtek1.jpg');
    const name = (m.translations || []).find(x => x.lang === lang)?.name || m.name || 'Monastery';
    return `<div class="slide" style="background-image:url('${escapeHtml(src)}')">
      <div class="meta">
        <h3>${escapeHtml(name)}</h3>
        <div><button onclick="showDetails('${escapeHtml(m._id || '')}')">${t('details','Details')}</button></div>
      </div>
    </div>`;
  }).join('');

  let idx = 0;
  const len = Math.max(1, slidesEl.children.length);
  const setTransform = () => slidesEl.style.transform = `translateX(${(-idx * 100)}%)`;

  const prevBtn = document.getElementById('prevSlide');
  const nextBtn = document.getElementById('nextSlide');
  if (prevBtn) prevBtn.onclick = () => { idx = (idx - 1 + len) % len; setTransform(); };
  if (nextBtn) nextBtn.onclick = () => { idx = (idx + 1) % len; setTransform(); };

  if (len > 1) {
    if (window._echoesSlideshowInterval) clearInterval(window._echoesSlideshowInterval);
    window._echoesSlideshowInterval = setInterval(() => {
      idx = (idx + 1) % len;
      setTransform();
    }, 5000);
  } else {
    if (window._echoesSlideshowInterval) { clearInterval(window._echoesSlideshowInterval); window._echoesSlideshowInterval = null; }
  }
}

function showDetails(id) {
  fetch('/api/monasteries/' + id).then(r => r.json()).then(m => { currentMon = m; renderDetails(m); showStreetView(m); initMiniMap(m); }).catch(()=>{});
}

function openTour() {
  if (!currentMon) return alert('Select a monastery');
  const panoContainer = document.getElementById('pannellum-container');
  const fallback = (currentMon.panoramas && currentMon.panoramas[0]) || (currentMon.images && currentMon.images[0]) || defaultImages[0] || '/assets/rumtek1.jpg';
  if (window.pannellum && typeof pannellum.viewer === 'function' && panoContainer) {
    try {
      if (window.currentPano && typeof window.currentPano.destroy === 'function') window.currentPano.destroy();
      window.currentPano = pannellum.viewer('pannellum-container', {
        type: 'equirectangular',
        panorama: currentMon.panoramas?.[0] || currentMon.images?.[0] || fallback,
        autoLoad: true,
        showControls: true,
        hotSpots: (currentMon.hotspots || []).map(h => ({
          pitch: h.pitch || 0,
          yaw: h.yaw || 0,
          cssClass: 'pn-hotspot',
          createTooltipFunc: function (hs, el) {
            el.innerHTML = '<div style="padding:6px;font-size:13px">' + escapeHtml(h.label || h.text || 'Info') + '</div>';
          },
          createTooltipArgs: [h.label || h.text || 'info']
        }))
      });
    } catch (e) {
      if (panoContainer) panoContainer.innerHTML = `<img src="${escapeHtml(fallback)}" style="width:100%"/>`;
    }
  } else {
    if (panoContainer) panoContainer.innerHTML = `<img src="${escapeHtml(fallback)}" style="width:100%"/>`;
  }
}

async function downloadTour() {
  if (!currentMon) return alert('Select a monastery');
  const urls = (currentMon.panoramas || []).concat(currentMon.images || []).concat(currentMon.audio ? [currentMon.audio] : []);
  if (!urls.length) return alert('No assets');
  for (const url of urls) {
    try {
      const r = await fetch(url);
      const b = await r.blob();
      try { await idbPut('assets', { key: 'asset:' + url, url, blob: b }); } catch (e) {}
      try { const cache = await caches.open('echoes-cache-v4'); await cache.add(url); } catch (e) {}
    } catch (e) {}
  }
  alert('Saved for offline');
}

function openStory() {
  if (!currentMon) return alert('Select a monastery');
  const modal = document.getElementById('storyModal');
  const content = document.getElementById('storyContent');
  if (content) {
    const title = (currentMon.translations || []).find(x => x.lang === lang)?.name || currentMon.name || '';
    const body = (currentMon.translations || []).find(x => x.lang === lang)?.history || currentMon.history || currentMon.description || '';
    content.innerHTML = `<h2>${escapeHtml(title)}</h2><div>${escapeHtml(body)}</div>`;
  }
  if (modal) modal.style.display = 'block';
  const audioUrl = currentMon.audio || null;
  if (audioUrl) { if (window.storyAudio) window.storyAudio.pause(); window.storyAudio = new Audio(audioUrl); }
  const play = document.getElementById('playStory');
  const pause = document.getElementById('pauseStory');
  const downloadBtn = document.getElementById('downloadStory');
  const closeBtn = document.getElementById('closeStory');
  if (play) play.onclick = () => { if (window.storyAudio) window.storyAudio.play(); };
  if (pause) pause.onclick = () => { if (window.storyAudio) window.storyAudio.pause(); };
  if (downloadBtn) downloadBtn.onclick = async () => { if (!audioUrl) return alert('No audio'); await downloadAudioToIdb(audioUrl); alert('Saved for offline'); };
  if (closeBtn) closeBtn.onclick = () => { if (modal) modal.style.display = 'none'; if (window.storyAudio) window.storyAudio.pause(); };
}

async function downloadAudioToIdb(url) {
  try {
    const r = await fetch(url);
    const b = await r.blob();
    await idbPut('assets', { key: 'asset:' + url, url, blob: b });
    return true;
  } catch (e) { return false; }
}

function openIdb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('echoes-db', 2);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('routes')) db.createObjectStore('routes', { keyPath: 'id' });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function idbPut(store, obj) {
  const db = await openIdb();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    s.put(obj);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}

async function idbGet(store, key) {
  const db = await openIdb();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const s = tx.objectStore(store);
    const r = s.get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function downloadRouteForMonastery(m) {
  if (!navigator.geolocation) return alert('GPS not available');
  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    try {
      const r = await fetch(`/api/routes/${m._id}?lat=${lat}&lng=${lng}`);
      const j = await r.json();
      if (j.steps) {
        await idbPut('routes', { id: `route:${m._id}:${lat.toFixed(3)},${lng.toFixed(3)}`, monastery: m._id, origin: { lat, lng }, steps: j.steps });
        alert('Route saved for offline');
      } else alert('No route');
    } catch (e) { alert('Failed'); }
  }, err => alert('GPS failed:' + err.message));
}

async function startOfflineNavigation(m) {
  if (!navigator.geolocation) return alert('GPS not available');
  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const db = await openIdb();
    const tx = db.transaction('routes', 'readonly');
    const store = tx.objectStore('routes');
    const all = await store.getAll();
    let best = null, bestD = 1e9;
    for (const rt of all) {
      if (rt.monastery !== m._id) continue;
      const d = Math.hypot(rt.origin.lat - lat, rt.origin.lng - lng);
      if (d < bestD) { best = rt; bestD = d; }
    }
    if (!best) return alert('No offline route cached');
    const steps = best.steps;
    let idx = 0;
    const navMarker = new google.maps.Marker({
      map,
      position: { lat: lat, lng: lng },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#ff0000', fillOpacity: 1, strokeColor: '#fff' }
    });
    function speak(text) { const u = new SpeechSynthesisUtterance(text); u.lang = localStorage.getItem('lang') || 'en-US'; speechSynthesis.speak(u); }
    function next() {
      if (idx >= steps.length) { speak('Arrived'); return; }
      const step = steps[idx];
      const instr = step.html_instructions.replace(/<[^>]+>/g, '');
      speak(instr);
      const path = [step.start_location, step.end_location].map(s => ({ lat: s.lat, lng: s.lng }));
      const poly = new google.maps.Polyline({ path, strokeColor: '#2563eb', strokeOpacity: 0.9, strokeWeight: 4, map });
      navMarker.setPosition({ lat: step.end_location.lat, lng: step.end_location.lng });
      idx++;
      setTimeout(next, 7000);
    }
    next();
  }, err => alert('GPS failed:' + err.message));
}

async function syncRoutes() {
  try {
    const r = await fetch('/api/routes');
    const list = await r.json();
    for (const rt of list) {
      await idbPut('routes', { id: `route:${rt.monastery._id}:${rt.origin?.lat?.toFixed?.(3) || 0},${rt.origin?.lng?.toFixed?.(3) || 0}`, monastery: rt.monastery._id, origin: rt.origin, steps: rt.steps });
    }
  } catch (e) {}
}

function initMiniMap(monastery) {
  const wrap = document.getElementById('minimap-wrap');
  const toggle = document.getElementById('minimap-toggle');
  if (!wrap || !toggle) return;
  const saved = JSON.parse(localStorage.getItem('miniMapState') || '{}');
  if (saved.top) wrap.style.top = saved.top;
  if (saved.left) wrap.style.left = saved.left;
  if (saved.width) wrap.style.width = saved.width;
  if (saved.height) wrap.style.height = saved.height;
  if (localStorage.getItem('miniMap') === null) {
    const ask = confirm("Enable Mini-Map?");
    localStorage.setItem('miniMap', ask ? 'true' : 'false');
  }
  function load() {
    wrap.style.display = 'block';
    // If google.maps is available, use it, otherwise embed a focused iframe for the monastery
    if (window.google && window.google.maps) {
      const mini = new google.maps.Map(document.getElementById('minimap'), { center: { lat: monastery.latitude, lng: monastery.longitude }, zoom: 13, disableDefaultUI: true });
      new google.maps.Marker({ position: { lat: monastery.latitude, lng: monastery.longitude }, map: mini });
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          new google.maps.Marker({
            position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            map: mini,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#f00', fillOpacity: 1, strokeColor: '#fff' }
          });
        });
      }
    } else {
      // embed simple iframe focused on monastery coordinates (approx)
      const mm = document.getElementById('minimap');
      mm.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.width = '100%';
      iframe.height = '100%';
      iframe.style.border = 0;
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      const q = encodeURIComponent((monastery.name || 'Sikkim') + ' ' + (monastery.latitude || '') + ',' + (monastery.longitude || ''));
      iframe.src = `https://www.google.com/maps?q=${q}&z=13&output=embed`;
      mm.appendChild(iframe);
    }
  }
  if (localStorage.getItem('miniMap') === 'true') load(); else wrap.style.display = 'none';
  toggle.onclick = () => {
    if (localStorage.getItem('miniMap') === 'true') { localStorage.setItem('miniMap', 'false'); wrap.style.display = 'none'; }
    else { localStorage.setItem('miniMap', 'true'); load(); }
  };
  let dragging = false, startX, startY, sTop, sLeft;
  wrap.addEventListener('mousedown', e => {
    if (e.target !== wrap) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    sTop = wrap.offsetTop;
    sLeft = wrap.offsetLeft;
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    wrap.style.top = sTop + dy + 'px';
    wrap.style.left = sLeft + dx + 'px';
  });
  window.addEventListener('mouseup', () => { if (dragging) { dragging = false; save(); } });
  new ResizeObserver(() => save()).observe(wrap);
  function save() {
    localStorage.setItem('miniMapState', JSON.stringify({ top: wrap.style.top, left: wrap.style.left, width: wrap.style.width, height: wrap.style.height }));
  }
}

/* ---------------- Chat handlers bound to static #chatbot HTML ---------------- */

function setupChatHandlers() {
  const topSearchBtn = document.getElementById('topSearchBtn');
  if (topSearchBtn) {
    topSearchBtn.onclick = () => fetchMonasteries(document.getElementById('topSearch')?.value || '');
  }

  const chatOpen = document.getElementById('chatOpen');
  const chatBox = document.getElementById('chatbot');
  const chatClose = document.getElementById('chatClose');
  const chatSend = document.getElementById('chatSend');
  const chatInput = document.getElementById('chatInput');

  if (chatOpen && chatBox) {
    chatOpen.onclick = () => {
      chatBox.classList.remove('hidden');
      chatBox.setAttribute('aria-hidden', 'false');
      const msgs = chatBox.querySelector('.chat-messages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
      if (chatInput) chatInput.focus();
    };
  }

  if (chatClose && chatBox) {
    chatClose.addEventListener('click', () => {
      chatBox.classList.add('hidden');
      chatBox.setAttribute('aria-hidden', 'true');
    });
  }

  if (chatSend && chatInput && chatBox) {
    chatSend.addEventListener('click', async () => {
      const out = chatBox.querySelector('.chat-messages');
      if (!out) return;
      const q = chatInput.value.trim();
      if (!q) return;
      out.innerHTML += `<div style="margin-bottom:8px"><strong>You</strong>: ${escapeHtml(q)}</div>`;
      out.scrollTop = out.scrollHeight;
      chatInput.value = '';
      try {
        const r = await fetch('/api/chatbot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q })
        });
        const j = await r.json();
        const answer = j.answer || j.error || JSON.stringify(j);
        out.innerHTML += `<div style="margin-bottom:8px"><strong>Assistant</strong>: <div style="white-space:pre-wrap">${escapeHtml(answer)}</div></div>`;
      } catch (e) {
        out.innerHTML += `<div style="margin-bottom:8px;color:red"><strong>Assistant</strong>: Error contacting server</div>`;
      }
      out.scrollTop = out.scrollHeight;
    });

    chatInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        chatSend.click();
      }
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
}

/* Initialize - ensure map embed if no maps lib, then load data */
window.addEventListener('load', () => {
  ensureMapEmbed();      // insert embedded Sikkim map if google maps lib is not present
  fetchMonasteries();    // populate slideshow/list
  syncRoutes();          // try to load any routes
  setupChatHandlers();   // wire chat
});
