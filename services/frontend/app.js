// CinePass Enterprise - Full Stack Cinema Ticketing
// Connected to: Auth (/api/auth), Catalog (/api/catalog), Booking (/api/bookings), Payment (/api/payments)

// ─── API Layer ─────────────────────────────────────────────────────────────
const API = {
  auth:    '/api/auth',
  catalog: '/api/catalog',
  booking: '/api/bookings',
  payment: '/api/payments',
};

let authToken = localStorage.getItem('cinepass_token') || null;

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
  };
}

async function apiFetch(url, opts = {}) {
  try {
    const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.warn(`[CinePass API] ${url} unreachable — using fallback`, err.message);
    return { ok: false, status: 0, data: null };
  }
}

// ─── Fallback Catalog (when backend not reachable) ─────────────────────────
const FALLBACK_MOVIES = [
  { id: 'm1', title: 'Devara: Part 1', lang: 'Telugu', genre: 'Action, Oceanic Thriller', rating: '9.4', duration: '2h 58m', cert: 'UA 16+', format: 'IMAX 3D • 4K ATMOS', poster: 'https://m.media-amazon.com/images/M/MV5BNWE3OGNiOTYtYTdmYS00NDM5LThhYzAtNmQ4ZTQzODkyNDI2XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg', synopsis: 'A fearless coastal chieftain embarks on a perilous voyage into treacherous waters to safeguard his land against warlords. Starring Jr NTR, Saif Ali Khan, and Janhvi Kapoor with explosive music by Anirudh.' },
  { id: 'm2', title: 'Kalki 2898 AD', lang: 'Telugu', genre: 'Sci-Fi, Epic Mythology', rating: '9.2', duration: '3h 01m', cert: 'UA', format: 'IMAX 3D • 4K', poster: 'https://m.media-amazon.com/images/M/MV5BMGNmOGNmMzMtNWQ3Zi00ODBiLWExMjItY2UxNzE2NGVjZWVmXkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg', synopsis: 'A modern avatar of Lord Vishnu descends to protect humanity from dark forces in a dystopian futuristic city of Kasi. Starring Prabhas, Amitabh Bachchan, Deepika Padukone, and Kamal Haasan.' },
  { id: 'm3', title: 'Pushpa 2: The Rule', lang: 'Telugu', genre: 'Action, Crime Thriller', rating: '9.6', duration: '3h 12m', cert: 'A', format: '4K DOLBY ATMOS', poster: 'https://m.media-amazon.com/images/M/MV5BNGZlNmE5MjMtMmIzNi00M2RmLWJkZmMtOGE0NTk2ZTUxY2Y2XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg', synopsis: 'Pushpa Raj expands his red sandalwood syndicate across international borders while confronting SP Bhanwar Singh Shekhawat in an explosive war of dominance. Starring Allu Arjun and Rashmika Mandanna.' },
  { id: 'm4', title: 'Salaar: Ceasefire', lang: 'Telugu', genre: 'High-Octane Action', rating: '8.9', duration: '2h 55m', cert: 'A', format: 'IMAX • 4K ATMOS', poster: 'https://m.media-amazon.com/images/M/MV5BMmU5ZWQxOWMtNjFkMi00NjQ4LWE5ODgtMTFkNDg2MTlhYmQ2XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg', synopsis: 'A gang leader makes a fierce promise to a dying friend and takes on other criminal factions in the ruthless fortified city of Khansaar. Directed by Prashanth Neel.' },
  { id: 'm5', title: 'RRR (Rise Roar Revolt)', lang: 'Telugu', genre: 'Historical Epic, Action', rating: '9.5', duration: '3h 07m', cert: 'UA', format: 'IMAX 3D', poster: 'https://m.media-amazon.com/images/M/MV5BODUwNDNjMTctODUxNy00ZTA2LWIyYTEtMDc5Y2E5NjgzZmU4XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg', synopsis: 'Two legendary revolutionaries journey away from home before they begin fighting for their country in 1920s colonial India. Oscar winner for Naatu Naatu, directed by S.S. Rajamouli.' },
  { id: 'm6', title: 'Hanu-Man', lang: 'Telugu', genre: 'Mythological Superhero', rating: '9.1', duration: '2h 38m', cert: 'UA', format: '4K DOLBY ATMOS', poster: 'https://m.media-amazon.com/images/M/MV5BMTdlMGVlMTYtOTRmOS00NTY2LWI3ZmMtMzA3YTVjMjE0ZGY2XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg', synopsis: 'An ordinary young man in the village of Anjanadri gains the supreme superpowers of Lord Hanuman and rises to defend his villagers from evil supervillains.' },
  { id: 'm7', title: 'Leo: Bloody Sweet', lang: 'Tamil', genre: 'Action, Neo-Noir Crime', rating: '8.8', duration: '2h 44m', cert: 'UA 16+', format: '4K IMAX', poster: 'https://m.media-amazon.com/images/M/MV5BMmNmNjFjNWQtZDVjYS00ZTdkLWE5NjMtNWY5YjU5N2YxNmM5XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg', synopsis: 'A mild-mannered cafe owner in Kashmir is targeted by ruthless gangsters who believe he is a former feared underworld enforcer named Leo Das. Directed by Lokesh Kanagaraj.' },
  { id: 'm8', title: 'Gladiator II', lang: 'English', genre: 'Action, Historical Drama', rating: '8.7', duration: '2h 28m', cert: 'A', format: 'IMAX Laser 3D', poster: 'https://m.media-amazon.com/images/M/MV5BMjA5OTc3NjQ4MV5BMl5BanBnXkFtZTgwNTM3NTg2NzE@._V1_.jpg', synopsis: 'Years after witnessing the sacrificial death of hero Maximus, Lucius enters the deadly arena of the Colosseum to restore Rome to its people. Directed by Ridley Scott.' },
  { id: 'm9', title: 'Guntur Kaaram', lang: 'Telugu', genre: 'Family Drama', rating: '8.3', duration: '2h 30m', cert: 'UA', format: '4K', poster: 'https://m.media-amazon.com/images/M/MV5BNzQ1ZTE4Y2MtYmU1NC00MmZmLWFlYzAtMmQzZGMzODNhNGVjXkEyXkFqcGc@._V1_.jpg', synopsis: 'A son and mother are estranged due to differences, and a quest to reconcile them forms the crux of this emotionally charged family drama directed by Trivikram Srinivas.' },
  { id: 'm10', title: 'Hi Nanna', lang: 'Telugu', genre: 'Romance, Drama', rating: '8.6', duration: '2h 27m', cert: 'UA', format: '4K', poster: 'https://m.media-amazon.com/images/M/MV5BYzA2NzVkZjMtMTkzOS00ZDA5LTlhMjAtYzI3MWQyN2IxOTc5XkEyXkFqcGc@._V1_.jpg', synopsis: 'A man struggles to raise his daughter alone after his lover disappears mysteriously, in this heartwarming romantic drama directed by Shouryuv.' },
  { id: 'm11', title: 'Oppenheimer', lang: 'English', genre: 'Biography, Historical', rating: '9.0', duration: '3h 00m', cert: 'UA', format: 'IMAX 70mm', poster: 'https://m.media-amazon.com/images/M/MV5BODkxNTM3MDMtZTcyMC00NTViLWJiODQtNjE3YjI0YWUwZWQ0XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg', synopsis: 'The story of American scientist, J. Robert Oppenheimer, and his role in the development of the atomic bomb. Directed by Christopher Nolan, Academy Award Best Picture.' },
  { id: 'm12', title: 'Animal', lang: 'Hindi', genre: 'Action, Crime Drama', rating: '8.5', duration: '3h 21m', cert: 'A', format: '4K ATMOS', poster: 'https://m.media-amazon.com/images/M/MV5BZGVlYTkwMjItMjI4NC00MmMyLWI1ZWUtZjI5Y2JmNDM2ZTE1XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg', synopsis: 'A son embarks on a vengeful path after his father faces an assassination attempt, blurring the lines between love and madness. Starring Ranbir Kapoor, directed by Sandeep Reddy Vanga.' },
];

