const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const twilio = require("twilio");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "@fancyDB";
const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI");
  process.exit(1);
}
if (!CUSTOMER_JWT_SECRET) {
  console.error("Missing CUSTOMER_JWT_SECRET");
  process.exit(1);
}
if (!ADMIN_JWT_SECRET || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error("Missing admin environment variables");
  process.exit(1);
}

const otpConfigured = Boolean(
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_VERIFY_SERVICE_SID
);
const twilioClient = otpConfigured
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  },
  maxPoolSize: 20
});

const otpRate = new Map();
function allowOtp(phone) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const limit = 5;
  const old = (otpRate.get(phone) || []).filter(t => now - t < windowMs);
  if (old.length >= limit) return false;
  old.push(now);
  otpRate.set(phone, old);
  return true;
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (!/^[6-9][0-9]{9}$/.test(local)) return null;
  return { local, e164: `+91${local}` };
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a || ""));
  const B = Buffer.from(String(b || ""));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function requireCustomer(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Mobile verification required" });
  }
  try {
    const payload = jwt.verify(auth.slice(7), CUSTOMER_JWT_SECRET);
    if (payload.role !== "customer" || !payload.phone) throw new Error("bad token");
    req.customer = payload;
    next();
  } catch (_) {
    return res.status(401).json({ message: "Customer login expired. Verify your mobile again." });
  }
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Admin login required" });
  }
  try {
    const payload = jwt.verify(auth.slice(7), ADMIN_JWT_SECRET);
    if (payload.role !== "admin") throw new Error("bad token");
    req.admin = payload;
    next();
  } catch (_) {
    return res.status(401).json({ message: "Admin session expired" });
  }
}

function orderOwnerFilter(phone, extra = {}) {
  return {
    ...extra,
    $or: [
      { phoneNormalized: phone },
      { phone },
      { phone: `91${phone}` },
      { phone: `+91${phone}` }
    ]
  };
}

function normalizeProduct(body) {
  const stock = Math.max(0, Math.floor(Number(body.stock || 0)));
  const image = String(body.image || body.imageUrl || "").trim();
  return {
    name: String(body.name || "").trim(),
    category: String(body.category || "").trim(),
    price: Math.max(0, Number(body.price || 0)),
    stock,
    image,
    imageUrl: image,
    description: String(body.description || "").trim(),
    isActive: body.isActive !== false,
    inStock: stock > 0 && body.inStock !== false
  };
}

