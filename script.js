const API_URL = "https://mahalakshmi-backend-wy3h.onrender.com";
// For local testing, use: http://localhost:5003

let selectedProduct = null;

document.addEventListener("DOMContentLoaded", getProducts);

async function getProducts() {
    const container = document.getElementById("productList");
    container.innerHTML = "<p>Loading products...</p>";

    const cacheKey = "products_cache_v2";
    const cacheTimeKey = "products_cache_time_v2";
    const maxCacheAge = 5 * 60 * 1000;

    try {
        let products = null;
        const cached = localStorage.getItem(cacheKey);
        const cachedTime = Number(localStorage.getItem(cacheTimeKey) || 0);

        if (cached && Date.now() - cachedTime < maxCacheAge) {
            products = JSON.parse(cached);
        }

        if (!products) {
            const response = await fetch(`${API_URL}/products`, { cache: "force-cache" });
            if (!response.ok) throw new Error(`Products request failed: ${response.status}`);
            products = await response.json();
            try {
                localStorage.setItem(cacheKey, JSON.stringify(products));
                localStorage.setItem(cacheTimeKey, String(Date.now()));
            } catch (_) {}
        }

        if (!products.length) {
            container.innerHTML = "<p>No products available.</p>";
            return;
        }

        const fragment = document.createDocumentFragment();

        products.forEach((product, index) => {
            const card = document.createElement("div");
            card.className = "card";
            const image = product.image || product.imageUrl ||
                "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800";

            card.innerHTML = `
                <img src="${escapeHtml(image)}"
                     alt="${escapeHtml(product.name || "Product")}"
                     loading="${index < 6 ? "eager" : "lazy"}"
                     decoding="async"
                     fetchpriority="${index < 2 ? "high" : "auto"}">
                <h3>${escapeHtml(product.name || "Product")}</h3>
                <p class="price">₹${Number(product.price || 0).toLocaleString("en-IN")}</p>
                <p class="stock">Category: ${escapeHtml(product.category || "Fashion Item")}</p>
                <p class="stock">Stock: ${Number(product.stock || 0)}</p>
                <button class="buy-btn" type="button">BUY NOW</button>
            `;

            card.querySelector(".buy-btn").addEventListener("click", () => buyNow(product));
            fragment.appendChild(card);
        });

        container.replaceChildren(fragment);
        enable3DTilt();
    } catch (error) {
        console.error("Product error:", error);
        container.innerHTML =
            `<p>Unable to load products. Check that the backend is running and API_URL is correct.</p>`;
    }
}

function enable3DTilt() {
    document.querySelectorAll(".card").forEach(card => {
        card.addEventListener("mousemove", e => {
            if (window.innerWidth <= 600) return;
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const rotateY = ((x / rect.width) - 0.5) * 14;
            const rotateX = ((y / rect.height) - 0.5) * -14;
            card.style.transform =
                `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
        });

        card.addEventListener("mouseleave", () => {
            card.style.transform = "";
        });
    });
}

function buyNow(product) {
    sessionStorage.setItem("selectedProduct", JSON.stringify(product));
    window.location.href = "checkout.html";
}


function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
