/* Frontend upgrade. Uses the existing GET /products + selectedProduct checkout contract. */
(() => {
  "use strict";
  const config = window.MAHALAKSHMI_STORE || {};
  const api = String(config.apiUrl || "").replace(/\/+$/, "");
  const page = document.body.dataset.page;
  const cacheKey = "mahalakshmi_catalogue_v1:" + api;
  const cartKey = "mahalakshmi_cart_v1:" + api;
  const params = new URLSearchParams(location.search);
  let products = [], live = false, busy = false, toastTimer;
  let query = params.get("q") || "", category = params.get("category") || "", sort = "featured";
  const requestedId = params.get("id");
  const $ = id => document.getElementById(id);
  const text = value => String(value ?? "");
  const esc = value => text(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const money = value => "₹" + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const idOf = p => text(p && (p._id?.$oid || p._id || p.id));
  const stockOf = p => Math.max(0, Math.floor(Number(p?.stock) || 0));
  const validPrice = p => p?.price !== "" && p?.price != null && Number.isFinite(Number(p.price)) && Number(p.price) >= 0;
  const sellable = p => !!p && p.isActive !== false && p.inStock !== false && stockOf(p) > 0 && validPrice(p);
  const productLink = p => "product.html?id=" + encodeURIComponent(idOf(p));
  const icons = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    order: '<path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7M12 11v10M7 5l9 4v5"/>',
    photo: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 16 5-5 5 5 3-3 5 5"/>',
    share: '<path d="M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8"/>',
    pin: '<path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[name] + '</svg>';

  function readStorage(kind, key, fallback) {
    try { return JSON.parse(window[kind].getItem(key) || "null") ?? fallback; } catch { return fallback; }
  }
  function writeStorage(kind, key, value) {
    try { window[kind].setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }
  function getCart() {
    const data = readStorage("localStorage", cartKey, []);
    return Array.isArray(data) ? [...new Set(data.filter(x => typeof x === "string" && x.length < 200))] : [];
  }
  function updateCount() { if ($("cartCount")) $("cartCount").textContent = getCart().length; }
  function toast(message) {
    clearTimeout(toastTimer);
    $("toast").textContent = message;
    $("toast").hidden = false;
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, 4200);
  }
  function status(message = "", retry = false) {
    $("loadStatus").replaceChildren();
    if (!message) return;
    const label = document.createElement("span"); label.textContent = message; $("loadStatus").append(label);
    if (retry) {
      const button = document.createElement("button"); button.type = "button"; button.className = "text-button"; button.textContent = "Try again";
      button.addEventListener("click", () => load()); $("loadStatus").append(button);
    }
  }
  function empty(title, message, link = true) {
    return '<div class="empty-state"><h2>' + esc(title) + '</h2><p>' + esc(message) + '</p>' + (link ? '<a href="index.html">Explore the collection →</a>' : '') + '</div>';
  }

  function header() {
    $("storeHeader").innerHTML = `<div class="header-inner">
      <a class="brand" href="index.html" aria-label="${esc(config.name || "Mahalakshmi")} home"><span class="brand-mark" aria-hidden="true">M</span><span><span class="brand-name">${esc(config.name || "MAHALAKSHMI")}</span><span class="brand-subtitle">${esc(config.subtitle || "Cloth Center & Fancy Store")}</span></span></a>
      <form class="search-form" id="searchForm" role="search" action="index.html"><button type="submit" aria-label="Search products">${icon("search")}</button><input id="searchInput" name="q" type="search" aria-label="Search products" placeholder="Search sarees, clothing & more" value="${esc(query)}" autocomplete="off"></form>
      <nav class="header-links" aria-label="Account and cart"><a class="header-link orders-link" href="orders.html" aria-label="My orders">${icon("order")}<span>My Orders</span></a><a class="header-link" href="cart.html">${icon("bag")}<span>Cart</span><span id="cartCount" class="cart-count" aria-label="Items in cart">0</span></a></nav>
    </div>`;
    document.querySelectorAll("[data-store-name]").forEach(el => { el.textContent = config.name || "MAHALAKSHMI"; });
    updateCount();
    if (page === "home") {
      $("searchForm").addEventListener("submit", event => { event.preventDefault(); query = $("searchInput").value.trim(); renderHome(); updateUrl(); });
      $("searchInput").addEventListener("input", () => { query = $("searchInput").value.trim(); renderHome(); updateUrl(); });
      $("sortProducts").addEventListener("change", event => { sort = event.target.value; renderHome(); });
    }
  }
  function updateUrl() {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (category) search.set("category", category);
    try { history.replaceState(null, "", location.pathname + (search.size ? "?" + search : "")); } catch { /* file:// preview */ }
  }

  function imageUrl(value) {
    if (value && typeof value === "object") value = value.url || value.src || value.image;
    if (typeof value !== "string" || !value.trim()) return "";
    value = value.trim();
    if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value)) return value;
    if (/^[a-z]:[\\/]/i.test(value) || value.includes("\\")) return "";
    try {
      const url = new URL(value, config.imageBaseUrl || location.href);
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }
  function imagesOf(p) {
    const values = [p.image, p.imageUrl, ...(Array.isArray(p.images) ? p.images : []), ...(Array.isArray(p.imageUrls) ? p.imageUrls : [])];
    return [...new Set(values.map(imageUrl).filter(Boolean))];
  }
  function media(p, index = 0, url = imagesOf(p)[0]) {
    return `<span class="image-fallback" ${url ? 'hidden' : ''}>${icon("photo")}<span>Photo unavailable</span></span>` + (url ? `<img src="${esc(url)}" alt="${esc(p.name || 'Product')}" loading="${index < 4 ? 'eager' : 'lazy'}" decoding="async">` : '');
  }
  function bindImages(root) {
    root.querySelectorAll("img").forEach(img => {
      const fail = () => {
        img.hidden = true;
        const fallback = img.parentElement.querySelector(".image-fallback"); if (fallback) fallback.hidden = false;
        if (img.parentElement.classList.contains("gallery-photo")) { img.parentElement.disabled = true; img.parentElement.removeAttribute("aria-label"); }
      };
      img.addEventListener("error", fail, { once: true });
      if (img.complete && !img.naturalWidth) fail();
    });
  }
  function priceHtml(p, detail = false) {
    if (!validPrice(p)) return '<p class="muted">Price unavailable</p>';
    const price = Number(p.price), original = Number(p.originalPrice ?? p.mrp);
    const hasDiscount = Number.isFinite(original) && original > price;
    return `<p class="price-line${detail ? ' detail-price' : ''}"><strong>${money(price)}</strong>${hasDiscount ? `<del>${money(original)}</del><span class="discount">${Math.round((1 - price / original) * 100)}% off</span>` : ''}</p>`;
  }
  function card(p, index) {
    return `<a class="product-card" href="${productLink(p)}" aria-label="View ${esc(p.name || 'product')} details"><div class="product-media">${media(p,index)}${!sellable(p) ? '<span class="stock-tag">'+ (validPrice(p) ? 'Out of stock' : 'Currently unavailable') +'</span>' : ''}</div><p class="product-category">${esc(p.category || 'Collection')}</p><h3 class="product-name">${esc(p.name || 'Product')}</h3>${priceHtml(p)}</a>`;
  }
  function skeletons() {
    $("productGrid").innerHTML = Array.from({length:4}, () => '<div aria-hidden="true"><div class="skeleton-media"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>').join("");
  }
  function categories() {
    const list = [...new Set(products.map(p => text(p.category).trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b));
    $("categoryNav").innerHTML = '<div class="category-inner"></div>';
    const container = $("categoryNav").firstElementChild;
    ["", ...list].forEach(value => {
      const button = document.createElement("button"); button.type = "button"; button.className = "category-tab";
      button.textContent = value || "For you"; button.dataset.category = value;
      button.setAttribute("aria-pressed", String(category === value));
      button.addEventListener("click", () => { category = value; categories(); renderHome(); updateUrl(); });
      container.append(button);
    });
  }
  function renderHome() {
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let filtered = products.filter(p => (!category || text(p.category).trim() === category) && terms.every(term => (text(p.name)+" "+text(p.category)+" "+text(p.description)).toLocaleLowerCase().includes(term)));
    if (sort === "price-low") filtered.sort((a,b) => (validPrice(a)?Number(a.price):Infinity) - (validPrice(b)?Number(b.price):Infinity));
    if (sort === "price-high") filtered.sort((a,b) => (validPrice(b)?Number(b.price):-Infinity) - (validPrice(a)?Number(a.price):-Infinity));
    if (sort === "name") filtered.sort((a,b) => text(a.name).localeCompare(text(b.name)));
    $("resultsTitle").firstChild.textContent = (query ? 'Search results' : category || 'All products') + ' ';
    $("productCount").textContent = `(${filtered.length})`;
    $("productGrid").innerHTML = filtered.length ? filtered.map(card).join("") : empty(products.length ? "No matching products" : "The collection is on its way", products.length ? "Try another search or choose a different category." : "Please check back soon for available products.", false);
    $("productGrid").setAttribute("aria-busy", "false"); bindImages($("productGrid"));
  }

  function renderProduct() {
    const p = products.find(p => idOf(p) === requestedId);
    const root = $("productDetail"); root.setAttribute("aria-busy", "false");
    if (!p) {
      root.innerHTML = empty("Product not found", "This item may no longer be available. Explore the collection to find another favourite.");
      $("similarSection").hidden = true; return;
    }
    document.title = text(p.name || "Product") + " | " + text(config.name || "Mahalakshmi");
    $("breadcrumb").innerHTML = `<a href="index.html">Home</a><span aria-hidden="true">/</span><a href="index.html?category=${encodeURIComponent(p.category || '')}">${esc(p.category || 'Collection')}</a><span aria-hidden="true">/</span><span>${esc(p.name || 'Product')}</span>`;
    const pictures = imagesOf(p), available = sellable(p), canBuy = live && available;
    const gallery = (pictures.length ? pictures : [""]).map((url,index) => `<button class="gallery-photo" type="button" data-image="${esc(url)}" ${url ? 'aria-label="Enlarge product photo '+(index+1)+'"' : 'disabled'}>${media(p,index,url)}</button>`).join("");
    const facts = [["Category", p.category || "Clothing & accessories"], ["Availability", available ? "In stock" : "Currently unavailable"]];
    // Sizes/colours are only descriptive when the stored item identifies them.
    // Do not show selectors: the existing order API does not record variants.
    for (const [label, key] of [["Colour","color"],["Size","size"],["Fabric","fabric"]]) {
      if (typeof p[key] === "string" && p[key].trim()) facts.push([label,p[key]]);
    }
    root.innerHTML = `<div class="detail-layout"><section class="gallery${pictures.length <= 1 ? ' single' : ''}" aria-label="Product photos">${gallery}<p class="gallery-caption">Click a photo to take a closer look.</p></section>
      <section class="detail-summary" aria-labelledby="productTitle"><div class="detail-topline"><span>${esc(p.category || 'THE COLLECTION')}</span><button id="shareProduct" class="icon-button" type="button" aria-label="Share this product">${icon("share")}</button></div>
      <h1 id="productTitle">${esc(p.name || 'Product')}</h1>${priceHtml(p,true)}
      <p class="availability${available ? '' : ' unavailable'}">${available ? 'In stock' : 'Currently unavailable'}</p>
      ${p.description ? '<p class="product-description">'+esc(p.description)+'</p>' : ''}
      <div class="buy-actions"><button id="addToCart" class="action-button secondary-button" type="button" ${canBuy ? '' : 'disabled'}>${icon('bag')}<span>${getCart().includes(idOf(p)) ? 'Go to cart' : 'Add to cart'}</span></button><button id="buyNow" class="action-button primary-button" type="button" ${canBuy ? '' : 'disabled'}>${!live ? 'Checking availability…' : available ? 'Buy Now · '+money(p.price) : 'Unavailable'}</button></div>
      <p class="checkout-note">Continue to delivery details, then choose your payment method.</p>
      <div class="product-facts"><h2>Product details</h2><dl>${facts.map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')}</dl></div>
      <div class="detail-info-row">${icon('pin')}<div><strong>Delivery details</strong><p>Enter your address and pincode at checkout.</p></div></div>
      <div class="detail-info-row">${icon('order')}<div><strong>Keep track of your order</strong><p>View your orders and their status in My Orders.</p></div></div>
      <details class="product-questions"><summary>Shopping questions</summary><p><strong>How do I place an order?</strong><br>Select Buy Now, enter your delivery details and continue to payment.</p><p><strong>Where can I find my orders?</strong><br>Open My Orders and use your existing account sign-in.</p></details></section></div>`;
    bindImages(root);
    $("buyNow").addEventListener("click", () => checkout(idOf(p)));
    $("addToCart").addEventListener("click", () => addToCart(idOf(p)));
    $("shareProduct").addEventListener("click", shareProduct);
    root.querySelectorAll(".gallery-photo[data-image]").forEach(button => button.addEventListener("click", () => {
      if (!button.dataset.image) return;
      $("enlargedImage").src = button.dataset.image; $("enlargedImage").alt = text(p.name || 'Product'); $("imageDialog").showModal();
    }));
    const similar = products.filter(item => idOf(item) !== idOf(p) && item.category === p.category).slice(0,4);
    $("similarSection").hidden = !similar.length;
    $("similarProducts").innerHTML = similar.map(card).join(""); bindImages($("similarProducts"));
  }
  async function shareProduct() {
    const url = location.href;
    try {
      if (navigator.share) { await navigator.share({title:document.title,url}); return; }
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(url); toast("Product link copied."); return; }
      toast("Copy the address from your browser to share this product.");
    } catch (error) { if (error.name !== "AbortError") toast("Copy the address from your browser to share this product."); }
  }
  function addToCart(id) {
    if (!live || !sellable(products.find(p => idOf(p) === id))) return;
    const cart = getCart();
    if (cart.includes(id)) { location.href = "cart.html"; return; }
    if (!writeStorage("localStorage", cartKey, [...cart,id])) { toast("Your browser could not save the cart. You can still use Buy Now."); return; }
    updateCount(); $("addToCart").lastElementChild.textContent = "Go to cart"; toast("Added to your cart.");
  }
  function renderCart() {
    const ids = getCart(); $("cartItems").setAttribute("aria-busy","false");
    $("cartItems").innerHTML = ids.length ? ids.map(id => {
      const p = products.find(p => idOf(p) === id);
      if (!p) return `<article class="cart-item"><div class="product-media">${media({})}</div><div><h2>Item no longer available</h2><p class="muted">Remove this item or explore the collection.</p></div><div class="cart-controls"><button class="text-button remove-item" type="button" data-id="${esc(id)}">Remove</button></div></article>`;
      return `<article class="cart-item"><a class="product-media" href="${productLink(p)}" aria-label="View ${esc(p.name)}">${media(p)}</a><div><h2><a href="${productLink(p)}">${esc(p.name)}</a></h2>${priceHtml(p)}<span class="availability${sellable(p) ? '' : ' unavailable'}">${sellable(p) ? 'In stock' : 'Currently unavailable'}</span></div><div class="cart-controls"><button class="action-button primary-button cart-buy" type="button" data-id="${esc(id)}" ${live && sellable(p) ? '' : 'disabled'}>${live ? 'Buy Now' : 'Checking…'}</button><button class="text-button remove-item" type="button" data-id="${esc(id)}">Remove</button></div></article>`;
    }).join("") : empty("Your cart is waiting", "See something you like? Open a product and add it to your cart.");
    bindImages($("cartItems"));
    document.querySelectorAll(".remove-item").forEach(button => button.addEventListener("click", () => {
      if (!writeStorage("localStorage",cartKey,getCart().filter(id => id !== button.dataset.id))) { toast("Unable to update your cart."); return; }
      renderCart(); updateCount();
    }));
    document.querySelectorAll(".cart-buy").forEach(button => button.addEventListener("click", () => checkout(button.dataset.id)));
  }

  async function fetchProducts() {
    if (!api || !/^https?:\/\//i.test(api)) throw new Error("Store address is unavailable.");
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(api + "/products", {cache:"no-store", signal:controller.signal});
      if (!response.ok) throw new Error("Products unavailable.");
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Invalid product response.");
      return data.filter(p => p && typeof p === "object" && idOf(p) && p.isActive !== false).map(p => ({...p,_id:idOf(p)}));
    } finally { clearTimeout(timer); }
  }
  function render() { if (page === "home") { categories(); renderHome(); } else if (page === "product") renderProduct(); else renderCart(); }
  async function load() {
    live = false; status("Loading the latest collection…");
    if (page !== "home" && products.length) render();
    try {
      products = await fetchProducts(); live = true;
      writeStorage("sessionStorage",cacheKey,{time:Date.now(),products});
      status(); render();
    } catch {
      live = false;
      status(products.length ? "We couldn’t refresh the collection. Please try again before buying." : "We couldn’t load the collection. Please try again.", true);
      if (products.length) render();
      else {
        const target = $(page === "home" ? "productGrid" : page === "product" ? "productDetail" : "cartItems");
        target.innerHTML = empty("We’ll be right back", "The store is taking longer to respond. Use Try again above to reconnect.",page !== "home");
        target.setAttribute("aria-busy","false");
      }
    }
  }
  async function checkout(id) {
    if (busy || !live) return;
    busy = true;
    document.querySelectorAll("#buyNow,.cart-buy").forEach(button => { button.disabled = true; });
    status("Checking the latest price and availability…");
    try {
      const latest = await fetchProducts(), p = latest.find(item => idOf(item) === id), previous = products.find(item => idOf(item) === id);
      products = latest; live = true; writeStorage("sessionStorage",cacheKey,{time:Date.now(),products});
      if (!sellable(p)) { render(); status("This item is no longer available. Please choose another product."); return; }
      if (Number(previous?.price) !== Number(p.price)) { render(); status("The price has changed. Please review the updated price and select Buy Now again."); return; }
      if (!writeStorage("sessionStorage","selectedProduct",p)) { render(); status("Your browser could not save this selection. Enable site storage and try again."); return; }
      // Viewing a product never writes checkout data or places an order.
      // Only this verified Buy Now action hands the selected product to checkout.
      location.href = "checkout.html";
    } catch {
      live = false; render(); status("We couldn’t confirm availability. Please reconnect and try again.",true);
    } finally { busy = false; }
  }

  header();
  if (page === "home") skeletons();
  if (page === "product") {
    $("closeImage").addEventListener("click", () => $("imageDialog").close());
    $("imageDialog").addEventListener("click", event => { if (event.target === $("imageDialog")) $("imageDialog").close(); });
    if (!requestedId) { $("productDetail").innerHTML = empty("Choose a product", "Open a product from the home page to view its photos and details."); $("productDetail").setAttribute("aria-busy","false"); return; }
  }
  const cached = readStorage("sessionStorage",cacheKey,null);
  if (cached && Date.now() - Number(cached.time) < 5 * 60 * 1000 && Array.isArray(cached.products)) {
    products = cached.products.filter(p => p && typeof p === "object" && idOf(p) && p.isActive !== false);
    if (products.length) render();
  }
  window.addEventListener("storage", event => { if (event.key === cartKey) { updateCount(); if (page === "cart") renderCart(); } });
  window.addEventListener("pageshow", event => { if (event.persisted) { busy = false; load(); } });
  load();
})();
