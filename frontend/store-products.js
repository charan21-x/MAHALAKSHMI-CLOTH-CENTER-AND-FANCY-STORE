(() => {
  'use strict';
  const API='https://mahalakshmi-backend-api.onrender.com';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const id=p=>String(p._id||p.id||'');
  const url=value=>{try{return ['http:','https:'].includes(new URL(value).protocol)?value:'';}catch{return '';}};
  const photos=p=>[...new Set([...(Array.isArray(p.images)?p.images:[]),p.image,p.imageUrl].filter(value=>value&&url(value)))].slice(0,10);
  const money=value=>'₹'+Number(value||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  function rating(p){const count=Number(p.ratingCount),average=Number(p.ratingAverage??p.rating);return Number.isInteger(count)&&count>0&&Number.isFinite(average)&&average>=1&&average<=5 ? `★ ${average.toFixed(1)} · ${count} rating${count===1?'':'s'}`:'No ratings yet';}
  let likes=[];
  try{const saved=JSON.parse(localStorage.getItem('mahalakshmiLikedProducts')||'[]');if(Array.isArray(saved))likes=saved.filter(x=>typeof x==='string');}catch{}
  function likeButton(p){const button=document.createElement('button');button.className='store-button secondary';button.type='button';button.title='Saved on this device';const update=()=>{const liked=likes.includes(id(p));button.textContent=liked?'♥ Liked':'♡ Like';button.setAttribute('aria-pressed',String(liked));button.setAttribute('aria-label',(liked?'Unlike ':'Like ')+(p.name||'product'));};update();button.onclick=()=>{likes=likes.includes(id(p))?likes.filter(x=>x!==id(p)):[...likes,id(p)];try{localStorage.setItem('mahalakshmiLikedProducts',JSON.stringify(likes));}catch{button.title='Saved for this page only; browser storage is unavailable';}update();};return button;}
  function card(p){const el=document.createElement('article');el.className='store-card';const image=photos(p)[0];el.innerHTML=`<a href="product.html?id=${encodeURIComponent(id(p))}">${image?`<img src="${esc(image)}" alt="${esc(p.name)}" loading="lazy">`:'<div class="store-empty-image">Photo not available</div>'}<div class="store-card-content"><h3>${esc(p.name)}</h3><p class="store-rating">${esc(rating(p))}</p><strong>${money(p.price)}</strong><p class="store-muted">${Number(p.stock)>0&&p.inStock!==false?'View product':'Out of stock'}</p></div></a>`;el.append(likeButton(p));return el;}
  async function load(){const r=await fetch(API+'/products');if(!r.ok)throw new Error('Products could not be loaded. Please try again.');const list=await r.json();if(!Array.isArray(list))throw new Error('Invalid product response.');return list;}
  async function home(){const grid=document.getElementById('productGrid');if(!grid)return;grid.classList.add('store-grid');grid.textContent='Loading products…';try{const products=await load();grid.replaceChildren(...products.map(card));if(!products.length)grid.textContent='New products are coming soon.';}catch(e){grid.textContent=e.message;const retry=document.createElement('button');retry.className='store-button secondary';retry.textContent='Try again';retry.onclick=home;grid.append(retry);}}
  async function detail(){
    const root=document.getElementById('productDetail');if(!root)return;
    const productId=new URLSearchParams(location.search).get('id');
    if(!productId){root.textContent='Choose a product from the store to view its details.';return;}
    try{
      const products=await load(),p=products.find(p=>id(p)===productId);
      if(!p){root.textContent='This product is no longer available. Please browse the store for other products.';return;}
      document.title=(p.name||'Product')+' | Mahalakshmi Store';
      const images=photos(p);let active=0;
      const delivery=p.deliveryMinDays!=null&&p.deliveryMaxDays!=null?`${p.deliveryMinDays}–${p.deliveryMaxDays} days (estimated)`:'Delivery estimate not specified';
      const returns=p.returnDays==null?'Return window not specified':Number(p.returnDays)===0?'Not eligible for returns':`${p.returnDays}-day returns after delivery`;
      root.innerHTML=`<section class="store-detail"><div><button class="store-photo" id="mainPhoto" aria-label="Open product images fullscreen" ${images.length?'':'disabled'}>${images.length?`<img id="mainImage" src="${esc(images[0])}" alt="${esc(p.name)} — photo 1">`:'<div class="store-empty-image">Photo not available</div>'}</button><div class="store-thumbs" id="thumbnails" aria-label="Product photos"></div><p class="store-muted" id="imageCount"></p></div><div><p class="store-muted">${esc(p.category)}</p><h1>${esc(p.name)}</h1><a href="#ratings" class="store-rating">${esc(rating(p))}</a><p class="store-price">${money(p.price)}</p><p>${Number(p.stock)>0&&p.inStock!==false?'In stock':'Out of stock'}</p><div class="store-actions" id="actions"><button id="buyProduct" class="store-button" ${Number(p.stock)>0&&p.inStock!==false?'':'disabled'}>Buy now</button></div><p class="store-muted">Likes are saved on this device.</p><div class="store-policies"><p><strong>Delivery:</strong> ${esc(delivery)}</p><p><strong>Returns:</strong> ${esc(returns)}</p>${p.returnPolicy?`<p class="store-copy">${esc(p.returnPolicy)}</p>`:''}</div><a href="#description">Read full description ↓</a></div></section><section class="store-panel" id="description"><h2>Description</h2><p class="store-copy">${esc(p.description||'The seller has not added a description yet.')}</p>${p.details?`<h3>Product details &amp; care</h3><p class="store-copy">${esc(p.details)}</p>`:''}</section><section class="store-panel" id="ratings"><h2>Customer ratings</h2><p class="store-rating">${esc(rating(p))}</p></section>`;
      document.getElementById('actions').append(likeButton(p));
      document.getElementById('buyProduct').onclick=()=>{try{sessionStorage.setItem('selectedProduct',JSON.stringify(p));location.href='checkout.html';}catch{document.getElementById('productStatus').textContent='Please allow browser storage to continue to checkout.';}};
      const dialog=document.getElementById('gallery'),large=document.getElementById('largeImage'),count=document.getElementById('galleryCount');
      function select(index){active=(index+images.length)%images.length;document.getElementById('mainImage').src=images[active];document.getElementById('mainImage').alt=p.name+' — photo '+(active+1);large.src=images[active];large.alt=p.name+' — photo '+(active+1);count.textContent=(active+1)+' / '+images.length;document.getElementById('imageCount').textContent=`Photo ${active+1} of ${images.length} · Click image to enlarge`;document.querySelectorAll('#thumbnails button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===active)));}
      images.forEach((src,index)=>{const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','Show photo '+(index+1));const img=document.createElement('img');img.src=src;img.alt='';button.append(img);button.onclick=()=>select(index);document.getElementById('thumbnails').append(button);});
      if(images.length){select(0);document.getElementById('mainPhoto').onclick=()=>dialog.showModal();}
      document.getElementById('closeGallery').onclick=()=>dialog.close();
      document.getElementById('previousPhoto').onclick=()=>select(active-1);
      document.getElementById('nextPhoto').onclick=()=>select(active+1);
      document.getElementById('previousPhoto').disabled=images.length<2;document.getElementById('nextPhoto').disabled=images.length<2;
      dialog.addEventListener('keydown',e=>{if(images.length&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();select(active+(e.key==='ArrowLeft'?-1:1));}});
      dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
      const related=products.filter(other=>id(other)!==id(p)).sort((a,b)=>Number(b.category===p.category)-Number(a.category===p.category)).slice(0,8);
      document.getElementById('relatedProducts').replaceChildren(...related.map(card));document.getElementById('relatedSection').hidden=!related.length;
    }catch(e){root.textContent=e.message;const retry=document.createElement('button');retry.textContent='Try again';retry.className='store-button secondary';retry.onclick=detail;root.append(retry);}
  }
  home();detail();
})();
