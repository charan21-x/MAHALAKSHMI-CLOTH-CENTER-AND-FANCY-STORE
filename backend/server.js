const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");
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

// Email OTP is sent through Brevo's HTTPS API (not SMTP).
// BREVO_SENDER_EMAIL must be a sender verified in your Brevo account.
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL =
  process.env.BREVO_SENDER_EMAIL ||
  process.env.EMAIL_USER;
const BREVO_SENDER_NAME =
  process.env.BREVO_SENDER_NAME ||
  "MAHALAKSHIMI STORE";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

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

const emailOtpConfigured = Boolean(
  BREVO_API_KEY &&
  BREVO_SENDER_EMAIL
);

const razorpayConfigured = Boolean(
  RAZORPAY_KEY_ID &&
  RAZORPAY_KEY_SECRET
);

const razorpay = razorpayConfigured
  ? new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET
    })
  : null;

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  },
  maxPoolSize: 20
});

function normalizeEmail(value) {
  const email = String(value || "")
    .trim()
    .toLowerCase();

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return null;
  }

  return email;
}

function otpHash(email, code) {
  return crypto
    .createHmac("sha256", CUSTOMER_JWT_SECRET)
    .update(`${email}|${code}`)
    .digest("hex");
}

async function sendOtpEmail(email, code) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    12000
  );

  try {
    const response = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": BREVO_API_KEY
        },
        body: JSON.stringify({
          sender: {
            name: BREVO_SENDER_NAME,
            email: BREVO_SENDER_EMAIL
          },
          to: [{ email }],
          subject: "MAHALAKSHIMI STORE - Your OTP",
          textContent:
            `Your MAHALAKSHIMI STORE OTP is ${code}. ` +
            "It expires in 10 minutes. Do not share this code."
        }),
        signal: controller.signal
      }
    );

    const responseText = await response.text();

    if (!response.ok) {
      let detail = responseText;
      try {
        const parsed = JSON.parse(responseText);
        detail =
          parsed.message ||
          parsed.code ||
          responseText;
      } catch (_) {
        // Keep the plain response text.
      }

      throw new Error(
        `Brevo HTTP ${response.status}: ${String(detail).slice(0, 250)}`
      );
    }

    return responseText;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("Brevo HTTP request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.length > 10
    ? digits.slice(-10)
    : digits;

  if (!/^[6-9][0-9]{9}$/.test(local)) {
    return null;
  }

  return {
    local,
    e164: `+91${local}`
  };
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a || ""));
  const B = Buffer.from(String(b || ""));

  return (
    A.length === B.length &&
    crypto.timingSafeEqual(A, B)
  );
}

function requireCustomer(req, res, next) {
  const auth = req.headers.authorization || "";

  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Email verification required"
    });
  }

  try {
    const payload = jwt.verify(
      auth.slice(7),
      CUSTOMER_JWT_SECRET
    );

    if (
      payload.role !== "customer" ||
      !payload.email
    ) {
      throw new Error("bad token");
    }

    req.customer = payload;
    next();
  } catch (_) {
    return res.status(401).json({
      message:
        "Customer login expired. Verify your email again."
    });
  }
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";

  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Admin login required"
    });
  }

  try {
    const payload = jwt.verify(
      auth.slice(7),
      ADMIN_JWT_SECRET
    );

    if (payload.role !== "admin") {
      throw new Error("bad token");
    }

    req.admin = payload;
    next();
  } catch (_) {
    return res.status(401).json({
      message: "Admin session expired"
    });
  }
}

function orderOwnerFilter(email, extra = {}) {
  return {
    ...extra,
    $or: [
      { emailNormalized: email },
      { email }
    ]
  };
}

function normalizeProduct(body) {
  const stock = Math.max(
    0,
    Math.floor(Number(body.stock || 0))
  );

  const image = String(
    body.image ||
    body.imageUrl ||
    ""
  ).trim();

  return {
    name: String(body.name || "").trim(),
    category: String(body.category || "").trim(),
    price: Math.max(0, Number(body.price || 0)),
    stock,
    image,
    imageUrl: image,
    description: String(
      body.description || ""
    ).trim(),
    isActive: body.isActive !== false,
    inStock:
      stock > 0 &&
      body.inStock !== false
  };
}