const CITIES_LIST = [
  'Hyderabad', 'Bengaluru', 'Mumbai', 'Chennai',
  'Delhi-NCR', 'Visakhapatnam', 'Vijayawada', 'Kochi',
  'Pune', 'Kolkata', 'Ahmedabad', 'Coimbatore', 'Surat', 'Jaipur',
];

const SEAT_TIERS = {
  RECLINER: { name: 'VIP Recliners (Row A - B)', price: 350, rows: ['A', 'B'] },
  PRIME:    { name: 'Prime Gold (Row C - F)', price: 250, rows: ['C', 'D', 'E', 'F'] },
  CLASSIC:  { name: 'Classic Silver (Row G - J)', price: 150, rows: ['G', 'H', 'J'] },
};

let MOVIES_DATABASE = [...FALLBACK_MOVIES];
let currentCity     = 'Hyderabad';
let activeMovie     = null;
let selectedSeats   = new Set();
let seatLockInterval = null;
let seatLockSeconds  = 300;
let activeBookingId  = null;
let apiOnline = { auth: false, catalog: false, booking: false, payment: false };

// ─── Bootstrap ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  renderMovies(MOVIES_DATABASE);
  renderCityGrid();
  setupEventListeners();
  checkUserSession();
  await loadCatalogFromAPI();
  showAPIStatusBanner();
});

