const fs = require('fs');
const path = require('path');
let mysql = null;
try {
  mysql = require('mysql2/promise');
} catch (e) {
  console.warn('mysql2 package not installed, running in JSON database mode.');
}

const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const DB_CONFIG_FILE = path.join(DATA_DIR, 'db_config.json');
const VISITORS_FILE = path.join(DATA_DIR, 'visitors.json');

// Helper for JSON read
function readJSON(file, fallback = {}) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
  }
  return fallback;
}

// Helper for JSON write
function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
    return false;
  }
}

// Database state
let pool = null;
let dbStatus = {
  driver: 'json',
  connected: false,
  host: 'localhost',
  port: 3306,
  user: 'root',
  database: 'ar_luxury_store',
  lastError: null,
  activeMode: 'Local JSON Storage (Resilient Active Fallback)'
};

// Initialize DB Layer
async function initDB() {
  const savedConfig = readJSON(DB_CONFIG_FILE, {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ar_luxury_store',
    autoConnect: true
  });

  if (mysql && savedConfig && savedConfig.password !== undefined && savedConfig.autoConnect) {
    try {
      await connectMySQL(savedConfig);
    } catch (err) {
      console.warn(`[DB] MySQL auto-connect note: ${err.message}. Seamlessly using local JSON database engine.`);
    }
  }
}

// Connect or reconnect to MySQL
async function connectMySQL(config) {
  if (!mysql) throw new Error('mysql2 package not available');

  // First connect to server without database to ensure DB exists
  const tempConn = await mysql.createConnection({
    host: config.host || '127.0.0.1',
    port: Number(config.port) || 3306,
    user: config.user || 'root',
    password: config.password || '',
    connectTimeout: 4000
  });

  const dbName = config.database || 'ar_luxury_store';
  await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await tempConn.end();

  // Create pool
  const newPool = mysql.createPool({
    host: config.host || '127.0.0.1',
    port: Number(config.port) || 3306,
    user: config.user || 'root',
    password: config.password || '',
    database: dbName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 4000
  });

  // Verify connection
  const conn = await newPool.getConnection();
  await conn.ping();
  conn.release();

  // Run schema creation
  await runMigrations(newPool);

  if (pool) {
    try { await pool.end(); } catch (e) {}
  }
  pool = newPool;

  dbStatus = {
    driver: 'mysql',
    connected: true,
    host: config.host,
    port: config.port || 3306,
    user: config.user,
    database: dbName,
    lastError: null,
    activeMode: 'MySQL 8.0 Live Database'
  };

  // Save successful config without raw plain password if preferred, or store config locally
  writeJSON(DB_CONFIG_FILE, {
    host: config.host,
    port: config.port || 3306,
    user: config.user,
    password: config.password,
    database: dbName,
    autoConnect: true
  });

  // Auto-sync products from JSON to MySQL if MySQL table is empty
  await autoSyncInitialData(newPool);

  console.log(`[DB] Successfully connected to MySQL 8.0 database: ${dbName}`);
  return true;
}

