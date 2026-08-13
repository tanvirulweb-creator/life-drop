/* ==========================================
   LIFE DROP
   Blood Donation & Donor Management System
   JavaScript (Connected to Express Backend)
   ========================================== */

// Helper functions for JWT authentication and session storage
function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

function getHeaders() {
  const token = getToken();
  return token ? {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  } : {
    'Content-Type': 'application/json'
  };
}

// Global Application State
let currentUser = getUser();
let donors = [];
let homeDonors = [];
let homeVisibleCount = 16;

// Initialize Application on Dom Content Loaded
document.addEventListener("DOMContentLoaded", function () {
  initApp();
});

async function initApp() {
  // Try to authenticate session on page load
  if (getToken()) {
    try {
      const res = await fetch('/api/auth/me', { headers: getHeaders() });
      if (res.ok) {
        currentUser = await res.json();
        localStorage.setItem('user', JSON.stringify(currentUser));
      } else {
        // Clear expired/invalid sessions
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        currentUser = null;
      }
    } catch (e) {
      console.error('Failed to verify authentication token:', e);
    }
  }

  updateNav();
  await fetchDonors();
  await fetchHomeDonors();
  
  // Set initial page from hash or default to home
  const initialPage = location.hash.slice(1) || "home";
  showPage(initialPage);
}

/* ================= ROUTING & SECURITY ================= */

const pages = [
  "home",
  "donors",
  "request",
  "about",
  "dashboard",
  "admin"
];

function showPage(id) {
  if (!pages.includes(id)) {
    id = "home";
  }

  // Auth Guard for Dashboard
  if (id === "dashboard" && !getToken()) {
    auth("login");
    return;
  }

  // Auth & Role Guard for Admin
  if (id === "admin") {
    if (!currentUser || currentUser.role !== 'admin') {
      toast("Admin access required.");
      showPage("home");
      return;
    }
  }

  // Activate Page
  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  const targetPage = document.getElementById(id);
  if (targetPage) {
    targetPage.classList.add("active");
  }

  // Scroll to top
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  // Toggle active class on nav links
  document.querySelectorAll("[data-page]").forEach(link => {
    link.classList.toggle(
      "active",
      link.dataset.page === id
    );
  });

  // Dynamic content loaders depending on active page
  if (id === "dashboard") {
    renderDashboard();
  } else if (id === "admin") {
    loadAdminStats();
    loadAdminRequests();
  }
}

// Global click router for pages
document.addEventListener("click", function (event) {
  const pageElement = event.target.closest("[data-page]");
  if (!pageElement) return;

  event.preventDefault();
  showPage(pageElement.dataset.page);
  history.replaceState(null, "", "#" + pageElement.dataset.page);
});

window.addEventListener("hashchange", function () {
  showPage(location.hash.slice(1) || "home");
});


/* ================= NAVIGATION STATE ================= */

function updateNav() {
  const navActions = document.querySelector(".nav-actions");
  const navLinks = document.querySelector(".nav-links");

  if (getToken() && currentUser) {
    // Authenticated links
    navActions.innerHTML = `
      <button class="btn btn-outline" data-page="dashboard">Dashboard</button>
      <button class="btn btn-primary" id="logoutBtn">Log Out</button>
    `;

    // Render Admin page link in navigation if role is admin
    let adminLink = document.getElementById("adminNavLink");
    if (currentUser.role === 'admin') {
      if (!adminLink) {
        const link = document.createElement('a');
        link.href = "#admin";
        link.id = "adminNavLink";
        link.setAttribute("data-page", "admin");
        link.textContent = "Admin";
        navLinks.appendChild(link);
      }
    } else {
      if (adminLink) adminLink.remove();
    }
  } else {
    // Unauthenticated links
    navActions.innerHTML = `
      <button class="btn btn-outline" data-open="login">Login</button>
      <button class="btn btn-primary" data-open="register">Become a Donor</button>
    `;
    let adminLink = document.getElementById("adminNavLink");
    if (adminLink) adminLink.remove();
  }
}


/* ================= DONORS (FETCH & RENDER) ================= */