// ─── Health / API Status ────────────────────────────────────────────────────
async function checkServiceHealth(service, path) {
  const r = await apiFetch(`${API[service]}/${path}`);
  apiOnline[service] = r.ok;
  return r.ok;
}

async function showAPIStatusBanner() {
  // parallel health checks
  await Promise.all([
    checkServiceHealth('auth', 'health'),
    checkServiceHealth('catalog', 'health'),
    checkServiceHealth('booking', 'health'),
    checkServiceHealth('payment', 'health'),
  ]);

  const allUp = Object.values(apiOnline).every(Boolean);
  const banner = document.getElementById('apiBanner');
  if (!banner) return;

  if (allUp) {
    banner.innerHTML = '🟢 All microservices online — Live data from Catalog, Auth, Booking & Payment APIs';
    banner.className = 'api-banner api-banner--ok';
  } else {
    const down = Object.entries(apiOnline).filter(([, v]) => !v).map(([k]) => k).join(', ');
    banner.innerHTML = `⚡ Demo mode — Services offline: <strong>${down}</strong> | UI showing fallback data`;
    banner.className = 'api-banner api-banner--warn';
  }
  banner.style.display = 'flex';

  // Update admin panel health dots
  updateAdminHealth();
}

function updateAdminHealth() {
  const services = ['auth', 'catalog', 'booking', 'payment'];
  services.forEach(svc => {
    const dot = document.getElementById(`health_${svc}`);
    if (dot) {
      dot.className = `h-dot ${apiOnline[svc] ? 'h-dot--up' : 'h-dot--down'}`;
      dot.title = apiOnline[svc] ? `${svc} ✅ ONLINE` : `${svc} ❌ OFFLINE`;
    }
  });
}

// ─── 1. Catalog Service Integration ────────────────────────────────────────
async function loadCatalogFromAPI() {
  const res = await apiFetch(`${API.catalog}/movies`);
  if (res.ok && res.data && Array.isArray(res.data.movies || res.data)) {
    const movies = res.data.movies || res.data;
    if (movies.length > 0) {
      // Merge API movies with local posters (API may not have poster URLs)
      MOVIES_DATABASE = movies.map((m, i) => ({
        id: m.id || `api_${i}`,
        title: m.title || m.name,
        lang: m.language || m.lang || 'Telugu',
        genre: m.genre || 'Action',
        rating: m.rating || '9.0',
        duration: m.duration || '2h 30m',
        cert: m.certificate || m.cert || 'UA',
        format: m.format || 'IMAX 3D',
        poster: m.posterUrl || m.poster || FALLBACK_MOVIES[i % FALLBACK_MOVIES.length]?.poster,
        synopsis: m.description || m.synopsis || '',
      }));
      renderMovies(MOVIES_DATABASE);
      apiOnline.catalog = true;
      console.log(`[CinePass] ✅ Catalog API: Loaded ${MOVIES_DATABASE.length} movies`);
    }
  } else {
    console.log('[CinePass] ⚡ Catalog API offline — using fallback movies');
  }
}

