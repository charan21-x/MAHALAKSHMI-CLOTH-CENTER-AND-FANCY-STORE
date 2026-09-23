(() => {
  'use strict';
  const API = 'https://mahalakshmi-backend-api.onrender.com';
  const $ = id => document.getElementById(id);
  let token = sessionStorage.getItem('mahalakshmiAdminToken') || '', products = [];
  const fields = ['name','category','price','stock','description','details','deliveryMinDays','deliveryMaxDays','returnDays','returnPolicy'];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function urls() { return $('images').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean); }
  function validURL(value) { try { return ['http:','https:'].includes(new URL(value).protocol); } catch { return false; } }
  function message(text) { $('message').textContent = text; }
  function showSession() { $('loginPanel').hidden = !!token; $('dashboard').hidden = !token; }
  async function request(path, method = 'GET', body) {
    const response = await fetch(API + path, {method, headers:{'Content-Type':'application/json', ...(token ? {Authorization:'Bearer ' + token}: {})}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) { token = ''; sessionStorage.removeItem('mahalakshmiAdminToken'); showSession(); }
    if (!response.ok) throw new Error(result.message || `Request failed (${response.status})`);
    return result;
  }
  function previews() {
    $('imagePreview').replaceChildren();
    urls().filter(validURL).slice(0,10).forEach((url, i) => { const img = document.createElement('img'); img.src = url; img.alt = 'Product photo ' + (i+1); img.referrerPolicy = 'no-referrer'; $('imagePreview').append(img); });
  }
  function reset() { $('productForm').reset(); $('productId').value = ''; $('formTitle').textContent = 'Add product'; $('saveProduct').textContent = 'Add product'; $('cancelEdit').hidden = true; previews(); }
  function render() {
    const q = $('search').value.trim().toLowerCase();
    const shown = products.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(q));
    $('productRows').innerHTML = shown.map(p => `<tr><td>${validURL(p.image || '') ? `<img src="${escape(p.image)}" alt="${escape(p.name)}" loading="lazy">` : 'No photo'}</td><td>${escape(p.name)}<br><small>${escape(p.category)}</small></td><td>₹${Number(p.price).toLocaleString('en-IN')}</td><td>${Number(p.stock)||0}</td><td>${p.isActive === false ? 'Hidden' : 'Visible'}</td><td><button type="button" class="store-button secondary" data-edit="${escape(p._id)}">Edit</button><button type="button" class="store-button danger" data-delete="${escape(p._id)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="6">No products found.</td></tr>';
  }
  async function load() { try { products = await request('/admin/products'); render(); } catch (e) { message(e.message); } }
  $('loginForm').onsubmit = async event => { event.preventDefault(); $('loginButton').disabled = true; try { const data = await request('/admin/login','POST',{username:$('username').value.trim(),password:$('password').value}); if (!data.token) throw new Error('Login did not return a session'); token = data.token; sessionStorage.setItem('mahalakshmiAdminToken',token); $('password').value=''; showSession(); message(''); await load(); } catch(e) { message(e.message); } finally { $('loginButton').disabled=false; } };
  $('logout').onclick = () => { token='';sessionStorage.removeItem('mahalakshmiAdminToken');products=[];reset();showSession();message('Logged out.'); };
  $('images').oninput = previews;
  $('cancelEdit').onclick = reset;
  $('search').oninput = render;
  $('refresh').onclick = load;
  $('productRows').onclick = async event => {
    const button = event.target.closest('button'); if (!button) return;
    const p = products.find(p => String(p._id) === (button.dataset.edit || button.dataset.delete)); if (!p) return;
    if (button.dataset.edit) {
      fields.forEach(key => { $(key).value = p[key] ?? ''; }); $('productId').value=p._id;
      $('images').value=(p.images?.length ? p.images : [p.image || p.imageUrl].filter(Boolean)).join('\n'); $('isActive').checked=p.isActive!==false;
      $('formTitle').textContent='Edit product';$('saveProduct').textContent='Save changes';$('cancelEdit').hidden=false;previews();$('name').focus();$('productForm').scrollIntoView({block:'start'});
    } else if (confirm(`Delete “${p.name}”? This removes the product from the store.`)) {
      button.disabled=true;
      try { await request('/admin/products/'+encodeURIComponent(p._id),'DELETE'); if ($('productId').value===String(p._id)) reset(); message('Product deleted.'); await load(); } catch(e) { message(e.message); } finally { button.disabled=false; }
    }
  };
  $('productForm').onsubmit = async event => {
    event.preventDefault(); const images=urls();
    if(images.length>10 || images.some(url=>!validURL(url))) return message('Enter up to 10 valid HTTP/HTTPS image URLs, one per line.');
    const data=Object.fromEntries(fields.map(key=>[key,$(key).value.trim()]));
    ['price','stock','returnDays','deliveryMinDays','deliveryMaxDays'].forEach(key=>{data[key]=data[key]===''?null:Number(data[key]);});
    if ((data.deliveryMinDays===null)!==(data.deliveryMaxDays===null) || (data.deliveryMinDays!==null && data.deliveryMaxDays<data.deliveryMinDays)) return message('Enter both delivery estimates, with maximum days at least the minimum.');
    Object.assign(data,{images,image:images[0]||'',isActive:$('isActive').checked});
    $('saveProduct').disabled=true;
    try { const id=$('productId').value; await request('/admin/products'+(id?'/'+encodeURIComponent(id):''),id?'PUT':'POST',data);reset();message('Product saved. Store listings may take up to 90 seconds to refresh.');await load(); } catch(e) {message(e.message);} finally {$('saveProduct').disabled=false;}
  };
  showSession(); if(token) load();
})();
