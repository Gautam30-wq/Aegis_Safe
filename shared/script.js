window.triggerEscapeProtocol = function () {
  try { sessionStorage.clear(); } catch (_) { }
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('aegis_'))
      .forEach(k => localStorage.removeItem(k));
  } catch (_) { }
  window.location.replace('https://weather.com/en-IN/weather/today/l/INXX0096:1:IN?Goto=Redirected');
};

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    window.triggerEscapeProtocol();
  }
});

(function initActiveNav() {
  const path = window.location.pathname;
  const navLinks = document.querySelectorAll('.menu-items a');

  navLinks.forEach(link => {
    try {
      const linkPath = new URL(link.href).pathname;
      const linkDir = linkPath.split('/').filter(Boolean).slice(-2, -1)[0] || '';
      const pageDir = path.split('/').filter(Boolean).slice(-2, -1)[0] || '';

      if (linkDir && pageDir && linkDir === pageDir) {
        link.classList.add('active-nav');
      }
    } catch (_) { }
  });
})();

(function initSOS() {
  const sosBtn = document.getElementById('sos-btn');
  const mapContainer = document.getElementById('map-frame');
  const nearbyStatus = document.getElementById('nearby-status');
  const nearbyList = document.getElementById('nearby-list');
  const serviceTypeSelect = document.getElementById('service-type');

  if (!sosBtn || !mapContainer || !nearbyStatus || !nearbyList) return;

  let currentLat = null;
  let currentLng = null;
  let leafletMap = null;
  let userMarker = null;
  let placeMarkers = [];

  function initLeafletMap(lat, lng) {
    leafletMap = L.map(mapContainer).setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(leafletMap);
  }

  function placeUserMarker(lat, lng) {
    if (!leafletMap) return;
    if (userMarker) userMarker.remove();
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:18px;height:18px;border-radius:50%;
        background:#3b82f6;border:3px solid #fff;
        box-shadow:0 0 0 4px rgba(59,130,246,0.35);
      "></div>`,
    });
    userMarker = L.marker([lat, lng], { icon })
      .addTo(leafletMap)
      .bindPopup('<b>📍 You are here</b>')
      .openPopup();
  }

  function clearPlaceMarkers() {
    placeMarkers.forEach(m => m.remove());
    placeMarkers = [];
  }

  function addPlaceMarkers(places, typeLabel) {
    if (!leafletMap) return;
    clearPlaceMarkers();

    const colorMap = {
      'Hospitals': '#ef4444',
      'Police Stations': '#1d4ed8',
      'Safe Shelters': '#7c3aed'
    };
    const color = colorMap[typeLabel] || '#ef4444';

    places.forEach((place) => {
      const lat = place.lat ?? place.center?.lat;
      const lng = place.lon ?? place.center?.lon;
      if (!lat || !lng) return;

      const name = place.tags?.name || typeLabel.replace(/s$/, '');
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:14px;height:14px;border-radius:50%;
          background:${color};border:2px solid #fff;
          box-shadow:0 2px 6px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      const marker = L.marker([lat, lng], { icon })
        .addTo(leafletMap)
        .bindPopup(`<b>${name}</b><br><a href="${mapsUrl}" target="_blank" rel="noopener">📍 Get Directions</a>`);
      placeMarkers.push(marker);
    });
  }

  function classifyPlace(tags = {}) {
    if (tags.amenity === 'hospital') return 'Hospital';
    if (tags.amenity === 'police') return 'Police Station';
    if (tags.amenity === 'shelter' ||
      tags.social_facility === 'shelter' ||
      tags.amenity === 'social_facility') return 'Women Shelter / Safe Shelter';
    return 'Support Service';
  }

  function renderNearbyPlaces(places) {
    if (!places.length) {
      nearbyList.innerHTML = '<p class="nearby-status">No nearby services found in current radius.</p>';
      return;
    }
    nearbyList.innerHTML = places.map((place) => {
      const type = classifyPlace(place.tags);
      const name = place.tags?.name || type;
      const lat = (place.lat ?? place.center?.lat ?? 0).toFixed(5);
      const lon = (place.lon ?? place.center?.lon ?? 0).toFixed(5);
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
      return `
        <article class="nearby-item">
          <h3>${type}: ${name}</h3>
          <p>Coordinates: ${lat}, ${lon}</p>
          <a href="${mapsUrl}" target="_blank" class="card-btn" style="font-size:13px;padding:6px 14px;">📍 Get Directions →</a>
        </article>`;
    }).join('');
  }

  async function fetchNearby(lat, lng, type = 'Hospitals') {
    let typeQuery = '';
    if (type === 'Police Stations') {
      typeQuery = `
        node["amenity"="police"](around:5000,${lat},${lng});
        way["amenity"="police"](around:5000,${lat},${lng});`;
    } else if (type === 'Safe Shelters') {
      typeQuery = `
        node["amenity"="shelter"](around:7000,${lat},${lng});
        way["amenity"="shelter"](around:7000,${lat},${lng});
        node["social_facility"="shelter"](around:7000,${lat},${lng});
        way["social_facility"="shelter"](around:7000,${lat},${lng});`;
    } else {
      typeQuery = `
        node["amenity"="hospital"](around:5000,${lat},${lng});
        way["amenity"="hospital"](around:5000,${lat},${lng});`;
    }

    const query = `[out:json][timeout:30];(${typeQuery});out center;`;
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });

    if (!response.ok) throw new Error('Overpass API request failed.');

    const data = await response.json();
    if (!Array.isArray(data.elements)) return [];

    const seen = new Set();

    return data.elements.filter(el => {
      const name = el.tags?.name || '';
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;

      const key = name + "_" + Math.round(lat * 1000) + "_" + Math.round(lon * 1000);

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (serviceTypeSelect) {
    serviceTypeSelect.addEventListener('change', async () => {
      if (currentLat == null || currentLng == null) return;
      const type = serviceTypeSelect.value;
      nearbyStatus.textContent = `Finding nearby ${type.toLowerCase()}...`;
      try {
        const places = await fetchNearby(currentLat, currentLng, type);
        addPlaceMarkers(places, type);
        renderNearbyPlaces(places);
        nearbyStatus.textContent = `Found ${places.length} nearby ${type.toLowerCase()}.`;
      } catch {
        nearbyStatus.textContent = 'Error fetching list. Please try again.';
      }
    });
  }

  async function locateAndLoad() {
    if (!navigator.geolocation) {
      nearbyStatus.textContent = 'Geolocation is not supported on this device/browser.';
      return;
    }

    nearbyStatus.textContent = 'Detecting your location...';
    sosBtn.textContent = '📍 Locating...';
    sosBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        currentLat = lat;
        currentLng = lng;

        initLeafletMap(lat, lng);
        placeUserMarker(lat, lng);

        try {
          localStorage.setItem('aegis_lastLat', String(lat));
          localStorage.setItem('aegis_lastLng', String(lng));
        } catch (_) { }

        try {
          const type = serviceTypeSelect ? serviceTypeSelect.value : 'Hospitals';
          nearbyStatus.textContent = `Finding nearby ${type.toLowerCase()}...`;
          const places = await fetchNearby(lat, lng, type);

          addPlaceMarkers(places, type);

          renderNearbyPlaces(places);
          nearbyStatus.textContent = `Found ${places.length} nearby ${type.toLowerCase()}.`;
        } catch (err) {
          nearbyStatus.textContent = err.message || 'Unable to fetch nearby services right now.';
          nearbyList.innerHTML = '';
        }
        finally {
          sosBtn.textContent = '✅ Location Updated';
          sosBtn.disabled = false;
        }
      },
      () => {
        nearbyStatus.textContent = 'Location access denied. Please allow location and tap the button again.';
        nearbyList.innerHTML = '';
        sosBtn.textContent = 'Enable Location';
        sosBtn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }
  sosBtn.addEventListener('click', locateAndLoad);
  locateAndLoad();
})();
(function initScrollReveal() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('/sign/') || path.includes('/auth-landing/')) return;

  const selectors = [
    'section', '.opener-content', '.issue-card', '.challenge-card',
    '.impact-card', '.milestone .content', '.stat-card', '.timeline .milestone'
  ];

  const revealNodes = Array.from(
    document.querySelectorAll(selectors.join(','))
  ).filter((el, idx, arr) => arr.indexOf(el) === idx);

  if (!revealNodes.length) return;

  const nodesToObserve = [];
  const initialViewportCutoff = window.innerHeight * 0.88;

  revealNodes.forEach((node) => {
    const rect = node.getBoundingClientRect();
    const isInitiallyVisible = rect.top < initialViewportCutoff;
    if (isInitiallyVisible) {
      node.classList.add('is-visible');
      return;
    }
    node.classList.add('scroll-reveal');
    nodesToObserve.push(node);
  });

  if (!nodesToObserve.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });


    },
    { threshold: 0.22, rootMargin: '0px 0px -8% 0px' }
  );

  nodesToObserve.forEach((node) => observer.observe(node));
})();