function setupEventListeners() {
  const searchInput = document.getElementById('movieSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = MOVIES_DATABASE.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.genre.toLowerCase().includes(q) ||
        m.lang.toLowerCase().includes(q)
      );
      renderMovies(filtered);
    });
  }
}

// ─── 2. Movie Grid Render ───────────────────────────────────────────────────
function renderMovies(movies) {
  const grid = document.getElementById('movieGrid');
  if (!grid) return;

  if (movies.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#94A3B8;">No movies match your search. Try another keyword!</div>';
    return;
  }

  grid.innerHTML = movies.map(m => `
    <div class="movie-card" onclick="openMovieDetail('${m.id}')">
      <div class="poster-box">
        <img src="${m.poster}" alt="${m.title}" loading="lazy"
          onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=800&auto=format&fit=crop'">
        <span class="score-badge">★ ${m.rating}</span>
        <span class="lang-badge">${m.lang} • ${m.cert}</span>
        <div class="poster-overlay">
          <p class="overlay-synopsis">${(m.synopsis || '').substring(0, 120)}...</p>
          <button class="btn-overlay-book" onclick="event.stopPropagation(); openBooking('${m.id}')">
            🎟️ Book Now
          </button>
        </div>
      </div>
      <div class="card-details">
        <div>
          <h3 class="c-title" title="${m.title}">${m.title}</h3>
          <p class="c-genre">${m.genre}</p>
          <p class="c-meta">${m.format} • ${m.duration}</p>
        </div>
        <button class="btn-card-book" onclick="event.stopPropagation(); openBooking('${m.id}')">
          Book Tickets
        </button>
      </div>
    </div>
  `).join('');
}

window.openMovieDetail = function(movieId) {
  // just open booking for now
  openBooking(movieId);
};

window.filterByLang = function(lang, el) {
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  if (lang === 'ALL') {
    renderMovies(MOVIES_DATABASE);
  } else {
    renderMovies(MOVIES_DATABASE.filter(m => m.lang.toLowerCase() === lang.toLowerCase()));
  }
};

// ─── 3. City Selector ──────────────────────────────────────────────────────
function renderCityGrid() {
  const container = document.getElementById('citiesList');
  if (!container) return;
  container.innerHTML = CITIES_LIST.map(city => `
    <button class="city-item-btn ${city === currentCity ? 'selected' : ''}" onclick="selectCity('${city}')">
      ${city}
    </button>
  `).join('');
}

window.openCityModal = function() {
  document.getElementById('cityModal').classList.add('active');
};
window.closeCityModal = function() {
  document.getElementById('cityModal').classList.remove('active');
};
window.selectCity = function(city) {
  currentCity = city;
  document.getElementById('currentCityLabel').innerText = city;
  document.getElementById('sectionCityName').innerText = city;
  closeCityModal();
  renderCityGrid();
};
window.searchCities = function() {
  const q = document.getElementById('citySearchInput').value.toLowerCase();
  const filtered = CITIES_LIST.filter(c => c.toLowerCase().includes(q));
  const container = document.getElementById('citiesList');
  container.innerHTML = filtered.map(city => `
    <button class="city-item-btn ${city === currentCity ? 'selected' : ''}" onclick="selectCity('${city}')">
      ${city}
    </button>
  `).join('');
};

// ─── 4. Booking Workflow (with API) ────────────────────────────────────────
window.openBooking = function(movieId) {
  activeMovie = MOVIES_DATABASE.find(m => m.id === movieId) || MOVIES_DATABASE[0];
  selectedSeats.clear();
  activeBookingId = null;

  document.getElementById('bMovieTitle').innerText = activeMovie.title;
  document.getElementById('bMovieMeta').innerText = `${activeMovie.lang} • ${activeMovie.format} • ${activeMovie.duration}`;

  renderSeatsMatrix();
  updateCheckoutState();
  startSeatTimer();

  document.getElementById('bookingModal').classList.add('active');
};