async function fetchDonors(blood = '', location = '') {
  try {
    let url = '/api/donors';
    const params = [];
    if (blood) params.push(`blood=${encodeURIComponent(blood)}`);
    if (location) params.push(`location=${encodeURIComponent(location)}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    const res = await fetch(url);
    if (res.ok) {
      donors = await res.json();
      renderDonors(donors);
    } else {
      toast("Failed to fetch donors data.");
    }
  } catch (err) {
    console.error('Error fetching donors:', err);
    toast("Server connection error.");
  }
}

function renderDonors(list = donors) {
  const grid = document.getElementById("donorGrid");
  if (!grid) return;

  grid.innerHTML = list
    .map(donor => `
      <article class="donor-card">
        <div class="avatar">
          ${donor.initials}
        </div>
        <div class="donor-info">
          <b>${donor.name}</b>
          <span>${donor.location}</span>
          <small>${donor.distance} away</small>
        </div>
        <b class="blood-badge">${donor.blood}</b>
        <button
          class="btn btn-outline request-donor"
          data-name="${donor.name}"
          data-blood="${donor.blood}"
          data-phone="${donor.phone || ''}"
          data-email="${donor.email || ''}">
          Request
        </button>
      </article>
    `)
    .join("");

  document.getElementById("resultCount").textContent =
    `${list.length} donor${list.length !== 1 ? "s" : ""} found`;
}

// Find Donors Filter trigger
async function filterDonors() {
  const blood = document.getElementById("donorBlood").value;
  const locationVal = document.getElementById("donorLocation").value;
  await fetchDonors(blood, locationVal);
}

// Hook Search button on search page
const searchButton = document.getElementById("donorSearch");
if (searchButton) {
  searchButton.onclick = filterDonors;
}

// Hook Search button on landing Hero page
const homeSearchButton = document.getElementById("homeSearch");
if (homeSearchButton) {
  homeSearchButton.onclick = async function () {
    const homeBlood = document.getElementById("homeBlood").value;
    const homeLocation = document.getElementById("homeLocation").value;
    await fetchHomeDonors(homeBlood, homeLocation);
  };
}

// Hook Auto-filter on blood group selection
const homeBloodSelect = document.getElementById("homeBlood");
if (homeBloodSelect) {
  homeBloodSelect.onchange = async function() {
    const homeBlood = homeBloodSelect.value;
    const homeLocation = document.getElementById("homeLocation").value;
    await fetchHomeDonors(homeBlood, homeLocation);
  };
}

// Home page donors dynamic loaders
async function fetchHomeDonors(blood = '', location = '') {
  try {
    let url = '/api/donors';
    const params = [];
    if (blood) params.push(`blood=${encodeURIComponent(blood)}`);
    if (location) params.push(`location=${encodeURIComponent(location)}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    const res = await fetch(url);
    if (res.ok) {
      homeDonors = await res.json();
      homeVisibleCount = 16;
      renderHomeDonors();
    }
  } catch (err) {
    console.error('Error fetching home donors:', err);
  }
}

function renderHomeDonors() {
  const grid = document.getElementById("homeDonorGrid");
  if (!grid) return;

  const visibleDonors = homeDonors.slice(0, homeVisibleCount);

  if (visibleDonors.length === 0) {
    grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #7d8692; padding: 40px 0;">No donors match your search criteria.</p>`;
    document.getElementById("homeLoadMoreContainer").style.display = "none";
    return;
  }

  grid.innerHTML = visibleDonors
    .map(donor => `
      <article class="donor-card">
        <div class="avatar">
          ${donor.initials}
        </div>
        <div class="donor-info">
          <b>${donor.name}</b>
          <span>${donor.location}</span>
          <small>${donor.distance} away</small>
        </div>
        <b class="blood-badge">${donor.blood}</b>
        <button
          class="btn btn-outline request-donor"
          data-name="${donor.name}"
          data-blood="${donor.blood}"
          data-phone="${donor.phone || ''}"
          data-email="${donor.email || ''}">
          Request
        </button>
      </article>
    `)
    .join("");

  const loadMoreContainer = document.getElementById("homeLoadMoreContainer");
  if (homeDonors.length > homeVisibleCount) {
    loadMoreContainer.style.display = "block";
  } else {
    loadMoreContainer.style.display = "none";
  }
}

// Hook Load More button on home page
const homeLoadMoreBtn = document.getElementById("homeLoadMoreBtn");
if (homeLoadMoreBtn) {
  homeLoadMoreBtn.onclick = function() {
    homeVisibleCount += 16;
    renderHomeDonors();
  };
}


/* ================= REQUEST CONTACT (EVENT DELEGATION) ================= */

document.addEventListener("click", function (event) {
  const requestButton = event.target.closest(".request-donor");
  if (!requestButton) return;

  const modal = document.getElementById("authModal");

  if (!getToken()) {
    // Show login redirect
    modal.classList.add("show");
    document.getElementById("authContent").innerHTML = `
      <h2>Request ${requestButton.dataset.name}</h2>
      <p style="color:#707987; margin: 12px 0 20px;">
        Please log in to contact this donor and submit a blood request.
      </p>
      <button class="btn btn-primary" data-open="login">
        Continue to Login
      </button>
    `;
  } else {
    // Logged in: show donor contact information
    modal.classList.add("show");
    document.getElementById("authContent").innerHTML = `
      <span class="eyebrow" style="color: #e04a4a;">DONOR CONTACT INFORMATION</span>
      <h2>Contact ${requestButton.dataset.name}</h2>
      <div style="margin: 20px 0; text-align: left; background: #fafafa; padding: 15px; border-radius: 8px; border: 1px solid #eee;">
        <p style="margin-bottom: 8px;"><strong>Blood Group:</strong> <b class="blood-badge" style="display: inline-block; vertical-align: middle;">${requestButton.dataset.blood}</b></p>
        <p style="margin-bottom: 8px;"><strong>Phone:</strong> <a href="tel:${requestButton.dataset.phone}" style="color: var(--primary); text-decoration: none;">${requestButton.dataset.phone || 'Not available'}</a></p>
        <p style="margin-bottom: 0;"><strong>Email:</strong> <a href="mailto:${requestButton.dataset.email}" style="color: var(--primary); text-decoration: none;">${requestButton.dataset.email || 'Not available'}</a></p>
      </div>
      <p style="font-size:12px; color:#777;">
        Please mention you found their profile on Life Drop when contacting them.
      </p>
    `;
  }
});


/* ================= AUTH MODAL & DYNAMIC FORM FIELDS ================= */

const modal = document.getElementById("authModal");

function auth(type) {
  modal.classList.add("show");

  if (type === "login") {
    document.getElementById("authContent").innerHTML = `
      <span class="eyebrow">WELCOME BACK</span>
      <h2>Login to Life Drop</h2>
      <form id="loginForm">
        <label>
          Email / Phone
          <input required id="loginId" placeholder="Enter email or phone">
        </label>
        <label>
          Password
          <input required id="loginPassword" type="password" placeholder="Enter password">
        </label>
        <button class="btn btn-primary" type="submit">Login</button>
        <p style="font-size:12px; color:#777; margin-top: 15px;">
          Use seeded accounts like: <b>luin@gmail.com</b> with password <b>password123</b>.
        </p>
      </form>
    `;
  } else {
    document.getElementById("authContent").innerHTML = `
      <span class="eyebrow">JOIN LIFE DROP</span>
      <h2>Become a Donor</h2>
      <form id="registerForm">
        <label>
          Full Name
          <input required id="regName" placeholder="Your full name">
        </label>
        <label>
          Email
          <input required id="regEmail" type="email" placeholder="you@example.com">
        </label>
        <label>
          Phone Number
          <input required id="regPhone" placeholder="+880 1XXXXXXXXX">
        </label>
        <label>
          Location
          <input required id="regLocation" placeholder="Area, City (e.g. Mirpur, Dhaka)">
        </label>
        <label>
          Blood Group
          <select required id="regBlood">
            <option value="">Select group</option>
            <option>O+</option>
            <option>O-</option>
            <option>A+</option>
            <option>A-</option>
            <option>B+</option>
            <option>B-</option>
            <option>AB+</option>
            <option>AB-</option>
          </select>
        </label>
        <label>
          Password
          <input required id="regPassword" type="password" placeholder="Choose a password">
        </label>
        <button class="btn btn-primary" type="submit">Create Donor Account</button>
      </form>
    `;
  }
}

// Event Delegation for Opening Login/Register from dynamic triggers
document.addEventListener("click", function (event) {
  const openButton = event.target.closest("[data-open]");
  if (!openButton) return;
  auth(openButton.dataset.open);
});

// Close Modal
const closeModal = document.getElementById("closeModal");
if (closeModal) {
  closeModal.onclick = function () {
    modal.classList.remove("show");
  };
}

if (modal) {
  modal.addEventListener("click", function (event) {
    if (event.target === modal) {
      modal.classList.remove("show");
    }
  });
}


/* ================= FORM SUBMISSIONS ================= */

document.addEventListener("submit", async function (event) {
  
  // LOGIN SUBMISSION
  if (event.target.id === "loginForm") {
    event.preventDefault();
    const loginId = document.getElementById("loginId").value;
    const password = document.getElementById("loginPassword").value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password })
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        currentUser = data.user;

        modal.classList.remove("show");
        updateNav();
        
        if (currentUser.role === 'admin') {
          showPage("admin");
          toast("Logged in as Admin");
        } else {
          showPage("dashboard");
          toast("Welcome back to Life Drop");
        }
      } else {
        toast(data.message || "Invalid credentials.");
      }
    } catch (err) {
      console.error(err);
      toast("Server connection failed.");
    }
  }

  // REGISTER SUBMISSION
  if (event.target.id === "registerForm") {
    event.preventDefault();
    const name = document.getElementById("regName").value;
    const email = document.getElementById("regEmail").value;
    const phone = document.getElementById("regPhone").value;
    const location = document.getElementById("regLocation").value;
    const blood_group = document.getElementById("regBlood").value;
    const password = document.getElementById("regPassword").value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, location, blood_group, password })
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        currentUser = data.user;

        modal.classList.remove("show");
        updateNav();
        showPage("dashboard");
        toast("Donor account created successfully!");
        fetchDonors(); // refresh donor list
      } else {
        toast(data.message || "Registration failed.");
      }
    } catch (err) {
      console.error(err);
      toast("Server connection failed.");
    }
  }

  // EMERGENCY REQUEST SUBMISSION
  if (event.target.id === "requestForm") {
    event.preventDefault();
    
    // Select form inputs (by standard index or queries since no IDs on request form labels)
    const form = event.target;
    const patient_name = form.querySelector('input[placeholder="Enter patient name"]').value;
    const blood_group = form.querySelector('select').value;
    const hospital = form.querySelector('input[placeholder="Hospital / clinic"]').value;
    const locationVal = form.querySelector('input[placeholder="Area, city"]').value;
    const contact = form.querySelector('input[placeholder="+880 1XXXXXXXXX"]').value;
    const units = form.querySelector('input[type="number"]').value;
    const urgency = form.querySelector('input[name="urgency"]:checked').value;

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_name,
          blood_group,
          hospital,
          location: locationVal,
          contact,
          units: parseInt(units),
          urgency
        })
      });
      const data = await res.json();

      if (res.ok) {
        toast("Emergency blood request submitted successfully.");
        form.reset();
        loadAdminRequests(); // Reload list if on admin page
      } else {
        toast(data.message || "Failed to submit request.");
      }
    } catch (err) {
      console.error(err);
      toast("Server connection failed.");
    }
  }
});