let initGlobalSOS = (function initGlobalSOS() {
  if (document.getElementById('sos-modal-overlay')) return;

  const modalHTML = `
    <div id="sos-modal-overlay">
      <button id="sos-cross-btn" style="position:absolute; top:20px; right:20px; background:none; border:none; color:#fff; font-size:36px; cursor:pointer; z-index:10000; line-height:1;">&times;</button>
      <div id="sos-hold-popup">
        <h2 id="sos-hold-title">Emergency SOS</h2>
        <p class="sos-hold-subtitle">This will alert authorities and share your live location.</p>
        <div class="sos-button-wrapper" id="sos-btn-wrapper">
          <svg viewBox="0 0 140 140">
            <circle class="sos-progress-bg" cx="70" cy="70" r="66"></circle>
            <circle class="sos-progress-ring" id="sos-progress-ring" cx="70" cy="70" r="66"></circle>
          </svg>
          <button class="sos-hold-btn" id="sos-hold-btn">SOS</button>
          <span id="sos-hold-pct">0%</span>
        </div>
        <div class="sos-warning-msg" id="sos-warning-msg">Hold continuously to activate</div>
      </div>
      <div id="sos-full-panel">
        <div class="panel-header">
          <h2>SOS Activated</h2>
        </div>
        <div class="sos-panel-grid">
          <button class="sos-location-btn" id="sos-share-location-btn">
            <span>📍</span> Share Live Location
          </button>
        </div>
        <button class="sos-quick-exit" id="sos-quick-exit">Quick Exit</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const overlay = document.getElementById('sos-modal-overlay');
  const btnWrapper = document.getElementById('sos-btn-wrapper');
  const progressRing = document.getElementById('sos-progress-ring');
  const pctText = document.getElementById('sos-hold-pct');
  const warningMsg = document.getElementById('sos-warning-msg');
  const quickExit = document.getElementById('sos-quick-exit');
  const shareLocationBtn = document.getElementById('sos-share-location-btn');
  const crossBtn = document.getElementById('sos-cross-btn');

  const HOLD_DURATION = 3000;
  const CIRCUMFERENCE = 414.69;

  let holdTimer = null;
  let startTime = null;
  let isActivated = false;

  const sosNavButtons = document.querySelectorAll('.site-nav a[href*="wa.me"], .site-nav #sos-btn');
  sosNavButtons.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openSOSModal();
    });
  });

  function openSOSModal() {
    isActivated = false;
    overlay.classList.remove('sos-panel-active');
    overlay.classList.add('sos-active');
    resetProgress();
  }

  function closeSOSModal() {
    overlay.classList.remove('sos-active');
    overlay.classList.remove('sos-panel-active');
    resetProgress();
  }

  function resetProgress() {
    cancelAnimationFrame(holdTimer);
    startTime = null;
    progressRing.style.strokeDashoffset = CIRCUMFERENCE;
    pctText.style.opacity = '0';
    pctText.textContent = '0%';
  }

  function showWarning() {
    warningMsg.classList.add('visible');
    setTimeout(() => {
      warningMsg.classList.remove('visible');
    }, 2000);
  }

  function startHold(e) {
    if (isActivated) return;
    startTime = performance.now();
    warningMsg.classList.remove('visible');
    pctText.style.opacity = '1';

    function updateProgress(now) {
      if (!startTime) return;
      const elapsed = now - startTime;
      let progress = Math.min(elapsed / HOLD_DURATION, 1);
      const offset = CIRCUMFERENCE - (progress * CIRCUMFERENCE);
      progressRing.style.strokeDashoffset = offset;
      pctText.textContent = Math.floor(progress * 100) + '%';

      if (progress >= 1) {
        triggerSOSPanel();
      } else {
        holdTimer = requestAnimationFrame(updateProgress);
      }
    }
    holdTimer = requestAnimationFrame(updateProgress);
  }

  function endHold(e) {
    if (isActivated) return;
    if (startTime && (performance.now() - startTime) < HOLD_DURATION) {
      showWarning();
    }
    resetProgress();
  }

  function triggerSOSPanel() {
    isActivated = true;
    resetProgress();
    overlay.classList.add('sos-panel-active');
  }

  btnWrapper.addEventListener('mousedown', startHold);
  window.addEventListener('mouseup', endHold);

  quickExit.addEventListener('click', () => {
    closeSOSModal();
  });

  crossBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  shareLocationBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    shareLocationBtn.innerHTML = '<span>⏳</span> Locating...';
    shareLocationBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
        const msg = `I am in danger! My location: ${mapsUrl}`;

        const contact = localStorage.getItem('aegis_emergency_contact_1') || '';

        shareLocationBtn.innerHTML = '<span>✅</span> Location Shared';

        if (contact) {
          window.open(`https://wa.me/${contact}?text=${encodeURIComponent(msg)}`, '_blank');
        }
        if (!contact) {
          window.open(`https://wa.me/112?text=${encodeURIComponent(msg)}`, '_blank');
        }
        shareLocationBtn.innerHTML = '<span>📍</span> Share Live Location';
        shareLocationBtn.disabled = false;

      },
      () => {
        alert('Location access denied or failed.');
        shareLocationBtn.innerHTML = '<span>📍</span> Share Live Location';
        shareLocationBtn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
})();