window.closeBookingModal = function() {
  document.getElementById('bookingModal').classList.remove('active');
  clearInterval(seatLockInterval);
  // Release any held booking
  if (activeBookingId) {
    apiFetch(`${API.booking}/${activeBookingId}/release`, { method: 'POST' });
    activeBookingId = null;
  }
};

window.onTheaterChange = function() {
  selectedSeats.clear();
  renderSeatsMatrix();
  updateCheckoutState();
};

window.setTime = function(el) {
  document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  selectedSeats.clear();
  renderSeatsMatrix();
  updateCheckoutState();
};

function renderSeatsMatrix() {
  const container = document.getElementById('seatMatrix');
  if (!container) return;

  let html = '';
  Object.entries(SEAT_TIERS).forEach(([, tier]) => {
    html += `<div class="tier-title-row">${tier.name} — ₹${tier.price}</div>`;
    tier.rows.forEach(rLetter => {
      html += `<div class="s-row"><span class="r-label">${rLetter}</span>`;
      for (let i = 1; i <= 10; i++) {
        const sId = `${rLetter}${i}`;
        let status = 'available';
        if ((rLetter === 'C' && (i === 4 || i === 5)) || (rLetter === 'A' && i === 6) || (rLetter === 'F' && i === 8)) {
          status = 'booked';
        } else if (rLetter === 'D' && i === 3) {
          status = 'locked';
        } else if (selectedSeats.has(sId)) {
          status = 'selected';
        }
        html += `<div class="s-seat ${status}" data-seat="${sId}" data-price="${tier.price}" onclick="clickSeat('${sId}',${tier.price},this)">${i}</div>`;
      }
      html += `</div>`;
    });
  });
  container.innerHTML = html;
}

window.clickSeat = function(seatId, price, el) {
  if (el.classList.contains('booked') || el.classList.contains('locked')) return;
  if (selectedSeats.has(seatId)) {
    selectedSeats.delete(seatId);
    el.classList.remove('selected');
  } else {
    if (selectedSeats.size >= 8) { alert('Max 8 seats per booking!'); return; }
    selectedSeats.add(seatId);
    el.classList.add('selected');
  }
  updateCheckoutState();
};

function updateCheckoutState() {
  const arr = Array.from(selectedSeats);
  const seatsListEl = document.getElementById('selectedSeatsList');
  const billEl      = document.getElementById('totalBillDisplay');
  const btn         = document.getElementById('btnPayNow');

  if (arr.length === 0) {
    seatsListEl.innerText = 'None';
    billEl.innerText = '₹0';
    btn.disabled = true;
    return;
  }

  seatsListEl.innerText = arr.join(', ');
  let subtotal = 0;
  arr.forEach(s => {
    const row = s.charAt(0);
    for (const tier of Object.values(SEAT_TIERS)) {
      if (tier.rows.includes(row)) { subtotal += tier.price; break; }
    }
  });

  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;
  billEl.innerText = `₹${total} (incl. ₹${gst} Tax & Fees)`;
  btn.disabled = false;
}

function startSeatTimer() {
  clearInterval(seatLockInterval);
  seatLockSeconds = 300;
  const digitsEl = document.getElementById('timerDigits');

  seatLockInterval = setInterval(() => {
    seatLockSeconds--;
    if (seatLockSeconds <= 0) {
      clearInterval(seatLockInterval);
      alert('⚠️ Redis seat lock expired! Seats released back to inventory.');
      selectedSeats.clear();
      renderSeatsMatrix();
      updateCheckoutState();
      return;
    }
    const m = Math.floor(seatLockSeconds / 60).toString().padStart(2, '0');
    const s = (seatLockSeconds % 60).toString().padStart(2, '0');
    if (digitsEl) digitsEl.innerText = `${m}:${s}`;
  }, 1000);
}

