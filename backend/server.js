const express = require("express"),
    cors = require("cors"),
    { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
app.use(cors());
app.use(express.json());
const uri = process.env.MONGODB_URI;
if (!uri) { console.error("Missing MONGODB_URI");
    process.exit(1) }
const DB_NAME = process.env.DB_NAME || "@fancyDB";
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } });
async function start() {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB connected");
    const db = client.db(DB_NAME);\
    nawait db.collection("sarees and fancy items").createIndex({ category: 1 });
    app.get("/", (q, s) => s.send("MAHALAKSHIMI backend running"));
    const productCache = { data: null, expires: 0 };
    app.get("/products", async(q, s) => {
        try {
            s.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
            const now = Date.now();
            if (productCache.data && now < productCache.expires) return s.json(productCache.data);
            const products = await db.collection("sarees and fancy items")
                .find({}, { projection: { name: 1, price: 1, stock: 1, category: 1, image: 1, imageUrl: 1 } })
                .toArray();
            productCache.data = products;
            productCache.expires = now + 60000;
            s.json(products);
        } catch (e) { s.status(500).json({ message: e.message }) }
    });
    app.post("/orders", async(q, s) => { try { const x = q.body; if (!x.productName || !x.customerName || !x.phone || !x.address || !x.paymentMethod) return s.status(400).json({ acknowledged: false, message: "Required order details are missing" }); if (!/^[0-9]{10}$/.test(String(x.phone))) return s.status(400).json({ acknowledged: false, message: "Invalid phone number" }); if (x.pincode && !/^[0-9]{6}$/.test(String(x.pincode))) return s.status(400).json({ acknowledged: false, message: "Invalid pincode" }); const order = {...x, price: Number(x.price || 0), quantity: Number(x.quantity || 1), createdAt: new Date() }; const r = await db.collection("orders").insertOne(order);
            s.status(201).json({ acknowledged: r.acknowledged, insertedId: r.insertedId }) } catch (e) { s.status(500).json({ acknowledged: false, message: e.message }) } });
    app.get("/orders", async(q, s) => { try { s.json(await db.collection("orders").find({}).sort({ createdAt: -1 }).toArray()) } catch (e) { s.status(500).json({ message: e.message }) } });
    app.get("/orders/:id", async(q, s) => { try { if (!ObjectId.isValid(q.params.id)) return s.status(400).json({ message: "Invalid order ID" }); const o = await db.collection("orders").findOne({ _id: new ObjectId(q.params.id) }); if (!o) return s.status(404).json({ message: "Order not found" });
            s.json(o) } catch (e) { s.status(500).json({ message: e.message }) } });
    const port = process.env.PORT || 5003;
    app.listen(port, () => console.log("Server running on port " + port))
}
start().catch(e => { console.error(e);
    process.exit(1) });