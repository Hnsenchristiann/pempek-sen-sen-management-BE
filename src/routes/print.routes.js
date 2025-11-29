import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PrintQueueModel } from '../models/posOrder.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTOPRINT_FOLDER = path.join(__dirname, '../../uploads/autoprint')

// Ensure autoprint folder exists
if (!fs.existsSync(AUTOPRINT_FOLDER)) {
  fs.mkdirSync(AUTOPRINT_FOLDER, { recursive: true })
  console.log(`✓ Created autoprint folder: ${AUTOPRINT_FOLDER}`)
}

const router = express.Router()

/**
 * POST /api/print/queue
 * Frontend mengirim print job ke queue
 */
router.post('/queue', async (req, res) => {
  try {
    const { escposData, printType, orderId } = req.body

    if (!escposData || !printType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: escposData, printType'
      })
    }

    const job = await PrintQueueModel.create({
      escposData,
      printType,
      orderId,
      status: 'pending'
    })

    console.log(`📤 Print job queued: ${job._id} (${printType})`)

    res.json({
      success: true,
      jobId: job._id,
      message: 'Print job queued successfully'
    })
  } catch (error) {
    console.error('Print queue error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * GET /api/print/next
 * Tablet polling untuk mendapat print job berikutnya
 */
router.get('/next', async (req, res) => {
  try {
    // Cari job pending terlama (FIFO)
    const job = await PrintQueueModel.findOne({ status: 'pending' }).sort({ createdAt: 1 })

    if (!job) {
      return res.json({
        success: true,
        hasPrint: false,
        message: 'No pending print jobs'
      })
    }

    // Update status ke "printing" agar tablet lain tidak ambil job yang sama
    await PrintQueueModel.findByIdAndUpdate(job._id, { status: 'printing' })

    console.log(`📥 Print job sent to tablet: ${job._id}`)

    res.json({
      success: true,
      hasPrint: true,
      jobId: job._id,
      escposData: job.escposData,
      printType: job.printType,
      orderId: job.orderId
    })
  } catch (error) {
    console.error('Get next print job error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * PUT /api/print/:jobId/done
 * Tablet confirm setelah print berhasil
 */
router.put('/:jobId/done', async (req, res) => {
  try {
    const { jobId } = req.params

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Missing jobId'
      })
    }

    const updated = await PrintQueueModel.findByIdAndUpdate(
      jobId,
      {
        status: 'printed',
        printedAt: new Date()
      },
      { new: true }
    )

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Print job not found'
      })
    }

    console.log(`✅ Print job completed: ${jobId}`)

    res.json({
      success: true,
      message: 'Print job marked as completed',
      job: updated
    })
  } catch (error) {
    console.error('Mark print done error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * GET /api/print/status/:jobId
 * Check status print job tertentu
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    const job = await PrintQueueModel.findById(req.params.jobId)

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Print job not found'
      })
    }

    res.json({
      success: true,
      job: {
        id: job._id,
        status: job.status,
        printType: job.printType,
        createdAt: job.createdAt,
        printedAt: job.printedAt
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * DELETE /api/print/cleanup
 * Admin: cleanup old printed jobs (opsional)
 */
router.delete('/cleanup', async (req, res) => {
  try {
    // Delete printed jobs older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const result = await PrintQueueModel.deleteMany({
      status: 'printed',
      printedAt: { $lt: sevenDaysAgo }
    })

    console.log(`🧹 Cleaned up ${result.deletedCount} old print jobs`)

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} old print jobs`,
      deletedCount: result.deletedCount
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * POST /api/print/save-for-autoprint
 * Save ESCPOS data ke file untuk AutoPrint RawBT (folder watching)
 * AutoPrint akan otomatis pick file terbaru dan print
 */
router.post('/save-for-autoprint', async (req, res) => {
  try {
    const { escposData, printType, jobId } = req.body

    if (!escposData) {
      return res.status(400).json({
        success: false,
        error: 'Missing escposData'
      })
    }

    // Nama file: timestamp_printtype_jobid.escpos
    const timestamp = Date.now()
    const filename = `${timestamp}_${printType}_${jobId || 'manual'}.escpos`
    const filepath = path.join(AUTOPRINT_FOLDER, filename)

    // Convert escposData (base64 or string) to binary buffer
    let buffer
    if (typeof escposData === 'string') {
      // Jika sudah base64
      if (escposData.match(/^[A-Za-z0-9+/=]+$/)) {
        buffer = Buffer.from(escposData, 'base64')
      } else {
        // Raw string - convert to buffer
        buffer = Buffer.from(escposData, 'utf8')
      }
    } else {
      buffer = Buffer.from(escposData)
    }

    // Write file
    fs.writeFileSync(filepath, buffer)
    console.log(`💾 Saved ESCPOS to autoprint folder: ${filename} (${buffer.length} bytes)`)

    // Optional: Delete old files (keep only last 10)
    try {
      const files = fs.readdirSync(AUTOPRINT_FOLDER)
        .filter(f => f.endsWith('.escpos'))
        .map(f => ({
          name: f,
          path: path.join(AUTOPRINT_FOLDER, f),
          time: fs.statSync(path.join(AUTOPRINT_FOLDER, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time)

      // Delete files older than 10
      if (files.length > 10) {
        files.slice(10).forEach(f => {
          fs.unlinkSync(f.path)
          console.log(`🗑️  Deleted old autoprint file: ${f.name}`)
        })
      }
    } catch (cleanupErr) {
      console.warn('Autoprint cleanup warning:', cleanupErr.message)
    }

    res.json({
      success: true,
      filename,
      path: filepath,
      size: buffer.length,
      message: 'ESCPOS saved for AutoPrint'
    })
  } catch (error) {
    console.error('Save autoprint error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

export default router
