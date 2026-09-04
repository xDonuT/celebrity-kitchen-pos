    /**
     * ============================================================
     * CELEBRITY KITCHEN POS - MAIN APPLICATION
     * Version: 2.0.1 (Fixed split completion)
     * ============================================================
     */
    // ============================================================
    // FIREBASE CONFIG
    // ============================================================
    const firebaseConfig = {
      apiKey: "AIzaSyBVV3ta5HCMFSq0hL6iIBfcaKY7k-0TASk",
      authDomain: "celebrity-kitchen-pos.firebaseapp.com",
      databaseURL: "https://celebrity-kitchen-pos-default-rtdb.asia-southeast1.firebasedatabase.app/",
      projectId: "celebrity-kitchen-pos",
      storageBucket: "celebrity-kitchen-pos.firebasestorage.app",
      messagingSenderId: "1045652882016",
      appId: "1:1045652882016:web:e913bd3032a5c5f0307905"
    };
    if (typeof firebase !== 'undefined' && firebase.initializeApp) {
      try {
        firebase.initializeApp(firebaseConfig);
      } catch (e) {
        console.warn('Firebase already initialized');
      }
    }
    const db = firebase.database();
    // ============================================================
    // GLOBAL STATE
    // ============================================================
    const importantSuggestions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    let soundOn = true;
    let darkMode = false;
    let orderCart = [];
    let currentTotal = 0;
    let paidAmount = 0;
    let ecoBagQuantity = 0;
    const ECO_BAG_PRICE = 5;
    let activePaymentMethod = 'Cash';
    let gcashAmount = 0;
    let splitPayment = false;
    let ordersRenderTimer = null;
    let currentTab = 'cashier';
    let splitField = 'gcash';
    let editingOrderId = null;
    let menuItems = [];
    let currentOrders = [];
    let toastTimer = null;
    let isProcessing = false;
    // ============================================================
    // CLOCK EMOJIS
    // ============================================================
    const clockEmojis = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'];
    let clockIndex = 0;
    // ============================================================
    // DEFAULT MENU
    // ============================================================
    const defaultMenu = [
      { name: 'PBQ', price: 27, category: 'PBQ', icon: '🍢' },
      { name: 'Pancit', price: 250, category: 'Kitchen', icon: '🍝' },
      { name: 'Lomi', price: 230, category: 'Kitchen', icon: '🍜' },
      { name: 'Chopsuey', price: 230, category: 'Kitchen', icon: '🥗' },
      { name: 'Bihon', price: 250, category: 'Kitchen', icon: '🍝' },
      { name: 'Bam-e', price: 250, category: 'Kitchen', icon: '🍲' },
      { name: 'Sotanghon', price: 250, category: 'Kitchen', icon: '🍜' },
      { name: 'Fish Tinola', price: 320, category: 'Kitchen', icon: '🐟' },
      { name: 'Four Season', price: 320, category: 'Kitchen', icon: '🥘' },
      { name: 'Meatball S&S', price: 260, category: 'Kitchen', icon: '🧆' },
      { name: 'Fish S&S', price: 320, category: 'Kitchen', icon: '🐟' },
      { name: 'Sotanghon Soup', price: 250, category: 'Kitchen', icon: '🍜' }
    ];
    // ============================================================
    // UTILITY FUNCTIONS
    // ============================================================
    function safeDisplay(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    function formatNumber(n) {
      if (n === undefined || n === null) return '0';
      return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    function getToday() {
      return new Date().toISOString().split('T')[0];
    }
    function getOrdersRef() {
      return db.ref('orders/' + getToday());
    }
    function getHistoryRef() {
      return db.ref('history');
    }
    function getMenuRef() {
      return db.ref('menu');
    }
    function getMetaRef() {
      return db.ref('meta');
    }
    function play(t) {
      if (!soundOn) return;
      try {
        if (typeof window.AudioContext === 'undefined' && typeof window.webkitAudioContext === 'undefined') return;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const c = new AudioCtx();
        if (c.state === 'suspended') c.resume();
        const o = c.createOscillator();
        const g = c.createGain();
        o.connect(g);
        g.connect(c.destination);
        o.frequency.value = t === 'calc' ? 800 : 600;
        g.gain.setValueAtTime(0.1, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
        o.start();
        o.stop(c.currentTime + 0.1);
        setTimeout(() => { try { c.close(); } catch (e) {} }, 200);
      } catch (e) {}
    }
    function updateConnectionStatus(connected) {
      const el = document.getElementById('connection-status');
      if (connected) {
        el.textContent = '☁️ Connected to Firebase';
        el.className = 'connection-status';
      } else {
        el.textContent = '⚠️ Offline - Check Internet';
        el.className = 'connection-status offline';
      }
    }
    function vibrate(duration) {
      try {
        if (navigator.vibrate) {
          navigator.vibrate(duration || 10);
        }
      } catch (e) {}
    }
    function disableButton(btn, loadingText) {
      if (!btn) return;
      btn.disabled = true;
      btn.classList.add('loading');
      if (loadingText && btn.textContent) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = loadingText;
      }
    }
    function enableButton(btn) {
      if (!btn) return;
      btn.disabled = false;
      btn.classList.remove('loading');
      if (btn.dataset.originalText) {
        btn.textContent = btn.dataset.originalText;
        btn.dataset.originalText = '';
      }
    }
    function showLoading(message) {
      let overlay = document.querySelector('.loading-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
          <div class="spinner"></div>
          <div class="loading-text">${message || 'Processing...'}</div>
        `;
        document.body.appendChild(overlay);
      } else {
        overlay.style.display = 'flex';
        const textEl = overlay.querySelector('.loading-text');
        if (textEl) textEl.textContent = message || 'Processing...';
      }
    }
    function hideLoading() {
      const overlay = document.querySelector('.loading-overlay');
      if (overlay) {
        overlay.style.display = 'none';
      }
    }
    // ============================================================
    // TOAST NOTIFICATION
    // ============================================================
    function showToast(message, subMessage, type) {
      const toast = document.getElementById('toast');
      const msg = document.getElementById('toastMsg');
      const sub = document.getElementById('toastSub');
      toast.classList.remove('error', 'success', 'warning');
      if (type === 'error') toast.classList.add('error');
      else if (type === 'success') toast.classList.add('success');
      else if (type === 'warning') toast.classList.add('warning');
      msg.textContent = message;
      if (subMessage) {
        sub.textContent = subMessage;
        sub.style.display = 'block';
      } else {
        sub.style.display = 'none';
      }
      if (type === 'error') vibrate(50);
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    }
    // ============================================================
    // TICK ALL CLOCK EMOJIS
    // ============================================================
    function tickAllClocks() {
      clockIndex = (clockIndex + 1) % clockEmojis.length;
      const newEmoji = clockEmojis[clockIndex];
      document.querySelectorAll('.clock-emoji').forEach(el => {
        el.textContent = newEmoji;
      });
    }
    // ============================================================
    // PBQ BULK ORDER FUNCTIONS
    // ============================================================
    let pbqQuantity = 1; // kept for potential use
    function openPbqBox() {
      const overlay = document.getElementById('pbqOverlay');
      const box = document.getElementById('pbqBox');
      if (overlay) {
        overlay.classList.add('active');
        document.getElementById('pbqQty').value = 1;
        setTimeout(() => document.getElementById('pbqQty').focus(), 100);
      } else if (box) {
        box.classList.add('active');
        document.getElementById('pbqQty').value = 1;
        setTimeout(() => document.getElementById('pbqQty').focus(), 100);
      }
    }
    function closePbqBox() {
      const overlay = document.getElementById('pbqOverlay');
      const box = document.getElementById('pbqBox');
      if (overlay) overlay.classList.remove('active');
      else if (box) box.classList.remove('active');
    }
    function adjustPbq(amount) {
      const input = document.getElementById('pbqQty');
      let val = parseInt(input.value) || 1;
      val = Math.max(1, val + amount);
      input.value = val;
    }
    function addPbqFromBox() {
      if (isProcessing) return;
      isProcessing = true;
      const input = document.getElementById('pbqQty');
      const qty = parseInt(input.value) || 1;
      if (qty < 1) {
        isProcessing = false;
        return;
      }
      const item = menuItems.find(i => i.name === 'PBQ');
      if (!item) {
        showToast('❌ PBQ not found in menu', null, 'error');
        isProcessing = false;
        return;
      }
      const existing = orderCart.find(i => i.name === 'PBQ');
      if (existing) {
        existing.quantity += qty;
        existing.total = existing.quantity * item.price;
      } else {
        orderCart.push({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: qty,
          total: qty * item.price,
          category: item.category || 'PBQ'
        });
      }
      updateOrderDisplay();
      closePbqBox();
      play('btn');
      vibrate(5);
      isProcessing = false;
    }
    function addPbqTap() {
      if (isProcessing) return;
      isProcessing = true;
      const item = menuItems.find(i => i.name === 'PBQ');
      if (!item) {
        showToast('❌ PBQ not found in menu', null, 'error');
        isProcessing = false;
        return;
      }
      const existing = orderCart.find(i => i.name === 'PBQ');
      if (existing) {
        existing.quantity += 1;
        existing.total = existing.quantity * item.price;
      } else {
        orderCart.push({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          total: item.price,
          category: item.category || 'PBQ'
        });
      }
      updateOrderDisplay();
      play('btn');
      vibrate(5);
      isProcessing = false;
    }
    // ============================================================
    // MENU FUNCTIONS
    // ============================================================
    function loadMenu() {
      getMenuRef().on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
          menuItems = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        } else {
          menuItems = defaultMenu;
          saveDefaultMenu();
        }
        renderMenu();
        renderAdminMenu();
      }, (error) => {
        console.error('Error loading menu:', error);
        menuItems = defaultMenu;
        renderMenu();
        renderAdminMenu();
      });
    }
    function saveDefaultMenu() {
      defaultMenu.forEach(item => {
        getMenuRef().push(item);
      });
    }
    function renderMenu() {
      const grid = document.getElementById('food-grid');
      if (!grid) return;
      if (menuItems.length === 0) {
        grid.innerHTML = '<div style="text-align:center;color:#8a6dcc;padding:20px;">No menu items</div>';
        return;
      }
      // Create PBQ box if it doesn't exist
      let pbqBox = document.getElementById('pbqBox');
      if (!pbqBox) {
        const container = document.getElementById('pbq-box-container');
        const overlay = document.createElement('div');
        overlay.className = 'pbq-overlay';
        overlay.id = 'pbqOverlay';
        overlay.onclick = function(e) {
          if (e.target === overlay) closePbqBox();
        };
        const box = document.createElement('div');
        box.className = 'pbq-box';
        box.id = 'pbqBox';
        box.innerHTML = `
          <div class="box-title">🍢 PBQ Quantity</div>
          <div class="box-row">
            <button class="btn-adjust btn-minus" onclick="adjustPbq(-1)">−</button>
            <input type="number" id="pbqQty" value="1" min="1" max="999" />
            <button class="btn-adjust btn-plus" onclick="adjustPbq(1)">+</button>
          </div>
          <div class="box-actions">
            <button class="btn-cancel" onclick="closePbqBox()">Cancel</button>
            <button class="btn-add" onclick="addPbqFromBox()">✅ Add</button>
          </div>
        `;
        overlay.appendChild(box);
        container.appendChild(overlay);
        document.getElementById('pbqQty').addEventListener('keydown', function(e) {
          if (e.key === 'Enter') addPbqFromBox();
        });
      }
      grid.innerHTML = menuItems.map(item => {
        const categoryClass = item.category === 'PBQ' ? 'meat pbq' : item.category === 'Kitchen' ? 'noodles' : '';
        let nameClass = '';
        if (item.name === 'Pancit') nameClass = 'pancit';
        if (item.name === 'Lomi') nameClass = 'lomi';
        if (item.name === 'PBQ') {
          return `<div class="btn-food ${categoryClass}" id="pbqBtn">
            <span class="food-icon">${item.icon || '🍢'}</span>
            <span class="food-name">${safeDisplay(item.name)}</span>
            <span class="food-price">₱${item.price}</span>
            <span class="pbq-badge" id="pbqBadge">
              <span class="badge-icon">🔢</span>
              <span class="badge-label">QTY</span>
            </span>
            <div class="pbq-hint">
              <span class="tap">👆 Tap = +1</span> · <span class="qty">🔢 QTY</span>
            </div>
          </div>`;
        }
        return `<div class="btn-food ${categoryClass} ${nameClass}" onclick="addToCart('${item.id}')">
          <span class="food-icon">${item.icon || '🍽️'}</span>
          <span class="food-name">${safeDisplay(item.name)}</span>
          <span class="food-price">₱${item.price}</span>
        </div>`;
      }).join('');
      // Re-bind PBQ events
      setTimeout(() => {
        const badge = document.getElementById('pbqBadge');
        const btn = document.getElementById('pbqBtn');
        if (badge) {
          badge.addEventListener('click', function(e) {
            e.stopPropagation();
            openPbqBox();
          });
        }
        if (btn) {
          btn.addEventListener('click', function(e) {
            if (e.target.closest('.pbq-badge')) return;
            addPbqTap();
          });
        }
        document.addEventListener('click', function(e) {
          if (!e.target.closest('.pbq-box') && !e.target.closest('.pbq-badge') && !e.target.closest('#pbqBtn')) {
            closePbqBox();
          }
        });
      }, 50);
    }
    function renderAdminMenu() {
      const list = document.getElementById('admin-items-list');
      if (!list) return;
      if (menuItems.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:#8a6dcc;padding:20px;">No menu items</div>';
        return;
      }
      list.innerHTML = menuItems.map(item => `
        <div class="admin-item" data-id="${item.id}">
          <span class="admin-icon">${item.icon || '🍽️'}</span>
          <input type="text" class="admin-name-input" value="${safeDisplay(item.name)}" placeholder="Name">
          <input type="number" class="admin-price-input" value="${item.price}" placeholder="Price" style="max-width:80px;">
          <span class="item-category">${item.category || 'Kitchen'}</span>
          <button class="btn-save" onclick="saveMenuItem('${item.id}')">💾 Save</button>
          <button class="btn-delete" onclick="deleteMenuItem('${item.id}')">🗑️</button>
        </div>
      `).join('');
    }
    function addMenuItem() {
      if (isProcessing) return;
      isProcessing = true;
      const nameInput = document.getElementById('admin-new-name');
      const priceInput = document.getElementById('admin-new-price');
      const categorySelect = document.getElementById('admin-new-category');
      const name = nameInput.value.trim();
      const price = parseFloat(priceInput.value);
      const category = categorySelect.value || 'Kitchen';
      if (!name) {
        showToast('❌ Please enter an item name', null, 'error');
        isProcessing = false;
        return;
      }
      if (!price || price <= 0) {
        showToast('❌ Please enter a valid price', null, 'error');
        isProcessing = false;
        return;
      }
      showLoading('Adding item...');
      getMenuRef().push({ name, price, category, icon: '🍽️' }).then(() => {
        nameInput.value = '';
        priceInput.value = '';
        play('btn');
        showToast('✅ Item added to menu!', `${name} · ₱${price}`, 'success');
        isProcessing = false;
        hideLoading();
      }).catch(err => {
        showToast('❌ Error adding item: ' + err.message, null, 'error');
        isProcessing = false;
        hideLoading();
      });
    }
    function saveMenuItem(itemId) {
      if (isProcessing) return;
      isProcessing = true;
      const itemElement = document.querySelector(`.admin-item[data-id="${itemId}"]`);
      if (!itemElement) {
        isProcessing = false;
        return;
      }
      const nameInput = itemElement.querySelector('.admin-name-input');
      const priceInput = itemElement.querySelector('.admin-price-input');
      const name = nameInput.value.trim();
      const price = parseFloat(priceInput.value);
      if (!name) {
        showToast('❌ Please enter a name', null, 'error');
        isProcessing = false;
        return;
      }
      if (!price || price <= 0) {
        showToast('❌ Please enter a valid price', null, 'error');
        isProcessing = false;
        return;
      }
      showLoading('Saving...');
      getMenuRef().child(itemId).update({ name, price }).then(() => {
        play('btn');
        showToast('✅ Item updated!', `${name} · ₱${price}`, 'success');
        isProcessing = false;
        hideLoading();
      }).catch(err => {
        showToast('❌ Error saving item: ' + err.message, null, 'error');
        isProcessing = false;
        hideLoading();
      });
    }
    function deleteMenuItem(itemId) {
      if (isProcessing) return;
      if (!confirm('Delete this item from the menu?')) return;
      isProcessing = true;
      showLoading('Deleting...');
      getMenuRef().child(itemId).remove().then(() => {
        play('btn');
        showToast('🗑️ Item removed from menu', null, 'warning');
        isProcessing = false;
        hideLoading();
      }).catch(err => {
        showToast('❌ Error deleting item: ' + err.message, null, 'error');
        isProcessing = false;
        hideLoading();
      });
    }
    // ============================================================
    // CART FUNCTIONS
    // ============================================================
    function addToCart(itemId) {
      if (isProcessing) return;
      isProcessing = true;
      const item = menuItems.find(i => i.id === itemId);
      if (!item) {
        showToast('❌ Item not found in menu', null, 'error');
        isProcessing = false;
        return;
      }
      const existing = orderCart.find(i => i.name === item.name);
      if (existing) {
        existing.quantity++;
        existing.total = existing.quantity * item.price;
      } else {
        orderCart.push({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          total: item.price,
          category: item.category || 'Kitchen'
        });
      }
      updateOrderDisplay();
      play('btn');
      vibrate(5);
      isProcessing = false;
    }
    function updateQuantity(name, change) {
      const item = orderCart.find(i => i.name === name);
      if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
          orderCart = orderCart.filter(i => i.name !== name);
        } else {
          item.total = item.quantity * item.price;
        }
        updateOrderDisplay();
        play('btn');
      }
    }
    function clearPBQ() {
      if (isProcessing) return;
      orderCart = orderCart.filter(i => i.name !== 'PBQ');
      updateOrderDisplay();
      play('btn');
      showToast('🗑️ PBQ removed from cart', null, 'warning');
    }
    function addEcoBag() {
      ecoBagQuantity++;
      updateEcoBagDisplay();
      updateOrderDisplay();
      play('btn');
    }
    function removeEcoBag() {
      if (ecoBagQuantity > 0) {
        ecoBagQuantity--;
        updateEcoBagDisplay();
        updateOrderDisplay();
        play('btn');
      }
    }
    function updateEcoBagDisplay() {
      const b = document.getElementById('eco-bag-btn');
      if (ecoBagQuantity > 0) {
        b.textContent = 'Bag ×' + ecoBagQuantity + ' ₱' + formatNumber(ecoBagQuantity * ECO_BAG_PRICE);
        b.style.background = '#4caf50';
        b.style.color = '#fff';
      } else {
        b.textContent = 'Bag ₱5';
        b.style.background = '#a8e6cf';
        b.style.color = '#00695c';
      }
    }
    function updateOrderTotal() {
      currentTotal = orderCart.reduce((sum, i) => sum + i.total, 0) + (ecoBagQuantity * ECO_BAG_PRICE);
      document.getElementById('total-display').textContent = 'Total: ₱' + formatNumber(currentTotal);
      const pt = document.getElementById('payment-total');
      if (pt) pt.textContent = '₱' + formatNumber(currentTotal);
    }
    function updateOrderDisplay() {
      const c = document.getElementById('cart-items');
      if (orderCart.length === 0 && ecoBagQuantity === 0) {
        c.innerHTML = '<div style="text-align:center;color:#8a6dcc;padding:20px;">No items in order yet</div>';
      } else {
        let h = '';
        orderCart.forEach(i => {
          const isPBQ = i.name === 'PBQ';
          h += `<div class="cart-item">
            <div class="cart-item-info">
              <span class="cart-item-name">${safeDisplay(i.name)}</span>
              <div class="quantity-controls">
                <button class="btn-quantity btn-minus" onclick="updateQuantity('${i.name.replace(/'/g, "\\'")}',-1)">−</button>
                <span class="quantity-display">${i.quantity}</span>
                <button class="btn-quantity" onclick="updateQuantity('${i.name.replace(/'/g, "\\'")}',1)">+</button>
                ${isPBQ ? `<button class="trash-btn" onclick="clearPBQ()">🗑️</button>` : ''}
              </div>
            </div>
            <span class="cart-item-price">₱${formatNumber(i.total)}</span>
          </div>`;
        });
        if (ecoBagQuantity > 0) {
          h += `<div class="cart-item">
            <div class="cart-item-info">
              <span class="cart-item-name">Eco Bag</span>
              <div class="quantity-controls">
                <button class="btn-quantity btn-minus" onclick="removeEcoBag()">−</button>
                <span class="quantity-display">${ecoBagQuantity}</span>
                <button class="btn-quantity" onclick="addEcoBag()">+</button>
              </div>
            </div>
            <span class="cart-item-price">₱${formatNumber(ecoBagQuantity * ECO_BAG_PRICE)}</span>
          </div>`;
        }
        c.innerHTML = h;
      }
      updateOrderTotal();
    }
    function resetOrderForm() {
      orderCart = [];
      currentTotal = 0;
      paidAmount = 0;
      ecoBagQuantity = 0;
      editingOrderId = null;
      activePaymentMethod = 'Cash';
      splitPayment = false;
      gcashAmount = 0;
      document.getElementById('order-number').value = '';
      document.getElementById('customer-name').value = '';
      document.getElementById('order-notes').value = '';
      updateOrderDisplay();
      updateEcoBagDisplay();
    }
    // ============================================================
    // PAYMENT FUNCTIONS
    // ============================================================
    function openPayment(method) {
      if (orderCart.length === 0 && ecoBagQuantity === 0) {
        showToast('⚠️ Cart is empty!', 'Add items first', 'warning');
        return;
      }
      updateOrderTotal();
      if (currentTotal <= 0) {
        showToast('⚠️ Total must be > ₱0', null, 'warning');
        return;
      }
      splitPayment = false;
      gcashAmount = 0;
      hideSplitControls();
      activePaymentMethod = method || 'Cash';
      document.getElementById('payment-total').textContent = '₱' + formatNumber(currentTotal);
      const calcContainer = document.getElementById('cash-calculator-controls');
      const submitBtn = document.getElementById('main-submit-pay-btn');
      const titleLabel = document.getElementById('payment-title-label');
      if (activePaymentMethod === 'GCash') {
        paidAmount = currentTotal;
        calcContainer.style.display = 'grid';
        submitBtn.textContent = '✅ Pay with GCash';
        submitBtn.style.background = '#007cfe';
        titleLabel.textContent = '📱 GCash Payment';
      } else {
        paidAmount = 0;
        calcContainer.style.display = 'grid';
        submitBtn.textContent = 'Calculate';
        submitBtn.style.background = '#8a6dcc';
        titleLabel.textContent = '💵 Cash Payment';
      }
      updatePaymentDisplay();
      document.getElementById('payment-modal').classList.add('show');
      play('btn');
    }
    function openSplitPayment() {
      if (orderCart.length === 0 && ecoBagQuantity === 0) {
        showToast('⚠️ Cart is empty!', 'Add items first', 'warning');
        return;
      }
      updateOrderTotal();
      if (currentTotal <= 0) {
        showToast('⚠️ Total must be > ₱0', null, 'warning');
        return;
      }
      splitPayment = true;
      activePaymentMethod = 'Split';
      gcashAmount = 0;
      paidAmount = 0;
      splitField = 'gcash';
      document.getElementById('payment-total').textContent = '₱' + formatNumber(currentTotal);
      const calcContainer = document.getElementById('cash-calculator-controls');
      const submitBtn = document.getElementById('main-submit-pay-btn');
      const titleLabel = document.getElementById('payment-title-label');
      calcContainer.style.display = 'grid';
      submitBtn.textContent = 'Calculate';
      submitBtn.style.background = '#6d5a8a';
      titleLabel.textContent = '🔀 Split Payment (GCash + Cash)';
      showSplitControls();
      setSplitField('gcash');
      updateSplitDisplay();
      updatePaymentDisplay();
      document.getElementById('payment-modal').classList.add('show');
      play('btn');
    }
    function hideSplitControls() {
      const el = document.getElementById('split-controls');
      if (el) el.style.display = 'none';
    }
    function showSplitControls() {
      const el = document.getElementById('split-controls');
      if (el) el.style.display = 'block';
    }
    function setSplitField(field) {
      if (field !== 'gcash' && field !== 'cash') return;
      splitField = field;
      const gBtn = document.getElementById('split-toggle-gcash');
      const cBtn = document.getElementById('split-toggle-cash');
      const label = document.getElementById('split-field-label');
      if (gBtn) gBtn.classList.toggle('active', field === 'gcash');
      if (cBtn) cBtn.classList.toggle('active', field === 'cash');
      if (label) label.textContent = field === 'gcash' ? '📱 GCash Amount' : '💵 Cash Tendered';
      renderSplitFieldDisplay();
      updatePaymentDisplay();
      play('btn');
    }
    function renderSplitFieldDisplay() {
      const el = document.getElementById('split-field-display');
      if (!el) return;
      if (splitField === 'gcash') {
        el.textContent = '₱' + formatNumber(gcashAmount);
      } else {
        el.textContent = '₱' + formatNumber(paidAmount);
      }
    }
    function splitDigit(d) {
      if (!splitPayment) return;
      if (splitField === 'gcash') {
        const na = gcashAmount * 10 + d;
        gcashAmount = na > currentTotal ? currentTotal : na;
      } else {
        paidAmount = paidAmount * 10 + d;
      }
      renderSplitFieldDisplay();
      updateSplitDisplay();
      updatePaymentDisplay();
      play('btn');
    }
    function splitBackspace() {
      if (!splitPayment) return;
      if (splitField === 'gcash') {
        gcashAmount = Math.floor(gcashAmount / 10);
      } else {
        paidAmount = Math.floor(paidAmount / 10);
      }
      renderSplitFieldDisplay();
      updateSplitDisplay();
      updatePaymentDisplay();
      play('btn');
    }
    function splitClear() {
      if (!splitPayment) return;
      if (splitField === 'gcash') {
        gcashAmount = 0;
      } else {
        paidAmount = 0;
      }
      renderSplitFieldDisplay();
      updateSplitDisplay();
      updatePaymentDisplay();
      play('btn');
    }
    function splitAddQuick(a) {
      if (!splitPayment) return;
      if (splitField === 'gcash') {
        gcashAmount = Math.min(currentTotal, gcashAmount + a);
      } else {
        paidAmount += a;
      }
      renderSplitFieldDisplay();
      updateSplitDisplay();
      updatePaymentDisplay();
      play('btn');
    }
    function updateSplitDisplay() {
      const cashRequired = Math.max(0, currentTotal - gcashAmount);
      const label = document.getElementById('split-cash-label');
      const req = document.getElementById('split-cash-required');
      if (label) label.textContent = '💵 Cash Required';
      if (req) req.textContent = '₱' + formatNumber(cashRequired);
    }
    function closePayment() {
      splitPayment = false;
      document.getElementById('payment-modal').classList.remove('show');
    }
    function getCashRequired() {
      if (splitPayment) {
        return Math.max(0, currentTotal - gcashAmount);
      }
      return currentTotal;
    }
    function updatePaymentDisplay() {
      const required = getCashRequired();
      document.getElementById('payment-paid').textContent = '₱' + formatNumber(paidAmount);
      const ch = paidAmount - required;
      const el = document.getElementById('payment-change');
      el.textContent = '₱' + formatNumber(Math.abs(ch));
      el.className = 'payment-value ' + (ch >= 0 ? 'change-value' : 'insufficient');
    }
    function addQuickAmount(a) {
      if (splitPayment) {
        splitAddQuick(a);
        return;
      }
      paidAmount += a;
      updatePaymentDisplay();
      play('btn');
    }
    function setExactAmount() {
      if (splitPayment) {
        splitField = 'cash';
        const gBtn = document.getElementById('split-toggle-gcash');
        const cBtn = document.getElementById('split-toggle-cash');
        const label = document.getElementById('split-field-label');
        if (gBtn) gBtn.classList.remove('active');
        if (cBtn) cBtn.classList.add('active');
        if (label) label.textContent = '💵 Cash Tendered';
        paidAmount = getCashRequired();
        renderSplitFieldDisplay();
        updatePaymentDisplay();
        play('btn');
        return;
      }
      paidAmount = getCashRequired();
      updatePaymentDisplay();
      play('btn');
    }
    function paymentInput(d) {
      if (splitPayment) {
        splitDigit(d);
        return;
      }
      paidAmount = paidAmount * 10 + d;
      updatePaymentDisplay();
    }
    function paymentBackspace() {
      if (splitPayment) {
        splitBackspace();
        return;
      }
      paidAmount = Math.floor(paidAmount / 10);
      updatePaymentDisplay();
    }
    function paymentClear() {
      if (splitPayment) {
        splitClear();
        return;
      }
      paidAmount = 0;
      updatePaymentDisplay();
    }
    function handlePaymentSubmission() {
      if (isProcessing) return;
      isProcessing = true;
      const required = getCashRequired();
      if (splitPayment && gcashAmount === 0) {
        showToast('❌ Enter GCash amount', 'Enter the GCash portion or use full Cash/GCash', 'error');
        isProcessing = false;
        return;
      }
      if (paidAmount < required) {
        showToast('❌ Cash paid less than cash required', null, 'error');
        isProcessing = false;
        return;
      }
      calculateChange();
      isProcessing = false;
    }
    function calculateChange() {
      const required = getCashRequired();
      const change = paidAmount - required;
      document.getElementById('result-change').textContent = '₱' + formatNumber(change);
      const list = document.getElementById('suggestion-list');
      list.innerHTML = '';
      let first = true;
      for (const extra of importantSuggestions) {
        const np = paidAmount + extra;
        const nc = np - required;
        if (nc > 0) {
          list.innerHTML += `<div class="suggestion-item ${first ? 'best' : ''}" onclick="useSuggestion(${np})">
            Pay ₱${formatNumber(np)} → Change ₱${formatNumber(nc)}
          </div>`;
          first = false;
        }
      }
      document.getElementById('payment-modal').classList.remove('show');
      document.getElementById('result-modal').classList.add('show');
      play('calc');
    }
    function useSuggestion(np) {
      paidAmount = np;
      updatePaymentDisplay();
      document.getElementById('result-modal').classList.remove('show');
      document.getElementById('payment-modal').classList.add('show');
      play('btn');
    }
    function closeResult() {
      document.getElementById('result-modal').classList.remove('show');
    }
    // ============================================================
    // ORDER OPERATIONS
    // ============================================================
    function pushOrderToFirebase(orderData) {
      return getOrdersRef().push(orderData);
    }
    function updateOrderInFirebase(orderId, orderData) {
      return getOrdersRef().child(orderId).update(orderData);
    }
    function deleteOrderFromFirebase(orderId) {
      return getOrdersRef().child(orderId).remove();
    }
    function pushHistoryToFirebase(historyData) {
      return getHistoryRef().push(historyData);
    }
    function clearTodayOrders() {
      return getOrdersRef().remove();
    }
    // Get next order number from Firebase counter
    function getNextOrderNumber() {
      const counterRef = getMetaRef().child('orderCounter');
      return counterRef.transaction(current => (current || 0) + 1)
        .then(result => {
          const newNum = result.snapshot.val();
          return 'W' + String(newNum).padStart(4, '0');
        });
    }
    function completeTransaction() {
      if (isProcessing) return;
      isProcessing = true;
      const btn = document.getElementById('btn-complete-transaction');
      disableButton(btn, 'Processing...');
      const ot = document.getElementById('order-type').value;
      let on = document.getElementById('order-number').value.trim();
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      // Generate order number if missing and walk-in
      if (!on && ot === 'walkin') {
        getNextOrderNumber().then(num => {
          on = num;
          document.getElementById('order-number').value = on;
          proceedWithCompletion(on, ot, timeStr, btn);
        }).catch(err => {
          showToast('❌ Error generating order number: ' + err.message, null, 'error');
          enableButton(btn);
          isProcessing = false;
        });
        return;
      }
      proceedWithCompletion(on, ot, timeStr, btn);
    }
    function proceedWithCompletion(on, ot, timeStr, btn) {
      const isSplit = activePaymentMethod === 'Split' || splitPayment;
      const cashRequired = isSplit ? Math.max(0, currentTotal - gcashAmount) : currentTotal;
      const orderData = {
        number: on,
        orderType: ot,          // 'walkin' or 'tawag'
        type: 'completed',      // status
        customerName: document.getElementById('customer-name').value,
        pickupTime: document.getElementById('pickup-time').value,
        timestamp: timeStr,
        notes: document.getElementById('order-notes').value.trim(),
        items: [...orderCart],
        ecoBags: ecoBagQuantity,
        total: currentTotal,
        paid: true,
        paymentMethod: activePaymentMethod,
        cashAmount: isSplit ? cashRequired : (activePaymentMethod === 'Cash' ? currentTotal : 0),
        gcashAmount: isSplit ? gcashAmount : (activePaymentMethod === 'GCash' ? currentTotal : 0),
        date: getToday()
      };
      // Only add completion flags for new orders (not editing)
      if (!editingOrderId) {
        orderData.kitchenCompleted = false;
        orderData.pbqCompleted = false;
      }
      const historyData = {
        ...orderData,
        paid: paidAmount,
        change: Math.max(0, paidAmount - cashRequired),
        completedAt: new Date().toISOString()
      };
      const operations = [];
      if (editingOrderId) {
        operations.push(updateOrderInFirebase(editingOrderId, orderData));
      } else {
        operations.push(pushOrderToFirebase(orderData));
      }
      operations.push(pushHistoryToFirebase(historyData));
      Promise.all(operations)
        .then(() => {
          resetOrderForm();
          closePayment();
          closeResult();
          play('calc');
          showToast('✅ Transaction complete!', 'Order saved successfully', 'success');
          enableButton(btn);
          isProcessing = false;
        })
        .catch((err) => {
          showToast('❌ Error saving order: ' + err.message, null, 'error');
          enableButton(btn);
          isProcessing = false;
          editingOrderId = null;
        });
    }
    function saveAsPending() {
      if (isProcessing) return;
      isProcessing = true;
      const ot = document.getElementById('order-type').value;
      let on = document.getElementById('order-number').value.trim();
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (ot === 'walkin' && !on) {
        showToast('❌ Missing Order Number', 'Please enter an order number for Walk-in', 'error');
        isProcessing = false;
        return;
      }
      if (ot === 'tawag' && !document.getElementById('customer-name').value.trim()) {
        if (document.getElementById('payment-modal').classList.contains('show')) closePayment();
        const nameInput = document.getElementById('customer-name');
        nameInput.style.display = 'block';
        nameInput.classList.add('field-error');
        nameInput.focus();
        nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('❌ Missing Customer Name', 'Please enter a customer name for Tawag', 'error');
        setTimeout(() => nameInput.classList.remove('field-error'), 2500);
        isProcessing = false;
        return;
      }
      if (orderCart.length === 0 && ecoBagQuantity === 0) {
        showToast('⚠️ Cart is empty!', 'Add items first', 'warning');
        isProcessing = false;
        return;
      }
      if (!on && ot === 'walkin') {
        getNextOrderNumber().then(num => {
          on = num;
          document.getElementById('order-number').value = on;
          savePendingWithNumber(on, ot, timeStr);
        }).catch(err => {
          showToast('❌ Error generating order number: ' + err.message, null, 'error');
          isProcessing = false;
        });
        return;
      }
      savePendingWithNumber(on, ot, timeStr);
    }
    function savePendingWithNumber(on, ot, timeStr) {
      const orderData = {
        number: on,
        orderType: ot,
        type: 'pending',
        customerName: document.getElementById('customer-name').value,
        pickupTime: document.getElementById('pickup-time').value,
        timestamp: timeStr,
        notes: document.getElementById('order-notes').value.trim(),
        items: [...orderCart],
        ecoBags: ecoBagQuantity,
        total: currentTotal,
        paid: false,
        paymentMethod: 'pending',
        date: getToday(),
        kitchenCompleted: false,
        pbqCompleted: false
      };
      showLoading('Saving pending order...');
      pushOrderToFirebase(orderData)
        .then(() => {
          resetOrderForm();
          closePayment();
          play('btn');
          const orderType = ot === 'tawag' ? '📞 Tawag' : '🚶 Walk-in';
          showToast(`✅ ${orderType} order saved as pending!`, `Order #${on} · ₱${formatNumber(currentTotal)}`, 'success');
          isProcessing = false;
          hideLoading();
        })
        .catch((err) => {
          showToast('❌ Error saving order: ' + err.message, null, 'error');
          isProcessing = false;
          hideLoading();
        });
    }
    function collectPendingPayment(id, method) {
      const order = currentOrders.find(o => o.id === id);
      if (!order) return;
      currentTotal = order.total || 0;
      paidAmount = 0;
      gcashAmount = 0;
      splitPayment = false;
      editingOrderId = id;
      orderCart = order.items ? [...order.items] : [];
      ecoBagQuantity = order.ecoBags || 0;
      switchTab('cashier');
      if (method === 'Split') {
        openSplitPayment();
      } else {
        openPayment(method);
      }
    }
    function cancelOrder(id) {
      if (!confirm('Cancel this order?')) return;
      showLoading('Cancelling order...');
      deleteOrderFromFirebase(id)
        .then(() => {
          play('btn');
          showToast('✅ Order cancelled', null, 'warning');
          hideLoading();
        })
        .catch((err) => {
          showToast('❌ Error cancelling order: ' + err.message, null, 'error');
          hideLoading();
        });
    }
    // ===== NEW: complete only one section =====
    function completeOrderLocal(id, section) {
      if (isProcessing) return;
      isProcessing = true;
      showLoading('Completing order...');
      const order = currentOrders.find(o => o.id === id);
      if (!order) {
        showToast('❌ Order not found', null, 'error');
        isProcessing = false;
        hideLoading();
        return;
      }
      const updates = {};
      if (section === 'kitchen') {
        updates.kitchenCompleted = true;
      } else if (section === 'pbq') {
        updates.pbqCompleted = true;
      } else {
        isProcessing = false;
        hideLoading();
        return;
      }
      getOrdersRef().child(id).update(updates)
        .then(() => {
          // Check if order is now fully completed
          const hasKitchen = (order.items || []).some(i => (i.category || 'Kitchen') !== 'PBQ');
          const hasPbq = (order.items || []).some(i => (i.category || 'Kitchen') === 'PBQ');
          const kitchenDone = (order.kitchenCompleted === true) || (section === 'kitchen' && !hasKitchen);
          const pbqDone = (order.pbqCompleted === true) || (section === 'pbq' && !hasPbq);
          let fullyCompleted = false;
          if (section === 'kitchen') {
            fullyCompleted = (!hasPbq || order.pbqCompleted === true);
          } else if (section === 'pbq') {
            fullyCompleted = (!hasKitchen || order.kitchenCompleted === true);
          }
          if (fullyCompleted) {
            return deleteOrderFromFirebase(id);
          } else {
            return Promise.resolve();
          }
        })
        .then(() => {
          play('btn');
          showToast('✅ Order completed', null, 'success');
          isProcessing = false;
          hideLoading();
        })
        .catch((err) => {
          showToast('❌ Error completing order: ' + err.message, null, 'error');
          isProcessing = false;
          hideLoading();
        });
    }
    // ============================================================
    // ORDER DISPLAYS
    // ============================================================
    function listenForOrders() {
      getOrdersRef().on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
          currentOrders = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        } else {
          currentOrders = [];
        }
        if (ordersRenderTimer) clearTimeout(ordersRenderTimer);
        ordersRenderTimer = setTimeout(() => {
          ordersRenderTimer = null;
          updateAllDisplays();
        }, 120);
      }, (error) => {
        console.error('Firebase listen error:', error);
        updateConnectionStatus(false);
      });
      db.ref('.info/connected').on('value', (snap) => {
        updateConnectionStatus(snap.val());
      });
    }
    function updateAllDisplays() {
      if (currentTab === 'pending') updatePendingDisplay();
      else if (currentTab === 'kitchen') updateKitchenDisplay();
      else if (currentTab === 'pbq') updatePbqDisplay();
    }
    function updatePendingDisplay() {
      const c = document.getElementById('pending-orders');
      const pending = currentOrders.filter(o => o.type === 'pending' || o.paid === false);
      const bar = document.getElementById('pending-total-bar');
      if (pending.length === 0) {
        c.innerHTML = '<div style="text-align:center;color:#8a6dcc;padding:20px;">No pending orders</div>';
        if (bar) bar.style.display = 'none';
        return;
      }
      let walkinTotal = 0, tawagTotal = 0, walkinCount = 0, tawagCount = 0;
      let grandTotal = 0;
      pending.forEach(o => {
        const t = o.total || 0;
        grandTotal += t;
        if ((o.orderType || o.type || 'walkin') === 'tawag') { tawagTotal += t; tawagCount++; }
        else { walkinTotal += t; walkinCount++; }
      });
      if (bar) {
        bar.style.display = 'block';
        bar.innerHTML =
          '<div class="summary-headline">Total Unpaid: ₱' + formatNumber(grandTotal) + '</div>' +
          '<div class="summary-sub">' + pending.length + ' order' + (pending.length > 1 ? 's' : '') + ' awaiting payment</div>' +
          '<div class="summary-items">' +
          '<span class="summary-item">🏃 Walk-in: ₱' + formatNumber(walkinTotal) + ' (' + walkinCount + ')</span>' +
          '<span class="summary-item">📞 Tawag: ₱' + formatNumber(tawagTotal) + ' (' + tawagCount + ')</span>' +
          '</div>';
      }
      c.innerHTML = pending.map(o => {
        const displayName = o.customerName || (o.orderType === 'tawag' ? 'Tawag Guest' : 'Walk-in #' + (o.number || ''));
        return `<div class="order-card" data-order-id="${o.id}">
          <div class="order-header"><span class="order-number">${safeDisplay(displayName)}</span><span class="order-type ${o.orderType || 'walkin'}">${o.orderType === 'tawag' ? 'TAWAG' : 'WALK-IN'}</span></div>
          <div class="order-time"><span class="clock-emoji">🕐</span> ${o.timestamp || ''}${o.customerName ? ' | 👤 ' + safeDisplay(o.customerName) : ''}${o.pickupTime ? ' | ⏰ ' + safeDisplay(o.pickupTime) : ''}</div>
          ${o.notes ? '<div class="order-notes">' + safeDisplay(o.notes) + '</div>' : ''}
          <div class="order-items">${(o.items || []).map(i => '<div class="order-item"><span>' + safeDisplay(i.name) + '</span><span>×' + i.quantity + '</span></div>').join('')}${o.ecoBags > 0 ? '<div class="order-item"><span>Eco Bag</span><span>×' + o.ecoBags + '</span></div>' : ''}</div>
          <div class="order-total">Total: ₱${formatNumber(o.total || 0)}</div>
          <div class="order-actions">
            <button class="btn-status btn-collect-payment" data-method="Cash">Collect Cash</button>
            <button class="btn-status btn-collect-payment btn-gcash-pay" data-method="GCash" style="background:#007cfe;">Collect GCash</button>
            <button class="btn-status btn-collect-payment" data-method="Split" style="background:#6d5a8a;">Collect Split</button>
            <button class="btn-status btn-cancel">Cancel</button>
          </div>
        </div>`;
      }).join('');
      c.querySelectorAll('.btn-collect-payment, .btn-cancel').forEach(btn => {
        btn.onclick = function(e) {
          e.stopPropagation();
          const card = this.closest('.order-card');
          if (!card) return;
          const id = card.dataset.orderId;
          if (this.classList.contains('btn-cancel')) {
            cancelOrder(id);
          } else {
            const method = this.dataset.method || 'Cash';
            collectPendingPayment(id, method);
          }
        };
      });
    }
    function updateKitchenDisplay() {
      const c = document.getElementById('kitchen-all-orders');
      // Show orders that have kitchen items and kitchen is not completed
      const kitchenOrders = currentOrders.filter(o => {
        const items = o.items || [];
        const hasKitchenItems = items.some(i => (i.category || 'Kitchen') !== 'PBQ');
        const kitchenDone = o.kitchenCompleted === true;
        return hasKitchenItems && !kitchenDone && (o.paid !== false); // only paid orders (or pending? we show all non-completed)
      });
      const bar = document.getElementById('kitchen-total-bar');
      if (kitchenOrders.length === 0) {
        c.innerHTML = '<div style="text-align:center;color:#8a6dcc;padding:20px;">No kitchen orders</div>';
        if (bar) bar.style.display = 'none';
        return;
      }
      const itemCounts = {};
      let totalItems = 0;
      kitchenOrders.forEach(o => {
        (o.items || []).forEach(i => {
          if ((i.category || 'Kitchen') !== 'PBQ') {
            const q = Number(i.quantity) || 1;
            itemCounts[i.name] = (itemCounts[i.name] || 0) + q;
            totalItems += q;
          }
        });
      });
      if (bar) {
        bar.style.display = 'block';
        const chipHtml = Object.keys(itemCounts).map(n =>
          '<span class="summary-item">' + safeDisplay(n) + ' ×' + itemCounts[n] + '</span>'
        ).join('');
        bar.innerHTML =
          '<div class="summary-headline">🍳 To cook: ' + totalItems + ' item' + (totalItems > 1 ? 's' : '') + '</div>' +
          '<div class="summary-items">' + chipHtml + '</div>';
      }
      c.innerHTML = kitchenOrders.map(o => {
        const ot = o.orderType || o.type || 'walkin';
        const paidBadge = o.paid ? '<span class="payment-status paid">PAID</span>' : '<span class="payment-status unpaid">UNPAID</span>';
        const displayName = o.customerName || (ot === 'tawag' ? 'Tawag Guest' : 'Walk-in #' + (o.number || ''));
        const kitchenItems = (o.items || []).filter(i => (i.category || 'Kitchen') !== 'PBQ');
        return `<div class="order-card" data-order-id="${o.id}">
          <div class="order-header"><span class="order-number">${safeDisplay(displayName)} ${paidBadge}</span><span class="order-type ${ot}">${ot === 'walkin' ? 'WALK-IN' : 'TAWAG'}</span></div>
          <div class="order-time"><span class="clock-emoji">🕐</span> ${o.timestamp || ''}${o.customerName ? ' | 👤 ' + safeDisplay(o.customerName) : ''}${o.pickupTime ? ' | ⏰ ' + safeDisplay(o.pickupTime) : ''}</div>
          ${o.notes ? '<div class="order-notes">' + safeDisplay(o.notes) + '</div>' : ''}
          <div class="order-items">${kitchenItems.map(i => '<div class="order-item"><span>' + safeDisplay(i.name) + '</span><span>×' + i.quantity + '</span></div>').join('')}</div>
          <div class="order-actions"><button class="btn-status btn-complete" data-section="kitchen">✓ Complete</button></div>
        </div>`;
      }).join('');
      c.querySelectorAll('.btn-complete').forEach(btn => {
        btn.onclick = function(e) {
          e.stopPropagation();
          const card = this.closest('.order-card');
          if (!card) return;
          const id = card.dataset.orderId;
          const section = this.dataset.section || 'kitchen';
          completeOrderLocal(id, section);
        };
      });
    }
    function updatePbqDisplay() {
      const c = document.getElementById('pbq-all-orders');
      // Show orders that have PBQ items and pbq is not completed
      const pbqOrders = currentOrders.filter(o => {
        const items = o.items || [];
        const hasPbqItems = items.some(i => (i.category || 'Kitchen') === 'PBQ');
        const pbqDone = o.pbqCompleted === true;
        return hasPbqItems && !pbqDone && (o.paid !== false);
      });
      if (pbqOrders.length === 0) {
        c.innerHTML = '<div style="text-align:center;color:#8a6dcc;padding:20px;">No PBQ orders</div>';
        const bar = document.getElementById('pbq-total-bar');
        if (bar) bar.style.display = 'none';
        return;
      }
      const bar = document.getElementById('pbq-total-bar');
      const pbqCounts = {};
      let pbqTotal = 0;
      pbqOrders.forEach(o => {
        (o.items || []).forEach(i => {
          if ((i.category || 'Kitchen') === 'PBQ') {
            const q = Number(i.quantity) || 1;
            pbqCounts[i.name] = (pbqCounts[i.name] || 0) + q;
            pbqTotal += q;
          }
        });
      });
      if (bar) {
        bar.style.display = 'block';
        const chipHtml = Object.keys(pbqCounts).map(n =>
          '<span class="summary-item">' + safeDisplay(n) + ' ×' + pbqCounts[n] + '</span>'
        ).join('');
        bar.innerHTML =
          '<div class="summary-headline">🍢 PBQ to cook: ' + pbqTotal + ' item' + (pbqTotal > 1 ? 's' : '') + '</div>' +
          '<div class="summary-items">' + chipHtml + '</div>';
      }
      c.innerHTML = pbqOrders.map(o => {
        const ot = o.orderType || o.type || 'walkin';
        const paidBadge = o.paid ? '<span class="payment-status paid">PAID</span>' : '<span class="payment-status unpaid">UNPAID</span>';
        const displayName = o.customerName || (ot === 'tawag' ? 'Tawag Guest' : 'Walk-in #' + (o.number || ''));
        return `<div class="order-card" data-order-id="${o.id}">
          <div class="order-header"><span class="order-number">${safeDisplay(displayName)} ${paidBadge}</span><span class="order-type ${ot}">${ot === 'walkin' ? 'WALK-IN' : 'TAWAG'}</span></div>
          <div class="order-time"><span class="clock-emoji">🕐</span> ${o.timestamp || ''}${o.customerName ? ' | 👤 ' + safeDisplay(o.customerName) : ''}${o.pickupTime ? ' | ⏰ ' + safeDisplay(o.pickupTime) : ''}</div>
          ${o.notes ? '<div class="order-notes">' + safeDisplay(o.notes) + '</div>' : ''}
          <div class="order-items">${(o.items || []).map(i => i.category !== 'PBQ' ? '' : '<div class="order-item"><span>' + safeDisplay(i.name) + '</span><span>×' + i.quantity + '</span></div>').join('')}</div>
          <div class="order-actions"><button class="btn-status btn-complete" data-section="pbq">✓ Complete</button></div>
        </div>`;
      }).join('');
      c.querySelectorAll('.btn-complete').forEach(btn => {
        btn.onclick = function(e) {
          e.stopPropagation();
          const card = this.closest('.order-card');
          if (!card) return;
          const id = card.dataset.orderId;
          const section = this.dataset.section || 'pbq';
          completeOrderLocal(id, section);
        };
      });
    }
    // ============================================================
    // END OF DAY
    // ============================================================
    function endOfDay() {
      if (isProcessing) return;
      if (!confirm('Export today\'s sales and clear all orders?')) return;
      isProcessing = true;
      showLoading('Exporting and clearing...');
      getOrdersRef().once('value').then((snapshot) => {
        const data = snapshot.val();
        if (!data) {
          showToast('📭 No orders to export today', null, 'warning');
          isProcessing = false;
          hideLoading();
          return;
        }
        const orders = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        let csv = 'Order#,Type,Total,Payment,Time,Items\n';
        orders.forEach(o => {
          const items = (o.items || []).map(i => i.name + '×' + i.quantity).join('; ');
          csv += (o.number || '') + ',' + (o.orderType || o.type) + ',' + (o.total || 0) + ',' + (o.paymentMethod || 'Cash') + ',' + (o.timestamp || '') + ',"' + items + '"\n';
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'sales_' + getToday() + '.csv';
        a.click();
        clearTodayOrders().then(() => {
          showToast('✅ Orders cleared! CSV downloaded.', null, 'success');
          isProcessing = false;
          hideLoading();
        }).catch((err) => {
          showToast('❌ Error clearing orders: ' + err.message, null, 'error');
          isProcessing = false;
          hideLoading();
        });
      }).catch((err) => {
        showToast('❌ Error exporting: ' + err.message, null, 'error');
        isProcessing = false;
        hideLoading();
      });
    }
    // ============================================================
    // HISTORY & SUMMARY
    // ============================================================
    function showHistory() {
      getHistoryRef().once('value').then((snapshot) => {
        const data = snapshot.val();
        const c = document.getElementById('history-list');
        if (!data) {
          c.innerHTML = '<div style="text-align:center;color:#8a6dcc;padding:20px;">No transactions yet</div>';
        } else {
          const history = Object.keys(data).map(key => ({ id: key, ...data[key] })).reverse();
          c.innerHTML = history.map(t => {
            const displayName = t.customerName || (t.number ? '#' + t.number : 'Guest');
            let methodLabel = (t.paymentMethod || 'Cash');
            if (t.paymentMethod === 'Split') {
              methodLabel = 'Split 💵₱' + formatNumber(t.cashAmount || 0) + ' 📱₱' + formatNumber(t.gcashAmount || 0);
            }
            return `<div class="history-item"><span class="clock-emoji">🕐</span> <strong>${t.timestamp || ''}</strong> | ${(t.orderType || t.type) === 'tawag' ? '📞 Tawag' : '🚶 Walk-in'} | Method: <strong>${methodLabel}</strong> | ${safeDisplay(displayName)}<br>Order: ₱${formatNumber(t.total || 0)} | Cash Paid: ₱${formatNumber(t.paid || 0)} | Change: ₱${formatNumber(t.change || 0)}</div>`;
          }).join('');
        }
        document.getElementById('history-modal').classList.add('show');
        play('btn');
      });
    }
    function closeHistory() {
      document.getElementById('history-modal').classList.remove('show');
    }
    function clearHistory() {
      if (!confirm('⚠️ Delete ALL data from Firebase? This cannot be undone!')) return;
      showLoading('Clearing data...');
      Promise.all([
        db.ref('orders').remove(),
        db.ref('history').remove()
      ]).then(() => {
        play('btn');
        showToast('🗑️ All data cleared from Firebase', null, 'warning');
        hideLoading();
      }).catch((err) => {
        showToast('❌ Error clearing data: ' + err.message, null, 'error');
        hideLoading();
      });
    }
    function showSummary() {
      getHistoryRef().once('value').then((snapshot) => {
        const data = snapshot.val();
        if (!data) {
          document.getElementById('summary-grid').innerHTML = '<div style="text-align:center;padding:20px;">No data yet</div>';
          document.getElementById('summary-modal').classList.add('show');
          return;
        }
        const history = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        const filter = document.getElementById('summary-filter').value;
        let filtered = history;
        if (filter === 'walkin') {
          filtered = history.filter(t => (t.orderType || t.type) === 'walkin' && t.paymentMethod !== 'GCash' && t.paymentMethod !== 'Split');
        } else if (filter === 'tawag') {
          filtered = history.filter(t => (t.orderType || t.type) === 'tawag' && t.paymentMethod !== 'GCash' && t.paymentMethod !== 'Split');
        } else if (filter === 'gcash') {
          filtered = history.filter(t => t.paymentMethod === 'GCash');
        } else if (filter === 'split') {
          filtered = history.filter(t => t.paymentMethod === 'Split');
        }
        let cashTotal = 0, gcashTotal = 0;
        history.forEach(t => {
          if (t.paymentMethod === 'Split') {
            gcashTotal += (t.gcashAmount || 0);
            cashTotal += (t.cashAmount || 0);
          } else if (t.paymentMethod === 'GCash') {
            gcashTotal += (t.total || 0);
          } else {
            cashTotal += (t.total || 0);
          }
        });
        const splitCount = history.filter(t => t.paymentMethod === 'Split').length;
        let splitCash = 0, splitGcash = 0;
        history.filter(t => t.paymentMethod === 'Split').forEach(t => {
          splitCash += (t.cashAmount || 0);
          splitGcash += (t.gcashAmount || 0);
        });
        const sales = {};
        filtered.forEach(t => {
          (t.items || []).forEach(i => {
            if (!sales[i.name]) sales[i.name] = { qty: 0, total: 0 };
            sales[i.name].qty += i.quantity;
            sales[i.name].total += i.total;
          });
          if (t.ecoBags > 0) {
            if (!sales['Eco Bag']) sales['Eco Bag'] = { qty: 0, total: 0 };
            sales['Eco Bag'].qty += t.ecoBags;
            sales['Eco Bag'].total += t.ecoBags * 5;
          }
        });
        let html = '<div class="summary-section-title">📊 Sales Breakdown</div>';
        if (sales && Object.keys(sales).length > 0) {
          html += '<table class="summary-table"><thead><tr><th>Item</th><th>Qty</th><th>Sales</th></tr></thead><tbody>';
          Object.keys(sales).forEach(k => {
            html += '<tr><td>' + safeDisplay(k) + '</td><td>' + sales[k].qty + '</td><td>₱' + formatNumber(sales[k].total) + '</td></tr>';
          });
          html += '</tbody></table>';
        } else {
          html += '<div style="text-align:center;padding:10px;color:#8a6dcc;">No item sales for this filter</div>';
        }
        html += '<div class="summary-breakdown">';
        html += '💵 <strong>Cash Drawer:</strong> ₱' + formatNumber(cashTotal) + '<br>';
        html += '📱 <strong>GCash Wallet:</strong> ₱' + formatNumber(gcashTotal) + '<br>';
        if (splitCount > 0) {
          html += '🔀 <strong>Split Orders:</strong> ' + splitCount + ' order' + (splitCount > 1 ? 's' : '') + ' (💵₱' + formatNumber(splitCash) + ' + 📱₱' + formatNumber(splitGcash) + ')<br>';
        }
        html += '<hr style="margin:5px 0; border:none; border-top:1px dashed #8a6dcc;">';
        html += '📈 <strong>Grand Total:</strong> ₱' + formatNumber(cashTotal + gcashTotal) + ' (' + filtered.length + ' orders)';
        html += '</div>';
        document.getElementById('summary-grid').innerHTML = html;
        document.getElementById('summary-modal').classList.add('show');
        play('btn');
      });
    }
    function closeSummary() {
      document.getElementById('summary-modal').classList.remove('show');
    }
    function exportSummary() {
      getHistoryRef().once('value').then((snapshot) => {
        const data = snapshot.val();
        if (!data) {
          showToast('📭 No data to export', null, 'warning');
          return;
        }
        const history = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        const filter = document.getElementById('summary-filter').value;
        let filtered = history;
        if (filter === 'walkin') {
          filtered = history.filter(t => (t.orderType || t.type) === 'walkin' && t.paymentMethod !== 'GCash' && t.paymentMethod !== 'Split');
        } else if (filter === 'tawag') {
          filtered = history.filter(t => (t.orderType || t.type) === 'tawag' && t.paymentMethod !== 'GCash' && t.paymentMethod !== 'Split');
        } else if (filter === 'gcash') {
          filtered = history.filter(t => t.paymentMethod === 'GCash');
        } else if (filter === 'split') {
          filtered = history.filter(t => t.paymentMethod === 'Split');
        }
        let csv = 'Time,Type,Method,Cash,GCash,Order#,Customer,Total,Change,Items\n';
        filtered.forEach(t => {
          const items = (t.items || []).map(i => i.name + '×' + i.quantity).join('; ');
          const cashPart = (t.paymentMethod === 'Split') ? (t.cashAmount || 0) : (t.paymentMethod === 'Cash' ? (t.total || 0) : 0);
          const gcashPart = (t.paymentMethod === 'Split') ? (t.gcashAmount || 0) : (t.paymentMethod === 'GCash' ? (t.total || 0) : 0);
          csv += (t.timestamp || '') + ',' + (t.orderType || t.type) + ',' + (t.paymentMethod || 'Cash') + ',' + cashPart + ',' + gcashPart + ',' + (t.number || '') + ',' + (t.customerName || '') + ',' + (t.total || 0) + ',' + (t.change || 0) + ',"' + items + '"\n';
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'sales_export_' + getToday() + '.csv';
        a.click();
        play('btn');
        showToast('📥 CSV exported successfully!', null, 'success');
      });
    }
    // ============================================================
    // TAB SWITCHING
    // ============================================================
    function switchTab(tab, el) {
      const views = ['cashier-view', 'pending-view', 'kitchen-view', 'pbq-view', 'more-view', 'admin-view'];
      views.forEach(id => {
        const e = document.getElementById(id);
        if (e) e.style.display = 'none';
      });
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const viewId = tab + '-view';
      const view = document.getElementById(viewId);
      if (view) view.style.display = 'flex';
      if (el) {
        el.classList.add('active');
      } else {
        const btn = document.querySelector(`[data-tab="${tab}"]`);
        if (btn) btn.classList.add('active');
      }
      if (tab === 'admin') {
        renderAdminMenu();
      }
      currentTab = tab;
      if (tab === 'pending') updatePendingDisplay();
      else if (tab === 'kitchen') updateKitchenDisplay();
      else if (tab === 'pbq') updatePbqDisplay();
    }
    // ============================================================
    // THEME & SOUND
    // ============================================================
    function toggleTheme() {
      darkMode = !darkMode;
      document.body.classList.toggle('dark-mode', darkMode);
      document.getElementById('theme-switch').classList.toggle('active', darkMode);
      play('btn');
      localStorage.setItem('pos_theme', darkMode ? 'dark' : 'light');
    }
    function toggleSound() {
      soundOn = !soundOn;
      document.getElementById('sound-switch').classList.toggle('active', soundOn);
      localStorage.setItem('pos_sound', soundOn ? 'on' : 'off');
      play('btn');
    }
    function showAppInfo() {
      document.getElementById('app-info-modal').classList.add('show');
      play('btn');
    }
    function closeAppInfo() {
      document.getElementById('app-info-modal').classList.remove('show');
    }
    // ============================================================
    // INITIALIZATION
    // ============================================================
    document.addEventListener('DOMContentLoaded', function() {
      // Low-performance device detection (old/slow phones): reduce heavy animations
      try {
        const cores = navigator.hardwareConcurrency || 8;
        const mem = navigator.deviceMemory || 8;
        if (cores <= 2 || mem <= 2) document.body.classList.add('low-perf');
      } catch (e) {}
      // Build compact calculator
      const calc = document.getElementById('compact-calculator');
      [
        ['7', '8', '9'],
        ['4', '5', '6'],
        ['1', '2', '3'],
        ['C', '0', '⌫']
      ].forEach(row => {
        row.forEach(key => {
          const btn = document.createElement('button');
          btn.className = 'calc-btn-compact';
          btn.textContent = key;
          btn.onclick = function() {
            if (key === 'C') paymentClear();
            else if (key === '⌫') paymentBackspace();
            else paymentInput(parseInt(key));
          };
          calc.appendChild(btn);
        });
      });
      // Order type toggle
      document.getElementById('order-type').addEventListener('change', function() {
        const isTawag = this.value === 'tawag';
        const cashierView = document.getElementById('cashier-view');
        const section = document.querySelector('.order-info-section');
        const badge = document.querySelector('.mode-badge');
        document.getElementById('pickup-time').style.display = isTawag ? 'block' : 'none';
        document.getElementById('customer-name').style.display = isTawag ? 'block' : 'none';
        document.getElementById('order-number').style.display = isTawag ? 'none' : 'block';
        cashierView.classList.remove('walkin-mode', 'tawag-mode');
        section.classList.remove('walkin-mode', 'tawag-mode');
        if (isTawag) {
          cashierView.classList.add('tawag-mode');
          section.classList.add('tawag-mode');
          if (badge) {
            badge.textContent = '📞 TAWAG';
            badge.className = 'mode-badge tawag';
          }
        } else {
          cashierView.classList.add('walkin-mode');
          section.classList.add('walkin-mode');
          if (badge) {
            badge.textContent = '🚶 WALK-IN';
            badge.className = 'mode-badge walkin';
          }
        }
        if (isTawag) {
          document.getElementById('pickup-time').value = new Date().toTimeString().slice(0, 5);
        }
      });
      // Restore theme and sound
      const savedTheme = localStorage.getItem('pos_theme');
      if (savedTheme === 'dark') {
        darkMode = true;
        document.body.classList.add('dark-mode');
        document.getElementById('theme-switch').classList.add('active');
      }
      const savedSound = localStorage.getItem('pos_sound');
      if (savedSound === 'off') {
        soundOn = false;
        document.getElementById('sound-switch').classList.remove('active');
      } else {
        soundOn = true;
        document.getElementById('sound-switch').classList.add('active');
      }
      // Initialize app
      loadMenu();
      listenForOrders();
      updateOrderDisplay();
      updateEcoBagDisplay();
      setInterval(tickAllClocks, 7000);
      console.log('🍩 Celebrity Kitchen POS v2.0.1 initialized successfully!');
    });