function renderEmergencyCards() {
  var grid = document.getElementById("emergency-grid");

  emergencyData.forEach(function (item) {
    var { number, label, icon } = item;
    var card = document.createElement("div");
    card.className = "issue-card";
    card.innerHTML =
      "<h3>" + icon + " " + label + "</h3>" +
      "<a href='tel:" + number + "' class='card-btn'>📞 Call " + number + "</a>";
    grid.appendChild(card);
  });
}
function renderNGOCards() {
  var grid = document.getElementById("ngo-grid");
  ngoData.forEach(function (item) {
    var { name, desc, url } = item;
    var card = document.createElement("div");
    card.className = "issue-card";
    card.innerHTML = "<h3>" + name + "</h3><p>" + desc + "</p><a href='" + url + "' target='_blank' class='card-btn'>🔗 Visit Website</a>";
    grid.appendChild(card);
  });
}

function renderSchemeCards() {
  var grid = document.getElementById("scheme-grid");
  schemeData.forEach(function (item) {
    var { name, desc, url } = item;
    var card = document.createElement("div");
    card.className = "issue-card";
    card.innerHTML = "<h3>" + name + "</h3><p>" + desc + "</p><a href='" + url + "' target='_blank' class='card-btn'>👉 Click to know more</a>";
    grid.appendChild(card);
  });
}

