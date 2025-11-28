// src/server.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import path from 'path'
import { fileURLToPath } from 'url'

import { connectDB } from './config/db.js'
import apiRouter from './routes/index.js'

import bcrypt from 'bcryptjs'
import User from './models/user.js'
import inventoryRoutes from './routes/inventory.routes.js'
import posRoutes from './routes/pos.routes.js'
import grabRoutes from './routes/grab.routes.js'
import menuRoutes from './routes/menu.routes.js'
import adminRoutes from './routes/admin.routes.js'
import paketRoutes from './routes/paket.routes.js'

import MenuSettings from './models/menuSettings.js'
import { setupCleanupScheduler } from './utils/cleanupProofImages.js'

// ---------------------- Seeder Users & Menus ----------------------
/**
 * PRODUCTION SEEDER:
 * Only runs on FIRST startup (checking if users exist)
 * Does NOT delete existing users to avoid data loss
 * Idempotent: Safe to run multiple times
 */
const seedUsers = async () => {
  try {
    const existingCount = await User.countDocuments({})
    if (existingCount > 0) {
      console.log('✓ Users already exist. Skipping seed (idempotent).')
      return
    }
    
    // Only create default users on FIRST startup
    const users = [
      {
        username: 'adminsensen',
        role: 'adminsensen',
        passwordHash: await bcrypt.hash('P3mpekS3nS3n19', 10)
      },
      {
        username: 'kasirsensen',
        role: 'kasirsensen',
        passwordHash: await bcrypt.hash('kasirsen19', 10)
      },
    ]

    await User.create(users)
    console.log('🌱 Seeded default users:')
    console.log('   - adminsensen / P3mpekS3nS3n19 (role: adminsensen)')
    console.log('   - kasirsensen / kasirsen19 (role: kasirsensen)')
  } catch (error) {
    console.error('❌ Seeder error:', error.message)
  }
}

/**
 * PRODUCTION MENU SEEDER:
 * Uses upsert: creates on first run, updates on subsequent runs
 * Safe for production (no data deletion)
 */
const seedMenus = async () => {
  try {
    const menus = [
      // Dashboards
      { menuKey: 'dashboard', section: 'dashboards', label: 'Dashboard', icon: 'mdi-view-dashboard', route: '/', roles: ['adminsensen'], visible: true, order: 1 },
      
      // POS
      { menuKey: 'pos-dashboard', section: 'pos', label: 'Dashboard', icon: 'mdi-shopping-outline', route: '/pos', roles: ['adminsensen', 'kasirsensen'], visible: true, order: 1 },
      { menuKey: 'grab-dashboard', section: 'pos', label: 'Grab Dashboard', icon: 'mdi-cellphone', route: '/grab', roles: ['adminsensen', 'kasirsensen'], visible: true, order: 2 },
      
      // Master Data
      { menuKey: 'categories', section: 'master', label: 'Kategori', icon: 'mdi-shape-outline', route: '/categories', roles: ['adminsensen'], visible: true, order: 1 },
      { menuKey: 'items', section: 'master', label: 'Item', icon: 'mdi-bowl', route: '/items', roles: ['adminsensen'], visible: true, order: 2 },
      { menuKey: 'stock', section: 'master', label: 'Stock', icon: 'mdi-warehouse', route: '/stock', roles: ['adminsensen'], visible: true, order: 3 },
      
      // History/Transactions
      { menuKey: 'transactions', section: 'history', label: 'Transaksi', icon: 'mdi-history', route: '/transactions', roles: ['adminsensen'], visible: true, order: 1 },
      { menuKey: 'grab-transactions', section: 'history', label: 'Transaksi Grab', icon: 'mdi-car', route: '/grab-transactions', roles: ['adminsensen'], visible: true, order: 2 },
      
      // Settings
      { menuKey: 'master-menu', section: 'settings', label: 'Master Menu', icon: 'mdi-cog', route: '/master-menu', roles: ['adminsensen'], visible: true, order: 1 },
      { menuKey: 'reset-data', section: 'settings', label: 'Reset Data', icon: 'mdi-database-remove', route: '/reset-data', roles: ['adminsensen'], visible: true, order: 2 },
    ]

    // Upsert each menu (idempotent - safe for production)
    for (const menu of menus) {
      await MenuSettings.updateOne(
        { menuKey: menu.menuKey },
        { $set: menu },
        { upsert: true }
      )
    }
    console.log('✓ Menu settings synced (upsert - idempotent)')
  } catch (error) {
    console.error('❌ Menu seeder error:', error.message)
  }
}