async function start() {
  await client.connect();
  await client.db("admin").command({ ping: 1 });
  console.log("MongoDB connected");

  const db = client.db(DB_NAME);
  const products = db.collection("sarees and fancy items");
  const orders = db.collection("orders");

  await Promise.all([
    products.createIndex({ category: 1 }),
    products.createIndex({ name: 1 }),
    orders.createIndex({ phoneNormalized: 1, createdAt: -1 }),
    orders.createIndex({ phone: 1, createdAt: -1 })
  ]);

  app.get("/", (req, res) => res.send("MAHALAKSHIMI backend running"));

  // Public product list.
  app.get("/products", async (req, res) => {
    try {
      res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      const list = await products.find(
        { isActive: { $ne: false } },
        { projection: { name:1, category:1, price:1, stock:1, image:1, imageUrl:1, inStock:1 } }
      ).toArray();
      res.json(list);
    } catch (e) {
      res.status(500).json({ message: "Unable to load products" });
    }
  });

  // Place order. New orders always store a normalized 10-digit phone.
  app.post("/orders", async (req, res) => {
    try {
      const x = req.body || {};
      const phone = normalizePhone(x.phone);
      if (!x.productName || !x.customerName || !phone || !x.address || !x.paymentMethod) {
        return res.status(400).json({ acknowledged:false, message:"Required order details are missing" });
      }
      if (x.pincode && !/^[0-9]{6}$/.test(String(x.pincode))) {
        return res.status(400).json({ acknowledged:false, message:"Invalid pincode" });
      }
      const order = {
        ...x,
        phone: phone.local,
        phoneNormalized: phone.local,
        price: Number(x.price || 0),
        quantity: Math.max(1, Number(x.quantity || 1)),
        orderStatus: x.orderStatus || "Placed",
        paymentStatus: x.paymentStatus || "Pending",
        createdAt: new Date()
      };
      const result = await orders.insertOne(order);
      res.status(201).json({ acknowledged:result.acknowledged, insertedId:result.insertedId });
    } catch (e) {
      console.error("Order create error:", e);
      res.status(500).json({ acknowledged:false, message:"Unable to place order" });
    }
  });

  // Send OTP to the mobile number.
  app.post("/customer/auth/send-otp", async (req, res) => {
    try {
      const phone = normalizePhone(req.body && req.body.phone);
      if (!phone) return res.status(400).json({ message:"Enter a valid Indian mobile number" });
      if (!otpConfigured) {
        return res.status(503).json({ message:"OTP service is not configured on the server" });
      }
      if (!allowOtp(phone.local)) {
        return res.status(429).json({ message:"Too many OTP requests. Please try again later." });
      }
      await twilioClient.verify.v2.services(TWILIO_VERIFY_SERVICE_SID)
        .verifications.create({ to:phone.e164, channel:"sms" });
      res.json({ sent:true });
    } catch (e) {
      console.error("OTP send error:", e && e.message ? e.message : e);
      res.status(500).json({ message:"Could not send OTP" });
    }
  });

  // Verify OTP and create customer token containing the verified phone.
  app.post("/customer/auth/verify-otp", async (req, res) => {
    try {
      const phone = normalizePhone(req.body && req.body.phone);
      const code = String((req.body && req.body.code) || "").replace(/\D/g, "");
      if (!phone || !/^[0-9]{4,10}$/.test(code)) {
        return res.status(400).json({ message:"Invalid mobile number or OTP" });
      }
      if (!otpConfigured) {
        return res.status(503).json({ message:"OTP service is not configured on the server" });
      }
      const check = await twilioClient.verify.v2.services(TWILIO_VERIFY_SERVICE_SID)
        .verificationChecks.create({ to:phone.e164, code });
      if (check.status !== "approved") {
        return res.status(401).json({ message:"Incorrect or expired OTP" });
      }
      const token = jwt.sign(
        { role:"customer", phone:phone.local },
        CUSTOMER_JWT_SECRET,
        { expiresIn:"12h" }
      );
      res.json({ token, phone:phone.local });
    } catch (e) {
      console.error("OTP verify error:", e && e.message ? e.message : e);
      res.status(401).json({ message:"OTP verification failed" });
    }
  });

  // Customer can only see orders belonging to the verified phone in the token.
  app.get("/customer/orders", requireCustomer, async (req, res) => {
    try {
      const list = await orders.find(orderOwnerFilter(req.customer.phone))
        .sort({ createdAt:-1 }).toArray();
      res.json(list);
    } catch (e) {
      res.status(500).json({ message:"Unable to load your orders" });
    }
  });

  // Shared tracking links are also protected by phone ownership.
  app.get("/customer/orders/:id", requireCustomer, async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message:"Invalid order ID" });
      }
      const order = await orders.findOne(orderOwnerFilter(req.customer.phone, {
        _id:new ObjectId(req.params.id)
      }));
      if (!order) {
        return res.status(404).json({ message:"This order is not available for your verified mobile number" });
      }
      res.json(order);
    } catch (e) {
      res.status(500).json({ message:"Unable to load order" });
    }
  });

  // Admin login.
  app.post("/admin/login", (req, res) => {
    const username = String((req.body && req.body.username) || "");
    const password = String((req.body && req.body.password) || "");
    if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
      return res.status(401).json({ message:"Invalid username or password" });
    }
    const token = jwt.sign(
      { role:"admin", username:ADMIN_USERNAME },
      ADMIN_JWT_SECRET,
      { expiresIn:"8h" }
    );
    res.json({ token });
  });

  // Only admin can see all customer orders.
  app.get("/admin/orders", requireAdmin, async (req, res) => {
    try {
      res.json(await orders.find({}).sort({ createdAt:-1 }).toArray());
    } catch (e) {
      res.status(500).json({ message:"Unable to load orders" });
    }
  });

  // Admin product management.
  app.get("/admin/products", requireAdmin, async (req, res) => {
    try { res.json(await products.find({}).sort({ name:1 }).toArray()); }
    catch (e) { res.status(500).json({ message:e.message }); }
  });

  app.post("/admin/products", requireAdmin, async (req, res) => {
    try {
      const p = normalizeProduct(req.body || {});
      if (!p.name) return res.status(400).json({ message:"Product name is required" });
      const result = await products.insertOne({ ...p, createdAt:new Date(), updatedAt:new Date() });
      res.status(201).json({ acknowledged:true, insertedId:result.insertedId });
    } catch (e) { res.status(500).json({ message:e.message }); }
  });

  app.put("/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message:"Invalid product ID" });
      const p = normalizeProduct(req.body || {});
      if (!p.name) return res.status(400).json({ message:"Product name is required" });
      const result = await products.updateOne(
        { _id:new ObjectId(req.params.id) },
        { $set:{ ...p, updatedAt:new Date() } }
      );
      if (!result.matchedCount) return res.status(404).json({ message:"Product not found" });
      res.json({ acknowledged:true });
    } catch (e) { res.status(500).json({ message:e.message }); }
  });

  app.patch("/admin/products/:id/stock", requireAdmin, async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message:"Invalid product ID" });
      const stock = Math.floor(Number(req.body && req.body.stock));
      if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ message:"Stock must be 0 or more" });
      const result = await products.updateOne(
        { _id:new ObjectId(req.params.id) },
        { $set:{ stock, inStock:stock > 0, updatedAt:new Date() } }
      );
      if (!result.matchedCount) return res.status(404).json({ message:"Product not found" });
      res.json({ acknowledged:true, stock, inStock:stock > 0 });
    } catch (e) { res.status(500).json({ message:e.message }); }
  });

  app.delete("/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message:"Invalid product ID" });
      const result = await products.deleteOne({ _id:new ObjectId(req.params.id) });
      if (!result.deletedCount) return res.status(404).json({ message:"Product not found" });
      res.json({ acknowledged:true });
    } catch (e) { res.status(500).json({ message:e.message }); }
  });

  // IMPORTANT: there is intentionally NO public GET /orders and NO public GET /orders/:id.
  const port = process.env.PORT || 5003;
  app.listen(port, () => console.log("Server running on port " + port));
}

start().catch(e => {
  console.error("Server startup error:", e);
  process.exit(1);
});
