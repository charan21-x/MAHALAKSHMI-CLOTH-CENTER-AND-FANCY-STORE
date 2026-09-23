(() => {
  'use strict';

  const API = 'https://mahalakshmi-backend-api.onrender.com';
  const $ = id => document.getElementById(id);

  let token = sessionStorage.getItem('mahalakshmiAdminToken') || '';
  let products = [];
  let selectedFiles = [];
  let existingImages = [];
  let previewObjectUrls = [];

  const fields = [
    'name','category','price','stock','description','details',
    'deliveryMinDays','deliveryMaxDays','returnDays','returnPolicy'
  ];

  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function validURL(value) {
    try {
      return ['http:','https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }

  function message(text) {
    $('message').textContent = text;
  }

  function showSession() {
    $('loginPanel').hidden = !!token;
    $('dashboard').hidden = !token;
  }

  async function request(path, method = 'GET', body) {
    const response = await fetch(API + path, {
      method,
      headers: {
        'Content-Type':'application/json',
        ...(token ? {Authorization:'Bearer ' + token} : {})
      },
      ...(body === undefined ? {} : {body:JSON.stringify(body)})
    });

    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      token = '';
      sessionStorage.removeItem('mahalakshmiAdminToken');
      showSession();
    }

    if (!response.ok) {
      throw new Error(result.message || `Request failed (${response.status})`);
    }

    return result;
  }

  function clearPreviewObjectUrls() {
    previewObjectUrls.forEach(url => URL.revokeObjectURL(url));
    previewObjectUrls = [];
  }

  function previews() {
    clearPreviewObjectUrls();
    $('imagePreview').replaceChildren();

    const sources = [
      ...existingImages.map(url => ({ url, local: false })),
      ...selectedFiles.map(file => {
        const url = URL.createObjectURL(file);
        previewObjectUrls.push(url);
        return { url, local: true };
      })
    ].slice(0, 10);

    sources.forEach((item, i) => {
      const wrap = document.createElement('div');
      wrap.style.position = 'relative';
      wrap.style.display = 'inline-block';

      const img = document.createElement('img');
      img.src = item.url;
      img.alt = 'Product photo ' + (i + 1);
      img.loading = 'lazy';
      wrap.append(img);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Remove this photo';
      remove.setAttribute('aria-label', 'Remove product photo ' + (i + 1));
      Object.assign(remove.style, {
        position: 'absolute', top: '5px', right: '5px',
        width: '28px', height: '28px', borderRadius: '50%',
        border: '0', background: 'rgba(190, 25, 25, .92)', color: '#fff',
        fontSize: '20px', lineHeight: '26px', cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0,0,0,.25)'
      });

      remove.onclick = () => {
        if (i < existingImages.length) {
          existingImages.splice(i, 1);
        } else {
          selectedFiles.splice(i - existingImages.length, 1);
        }

        previews();
        const total = existingImages.length + selectedFiles.length;
        message(total
          ? `${total} photo(s) ready. First photo is the home-page cover.`
          : 'No photos selected.');
      };
      wrap.append(remove);

      if (i === 0) {
        const badge = document.createElement('span');
        badge.textContent = 'HOME COVER';
        Object.assign(badge.style, {
          position: 'absolute', left: '6px', bottom: '6px',
          background: 'rgba(0,0,0,.72)', color: '#fff',
          padding: '3px 6px', borderRadius: '5px', fontSize: '10px'
        });
        wrap.append(badge);
      }

      $('imagePreview').append(wrap);
    });
  }

  function reset() {
    $('productForm').reset();
    $('productId').value = '';
    $('formTitle').textContent = 'Add product';
    $('saveProduct').textContent = 'Add product';
    $('cancelEdit').hidden = true;
    selectedFiles = [];
    existingImages = [];
    $('imageFiles').value = '';
    previews();
  }

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const shown = products.filter(p =>
      `${p.name} ${p.category}`.toLowerCase().includes(q)
    );

    $('productRows').innerHTML = shown.map(p => {
      const cover = p.image || p.imageUrl || (Array.isArray(p.images) ? p.images[0] : '') || '';
      return `<tr>
        <td>${validURL(cover) ? `<img src="${escape(cover)}" alt="${escape(p.name)}" loading="lazy">` : 'No photo'}</td>
        <td>${escape(p.name)}<br><small>${escape(p.category)}</small></td>
        <td>₹${Number(p.price).toLocaleString('en-IN')}</td>
        <td>${Number(p.stock) || 0}</td>
        <td>${p.isActive === false ? 'Hidden' : 'Visible'}</td>
        <td>
          <button type="button" class="store-button secondary" data-edit="${escape(p._id)}">Edit</button>
          <button type="button" class="store-button danger" data-delete="${escape(p._id)}">Delete</button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="6">No products found.</td></tr>';
  }

  async function load() {
    try {
      products = await request('/admin/products');
      render();
    } catch (e) {
      message(e.message);
    }
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image: ' + file.name));
      };
      img.src = url;
    });
  }

  async function compressImage(file) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
      throw new Error('Only JPG, PNG and WEBP photos are supported.');
    }

    if (file.size > 20 * 1024 * 1024) {
      throw new Error(`${file.name} is too large. Choose an image below 20 MB.`);
    }

    const img = await loadImage(file);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    let blob = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/webp', 0.82)
    );

    if (!blob) {
      throw new Error('Could not prepare ' + file.name + ' for upload.');
    }

    // Extra fallback for unusually detailed photos.
    if (blob.size > 3 * 1024 * 1024) {
      blob = await new Promise(resolve =>
        canvas.toBlob(resolve, 'image/webp', 0.68)
      );
    }

    if (!blob || blob.size > 3 * 1024 * 1024) {
      throw new Error(`${file.name} is still too large after compression.`);
    }

    return blob;
  }

  async function uploadImage(file, index, total) {
    message(`Uploading photo ${index} of ${total}...`);
    const blob = await compressImage(file);

    const response = await fetch(API + '/admin/product-images', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': blob.type || 'image/webp',
        'X-File-Name': encodeURIComponent(file.name)
      },
      body: blob
    });

    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      token = '';
      sessionStorage.removeItem('mahalakshmiAdminToken');
      showSession();
    }

    if (!response.ok || !result.url) {
      throw new Error(result.message || `Photo upload failed (${response.status})`);
    }

    return /^https?:\/\//i.test(result.url) ? result.url : API + result.url;
  }

  $('loginForm').onsubmit = async event => {
    event.preventDefault();
    $('loginButton').disabled = true;

    try {
      const data = await request('/admin/login', 'POST', {
        username: $('username').value.trim(),
        password: $('password').value
      });

      if (!data.token) throw new Error('Login did not return a session');

      token = data.token;
      sessionStorage.setItem('mahalakshmiAdminToken', token);
      $('password').value = '';
      showSession();
      message('');
      await load();
    } catch (e) {
      message(e.message);
    } finally {
      $('loginButton').disabled = false;
    }
  };

  $('logout').onclick = () => {
    token = '';
    sessionStorage.removeItem('mahalakshmiAdminToken');
    products = [];
    reset();
    showSession();
    message('Logged out.');
  };

  $('imageFiles').onchange = () => {
    const files = Array.from($('imageFiles').files || []);

    const bad = files.find(file =>
      !['image/jpeg','image/png','image/webp'].includes(file.type)
    );

    if (bad) {
      $('imageFiles').value = '';
      return message('Only JPG, PNG and WEBP photos are supported.');
    }

    // Add new selections instead of replacing earlier selections.
    // This lets you choose photos one-by-one or many at once.
    const seen = new Set(
      selectedFiles.map(file => `${file.name}|${file.size}|${file.lastModified}`)
    );

    for (const file of files) {
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      if (!seen.has(key)) {
        selectedFiles.push(file);
        seen.add(key);
      }
    }

    const total = existingImages.length + selectedFiles.length;
    if (total > 10) {
      selectedFiles = selectedFiles.slice(0, Math.max(0, 10 - existingImages.length));
      $('imageFiles').value = '';
      previews();
      return message('Maximum 10 product photos. Extra photos were not added.');
    }

    $('imageFiles').value = '';
    previews();
    message(total ? `${total} photo(s) ready. First photo is the home-page cover.` : '');
  };

  $('cancelEdit').onclick = reset;
  $('search').oninput = render;
  $('refresh').onclick = load;

  $('productRows').onclick = async event => {
    const button = event.target.closest('button');
    if (!button) return;

    const p = products.find(p =>
      String(p._id) === (button.dataset.edit || button.dataset.delete)
    );
    if (!p) return;

    if (button.dataset.edit) {
      fields.forEach(key => {
        $(key).value = p[key] ?? '';
      });

      $('productId').value = p._id;
      existingImages = Array.isArray(p.images) && p.images.length
        ? p.images.filter(validURL).slice(0, 10)
        : [p.image || p.imageUrl].filter(validURL);
      selectedFiles = [];
      $('imageFiles').value = '';
      $('isActive').checked = p.isActive !== false;
      $('formTitle').textContent = 'Edit product';
      $('saveProduct').textContent = 'Save changes';
      $('cancelEdit').hidden = false;
      previews();
      $('name').focus();
      $('productForm').scrollIntoView({block:'start'});
    } else if (confirm(`Delete “${p.name}”? This removes the product from the store.`)) {
      button.disabled = true;
      try {
        await request('/admin/products/' + encodeURIComponent(p._id), 'DELETE');
        if ($('productId').value === String(p._id)) reset();
        message('Product deleted.');
        await load();
      } catch (e) {
        message(e.message);
      } finally {
        button.disabled = false;
      }
    }
  };

  $('productForm').onsubmit = async event => {
    event.preventDefault();

    if (selectedFiles.length > 10) {
      return message('Select maximum 10 photos.');
    }

    const data = Object.fromEntries(
      fields.map(key => [key, $(key).value.trim()])
    );

    ['price','stock','returnDays','deliveryMinDays','deliveryMaxDays'].forEach(key => {
      data[key] = data[key] === '' ? null : Number(data[key]);
    });

    if (
      (data.deliveryMinDays === null) !== (data.deliveryMaxDays === null) ||
      (data.deliveryMinDays !== null && data.deliveryMaxDays < data.deliveryMinDays)
    ) {
      return message('Enter both delivery estimates, with maximum days at least the minimum.');
    }

    $('saveProduct').disabled = true;

    try {
      let images = existingImages.slice(0, 10);

      if (selectedFiles.length) {
        const newImages = [];
        for (let i = 0; i < selectedFiles.length; i += 1) {
          newImages.push(await uploadImage(selectedFiles[i], i + 1, selectedFiles.length));
        }
        images = [...images, ...newImages].slice(0, 10);
      }

      Object.assign(data, {
        images,
        image: images[0] || '',
        imageUrl: images[0] || '',
        isActive: $('isActive').checked
      });

      const id = $('productId').value;
      message(id ? 'Saving changes...' : 'Adding product...');

      await request(
        '/admin/products' + (id ? '/' + encodeURIComponent(id) : ''),
        id ? 'PUT' : 'POST',
        data
      );

      reset();
      message('Product saved successfully.');
      await load();
    } catch (e) {
      message(e.message);
    } finally {
      $('saveProduct').disabled = false;
    }
  };

  showSession();
  if (token) load();
})();