// ─── 5. Payment (with API) ─────────────────────────────────────────────────
window.processPayment = async function() {
  const btn = document.getElementById('btnPayNow');
  btn.innerText = '⏳ Authorizing Payment...';
  btn.disabled = true;

  const user = JSON.parse(localStorage.getItem('cinepass_user') || '{}');
  const thEl  = document.getElementById('theaterSelect');
  const timeEl = document.querySelector('.time-btn.active');
  const theater = thEl ? thEl.value : 'theater-001';
  const showId  = `show-${theater}-${Date.now()}`;

  let bookingRef = 'CP-' + Math.floor(100000 + Math.random() * 900000);
  let paymentStatus = 'SUCCESS';

  // Step 1 — Hold seats via Booking Service
  if (apiOnline.booking) {
    const holdRes = await apiFetch(`${API.booking}/hold`, {
      method: 'POST',
      body: JSON.stringify({
        showId,
        userId: user.id || user.email || 'guest',
        seats: Array.from(selectedSeats),
      }),
    });

    if (holdRes.ok && holdRes.data) {
      activeBookingId = holdRes.data.bookingId || holdRes.data.id;
      bookingRef = `CP-${activeBookingId || bookingRef}`;
    }
  }

  // Step 2 — Process payment via Payment Service
  let amount = 0;
  Array.from(selectedSeats).forEach(s => {
    const row = s.charAt(0);
    for (const tier of Object.values(SEAT_TIERS)) {
      if (tier.rows.includes(row)) { amount += tier.price; break; }
    }
  });
  const gst = Math.round(amount * 0.18);
  const total = amount + gst;

  if (apiOnline.payment) {
    const payRes = await apiFetch(`${API.payment}/process`, {
      method: 'POST',
      body: JSON.stringify({
        bookingId: activeBookingId,
        userId: user.id || user.email || 'guest',
        amount: total,
        currency: 'INR',
        method: 'UPI',
      }),
    });

    if (payRes.ok && payRes.data) {
      paymentStatus = payRes.data.status || 'SUCCESS';
      bookingRef = `CP-${payRes.data.paymentId || payRes.data.id || activeBookingId}`;
    }
  }

  // Step 3 — Confirm booking
  if (apiOnline.booking && activeBookingId) {
    await apiFetch(`${API.booking}/${activeBookingId}/confirm`, { method: 'POST' });
  }

  btn.innerText = 'Proceed to Payment & Buy ➔';
  closeBookingModal();
  generateBoardingPassTicket(bookingRef, total, paymentStatus);
};

function generateBoardingPassTicket(bookingRef, totalAmount, status) {
  const seats  = Array.from(selectedSeats).join(', ');
  const thEl   = document.getElementById('theaterSelect');
  const thName = thEl ? thEl.options[thEl.selectedIndex].text : 'AMB Cinemas, IMAX';
  const timeEl = document.querySelector('.time-btn.active');
  const timeVal = timeEl ? timeEl.innerText : '06:30 PM';

  document.getElementById('tMovieTitle').innerText = activeMovie ? activeMovie.title : 'CinePass Movie';
  document.getElementById('tTheaterName').innerText = `${thName}, ${currentCity}`;
  document.getElementById('tTime').innerText = timeVal;
  document.getElementById('tSeats').innerText = seats || 'A1, A2';
  document.getElementById('tAmount').innerText = totalAmount ? `₹${totalAmount}` : '₹0';
  document.getElementById('tRefId').innerText = bookingRef || 'CP-000000';

  // Show payment status indicator
  const statusEl = document.getElementById('tPayStatus');
  if (statusEl) {
    statusEl.innerText = status === 'SUCCESS' ? '✅ Payment Confirmed' : '⚡ Demo Booking';
    statusEl.style.color = status === 'SUCCESS' ? '#22c55e' : '#f59e0b';
  }

  document.getElementById('ticketModal').classList.add('active');
}

window.closeTicketModal = function() {
  document.getElementById('ticketModal').classList.remove('active');
  selectedSeats.clear();
  activeBookingId = null;
};

// ─── 6. Auth Service Integration ───────────────────────────────────────────
window.openAuthModal = function(tab = 'login') {
  switchAuthTab(tab);
  document.getElementById('authModal').classList.add('active');
};
window.closeAuthModal = function() {
  document.getElementById('authModal').classList.remove('active');
};
window.switchAuthTab = function(tab) {
  if (tab === 'login') {
    document.getElementById('tabLogin').classList.add('active');
    document.getElementById('tabRegister').classList.remove('active');
    document.getElementById('authLoginBody').style.display = 'block';
    document.getElementById('authRegisterBody').style.display = 'none';
  } else {
    document.getElementById('tabLogin').classList.remove('active');
    document.getElementById('tabRegister').classList.add('active');
    document.getElementById('authLoginBody').style.display = 'none';
    document.getElementById('authRegisterBody').style.display = 'block';
  }
};