var TOTAL = 120;
var timeLeft = TOTAL;
var timerInterval = null;
var isRunning = false;

function updateTimerDisplay(seconds) {
  var minutes = Math.floor(seconds / 60);
  var secs = seconds % 60;
  var secStr = secs < 10 ? "0" + secs : "" + secs;

  var timerNum = document.getElementById("timer-num");
  if (timerNum) timerNum.textContent = minutes + ":" + secStr;

  var timerCircle = document.getElementById("timer-circle");
  if (timerCircle) {
    var circumference = 314;
    var offset = circumference * (1 - seconds / TOTAL);
    timerCircle.style.strokeDashoffset = offset;
  }
}

document.addEventListener("DOMContentLoaded", function () {
  var btn = document.getElementById("checkin-btn");
  var status = document.getElementById("timer-status");

  if (!btn || !status) return;

  function getEmergencyContacts() {
    const c1 = localStorage.getItem('aegis_emergency_contact_1');
    return [c1].filter(Boolean);
  }

  function callEmergency() {
    const contacts = getEmergencyContacts();
    if (contacts.length === 0) {
      window.location.href = "tel:112";
      return;
    }
    if (contacts.length === 1) {
      window.location.href = "tel:" + contacts[0];
      return;
    }
    window.location.href = "tel:" + contacts[0];
  }

  function startTimer() {
    if (isRunning) return;
    isRunning = true;
    timeLeft = TOTAL;
    updateTimerDisplay(TOTAL);

    btn.textContent = "✅ I'm Safe — Click to Check In";
    status.textContent = "Timer running... check in before it ends!";
    status.className = "timer-status running";

    timerInterval = setInterval(function () {
      timeLeft--;
      updateTimerDisplay(timeLeft);

      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        isRunning = false;

        btn.textContent = "Start Check-In";
        status.textContent = "Check-in missed! Please call someone.";
        status.className = "timer-status missed";

        var alarm = document.getElementById("alarm-sound");
        if (alarm) {
          alarm.loop = true;
          alarm.play().catch(() => { });
        }

        if (navigator.vibrate) {
          navigator.vibrate([500, 300, 500, 300, 500]);
        }

        setTimeout(function () {
          var confirmCall = confirm("⚠️ You missed check-in!\n\nCall your emergency contact now?");
          if (confirmCall) {
            callEmergency();
          }
        }, 3000);

        alert("⚠️ AegisSafe Alert!\n\nYou missed your safety check-in.");
      }
    }, 1000);
  }

  btn.addEventListener("click", function () {
    if (!isRunning) {
      startTimer();
    } else {
      clearInterval(timerInterval);

      var alarm = document.getElementById("alarm-sound");
      if (alarm) {
        alarm.pause();
        alarm.currentTime = 0;
      }

      isRunning = false;
      timeLeft = TOTAL;
      updateTimerDisplay(TOTAL);

      btn.textContent = "✅ I'm Safe — Click to Check In";
      status.textContent = "Timer running... check in before it ends!";
      status.className = "timer-status running";

      setTimeout(function () {
        status.textContent = "Not active";
        status.className = "timer-status";
      }, 3000);
    }
  });

  setTimeout(startTimer, 2000);
});
function startTicker() {
  var tickerEl = document.getElementById("ticker");

  var tips = [
    "Trust your instincts — if something feels wrong, act immediately.",
    "Share your live location with a trusted contact when travelling alone.",
    "Save emergency numbers as speed dials on your phone.",
    "Walk confidently and stay in well-lit areas at night.",
    "You are not alone — help is always just one call away."
  ];

  var tipIndex = 0;

  tickerEl.style.opacity = "1";
  tickerEl.style.display = "inline-block";
  tickerEl.style.transition = "opacity 0.5s ease-in-out";
  tickerEl.textContent = tips[0];

  setInterval(function () {
    tickerEl.style.opacity = "0";

    setTimeout(function () {
      tipIndex++;
      if (tipIndex >= tips.length) tipIndex = 0;

      tickerEl.textContent = tips[tipIndex];
      tickerEl.style.opacity = "1";

      console.log("Swapped to tip: " + tipIndex);
    }, 500);

  }, 4000);
}

document.addEventListener("DOMContentLoaded", function () {
  startTicker();
});





let tapCount = 0;
let lastTapTime = 0;
function handleTap(e) {
  if (e && e.target) {
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'button' || tag === 'a' || e.target.closest('button') || e.target.closest('a')) {
      return;
    }
  }
  const currentTime = Date.now();
  if (currentTime - lastTapTime < 600) {
    tapCount++;
  } else {
    tapCount = 1;
  }
  lastTapTime = currentTime;
  if (tapCount === 3) {
    console.log("🚨 Triple Tap SOS Triggered");
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const shareLocationBtn = document.getElementById('sos-share-location-btn');
    if (shareLocationBtn) {
      shareLocationBtn.click();
    } else {
      window.location.href = "tel:112";
    }
    tapCount = 0;
  }
}
document.addEventListener("click", handleTap);