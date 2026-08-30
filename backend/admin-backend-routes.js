// Add the following backend routes to your existing server.js.
// This file is a reference snippet; merge the code into server.js rather than
// running it separately.
//
// Required packages:
// npm install jsonwebtoken bcryptjs

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync("ChangeMe123!", 10);
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";

function adminAuth(req,res,next){
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try{
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  }catch{
    res.status(401).json({message:"Unauthorized"});
  }
}

app.post("/admin/login", async (req,res)=>{
  const {username,password} = req.body || {};
  const validUser = username === ADMIN_USER;
  const validPassword = await bcrypt.compare(password || "", ADMIN_PASSWORD_HASH);
  if(!validUser || !validPassword) return res.status(401).json({message:"Invalid username or password"});
  const token = jwt.sign({username,role:"admin"}, JWT_SECRET, {expiresIn:"8h"});
  res.json({token});
});

// IMPORTANT:
// Change "Product" below to your actual Mongoose model name if it differs.
// The routes assume your Product model has:
// name, category, price, stock, image, description, isActive.

app.post("/products", adminAuth, async (req,res)=>{
  try{
    const product = await Product.create(req.body);
    res.status(201).json(product);
  }catch(err){ res.status(400).json({message:err.message}); }
});

app.put("/products/:id", adminAuth, async (req,res)=>{
  try{
    const product = await Product.findByIdAndUpdate(
      req.params.id, req.body, {new:true, runValidators:true}
    );
    if(!product) return res.status(404).json({message:"Product not found"});
    res.json(product);
  }catch(err){ res.status(400).json({message:err.message}); }
});

app.patch("/products/:id/stock", adminAuth, async (req,res)=>{
  try{
    const stock = Number(req.body.stock);
    if(!Number.isInteger(stock) || stock < 0) return res.status(400).json({message:"Stock must be a non-negative integer"});
    const product = await Product.findByIdAndUpdate(
      req.params.id, {stock}, {new:true, runValidators:true}
    );
    if(!product) return res.status(404).json({message:"Product not found"});
    res.json(product);
  }catch(err){ res.status(400).json({message:err.message}); }
});

app.delete("/products/:id", adminAuth, async (req,res)=>{
  try{
    const product = await Product.findByIdAndDelete(req.params.id);
    if(!product) return res.status(404).json({message:"Product not found"});
    res.json({message:"Product deleted"});
  }catch(err){ res.status(400).json({message:err.message}); }
});