/* ================= LOGOUT ================= */

document.addEventListener("click", function(event) {
  if (event.target.id === 'logoutBtn') {
    logout();
  }
});

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  currentUser = null;
  updateNav();
  showPage("home");
  history.replaceState(null, "", "#home");
  toast("You have been logged out.");
}


/* ================= DONOR DASHBOARD LOGIC ================= */

async function renderDashboard() {
  if (!currentUser) return;

  // Set greeting & basic profile sidebar details
  document.querySelector("#dashboard .dashboard-top h1").nextElementSibling.textContent = 
    `Welcome back, ${currentUser.name}.`;

  const sidebarProfile = document.querySelector("#dashboard .profile-mini");
  if (sidebarProfile) {
    const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    sidebarProfile.querySelector(".avatar").textContent = initials;
    sidebarProfile.querySelector("b").textContent = currentUser.name;
    sidebarProfile.querySelector("span").textContent = `${currentUser.blood_group} • ${currentUser.location}`;
  }

  // Draw availability badge
  updateAvailabilityUI(currentUser.is_available);

  // Load donation history list and stats card
  await loadDonationData();
}

// Click availability badge to toggle state
document.addEventListener("click", async function (event) {
  const toggleBtn = event.target.closest("#availabilityToggle");
  if (!toggleBtn || !currentUser) return;

  const newStatus = currentUser.is_available ? 0 : 1;

  try {
    const res = await fetch('/api/donors/availability', {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ is_available: newStatus })
    });
    const data = await res.json();

    if (res.ok) {
      currentUser.is_available = data.is_available;
      localStorage.setItem('user', JSON.stringify(currentUser));
      updateAvailabilityUI(currentUser.is_available);
      toast("Availability updated.");
    } else {
      toast("Failed to update status.");
    }
  } catch (err) {
    console.error(err);
    toast("Server connection failed.");
  }
});

