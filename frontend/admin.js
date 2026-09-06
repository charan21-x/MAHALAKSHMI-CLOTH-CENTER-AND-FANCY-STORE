const API_URL = "https://mahalakshmi-backend-api.onrender.com";

async function loadOrders() {
    const table = document.getElementById("ordersTable");

    table.innerHTML =
        `<tr><td colspan="5">Loading orders...</td></tr>`;

    try {
        const response = await fetch(`${API_URL}/orders`);

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const orders = await response.json();

        if (!orders.length) {
            table.innerHTML =
                `<tr><td colspan="5">No orders found.</td></tr>`;
            return;
        }

        table.innerHTML = "";

        orders.forEach(order => {
            const row = document.createElement("tr");

            row.innerHTML = `
                <td>${order.customerName || "-"}</td>
                <td>${order.phone || "-"}</td>
                <td>${order.productName || "-"}</td>
                <td>₹${Number(order.price || 0).toLocaleString("en-IN")}</td>
                <td>${order.address || "-"}</td>
            `;

            table.appendChild(row);
        });

    } catch (error) {
        console.error("Orders error:", error);

        table.innerHTML = `
            <tr>
                <td colspan="5">
                    ❌ Cannot load orders
                </td>
            </tr>
        `;
    }
}

document.addEventListener("DOMContentLoaded", loadOrders);