function validateDeliveryData(x) {
  const phone = normalizePhone(x.phone);
  const email = normalizeEmail(x.email);

  if (
    !x.customerName ||
    !phone ||
    !email ||
    !x.address
  ) {
    return {
      ok: false,
      message:
        "Customer name, email, mobile number and address are required"
    };
  }

  if (
    x.pincode &&
    !/^[0-9]{6}$/.test(String(x.pincode))
  ) {
    return {
      ok: false,
      message: "Invalid pincode"
    };
  }

  return {
    ok: true,
    phone,
    email
  };
}

async function getSellableProduct(
  products,
  productId
) {
  if (!ObjectId.isValid(productId)) {
    return null;
  }

  return products.findOne({
    _id: new ObjectId(productId),
    isActive: { $ne: false },
    inStock: { $ne: false },
    stock: { $gt: 0 }
  });
}

function buildCustomerFields(
  x,
  phone,
  email
) {
  return {
    customerName: String(
      x.customerName || ""
    ).trim(),

    email,
    emailNormalized: email,

    phone: phone.local,
    phoneNormalized: phone.local,

    address: String(
      x.address || ""
    ).trim(),

    doorNo: String(
      x.doorNo || ""
    ).trim(),

    areaVillage: String(
      x.areaVillage || ""
    ).trim(),

    city: String(
      x.city || ""
    ).trim(),

    pincode: String(
      x.pincode || ""
    ).trim()
  };
}