function updateAvailabilityUI(isAvailable) {
  const dashboardTop = document.querySelector("#dashboard .dashboard-top");
  if (!dashboardTop) return;

  // Remove existing toggle badge if present, then recreate it as clickable element
  let badge = document.getElementById("availabilityToggle");
  if (badge) badge.remove();

  badge = document.createElement("span");
  badge.id = "availabilityToggle";
  badge.className = "availability";
  badge.style.cursor = "pointer";
  badge.style.transition = "all 0.2s ease";

  if (isAvailable) {
    badge.innerHTML = `<i></i> Available to donate`;
    badge.style.background = "#ecfaf3";
    badge.style.color = "#218458";
  } else {
    badge.innerHTML = `<i style="background:#d93838;"></i> Unavailable`;
    badge.style.background = "#fff0f0";
    badge.style.color = "#d93838";
  }

  dashboardTop.appendChild(badge);
}

// Load dynamic donation entries
async function loadDonationData() {
  try {
    const res = await fetch('/api/donations/history', { headers: getHeaders() });
    if (!res.ok) return;

    const donations = await res.json();

    // Fill Stats Cards
    const cards = document.querySelectorAll("#dashboard .dash-cards > div");
    if (cards.length >= 3) {
      // 1. Last Donation Card
      const lastDonationDateEl = cards[0].querySelector("b");
      const lastDonationSubEl = cards[0].querySelector("small");
      
      // 2. Next Eligible Card
      const nextEligibleDateEl = cards[1].querySelector("b");
      const nextEligibleSubEl = cards[1].querySelector("small");
      
      // 3. Total Donations Card
      const totalDonationsEl = cards[2].querySelector("b");

      // Set counts
      totalDonationsEl.textContent = donations.length;

      if (donations.length > 0) {
        const last = donations[0]; // ordered DESC in api
        
        // Format Date nicely: YYYY-MM-DD to DD MMM YYYY
        const lastDate = new Date(last.donation_date);
        const options = { day: 'numeric', month: 'short', year: 'numeric' };
        lastDonationDateEl.textContent = lastDate.toLocaleDateString('en-GB', options);
        lastDonationSubEl.textContent = "Completed";

        // Calculate next eligibility (3 months after last donation)
        const eligibleDate = new Date(lastDate);
        eligibleDate.setMonth(eligibleDate.getMonth() + 3);
        nextEligibleDateEl.textContent = eligibleDate.toLocaleDateString('en-GB', options);

        const today = new Date();
        if (today >= eligibleDate) {
          nextEligibleSubEl.textContent = "Eligible now";
          nextEligibleSubEl.className = "";
        } else {
          const daysLeft = Math.ceil((eligibleDate - today) / (1000 * 60 * 60 * 24));
          nextEligibleSubEl.textContent = `In ${daysLeft} days`;
          nextEligibleSubEl.className = "danger";
        }
      } else {
        lastDonationDateEl.textContent = "Never";
        lastDonationSubEl.textContent = "No donations logged";
        nextEligibleDateEl.textContent = "Anytime";
        nextEligibleSubEl.textContent = "Eligible now";
        nextEligibleSubEl.className = "";
      }
    }

    // Fill Recent Activity lists
    const activityPanel = document.querySelector("#dashboard .panel .activity").parentNode;
    if (activityPanel) {
      // Keep panel head but clear out activities
      const panelHead = activityPanel.querySelector(".panel-head");
      activityPanel.innerHTML = '';
      activityPanel.appendChild(panelHead);

      if (donations.length === 0) {
        activityPanel.innerHTML += `
          <p style="padding: 20px; text-align: center; color: #777;">
            No donation activity logged yet.
          </p>
        `;
      } else {
        donations.forEach(donation => {
          const dDate = new Date(donation.donation_date);
          const formattedDate = dDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
          activityPanel.innerHTML += `
            <div class="activity">
              <i>✓</i>
              <div>
                <b>Donation completed</b>
                <span>${formattedDate} • ${donation.hospital}</span>
              </div>
              <strong>+${donation.units} unit${donation.units !== 1 ? 's' : ''}</strong>
            </div>
          `;
        });
      }
    }

  } catch (err) {
    console.error('Error loading donations:', err);
  }
}

