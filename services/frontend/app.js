// CinePass Enterprise Interactive Cinema State Engine

const MOVIES_DATABASE = [
  {
    id: 'm1',
    title: 'Devara: Part 1',
    genre: ['Action', 'Drama'],
    rating: '⭐ 9.2',
    language: 'Telugu • Hindi • English',
    duration: '2h 58m',
    cert: 'UA 16+',
    format: 'IMAX 3D • 4K ATMOS',
    poster: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=800&auto=format&fit=crop',
    backdrop: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1920&auto=format&fit=crop',
    description: 'A fearless coastal chieftain embarks on a heroic voyage across turbulent seas to protect his land.'
  },
  {
    id: 'm2',
    title: 'Kalki 2898 AD',
    genre: ['Sci-Fi', 'Action'],
    rating: '⭐ 9.0',
    language: 'Telugu • Hindi • Tamil',
    duration: '3h 01m',
    cert: 'UA',
    format: 'IMAX 3D',
    poster: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=800&auto=format&fit=crop',
    description: 'A modern avatar of Vishnu descends to protect humanity from dark forces in a dystopian futuristic Kasi.'
  },
  {
    id: 'm3',
    title: 'Gladiator II',
    genre: ['Action', 'Drama'],
    rating: '⭐ 8.7',
    language: 'English • Hindi',
    duration: '2h 30m',
    cert: 'A',
    format: '4K LASER',
    poster: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?q=80&w=800&auto=format&fit=crop',
    description: 'Years after witnessing the fall of Maximus, Lucius enters the Colosseum to restore Rome’s lost glory.'
  },
  {
    id: 'm4',
    title: 'Interstellar (10th Anniversary IMAX)',
    genre: ['Sci-Fi', 'Drama'],
    rating: '⭐ 9.4',
    language: 'English',
    duration: '2h 49m',
    cert: 'UA',
    format: '70MM IMAX',
    poster: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800&auto=format&fit=crop',
    description: 'A team of brave explorers journey through a wormhole in search of a new habitable home for mankind.'
  }
];

const SEAT_TIERS = {
  RECLINER: { name: 'VIP Recliners', price: 350, rows: ['A', 'B'] },
  PRIME: { name: 'Prime Gold', price: 250, rows: ['C', 'D', 'E', 'F'] },
  CLASSIC: { name: 'Classic Silver', price: 150, rows: ['G', 'H', 'J'] }
};

let currentMovie = null;
let selectedSeats = new Set();
let timerInterval = null;
let timeRemaining = 300; // 5 minutes seat lock

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  renderCatalog('all');
  setupEventListeners();
  setupClusterHealthDrawer();
});

function setupEventListeners() {
  // Genre Filter Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderCatalog(e.target.dataset.genre);
    });
  });

  // Movie Search
  const searchInput = document.getElementById('movieSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = MOVIES_DATABASE.filter(m => 
        m.title.toLowerCase().includes(q) || 
        m.genre.some(g => g.toLowerCase().includes(q))
      );
      renderMoviesList(filtered);
    });
  }

  // Cluster Health Button
  const btnClusterHealth = document.getElementById('btnClusterHealth');
  if (btnClusterHealth) {
    btnClusterHealth.addEventListener('click', toggleClusterDrawer);
  }
}

function renderCatalog(genreFilter = 'all') {
  const filtered = genreFilter === 'all' 
    ? MOVIES_DATABASE 
    : MOVIES_DATABASE.filter(m => m.genre.includes(genreFilter));
  renderMoviesList(filtered);
}

function renderMoviesList(movies) {
  const grid = document.getElementById('moviesGrid');
  if (!grid) return;

  grid.innerHTML = movies.map(movie => `
    <div class="movie-card">
      <div class="poster-box">
        <img src="${movie.poster}" alt="${movie.title}">
        <span class="card-rating-badge">${movie.rating}</span>
      </div>
      <div class="card-info">
        <div>
          <h3 class="card-title">${movie.title}</h3>
          <p class="card-meta">${movie.format} • ${movie.duration}</p>
          <div class="genre-tags">
            ${movie.genre.map(g => `<span class="genre-pill">${g}</span>`).join('')}
          </div>
        </div>
        <button class="btn-book-card" onclick="openBookingModal('${movie.id}')">
          Book Seats ➔
        </button>
      </div>
    </div>
  `).join('');
}

// Open Booking Modal
window.openBookingModal = function(movieId) {
  currentMovie = MOVIES_DATABASE.find(m => m.id === movieId) || MOVIES_DATABASE[0];
  selectedSeats.clear();

  document.getElementById('modalMovieTitle').innerText = currentMovie.title;
  document.getElementById('modalMovieMeta').innerText = `${currentMovie.format} • ${currentMovie.duration} • ${currentMovie.language}`;
  
  renderSeats();
  updateCheckoutBar();
  startSeatLockTimer();

  document.getElementById('bookingModal').classList.add('active');
};

window.closeBookingModal = function() {
  document.getElementById('bookingModal').classList.remove('active');
  clearInterval(timerInterval);
};

