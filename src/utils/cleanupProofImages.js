/**
 * CLEANUP UTILITY: Auto-delete proof images setelah 7 hari
 * 
 * Purpose:
 * - Menghapus file gambar bukti TF (QRIS) yang sudah lebih dari 7 hari
 * - Menjaga storage agar tidak penuh
 * - Berjalan otomatis setiap hari (configurable di server.js)
 * 
 * File yang dihapus: uploads/bukti-*.jpg, uploads/bukti-*.png, etc
 * Database: Set payment.qrisProofUrl = null jika file sudah dihapus
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import PosOrder from '../models/posOrder.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsDir = path.resolve(__dirname, '../../uploads')

// 7 hari dalam milliseconds
const RETENTION_DAYS = 7
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000

/**
 * Main cleanup function
 * Runs setiap hari untuk delete image yang berusia > 7 hari
 */
export async function cleanupProofImages() {
  try {
    console.log(`🧹 Starting proof image cleanup (retention: ${RETENTION_DAYS} days)...`)
    
    const now = new Date()
    const cutoffDate = new Date(now.getTime() - RETENTION_MS)
    
    console.log(`📅 Current time: ${now.toISOString()}`)
    console.log(`📅 Cutoff time: ${cutoffDate.toISOString()} (older than this will be deleted)`)

    // 1. Find all orders dengan payment.uploadedAt < cutoffDate
    const ordersWithOldFiles = await PosOrder.find({
      'payment.uploadedAt': { $lt: cutoffDate },
      'payment.qrisProofUrl': { $exists: true, $ne: null }
    })

    console.log(`📊 Found ${ordersWithOldFiles.length} orders dengan file lama`)

    let filesDeleted = 0
    let errorCount = 0

    // 2. Delete files & update DB untuk setiap order
    for (const order of ordersWithOldFiles) {
      const filePath = order.payment.qrisProofUrl
      if (!filePath) continue

      // Reconstruct full path (filePath biasanya: 'bukti-1234567890.jpg')
      const fullPath = path.join(uploadsDir, path.basename(filePath))

      try {
        // 2a. Delete file dari disk
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath)
          console.log(`✓ Deleted: ${path.basename(fullPath)}`)
          filesDeleted++
        }

        // 2b. Update DB: set qrisProofUrl = null
        await PosOrder.updateOne(
          { _id: order._id },
          { $set: { 'payment.qrisProofUrl': null } }
        )
        console.log(`✓ Updated DB: Order ${order._id}`)

      } catch (err) {
        console.error(`✗ Error deleting ${fullPath}:`, err.message)
        errorCount++
      }
    }

    console.log(`\n✅ Cleanup complete:`)
    console.log(`   - Files deleted: ${filesDeleted}`)
    console.log(`   - Errors: ${errorCount}`)
    console.log(`   - Storage freed: ~${(filesDeleted * 2).toFixed(1)} MB (estimate)`)

    return {
      success: true,
      filesDeleted,
      errors: errorCount,
      timestamp: new Date().toISOString()
    }

  } catch (err) {
    console.error('❌ Cleanup error:', err)
    return {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * Manual cleanup endpoint (bisa di-trigger manual dari admin)
 * Usage: POST /api/admin/cleanup-proof-images
 */
export async function triggerCleanupEndpoint(req, res) {
  try {
    const result = await cleanupProofImages()
    res.json({
      message: 'Cleanup process completed',
      result
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * Setup scheduler untuk auto-cleanup setiap hari
 * Usage: Di server.js pada app startup
 */
export function setupCleanupScheduler(intervalMs = 24 * 60 * 60 * 1000) {
  // Run cleanup setiap 24 jam
  setInterval(async () => {
    console.log('\n⏰ [Scheduled cleanup] Starting...')
    await cleanupProofImages()
  }, intervalMs)
  
  console.log('✓ Proof image cleanup scheduler started (every 24 hours)')
}

export default { cleanupProofImages, setupCleanupScheduler, triggerCleanupEndpoint }