// Hook Donate Now Button
document.addEventListener("click", async function (event) {
  if (event.target.id !== "donateBtn") return;

  const hospital = prompt("Enter the hospital or blood bank name where you donated:");
  if (!hospital) return; // user cancelled

  try {
    const res = await fetch('/api/donations', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ hospital, units: 1 })
    });
    const data = await res.json();

    if (res.ok) {
      toast("Donation logged successfully. Thank you for your support!");
      await loadDonationData(); // reload stats and listing
    } else {
      toast(data.message || "Failed to log donation.");
    }
  } catch (err) {
    console.error(err);
    toast("Server connection failed.");
  }
});


/* ================= ADMIN DASHBOARD LOGIC ================= */

async function loadAdminStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;

    const stats = await res.json();

    const statsBoxes = document.querySelectorAll("#admin .admin-stats > div");
    if (statsBoxes.length >= 4) {
      statsBoxes[0].querySelector("strong").textContent = stats.totalDonors.toLocaleString();
      statsBoxes[1].querySelector("strong").textContent = stats.availableUnits.toLocaleString();
      statsBoxes[2].querySelector("strong").textContent = stats.pendingRequests.toLocaleString();
      statsBoxes[3].querySelector("strong").textContent = stats.successfulDonations.toLocaleString();
    }

    // Update stock levels
    const stockPanel = document.querySelector("#admin .panel.stock");
    if (stockPanel && stats.stock) {
      const stockRows = stockPanel.querySelectorAll(".stock-row");
      stockRows.forEach(row => {
        const group = row.querySelector("span").textContent.trim();
        const value = stats.stock[group];
        if (value !== undefined) {
          row.querySelector("b").textContent = value;
          // Dynamically compute progress bar percentage (assuming max is 100)
          const pct = Math.min((value / 100) * 100, 100);
          row.querySelector("i").style.width = `${pct}%`;
        }
      });
    }

  } catch (err) {
    console.error('Error loading admin statistics:', err);
  }
}