// Create MySQL tables if not exist
async function runMigrations(p) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS \`products\` (
      \`id\` VARCHAR(64) PRIMARY KEY,
      \`section\` VARCHAR(50) NOT NULL DEFAULT 'airpods',
      \`category\` VARCHAR(100) NOT NULL DEFAULT 'AirPods & Audio',
      \`gender\` VARCHAR(20) DEFAULT 'unisex',
      \`title\` VARCHAR(500) NOT NULL,
      \`price\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      \`original_price\` DECIMAL(10, 2) DEFAULT 0.00,
      \`ali_price\` DECIMAL(10, 2) DEFAULT 0.00,
      \`rating\` DECIMAL(3, 1) DEFAULT 5.0,
      \`reviews\` INT DEFAULT 1,
      \`badge\` VARCHAR(100) DEFAULT 'New Arrival',
      \`badge_type\` VARCHAR(50) DEFAULT 'bestseller',
      \`image\` VARCHAR(1000) NOT NULL,
      \`description\` TEXT,
      \`sizes_json\` JSON NULL,
      \`keywords_json\` JSON NULL,
      \`in_stock\` TINYINT(1) NOT NULL DEFAULT 1,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS \`orders\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`order_id\` VARCHAR(50) UNIQUE NOT NULL,
      \`customer_name\` VARCHAR(255) NOT NULL,
      \`customer_phone\` VARCHAR(50) NOT NULL,
      \`customer_email\` VARCHAR(255) DEFAULT '',
      \`customer_address\` TEXT NOT NULL,
      \`customer_city\` VARCHAR(100) DEFAULT 'Karachi',
      \`customer_area\` VARCHAR(100) DEFAULT '',
      \`subtotal\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      \`delivery_fee\` DECIMAL(10, 2) NOT NULL DEFAULT 250.00,
      \`total\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      \`payment_method\` VARCHAR(50) DEFAULT 'COD',
      \`status\` ENUM('Pending', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled') DEFAULT 'Pending',
      \`notes\` TEXT,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS \`order_items\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`order_id\` VARCHAR(50) NOT NULL,
      \`product_id\` VARCHAR(64) NOT NULL,
      \`title\` VARCHAR(500) NOT NULL,
      \`size\` VARCHAR(100) DEFAULT 'Standard',
      \`price\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      \`quantity\` INT NOT NULL DEFAULT 1,
      \`subtotal\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      \`image\` VARCHAR(1000) DEFAULT '',
      INDEX \`idx_order_id\` (\`order_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS \`settings\` (
      \`setting_key\` VARCHAR(100) PRIMARY KEY,
      \`setting_value\` JSON NOT NULL,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

// Auto seed MySQL from JSON if empty
async function autoSyncInitialData(p) {
  const [rows] = await p.query('SELECT COUNT(*) as count FROM products');
  if (rows[0].count === 0) {
    const jsonProds = readJSON(PRODUCTS_FILE, {});
    for (const [id, prod] of Object.entries(jsonProds)) {
      await saveProductToMySQL(p, prod);
    }
    console.log(`[DB] Seeded ${Object.keys(jsonProds).length} products into MySQL database.`);
  }

  // Also seed settings
  const [sRows] = await p.query('SELECT COUNT(*) as count FROM settings');
  if (sRows[0].count === 0) {
    const jsonSettings = readJSON(SETTINGS_FILE, {});
    await p.query('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
      ['general', JSON.stringify(jsonSettings), JSON.stringify(jsonSettings)]);
  }
}

// Test MySQL connection helper
async function testMySQL(config) {
  if (!mysql) throw new Error('mysql2 is not installed');
  const conn = await mysql.createConnection({
    host: config.host || '127.0.0.1',
    port: Number(config.port) || 3306,
    user: config.user || 'root',
    password: config.password || '',
    connectTimeout: 4000
  });
  const [result] = await conn.query('SELECT VERSION() as version');
  await conn.end();
  return { success: true, version: result[0].version };
}

// Save product to MySQL helper
async function saveProductToMySQL(p, prod) {
  const query = `
    INSERT INTO products (
      id, section, category, gender, title, price, original_price, ali_price,
      rating, reviews, badge, badge_type, image, description, sizes_json, keywords_json, in_stock
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      category = VALUES(category),
      title = VALUES(title),
      price = VALUES(price),
      original_price = VALUES(original_price),
      badge = VALUES(badge),
      image = VALUES(image),
      description = VALUES(description),
      sizes_json = VALUES(sizes_json),
      in_stock = VALUES(in_stock);
  `;
  await p.query(query, [
    prod.id,
    prod.section || 'airpods',
    prod.category || 'AirPods & Audio',
    prod.gender || 'unisex',
    prod.title,
    prod.price,
    prod.originalPrice || prod.original_price || prod.price,
    prod.aliPrice || prod.ali_price || 0,
    prod.rating || 5.0,
    prod.reviews || 1,
    prod.badge || 'New Arrival',
    prod.badgeType || prod.badge_type || 'bestseller',
    prod.image,
    prod.description || '',
    JSON.stringify(prod.sizes || ['Standard']),
    JSON.stringify(prod.keywords || []),
    prod.inStock !== false ? 1 : 0
  ]);
}

// ============================================================================
// PUBLIC UNIFIED API (WORKS FOR BOTH MYSQL AND RESILIENT JSON STORAGE)
// ============================================================================

async function getProducts() {
  if (pool && dbStatus.connected) {
    try {
      const [rows] = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
      const productsMap = {};
      for (const r of rows) {
        productsMap[r.id] = {
          id: r.id,
          section: r.section,
          category: r.category,
          gender: r.gender,
          title: r.title,
          price: Number(r.price),
          originalPrice: Number(r.original_price),
          aliPrice: Number(r.ali_price),
          rating: Number(r.rating),
          reviews: Number(r.reviews),
          badge: r.badge,
          badgeType: r.badge_type,
          image: r.image,
          description: r.description,
          sizes: typeof r.sizes_json === 'string' ? JSON.parse(r.sizes_json) : (r.sizes_json || ['Standard']),
          keywords: typeof r.keywords_json === 'string' ? JSON.parse(r.keywords_json) : (r.keywords_json || []),
          inStock: Boolean(r.in_stock)
        };
      }
      return productsMap;
    } catch (err) {
      console.error('[DB] MySQL getProducts error, falling back to JSON:', err);
    }
  }
  return readJSON(PRODUCTS_FILE, {});
}

async function saveProduct(prod) {
  // Always update JSON file so local cache is never stale
  const jsonProds = readJSON(PRODUCTS_FILE, {});
  jsonProds[prod.id] = {
    ...(jsonProds[prod.id] || {}),
    ...prod
  };
  writeJSON(PRODUCTS_FILE, jsonProds);

  if (pool && dbStatus.connected) {
    try {
      await saveProductToMySQL(pool, jsonProds[prod.id]);
    } catch (err) {
      console.error('[DB] MySQL saveProduct error:', err);
    }
  }
  return jsonProds[prod.id];
}

async function deleteProduct(id) {
  // Update JSON
  const jsonProds = readJSON(PRODUCTS_FILE, {});
  if (jsonProds[id]) {
    delete jsonProds[id];
    writeJSON(PRODUCTS_FILE, jsonProds);
  }

  if (pool && dbStatus.connected) {
    try {
      await pool.query('DELETE FROM products WHERE id = ?', [id]);
    } catch (err) {
      console.error('[DB] MySQL deleteProduct error:', err);
    }
  }
  return true;
}

async function getOrders() {
  if (pool && dbStatus.connected) {
    try {
      const [orders] = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
      const [items] = await pool.query('SELECT * FROM order_items');

      const itemsMap = {};
      for (const it of items) {
        if (!itemsMap[it.order_id]) itemsMap[it.order_id] = [];
        itemsMap[it.order_id].push({
          productId: it.product_id,
          title: it.title,
          selectedSize: it.size,
          price: Number(it.price),
          quantity: it.quantity,
          subtotal: Number(it.subtotal),
          image: it.image
        });
      }

      return orders.map(o => ({
        orderId: o.order_id,
        createdAt: o.created_at,
        customer: {
          name: o.customer_name,
          phone: o.customer_phone,
          email: o.customer_email,
          area: o.customer_area,
          address: o.customer_address,
          city: o.customer_city
        },
        items: itemsMap[o.order_id] || [],
        subtotal: Number(o.subtotal),
        deliveryFee: Number(o.delivery_fee),
        total: Number(o.total),
        paymentMethod: o.payment_method,
        status: o.status,
        notes: o.notes || ''
      }));
    } catch (err) {
      console.error('[DB] MySQL getOrders error, falling back to JSON:', err);
    }
  }
  return readJSON(ORDERS_FILE, []);
}

async function createOrder(orderData) {
  // Update JSON file
  const orders = readJSON(ORDERS_FILE, []);
  orders.unshift(orderData);
  writeJSON(ORDERS_FILE, orders);

  if (pool && dbStatus.connected) {
    try {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        await conn.query(`
          INSERT INTO orders (
            order_id, customer_name, customer_phone, customer_email,
            customer_address, customer_city, customer_area,
            subtotal, delivery_fee, total, payment_method, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          orderData.orderId,
          orderData.customer?.name || orderData.name || 'Anonymous',
          orderData.customer?.phone || orderData.phone || '',
          orderData.customer?.email || orderData.email || '',
          orderData.customer?.address || orderData.address || '',
          orderData.customer?.city || orderData.city || 'Karachi',
          orderData.customer?.area || orderData.area || '',
          orderData.subtotal || 0,
          orderData.deliveryFee !== undefined ? orderData.deliveryFee : 250,
          orderData.total || 0,
          orderData.paymentMethod || 'COD',
          orderData.status || 'Pending',
          orderData.notes || ''
        ]);

        if (Array.isArray(orderData.items)) {
          for (const it of orderData.items) {
            await conn.query(`
              INSERT INTO order_items (
                order_id, product_id, title, size, price, quantity, subtotal, image
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              orderData.orderId,
              it.id || it.productId || 'item',
              it.title || 'Product',
              it.selectedSize || it.size || 'Standard',
              it.price || 0,
              it.quantity || 1,
              (it.price || 0) * (it.quantity || 1),
              it.image || ''
            ]);
          }
        }

        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error('[DB] MySQL createOrder error:', err);
    }
  }
  return orderData;
}

async function updateOrderStatus(orderId, status) {
  // Update JSON
  const orders = readJSON(ORDERS_FILE, []);
  const order = orders.find(o => o.orderId === orderId);
  if (order) {
    order.status = status;
    writeJSON(ORDERS_FILE, orders);
  }

  if (pool && dbStatus.connected) {
    try {
      await pool.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, orderId]);
    } catch (err) {
      console.error('[DB] MySQL updateOrderStatus error:', err);
    }
  }
  return order;
}

async function getSettings() {
  if (pool && dbStatus.connected) {
    try {
      const [rows] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['general']);
      if (rows.length > 0) {
        return typeof rows[0].setting_value === 'string' ? JSON.parse(rows[0].setting_value) : rows[0].setting_value;
      }
    } catch (e) {
      console.error('[DB] MySQL getSettings error:', e);
    }
  }
  return readJSON(SETTINGS_FILE, {});
}

async function saveSettings(settingsData) {
  writeJSON(SETTINGS_FILE, settingsData);
  if (pool && dbStatus.connected) {
    try {
      await pool.query('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
        ['general', JSON.stringify(settingsData), JSON.stringify(settingsData)]);
    } catch (e) {
      console.error('[DB] MySQL saveSettings error:', e);
    }
  }
  return settingsData;
}

// Record incoming customer page visit
async function recordVisit(visitData) {
  const visitorsObj = readJSON(VISITORS_FILE, { visits: [] });
  if (!Array.isArray(visitorsObj.visits)) visitorsObj.visits = [];

  const now = new Date();
  const entry = {
    id: 'v_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    visitorId: String(visitData.visitorId || 'guest_' + Math.random().toString(36).substring(2, 6)),
    page: String(visitData.page || 'index.html').replace(/^\//, '') || 'index.html',
    device: visitData.device || 'Desktop',
    referrer: visitData.referrer || 'Direct',
    ip: visitData.ip || '127.0.0.1',
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString()
  };

  visitorsObj.visits.push(entry);

  // Keep last 3,000 visits to keep file compact and fast
  if (visitorsObj.visits.length > 3000) {
    visitorsObj.visits = visitorsObj.visits.slice(-3000);
  }

  writeJSON(VISITORS_FILE, visitorsObj);
  return entry;
}

// Compute live visitor analytics
async function getVisitorStats() {
  const visitorsObj = readJSON(VISITORS_FILE, { visits: [] });
  const visits = Array.isArray(visitorsObj.visits) ? visitorsObj.visits : [];

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const fifteenMinsAgo = Date.now() - (15 * 60 * 1000);

  const todayVisits = visits.filter(v => v.date === todayStr);
  const todayUniqueVisitors = new Set(todayVisits.map(v => v.visitorId)).size;
  const totalUniqueVisitors = new Set(visits.map(v => v.visitorId)).size;

  const activeNow = new Set(
    visits.filter(v => new Date(v.timestamp).getTime() >= fifteenMinsAgo).map(v => v.visitorId)
  ).size;

  // Page breakdown for today
  const pageMap = {};
  todayVisits.forEach(v => {
    const p = v.page || 'index.html';
    pageMap[p] = (pageMap[p] || 0) + 1;
  });

  const pageBreakdown = Object.keys(pageMap).map(p => ({
    page: p,
    views: pageMap[p]
  })).sort((a, b) => b.views - a.views);

  // Device breakdown
  let mobileCount = 0;
  let desktopCount = 0;
  todayVisits.forEach(v => {
    if (v.device === 'Mobile') mobileCount++;
    else desktopCount++;
  });

  // Recent visits (last 25)
  const recentVisits = [...visits].reverse().slice(0, 25);

  return {
    todayVisitors: todayUniqueVisitors,
    todayPageViews: todayVisits.length,
    totalVisitors: totalUniqueVisitors,
    totalPageViews: visits.length,
    activeNow: Math.max(activeNow, 1), // At least current active visitor
    deviceBreakdown: { mobile: mobileCount, desktop: desktopCount },
    pageBreakdown,
    recentVisits
  };
}

async function getStats() {
  const orders = await getOrders();
  const products = await getProducts();
  const visitorStats = await getVisitorStats();

  let totalRevenue = 0;
  let pendingOrders = 0;
  let confirmedOrders = 0;
  let dispatchedOrders = 0;
  let deliveredOrders = 0;

  orders.forEach(o => {
    if (o.status !== 'Cancelled') {
      totalRevenue += (Number(o.total) || 0);
    }
    if (o.status === 'Pending') pendingOrders++;
    if (o.status === 'Confirmed') confirmedOrders++;
    if (o.status === 'Dispatched') dispatchedOrders++;
    if (o.status === 'Delivered') deliveredOrders++;
  });

  return {
    totalRevenue,
    totalOrders: orders.length,
    pendingOrders,
    confirmedOrders,
    dispatchedOrders,
    deliveredOrders,
    totalProducts: Object.keys(products).length,
    visitors: visitorStats,
    db: dbStatus
  };
}

function getDbStatus() {
  return { ...dbStatus };
}

// Export module
module.exports = {
  initDB,
  connectMySQL,
  testMySQL,
  getProducts,
  saveProduct,
  deleteProduct,
  getOrders,
  createOrder,
  updateOrderStatus,
  getSettings,
  saveSettings,
  recordVisit,
  getVisitorStats,
  getStats,
  getDbStatus
};
