import { Router } from 'express'
import PosOrder from '../models/posOrder.js'
import GrabOrder from '../models/grabOrder.js'
import Item from '../models/items.js'
import Category from '../models/category.js'
import InventoryMovement from '../models/inventoryMovement.js'
import InventoryPeriod from '../models/inventoryPeriod.js'
import { cleanupProofImages } from '../utils/cleanupProofImages.js'

const router = Router()

// Log to verify router is loading
console.log('✓ Admin routes loaded')

// Reset all data - ADMIN ONLY
router.post('/reset-data', async (req, res) => {
  try {
    const { password } = req.body
    const adminPassword = 'P@ssw0rd'

    if (password !== adminPassword) {
      return res.status(403).json({ message: 'Password salah! Reset data dibatalkan.' })
    }

    console.log('🗑️  Starting data reset...')

    // Delete all data from collections
    await PosOrder.deleteMany({})
    console.log('✓ Deleted all PosOrder')

    await GrabOrder.deleteMany({})
    console.log('✓ Deleted all GrabOrder')

    await InventoryMovement.deleteMany({})
    console.log('✓ Deleted all InventoryMovement')

    await InventoryPeriod.deleteMany({})
    console.log('✓ Deleted all InventoryPeriod')

    // Keep items & categories but reset stock
    await Item.updateMany({}, { $set: { currentStock: 0 } })
    console.log('✓ Reset all Item currentStock to 0')

    console.log('✅ Data reset completed successfully!')

    res.json({
      ok: true,
      message: 'Semua data berhasil dihapus. Database sudah clean.',
      deleted: {
        posOrders: true,
        grabOrders: true,
        inventoryMovements: true,
        inventoryPeriods: true,
        itemsStockReset: true,
      }
    })
  } catch (error) {
    console.error('❌ Error resetting data:', error)
    res.status(500).json({ message: 'Gagal reset data: ' + error.message })
  }
})

// Manual trigger: Cleanup proof images (delete > 7 hari)
router.post('/cleanup-proof-images', async (req, res) => {
  try {
    console.log('🧹 Manual cleanup triggered')
    const result = await cleanupProofImages()
    res.json({
      message: 'Cleanup process completed',
      result
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