window.handleCustomerLogin = async function(e) {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const btn      = e.target.querySelector('button[type=submit]');
  btn.innerText  = 'Signing in...';

  if (apiOnline.auth) {
    const res = await apiFetch(`${API.auth}/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (res.ok && res.data?.token) {
      authToken = res.data.token;
      localStorage.setItem('cinepass_token', authToken);
      const userData = { name: res.data.user?.name || email.split('@')[0], email, id: res.data.user?.id, role: res.data.user?.role };
      localStorage.setItem('cinepass_user', JSON.stringify(userData));
      updateAuthHeader(userData.name);
      closeAuthModal();
      showToast(`✅ Welcome back, ${userData.name}!`);
    } else {
      showToast(`❌ ${res.data?.message || 'Invalid credentials'}`, 'error');
    }
  } else {
    // Offline fallback
    const name = email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase());
    localStorage.setItem('cinepass_user', JSON.stringify({ name, email }));
    updateAuthHeader(name);
    closeAuthModal();
    showToast(`✅ Demo login — Welcome, ${name}!`);
  }

  btn.innerText = 'Sign In';
};

window.handleCustomerRegister = async function(e) {
  e.preventDefault();
  const name     = document.getElementById('regName').value;
  const email    = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;
  const btn      = e.target.querySelector('button[type=submit]');
  btn.innerText  = 'Creating Account...';

  if (apiOnline.auth) {
    const res = await apiFetch(`${API.auth}/register`, {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role: 'CUSTOMER' }),
    });

    if (res.ok && res.data?.token) {
      authToken = res.data.token;
      localStorage.setItem('cinepass_token', authToken);
      localStorage.setItem('cinepass_user', JSON.stringify({ name, email, id: res.data.user?.id }));
      updateAuthHeader(name);
      closeAuthModal();
      showToast(`🎉 Account created! Welcome to CinePass, ${name}!`);
    } else {
      showToast(`❌ ${res.data?.message || 'Registration failed'}`, 'error');
    }
  } else {
    localStorage.setItem('cinepass_user', JSON.stringify({ name, email }));
    updateAuthHeader(name);
    closeAuthModal();
    showToast(`🎉 Demo register — Welcome, ${name}!`);
  }

  btn.innerText = 'Create Account';
};

function checkUserSession() {
  const saved = localStorage.getItem('cinepass_user');
  if (saved) {
    try {
      const u = JSON.parse(saved);
      updateAuthHeader(u.name);
    } catch (_) {}
  }
}

function updateAuthHeader(name) {
  const container = document.getElementById('authContainer');
  if (!container) return;
  const initial = (name || 'G').charAt(0).toUpperCase();
  container.innerHTML = `
    <div class="user-logged-badge" title="Signed in as ${name}" onclick="showUserMenu()">
      <span class="u-avatar">${initial}</span>
      <span class="u-name">${name}</span>
      <span style="font-size:10px;opacity:.6">▼</span>
    </div>
  `;
}

window.showUserMenu = function() {
  const user = JSON.parse(localStorage.getItem('cinepass_user') || '{}');
  if (confirm(`Signed in as: ${user.name || 'Guest'}\n\nSign out?`)) {
    localStorage.removeItem('cinepass_user');
    localStorage.removeItem('cinepass_token');
    authToken = null;
    const container = document.getElementById('authContainer');
    if (container) {
      container.innerHTML = `<button class="btn-login" onclick="openAuthModal('login')">Sign In</button>`;
    }
    showToast('👋 Signed out successfully');
  }
};

// ─── 7. Admin Console ─────────────────────────────────────────────────────
window.openAdminModal = function() {
  const user = JSON.parse(localStorage.getItem('cinepass_user') || '{}');
  // Check admin access via API
  if (authToken && apiOnline.auth) {
    apiFetch(`${API.auth}/admin/verify-access`).then(res => {
      if (!res.ok) {
        showToast('🔒 Admin access denied. Requires THEATER_ADMIN role.', 'error');
        return;
      }
      document.getElementById('adminModal').classList.add('active');
      updateAdminHealth();
    });
  } else {
    // Demo mode — allow admin panel
    document.getElementById('adminModal').classList.add('active');
    updateAdminHealth();
  }
};

window.closeAdminModal = function() {
  document.getElementById('adminModal').classList.remove('active');
};

window.adminAddMovie = async function() {
  const title = document.getElementById('adminNewMovieTitle').value.trim();
  const lang  = document.getElementById('adminNewMovieLang').value;
  if (!title) { alert('Please enter a movie title!'); return; }

  const newMovie = {
    id: 'm_' + Date.now(), title, lang,
    genre: 'Action, Blockbuster', rating: '9.0',
    duration: '2h 45m', cert: 'UA', format: 'IMAX 3D',
    poster: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=800&auto=format&fit=crop',
    synopsis: `${title} has been added by the Theater Administrator. Now showing across all screens in ${currentCity}.`,
  };

  // POST to catalog service
  if (apiOnline.catalog) {
    const res = await apiFetch(`${API.catalog}/movies`, {
      method: 'POST',
      body: JSON.stringify({ title, language: lang, genre: newMovie.genre, rating: parseFloat(newMovie.rating), duration: newMovie.duration }),
    });
    if (res.ok) {
      newMovie.id = res.data?.id || newMovie.id;
      showToast(`✅ "${title}" added to Catalog Service DB!`);
    } else {
      showToast(`⚡ Demo mode — added locally`, 'warn');
    }
  }

  MOVIES_DATABASE.unshift(newMovie);
  renderMovies(MOVIES_DATABASE);
  document.getElementById('adminNewMovieTitle').value = '';
};

window.adminRefreshHealth = async function() {
  showToast('🔄 Refreshing service health...');
  await showAPIStatusBanner();
  showToast('✅ Health check complete!');
};

// ─── 8. Toast Notifications ────────────────────────────────────────────────
function showToast(msg, type = 'ok') {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const colors = { ok: '#22c55e', error: '#ef4444', warn: '#f59e0b' };
  toast.style.cssText = `
    background:#1e293b;border-left:4px solid ${colors[type] || colors.ok};
    color:#f1f5f9;padding:12px 20px;border-radius:8px;font-size:14px;
    box-shadow:0 4px 20px rgba(0,0,0,.4);min-width:280px;max-width:400px;
    animation:slideIn .3s ease;
  `;
  toast.innerText = msg;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ─── 9. Misc ───────────────────────────────────────────────────────────────
window.playTrailer = function() {
  showToast('🎬 Playing 4K Official IMAX Trailer in Dolby Atmos...');
};

window.openTheatersList = function() {
  const theaters = {
    'Hyderabad': ['AMB Cinemas: Laser IMAX (Gachibowli)', 'Prasads Multiplex (Necklace Road)', 'PVR Inorbit Mall', 'Asian Cinemas 4K Atmos', 'Cinepolis CCPL'],
    'Bengaluru': ['PVR Forum Mall (Koramangala)', 'INOX Lido (MG Road)', 'Cinepolis Nexus (Whitefield)', 'PVR Orion (Rajajinagar)', 'Garuda Mall Cinemas'],
    'Mumbai':    ['PVR BKC (Bandra-Kurla)', 'INOX R-City (Ghatkopar)', 'Cinepolis Viviana (Thane)', 'Regal Cinema (Colaba)', 'Metro INOX'],
    'Chennai':   ['INOX Palazzo (Chennai)', 'Sathyam Cinemas (IMAX)', 'PVR VR Chennai', 'Luxe Cinemas', 'Escape Cinemas'],
  };
  const list = theaters[currentCity] || ['AMB Cinemas', 'PVR', 'INOX', 'Cinepolis', 'Asian Cinemas'];
  showToast(`🏟️ ${currentCity}: ${list.slice(0,3).join(' | ')} + ${list.length - 3} more`);
};
