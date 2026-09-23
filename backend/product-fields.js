// Product fields shared by the existing authenticated admin routes.
function productFields(body) {
  const bad = message => { const e = new Error(message); e.status = 400; throw e; };
  const text = (key, max) => {
    const value = String(body[key] ?? '').trim();
    if (value.length > max) bad(`${key} must be at most ${max} characters`);
    return value;
  };
  const number = (key, max, integer = true) => {
    const raw = body[key];
    if (raw === '' || raw === null || raw === undefined) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) bad(`Invalid ${key}`);
    return value;
  };
  const name = text('name', 150);
  if (!name) bad('Product name is required');
  const price = number('price', 10000000, false);
  const stock = number('stock', 1000000);
  if (price === null || stock === null) bad('Price and stock are required');
  let images = body.images;
  if (images === undefined) images = [body.image || body.imageUrl || ''].filter(Boolean);
  if (!Array.isArray(images) || images.length > 10) bad('Use up to 10 image URLs');
  images = [...new Set(images.map(value => {
    if (typeof value !== 'string' || value.length > 2048) bad('Invalid image URL');
    const url = value.trim();
    try { if (!['https:', 'http:'].includes(new URL(url).protocol)) bad('Images must use HTTP or HTTPS URLs'); } catch (_) { bad('Images must use valid HTTP or HTTPS URLs'); }
    return url;
  }))];
  const deliveryMinDays = number('deliveryMinDays', 365);
  const deliveryMaxDays = number('deliveryMaxDays', 365);
  if ((deliveryMinDays === null) !== (deliveryMaxDays === null)) bad('Enter both delivery estimates');
  if (deliveryMinDays !== null && deliveryMaxDays < deliveryMinDays) bad('Maximum delivery days must be at least the minimum');
  return {
    name, category: text('category', 80), price, stock, images,
    image: images[0] || '', imageUrl: images[0] || '',
    description: text('description', 10000), details: text('details', 6000),
    returnDays: number('returnDays', 365), returnPolicy: text('returnPolicy', 2000),
    deliveryMinDays, deliveryMaxDays,
    isActive: body.isActive !== false, inStock: stock > 0 && body.inStock !== false
  };
}
module.exports = { productFields };