async function start() {
  await client.connect();

  await client
    .db("admin")
    .command({ ping: 1 });

  console.log("MongoDB connected");

  const db = client.db(DB_NAME);

  const products = db.collection(
    "sarees and fancy items"
  );

  const orders = db.collection("orders");

  // Payment attempts are NOT customer orders.
  // Failed/cancelled online payments stay here
  // and never appear in My Orders.
  const paymentAttempts =
    db.collection("payment_attempts");

  // Short-lived hashed email OTP records.
  const emailOtps =
    db.collection("email_otps");

  await Promise.all([
    products.createIndex({ category: 1 }),
    products.createIndex({ name: 1 }),

    orders.createIndex({
      phoneNormalized: 1,
      createdAt: -1
    }),

    orders.createIndex({
      phone: 1,
      createdAt: -1
    }),

    orders.createIndex({
      emailNormalized: 1,
      createdAt: -1
    }),

    orders.createIndex({
      email: 1,
      createdAt: -1
    }),

    emailOtps.createIndex(
      { emailNormalized: 1 },
      { unique: true }
    ),

    emailOtps.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 }
    ),

    orders.createIndex(
      { razorpayPaymentId: 1 },
      { unique: true, sparse: true }
    ),

    paymentAttempts.createIndex(
      { razorpayOrderId: 1 },
      { unique: true }
    )
  ]);

  app.get("/", (req, res) => {
    res.send(
      "MAHALAKSHIMI backend running"
    );
  });

  // ---------------------------------
  // PUBLIC PRODUCTS
  // ---------------------------------

  app.get("/products", async (req, res) => {
    try {
      res.set(
        "Cache-Control",
        "public, max-age=30, stale-while-revalidate=60"
      );

      const list = await products
        .find(
          {
            isActive: { $ne: false }
          },
          {
            projection: {
              name: 1,
              category: 1,
              price: 1,
              stock: 1,
              image: 1,
              imageUrl: 1,
              inStock: 1
            }
          }
        )
        .toArray();

      res.json(list);
    } catch (e) {
      res.status(500).json({
        message:
          "Unable to load products"
      });
    }
  });

  // ---------------------------------
  // COD ORDER
  // ---------------------------------
  //
  // SECURITY:
  // This route intentionally accepts
  // CASH ON DELIVERY ONLY.
  //
  // UPI/Card cannot use this route,
  // so an unpaid online order cannot
  // be inserted by bypassing the UI.
  // ---------------------------------

  app.post("/orders", async (req, res) => {
    try {
      const x = req.body || {};

      if (
        x.paymentMethod !==
        "Cash on Delivery"
      ) {
        return res.status(400).json({
          acknowledged: false,
          message:
            "Online payments must be verified before the order is placed"
        });
      }

      const delivery =
        validateDeliveryData(x);

      if (!delivery.ok) {
        return res.status(400).json({
          acknowledged: false,
          message: delivery.message
        });
      }

      const product =
        await getSellableProduct(
          products,
          x.productId
        );

      if (!product) {
        return res.status(400).json({
          acknowledged: false,
          message:
            "Product is unavailable or out of stock"
        });
      }

      const quantity = 1;

      const order = {
        productId: product._id,
        productName: product.name,
        productImage: product.image || product.imageUrl || "",
        price: Number(product.price || 0),
        quantity,

        ...buildCustomerFields(
          x,
          delivery.phone,
          delivery.email
        ),

        paymentMethod:
          "Cash on Delivery",

        paymentStatus:
          "COD - Pay on Delivery",

        orderStatus: "Placed",

        // Admin inbox state: new orders stay in Today's New Orders
        // until the admin opens/views them.
        adminSeen: false,
        adminSeenAt: null,

        createdAt: new Date()
      };

      const result =
        await orders.insertOne(order);

      res.status(201).json({
        acknowledged:
          result.acknowledged,

        insertedId:
          result.insertedId
      });
    } catch (e) {
      console.error(
        "COD order create error:",
        e
      );

      res.status(500).json({
        acknowledged: false,
        message:
          "Unable to place order"
      });
    }
  });

  // ---------------------------------
  // CREATE RAZORPAY PAYMENT ORDER
  // ---------------------------------
  //
  // This creates a Razorpay payment
  // order ONLY. It does NOT create
  // a customer order in MongoDB.
  // ---------------------------------

  app.post(
    "/payments/razorpay/create-order",
    async (req, res) => {
      try {
        if (!razorpayConfigured) {
          return res.status(503).json({
            message:
              "Online payment gateway is not configured"
          });
        }

        const product =
          await getSellableProduct(
            products,
            req.body &&
              req.body.productId
          );

        if (!product) {
          return res.status(400).json({
            message:
              "Product is unavailable or out of stock"
          });
        }

        const quantity = 1;

        const amount = Math.round(
          Number(product.price || 0) *
          100 *
          quantity
        );

        if (
          !Number.isInteger(amount) ||
          amount <= 0
        ) {
          return res.status(400).json({
            message:
              "Invalid product amount"
          });
        }

        const receipt =
          `mcc_${Date.now()}_${String(product._id).slice(-6)}`;

        const razorpayOrder =
          await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt
          });

        await paymentAttempts.insertOne({
          razorpayOrderId:
            razorpayOrder.id,

          productId:
            product._id,

          productSnapshot: {
            name: product.name,
            category:
              product.category || "",
            price:
              Number(product.price || 0),
            image:
              product.image || product.imageUrl || ""
          },

          quantity,
          amount,
          currency: "INR",
          status: "created",

          createdAt: new Date(),
          updatedAt: new Date()
        });

        res.json({
          keyId: RAZORPAY_KEY_ID,

          razorpayOrderId:
            razorpayOrder.id,

          amount,
          currency: "INR",

          product: {
            id: String(product._id),
            name: product.name,
            price:
              Number(product.price || 0)
          }
        });
      } catch (e) {
        console.error(
          "Razorpay order create error:",
          e
        );

        res.status(500).json({
          message:
            "Unable to start online payment"
        });
      }
    }
  );

  // ---------------------------------
  // VERIFY PAYMENT THEN PLACE ORDER
  // ---------------------------------
  //
  // The customer order is inserted
  // ONLY after:
  // 1. signature is valid
  // 2. payment belongs to our order
  // 3. amount matches
  // 4. Razorpay reports CAPTURED
  // ---------------------------------

  app.post(
    "/payments/razorpay/verify-and-place-order",
    async (req, res) => {
      try {
        if (!razorpayConfigured) {
          return res.status(503).json({
            acknowledged: false,
            message:
              "Online payment gateway is not configured"
          });
        }

        const x = req.body || {};

        const razorpayOrderId =
          String(
            x.razorpay_order_id || ""
          );

        const razorpayPaymentId =
          String(
            x.razorpay_payment_id || ""
          );

        const razorpaySignature =
          String(
            x.razorpay_signature || ""
          );

        if (
          !razorpayOrderId ||
          !razorpayPaymentId ||
          !razorpaySignature
        ) {
          return res.status(400).json({
            acknowledged: false,
            message:
              "Missing payment verification details"
          });
        }

        const delivery =
          validateDeliveryData(x);

        if (!delivery.ok) {
          return res.status(400).json({
            acknowledged: false,
            message: delivery.message
          });
        }

        // Idempotency:
        // if this payment was already
        // converted to an order, return
        // the existing order instead of
        // creating a duplicate.
        const alreadyPlaced =
          await orders.findOne({
            razorpayPaymentId
          });

        if (alreadyPlaced) {
          return res.json({
            acknowledged: true,
            insertedId:
              alreadyPlaced._id,
            alreadyPlaced: true
          });
        }

        const attempt =
          await paymentAttempts.findOne({
            razorpayOrderId
          });

        if (!attempt) {
          return res.status(400).json({
            acknowledged: false,
            message:
              "Unknown payment order"
          });
        }

        const generatedSignature =
          crypto
            .createHmac(
              "sha256",
              RAZORPAY_KEY_SECRET
            )
            .update(
              `${attempt.razorpayOrderId}|${razorpayPaymentId}`
            )
            .digest("hex");

        if (
          !safeEqual(
            generatedSignature,
            razorpaySignature
          )
        ) {
          return res.status(400).json({
            acknowledged: false,
            message:
              "Payment verification failed. Order was not placed."
          });
        }

        // Server-to-server check.
        const payment =
          await razorpay.payments.fetch(
            razorpayPaymentId
          );

        if (
          payment.order_id !==
          attempt.razorpayOrderId
        ) {
          return res.status(400).json({
            acknowledged: false,
            message:
              "Payment does not belong to this checkout"
          });
        }

        if (
          Number(payment.amount) !==
          Number(attempt.amount)
        ) {
          return res.status(400).json({
            acknowledged: false,
            message:
              "Payment amount mismatch. Order was not placed."
          });
        }

        // The user specifically asked:
        // no order until payment is
        // actually complete.
        if (
          payment.status !== "captured"
        ) {
          return res.status(409).json({
            acknowledged: false,
            message:
              "Payment is not captured yet. Order was not placed."
          });
        }

        const product =
          await products.findOne({
            _id: attempt.productId
          });

        if (!product) {
          return res.status(409).json({
            acknowledged: false,
            message:
              "Payment was received but the product record is unavailable. Contact the store."
          });
        }

        const onlineMethod =
          ["UPI", "Card"].includes(
            String(x.paymentMethod)
          )
            ? String(x.paymentMethod)
            : "Online Payment";

        const order = {
          productId:
            attempt.productId,

          productName:
            attempt.productSnapshot &&
            attempt.productSnapshot.name
              ? attempt.productSnapshot.name
              : product.name,

          productImage:
            attempt.productSnapshot &&
            attempt.productSnapshot.image
              ? attempt.productSnapshot.image
              : (product.image || product.imageUrl || ""),

          price:
            Number(attempt.amount) /
            100 /
            Math.max(
              1,
              Number(
                attempt.quantity || 1
              )
            ),

          quantity:
            Math.max(
              1,
              Number(
                attempt.quantity || 1
              )
            ),

          ...buildCustomerFields(
            x,
            delivery.phone,
            delivery.email
          ),

          paymentMethod:
            onlineMethod,

          paymentStatus: "Paid",

          orderStatus: "Placed",

          // Admin inbox state: new orders stay in Today's New Orders
          // until the admin opens/views them.
          adminSeen: false,
          adminSeenAt: null,

          razorpayOrderId:
            attempt.razorpayOrderId,

          razorpayPaymentId,

          razorpayPaymentMethod:
            payment.method || null,

          amountPaid:
            Number(payment.amount) /
            100,

          currency:
            payment.currency || "INR",

          paidAt: new Date(),

          createdAt: new Date()
        };

        let result;

        try {
          result =
            await orders.insertOne(order);
        } catch (insertError) {
          // Duplicate payment protection.
          if (
            insertError &&
            insertError.code === 11000
          ) {
            const existing =
              await orders.findOne({
                razorpayPaymentId
              });

            if (existing) {
              return res.json({
                acknowledged: true,
                insertedId:
                  existing._id,
                alreadyPlaced: true
              });
            }
          }

          throw insertError;
        }

        await paymentAttempts.updateOne(
          {
            razorpayOrderId:
              attempt.razorpayOrderId
          },
          {
            $set: {
              status: "placed",
              razorpayPaymentId,
              placedOrderId:
                result.insertedId,
              updatedAt: new Date()
            }
          }
        );

        res.status(201).json({
          acknowledged: true,
          insertedId:
            result.insertedId,
          paymentStatus: "Paid"
        });
      } catch (e) {
        console.error(
          "Payment verify/order error:",
          e
        );

        res.status(500).json({
          acknowledged: false,
          message:
            "Payment could not be verified. Order was not placed."
        });
      }
    }
  );

  // ---------------------------------
  // CUSTOMER EMAIL OTP
  // ---------------------------------

  app.post(
    "/customer/auth/send-email-otp",
    async (req, res) => {
      try {
        const email = normalizeEmail(
          req.body && req.body.email
        );

        if (!email) {
          return res.status(400).json({
            message: "Enter a valid email address"
          });
        }

        if (!emailOtpConfigured) {
          return res.status(503).json({
            message:
              "Email OTP HTTP API is not configured on the server"
          });
        }

        const now = new Date();
        const existing = await emailOtps.findOne({
          emailNormalized: email
        });

        if (
          existing &&
          existing.lastSentAt &&
          now.getTime() -
            new Date(existing.lastSentAt).getTime() <
            60 * 1000
        ) {
          return res.status(429).json({
            message:
              "Please wait 60 seconds before requesting another OTP"
          });
        }

        const code = String(
          crypto.randomInt(100000, 1000000)
        );

        const expiresAt = new Date(
          now.getTime() + 10 * 60 * 1000
        );

        await emailOtps.updateOne(
          { emailNormalized: email },
          {
            $set: {
              emailNormalized: email,
              otpHash: otpHash(email, code),
              attempts: 0,
              lastSentAt: now,
              expiresAt
            }
          },
          { upsert: true }
        );

        try {
          await sendOtpEmail(email, code);
        } catch (mailError) {
          await emailOtps.deleteOne({
            emailNormalized: email
          });
          throw mailError;
        }

        res.json({ sent: true });
      } catch (e) {
        console.error(
          "Email OTP send error:",
          e && e.message ? e.message : e
        );

        res.status(500).json({
          message: "Could not send email OTP"
        });
      }
    }
  );

  app.post(
    "/customer/auth/verify-email-otp",
    async (req, res) => {
      try {
        const email = normalizeEmail(
          req.body && req.body.email
        );

        const code = String(
          (req.body && req.body.code) || ""
        ).replace(/\D/g, "");

        if (!email || !/^[0-9]{6}$/.test(code)) {
          return res.status(400).json({
            message: "Invalid email or OTP"
          });
        }

        const record = await emailOtps.findOne({
          emailNormalized: email
        });

        if (!record) {
          return res.status(401).json({
            message: "OTP expired. Request a new OTP."
          });
        }

        if (
          !record.expiresAt ||
          new Date(record.expiresAt).getTime() < Date.now()
        ) {
          await emailOtps.deleteOne({
            emailNormalized: email
          });
          return res.status(401).json({
            message: "OTP expired. Request a new OTP."
          });
        }

        if (Number(record.attempts || 0) >= 5) {
          await emailOtps.deleteOne({
            emailNormalized: email
          });
          return res.status(429).json({
            message:
              "Too many incorrect attempts. Request a new OTP."
          });
        }

        const expected = otpHash(email, code);

        if (!safeEqual(expected, record.otpHash)) {
          await emailOtps.updateOne(
            { emailNormalized: email },
            { $inc: { attempts: 1 } }
          );
          return res.status(401).json({
            message: "Incorrect OTP"
          });
        }

        await emailOtps.deleteOne({
          emailNormalized: email
        });

        const token = jwt.sign(
          {
            role: "customer",
            email
          },
          CUSTOMER_JWT_SECRET,
          { expiresIn: "12h" }
        );

        res.json({ token, email });
      } catch (e) {
        console.error(
          "Email OTP verify error:",
          e && e.message ? e.message : e
        );

        res.status(500).json({
          message: "OTP verification failed"
        });
      }
    }
  );

  // Customer sees only own orders.
  app.get(
    "/customer/orders",
    requireCustomer,
    async (req, res) => {
      try {
        const list =
          await orders
            .find(
              orderOwnerFilter(
                req.customer.email
              )
            )
            .sort({
              createdAt: -1
            })
            .toArray();

        res.json(list);
      } catch (e) {
        res.status(500).json({
          message:
            "Unable to load your orders"
        });
      }
    }
  );

  // Tracking link is also ownership protected.
  app.get(
    "/customer/orders/:id",
    requireCustomer,
    async (req, res) => {
      try {
        if (
          !ObjectId.isValid(
            req.params.id
          )
        ) {
          return res.status(400).json({
            message:
              "Invalid order ID"
          });
        }

        const order =
          await orders.findOne(
            orderOwnerFilter(
              req.customer.email,
              {
                _id:
                  new ObjectId(
                    req.params.id
                  )
              }
            )
          );

        if (!order) {
          return res.status(404).json({
            message:
              "This order is not available for your verified email address"
          });
        }

        res.json(order);
      } catch (e) {
        res.status(500).json({
          message:
            "Unable to load order"
        });
      }
    }
  );

  // ---------------------------------
  // ADMIN
  // ---------------------------------

  app.post(
    "/admin/login",
    (req, res) => {
      const username =
        String(
          (req.body &&
            req.body.username) ||
          ""
        );

      const password =
        String(
          (req.body &&
            req.body.password) ||
          ""
        );

      if (
        !safeEqual(
          username,
          ADMIN_USERNAME
        ) ||
        !safeEqual(
          password,
          ADMIN_PASSWORD
        )
      ) {
        return res.status(401).json({
          message:
            "Invalid username or password"
        });
      }

      const token = jwt.sign(
        {
          role: "admin",
          username: ADMIN_USERNAME
        },
        ADMIN_JWT_SECRET,
        {
          expiresIn: "8h"
        }
      );

      res.json({
        token
      });
    }
  );

  // Today's unseen orders, calculated using India Standard Time.
  // Old orders that pre-date adminSeen are treated as unseen only if
  // they were actually created today.
  app.get(
    "/admin/orders/today-new",
    requireAdmin,
    async (req, res) => {
      try {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).formatToParts(new Date());

        const byType = Object.fromEntries(
          parts.map(part => [part.type, part.value])
        );

        const ymd = `${byType.year}-${byType.month}-${byType.day}`;
        const start = new Date(`${ymd}T00:00:00.000+05:30`);
        const end = new Date(`${ymd}T23:59:59.999+05:30`);

        const list = await orders
          .find({
            createdAt: { $gte: start, $lte: end },
            adminSeen: { $ne: true }
          })
          .sort({ createdAt: -1 })
          .toArray();

        res.json(list);
      } catch (e) {
        console.error("Today new orders error:", e);
        res.status(500).json({
          message: "Unable to load today's new orders"
        });
      }
    }
  );

  // Mark an order as seen when the admin opens it.
  app.patch(
    "/admin/orders/:id/seen",
    requireAdmin,
    async (req, res) => {
      try {
        if (!ObjectId.isValid(req.params.id)) {
          return res.status(400).json({
            message: "Invalid order ID"
          });
        }

        const result = await orders.updateOne(
          { _id: new ObjectId(req.params.id) },
          {
            $set: {
              adminSeen: true,
              adminSeenAt: new Date()
            }
          }
        );

        if (!result.matchedCount) {
          return res.status(404).json({
            message: "Order not found"
          });
        }

        res.json({ acknowledged: true });
      } catch (e) {
        console.error("Mark order seen error:", e);
        res.status(500).json({
          message: "Unable to mark order as seen"
        });
      }
    }
  );

  // Complete order history, newest first.
  app.get(
    "/admin/orders",
    requireAdmin,
    async (req, res) => {
      try {
        res.json(
          await orders
            .find({})
            .sort({
              createdAt: -1
            })
            .toArray()
        );
      } catch (e) {
        res.status(500).json({
          message:
            "Unable to load orders"
        });
      }
    }
  );

  app.get(
    "/admin/products",
    requireAdmin,
    async (req, res) => {
      try {
        res.json(
          await products
            .find({})
            .sort({ name: 1 })
            .toArray()
        );
      } catch (e) {
        res.status(500).json({
          message: e.message
        });
      }
    }
  );

  app.post(
    "/admin/products",
    requireAdmin,
    async (req, res) => {
      try {
        const p =
          normalizeProduct(
            req.body || {}
          );

        if (!p.name) {
          return res.status(400).json({
            message:
              "Product name is required"
          });
        }

        const result =
          await products.insertOne({
            ...p,
            createdAt: new Date(),
            updatedAt: new Date()
          });

        res.status(201).json({
          acknowledged: true,
          insertedId:
            result.insertedId
        });
      } catch (e) {
        res.status(500).json({
          message: e.message
        });
      }
    }
  );

  app.put(
    "/admin/products/:id",
    requireAdmin,
    async (req, res) => {
      try {
        if (
          !ObjectId.isValid(
            req.params.id
          )
        ) {
          return res.status(400).json({
            message:
              "Invalid product ID"
          });
        }

        const p =
          normalizeProduct(
            req.body || {}
          );

        if (!p.name) {
          return res.status(400).json({
            message:
              "Product name is required"
          });
        }

        const result =
          await products.updateOne(
            {
              _id:
                new ObjectId(
                  req.params.id
                )
            },
            {
              $set: {
                ...p,
                updatedAt:
                  new Date()
              }
            }
          );

        if (!result.matchedCount) {
          return res.status(404).json({
            message:
              "Product not found"
          });
        }

        res.json({
          acknowledged: true
        });
      } catch (e) {
        res.status(500).json({
          message: e.message
        });
      }
    }
  );

  app.patch(
    "/admin/products/:id/stock",
    requireAdmin,
    async (req, res) => {
      try {
        if (
          !ObjectId.isValid(
            req.params.id
          )
        ) {
          return res.status(400).json({
            message:
              "Invalid product ID"
          });
        }

        const stock = Math.floor(
          Number(
            req.body &&
            req.body.stock
          )
        );

        if (
          !Number.isInteger(stock) ||
          stock < 0
        ) {
          return res.status(400).json({
            message:
              "Stock must be 0 or more"
          });
        }

        const result =
          await products.updateOne(
            {
              _id:
                new ObjectId(
                  req.params.id
                )
            },
            {
              $set: {
                stock,
                inStock: stock > 0,
                updatedAt:
                  new Date()
              }
            }
          );

        if (!result.matchedCount) {
          return res.status(404).json({
            message:
              "Product not found"
          });
        }

        res.json({
          acknowledged: true,
          stock,
          inStock: stock > 0
        });
      } catch (e) {
        res.status(500).json({
          message: e.message
        });
      }
    }
  );

  app.delete(
    "/admin/products/:id",
    requireAdmin,
    async (req, res) => {
      try {
        if (
          !ObjectId.isValid(
            req.params.id
          )
        ) {
          return res.status(400).json({
            message:
              "Invalid product ID"
          });
        }

        const result =
          await products.deleteOne({
            _id:
              new ObjectId(
                req.params.id
              )
          });

        if (!result.deletedCount) {
          return res.status(404).json({
            message:
              "Product not found"
          });
        }

        res.json({
          acknowledged: true
        });
      } catch (e) {
        res.status(500).json({
          message: e.message
        });
      }
    }
  );

  // IMPORTANT:
  // There is intentionally NO public
  // GET /orders and NO public
  // GET /orders/:id.

  const port =
    process.env.PORT || 5003;

  app.listen(port, () => {
    console.log(
      "Server running on port " +
      port
    );

    console.log(
      "Razorpay configured:",
      razorpayConfigured
    );

    console.log(
      "Email OTP configured:",
      emailOtpConfigured
    );
  });
}

start().catch(e => {
  console.error(
    "Server startup error:",
    e
  );

  process.exit(1);
});