window.selectShowtime = function(el) {
  document.querySelectorAll('.time-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  selectedSeats.clear();
  renderSeats();
  updateCheckoutBar();
};

// Render Seat Grid
function renderSeats() {
  const container = document.getElementById('seatMap');
  if (!container) return;

  let html = '';

  Object.entries(SEAT_TIERS).forEach(([tierKey, tier]) => {
    html += `<div class="seat-tier-header">${tier.name} — ₹${tier.price}</div>`;

    tier.rows.forEach(rowLetter => {
      html += `<div class="seat-row">`;
      html += `<span class="row-label">${rowLetter}</span>`;

      for (let i = 1; i <= 10; i++) {
        const seatId = `${rowLetter}${i}`;
        let status = 'available';

        // Pre-simulate some booked & locked seats for realistic experience
        if ((rowLetter === 'C' && (i === 3 || i === 8)) || (rowLetter === 'A' && i === 5)) {
          status = 'booked';
        } else if (rowLetter === 'D' && i === 2) {
          status = 'locked';
        } else if (selectedSeats.has(seatId)) {
          status = 'selected';
        }

        html += `
          <div class="seat ${status}" 
               data-seat="${seatId}" 
               data-price="${tier.price}"
               onclick="toggleSeat('${seatId}', ${tier.price}, this)">
            ${i}
          </div>
        `;
      }
      html += `</div>`;
    });
  });

  container.innerHTML = html;
}

window.toggleSeat = function(seatId, price, el) {
  if (el.classList.contains('booked') || el.classList.contains('locked')) {
    return;
  }

  if (selectedSeats.has(seatId)) {
    selectedSeats.delete(seatId);
    el.classList.remove('selected');
  } else {
    if (selectedSeats.size >= 6) {
      alert('You can select a maximum of 6 seats per transaction!');
      return;
    }
    selectedSeats.add(seatId);
    el.classList.add('selected');
  }

  updateCheckoutBar();
};

function updateCheckoutBar() {
  const seatsArr = Array.from(selectedSeats);
  const selectedText = document.getElementById('selectedSeatsText');
  const totalPriceEl = document.getElementById('totalPrice');
  const btnCheckout = document.getElementById('btnCheckout');

  if (seatsArr.length === 0) {
    selectedText.innerText = 'None';
    totalPriceEl.innerText = '₹0';
    btnCheckout.disabled = true;
    return;
  }

  selectedText.innerText = seatsArr.join(', ');

  // Calculate price based on tier
  let total = 0;
  seatsArr.forEach(seatId => {
    const row = seatId.charAt(0);
    for (const tier of Object.values(SEAT_TIERS)) {
      if (tier.rows.includes(row)) {
        total += tier.price;
        break;
      }
    }
  });

  totalPriceEl.innerText = `₹${total}`;
  btnCheckout.disabled = false;
}

function startSeatLockTimer() {
  clearInterval(timerInterval);
  timeRemaining = 300;
  const timerEl = document.getElementById('lockTimer');

  timerInterval = setInterval(() => {
    timeRemaining--;
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      alert('⚠️ Seat lock expired! The seats have been released back to the inventory pool.');
      selectedSeats.clear();
      renderSeats();
      updateCheckoutBar();
      return;
    }

    const mins = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const secs = (timeRemaining % 60).toString().padStart(2, '0');
    timerEl.innerText = `${mins}:${secs}`;
  }, 1000);
}

// Checkout & Boarding Pass Ticket
window.proceedToCheckout = function() {
  const btnCheckout = document.getElementById('btnCheckout');
  btnCheckout.innerText = '⏳ Processing with Payment Service...';
  btnCheckout.disabled = true;

  setTimeout(() => {
    btnCheckout.innerText = 'Proceed to Payment & Buy ➔';
    closeBookingModal();
    openTicketModal();
  }, 900);
};

function openTicketModal() {
  const seatsArr = Array.from(selectedSeats);
  const theaterSelect = document.getElementById('theaterSelect');
  const activeTimePill = document.querySelector('.time-pill.active');

  document.getElementById('ticketMovie').innerText = currentMovie ? currentMovie.title : 'Devara: Part 1';
  document.getElementById('ticketTheater').innerText = theaterSelect.options[theaterSelect.selectedIndex].text;
  document.getElementById('ticketTime').innerText = activeTimePill ? activeTimePill.innerText : '06:15 PM';
  document.getElementById('ticketSeats').innerText = seatsArr.join(', ');
  
  const totalPrice = document.getElementById('totalPrice').innerText;
  document.getElementById('ticketPaid').innerText = totalPrice;
  document.getElementById('ticketRef').innerText = 'CP-' + Math.floor(100000 + Math.random() * 900000);

  document.getElementById('ticketModal').classList.add('active');
}

window.closeTicketModal = function() {
  document.getElementById('ticketModal').classList.remove('active');
  selectedSeats.clear();
  updateCheckoutBar();
};

// Cluster Telemetry Drawer
window.toggleClusterDrawer = function() {
  const drawer = document.getElementById('clusterDrawer');
  drawer.classList.toggle('active');
};

function setupClusterHealthDrawer() {
  const services = [
    { name: 'Auth Service', port: 8080, proto: 'JWT / OAuth2', status: 'Healthy (2/2 Pods)' },
    { name: 'Catalog Service', port: 8081, proto: 'REST / PostgreSQL', status: 'Healthy (2/2 Pods)' },
    { name: 'Booking Service', port: 8082, proto: 'Redis Redlock', status: 'Healthy (2/2 Pods)' },
    { name: 'Payment Service', port: 8083, proto: 'Event Driven SQS', status: 'Healthy (2/2 Pods)' },
    { name: 'Notification Service', port: 8084, proto: 'Async SQS Consumer', status: 'Healthy (2/2 Pods)' }
  ];

  const listEl = document.getElementById('servicesStatusList');
  if (!listEl) return;

  listEl.innerHTML = services.map(s => `
    <div class="service-card">
      <div class="svc-info">
        <h4>${s.name}</h4>
        <span>Port ${s.port} • ${s.proto}</span>
      </div>
      <div class="svc-status">
        <span class="pulse-dot"></span>
        ${s.status}
      </div>
    </div>
  `).join('');
}