// Tambahkan seeder untuk tables
const seedTables = async () => {
  try {
    const Table = await import('./models/posTable.js')
    const existingTables = await Table.default.countDocuments({})

    if (existingTables > 0) {
      console.log('✓ Tables already exist')
      return
    }

    // Create default 10 tables
    const tables = []
    for (let i = 1; i <= 10; i++) {
      tables.push({
        number: i,
        label: `Table ${i}`,
        status: 'EMPTY',
        currentOrderId: null
      })
    }

    await Table.default.create(tables)
    console.log('🌱 Seeded 10 default tables')
  } catch (error) {
    console.error('❌ Table seeder error:', error.message)
  }
}

// Di bagian start, tambahkan:
connectDB(MONGO_URI).then(async () => {
  console.log('✓ Admin routes loaded')
  await seedUsers()
  await seedMenus()
  await seedTables()  // ✅ Add this

  setupCleanupScheduler(24 * 60 * 60 * 1000)

  app.listen(PORT, () =>
    console.log(`🚀 API running at http://localhost:${PORT}`)
  )
})

// const clearRoles = async () => {
//   // Clear all roles so user can create custom roles
//   // await Role.deleteMany({})
//   // console.log('🗑️ Cleared all roles - ready for custom role creation')
// }

// ---------------------- App Init ----------------------
const app = express()

// Middleware (cukup sekali, hindari duplikasi)
// Ganti line 122 dengan:
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://pempek-sen-sen-management-fe.vercel.app'
  ],
  credentials: true
})); // aman untuk dev FE
app.use(express.json())
app.use(morgan('dev'))

// Static untuk bukti QRIS (dan file lain jika perlu)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsDir = path.resolve(__dirname, '../uploads')
app.use('/uploads', express.static(uploadsDir))

// ---------------------- Health Checks ----------------------
app.get('/health', (_req, res) =>
  res.json({ ok: true, service: 'pempek-sen-sen', time: new Date() })
)
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, service: 'pempek-sen-sen', time: new Date() })
)

// ---------------------- Routes ----------------------
// Inventory (sudah ada)
app.use('/api/inventory', inventoryRoutes)

// POS routes → /api/pos/*
app.use('/api', posRoutes)

// Grab routes → /api/grab/*
app.use('/api', grabRoutes)

// Menu routes → /api/admin/menu-settings, /api/menus/by-role
app.use('/api', menuRoutes)

// Admin routes → /api/reset-data
app.use('/api', adminRoutes)

// Paket routes → /api/paket/*
app.use('/api/paket', paketRoutes)

// Router utama proyekmu
app.use('/api', apiRouter)



// 404 fallback (opsional tapi membantu)
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found', path: req.originalUrl })
})

// Error handler (opsional)
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ message: 'Internal server error' })
})

// ---------------------- Start ----------------------
const PORT = process.env.PORT || 4000
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017'

connectDB(MONGO_URI).then(async () => {
  console.log('✓ Admin routes loaded')
  await seedUsers()
  await seedMenus()
  await seedTables()  // ✅ Add this
  
  // Setup auto-cleanup untuk proof images (delete setelah 7 hari)
  setupCleanupScheduler(24 * 60 * 60 * 1000) // Run setiap 24 jam
  
  app.listen(PORT, () =>
    console.log(`🚀 API running at http://localhost:${PORT}`)
  )
})
