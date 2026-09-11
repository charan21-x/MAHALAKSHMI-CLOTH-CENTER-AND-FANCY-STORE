const API_URL = "https://mahalakshmi-backend-api.onrender.com";
const TOKEN_KEY = "mahalakshmiAdminToken";

let adminToken = sessionStorage.getItem(TOKEN_KEY) || "";
let newOrders = [];
let allOrders = [];

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  $("loginBtn").addEventListener("click", login);
  $("password").addEventListener("keydown", e => { if (e.key === "Enter") login(); });
  $("refreshBtn").addEventListener("click", loadOrders);
  $("logoutBtn").addEventListener("click", logout);
  $("closeModal").addEventListener("click", closeModal);
  $("orderModal").addEventListener("click", e => { if (e.target === $("orderModal")) closeModal(); });
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));

  if (adminToken) showDashboardAndLoad();
});

async function login() {
  const username = $("username").value.trim();
  const password = $("password").value;
  $("loginError").textContent = "";
  if (!username || !password) {
    $("loginError").textContent = "Enter admin username and password.";
    return;
  }

  const btn = $("loginBtn");
  btn.disabled = true;
  btn.textContent = "LOGGING IN...";
  try {
    const r = await fetch(`${API_URL}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await safeJson(r);
    if (!r.ok || !data.token) throw new Error(data.message || "Login failed");
    adminToken = data.token;
    sessionStorage.setItem(TOKEN_KEY, adminToken);
    showDashboardAndLoad();
  } catch (e) {
    $("loginError").textContent = e.message || "Unable to login.";
  } finally {
    btn.disabled = false;
    btn.textContent = "LOGIN";
  }
}

function showDashboardAndLoad() {
  $("loginView").classList.add("hidden");
  $("dashboardView").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  loadOrders();
}

function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  adminToken = "";
  location.reload();
}

function authHeaders(extra = {}) {
  return { ...extra, Authorization: `Bearer ${adminToken}` };
}

async function api(path, options = {}) {
  const r = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: authHeaders(options.headers || {})
  });
  const data = await safeJson(r);
  if (r.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    adminToken = "";
    throw new Error("Admin session expired. Please login again.");
  }
  if (!r.ok) throw new Error(data.message || `Request failed (${r.status})`);
  return data;
}

async function safeJson(r) {
  const text = await r.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { message: text || "Unexpected server response" }; }
}

async function loadOrders() {
  setLoading();
  try {
    [newOrders, allOrders] = await Promise.all([
      api("/admin/orders/today-new"),
      api("/admin/orders")
    ]);
    $("newCount").textContent = newOrders.length;
    $("allCount").textContent = allOrders.length;
    renderOrders($("newOrdersBox"), newOrders, true);
    renderOrders($("allOrdersBox"), allOrders, false);
  } catch (e) {
    if (!adminToken) {
      $("dashboardView").classList.add("hidden");
      $("loginView").classList.remove("hidden");
      $("logoutBtn").classList.add("hidden");
      $("loginError").textContent = e.message;
      return;
    }
    $("newOrdersBox").innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    $("allOrdersBox").innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function setLoading() {
  $("newOrdersBox").innerHTML = '<div class="loading">Loading new orders...</div>';
  $("allOrdersBox").innerHTML = '<div class="loading">Loading all orders...</div>';
}

function renderOrders(box, orders, isNewList) {
  if (!orders.length) {
    box.innerHTML = `<div class="empty">${isNewList ? "No unseen orders booked today." : "No orders found."}</div>`;
    return;
  }

  const rows = orders.map(o => {
    const total = Number(o.amountPaid ?? (Number(o.price || 0) * Number(o.quantity || 1)));
    const status = o.adminSeen === true ? '<span class="seen-pill">SEEN</span>' : '<span class="new-pill">NEW</span>';
    return `<tr>
      <td><div class="order-id">${esc(shortId(o._id))}</div><div style="margin-top:5px">${status}</div></td>
      <td><b>${esc(o.customerName || "-")}</b><br><span class="muted">${esc(o.phone || "-")}</span></td>
      <td>${esc(o.productName || "-")}</td>
      <td class="price">₹${money(total)}</td>
      <td><span class="pay-pill">${esc(o.paymentMethod || "-")}</span><br><small>${esc(o.paymentStatus || "")}</small></td>
      <td>${esc(formatDate(o.createdAt))}</td>
      <td><button class="view-btn" type="button" data-id="${esc(String(o._id || ""))}" data-new="${isNewList ? "1" : "0"}">View Order</button></td>
    </tr>`;
  }).join("");

  box.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Amount</th><th>Payment</th><th>Booked At</th><th>Action</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;

  box.querySelectorAll(".view-btn").forEach(btn => {
    btn.addEventListener("click", () => openOrder(btn.dataset.id, btn.dataset.new === "1"));
  });
}

async function openOrder(id, fromNew) {
  const order = [...newOrders, ...allOrders].find(o => String(o._id) === String(id));
  if (!order) return;

  showOrderDetails(order);

  if (fromNew && order.adminSeen !== true) {
    try {
      await api(`/admin/orders/${encodeURIComponent(id)}/seen`, { method: "PATCH" });
      order.adminSeen = true;
      order.adminSeenAt = new Date().toISOString();
      newOrders = newOrders.filter(o => String(o._id) !== String(id));
      allOrders = allOrders.map(o => String(o._id) === String(id) ? { ...o, adminSeen: true, adminSeenAt: order.adminSeenAt } : o);
      $("newCount").textContent = newOrders.length;
      renderOrders($("newOrdersBox"), newOrders, true);
      renderOrders($("allOrdersBox"), allOrders, false);
    } catch (e) {
      console.error("Could not mark order seen:", e);
    }
  }
}

function showOrderDetails(o) {
  const total = Number(o.amountPaid ?? (Number(o.price || 0) * Number(o.quantity || 1)));
  const fullAddress = [o.doorNo, o.areaVillage, o.city, o.state, o.pincode].filter(Boolean).join(", ") || o.address || "-";
  $("orderDetails").innerHTML = `<div class="details">
    ${detail("Order ID", String(o._id || "-"))}
    ${detail("Booked At", formatDate(o.createdAt))}
    ${detail("Customer", o.customerName || "-")}
    ${detail("Mobile", o.phone || "-")}
    ${detail("Email", o.email || "-")}
    ${detail("Product", o.productName || "-")}
    ${detail("Quantity", String(o.quantity || 1))}
    ${detail("Amount", `₹${money(total)}`)}
    ${detail("Payment Method", o.paymentMethod || "-")}
    ${detail("Payment Status", o.paymentStatus || "-")}
    ${detail("Order Status", o.orderStatus || "-")}
    ${detail("Admin View", o.adminSeen ? "Seen" : "New")}
    ${detail("Delivery Address", fullAddress, true)}
  </div>`;
  $("orderModal").classList.add("show");
}

function detail(label, value, full = false) {
  return `<div class="detail${full ? " full" : ""}"><b>${esc(label)}</b><span>${esc(value)}</span></div>`;
}

function closeModal() { $("orderModal").classList.remove("show"); }

function showTab(tab) {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $("newSection").classList.toggle("hidden", tab !== "new");
  $("allSection").classList.toggle("hidden", tab !== "all");
}

function shortId(id) {
  const s = String(id || "");
  return s ? `#${s.slice(-8).toUpperCase()}` : "-";
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true
  }).format(d);
}

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