async function loadAdminRequests() {
  try {
    const res = await fetch('/api/requests');
    if (!res.ok) return;

    const requests = await res.json();

    const tbody = document.querySelector("#admin table tbody");
    if (!tbody) return;

    if (requests.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: #777; padding: 20px;">
            No requests registered.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = requests
      .map(req => {
        let urgencyClass = 'medium';
        if (req.urgency.toLowerCase() === 'high') urgencyClass = 'high';
        else if (req.urgency.toLowerCase() === 'low') urgencyClass = 'low';

        let statusClass = 'pending';
        if (req.status.toLowerCase() === 'matched') statusClass = 'matched';
        
        return `
          <tr>
            <td>${req.patient_name}</td>
            <td><b class="blood-badge">${req.blood_group}</b></td>
            <td>${req.hospital}</td>
            <td><span class="status ${urgencyClass}">${req.urgency}</span></td>
            <td><span class="status ${statusClass}">${req.status}</span></td>
          </tr>
        `;
      })
      .join("");

  } catch (err) {
    console.error('Error loading admin requests:', err);
  }
}


/* ================= MOBILE NAV MENU CONTROL ================= */

const mobileMenu = document.getElementById("mobileMenu");
if (mobileMenu) {
  mobileMenu.onclick = function () {
    const nav = document.querySelector(".nav-links");
    
    if (nav.style.display === "flex") {
      nav.style.display = "none";
    } else {
      nav.style.display = "flex";
      nav.style.position = "absolute";
      nav.style.top = "76px";
      nav.style.left = "0";
      nav.style.right = "0";
      nav.style.background = "#fff";
      nav.style.padding = "20px";
      nav.style.flexDirection = "column";
    }
  };
}


/* ================= TOAST NOTIFICATION SYSTEM ================= */

function toast(message) {
  const toastElement = document.getElementById("toast");
  if (!toastElement) return;

  toastElement.textContent = message;
  toastElement.classList.add("show");

  setTimeout(function () {
    toastElement.classList.remove("show");
  }, 3000);
}