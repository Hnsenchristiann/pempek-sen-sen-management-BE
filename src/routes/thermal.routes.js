/**
 * Thermal Printer Routes
 * Endpoints for communicating with thermal printer via COM port
 */

import express from 'express'
import jwt from 'jsonwebtoken'
import {
  printToThermalPrinter,
  initializeThermalPrinter,
  listAvailablePorts,
  getPrinterStatus,
  disconnectThermalPrinter
} from '../controller/thermalPrinterController.js'

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

/**
 * Middleware: Verify JWT Token
 */
function verifyToken(req, res, next) {
  try {
    const auth = req.headers.authorization || ''
    const [, token] = auth.split(' ')
    if (!token) return res.status(401).json({ message: 'No token' })

    const data = jwt.verify(token, JWT_SECRET)
    req.user = data
    next()
  } catch (e) {
    res.status(401).json({ message: 'Unauthorized' })
  }
}

/**
 * POST /api/thermal/print
 * Send ESCPOS data to thermal printer
 * 
 * Request body:
 * {
 *   escpos: "ESCPOS binary string",
 *   comPort: "COM3" (optional, default: COM3),
 *   baudRate: 9600 (optional)
 * }
 */
router.post('/print', verifyToken, async (req, res) => {
  try {
    const { escpos, comPort = 'COM3', baudRate = 9600 } = req.body

    if (!escpos) {
      return res.status(400).json({ success: false, message: 'ESCPOS data required' })
    }

    // Initialize printer if needed
    const initialized = await initializeThermalPrinter(comPort, baudRate)
    if (!initialized) {
      return res.status(500).json({
        success: false,
        message: `Failed to initialize printer on ${comPort}. Check connection and try again.`
      })
    }

    // Send to printer
    const success = await printToThermalPrinter(escpos, comPort)
    if (success) {
      res.json({ success: true, message: 'Print command sent to thermal printer' })
    } else {
      res.status(500).json({ success: false, message: 'Failed to send print command' })
    }
  } catch (error) {
    console.error('Error in /thermal/print:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * GET /api/thermal/ports
 * List available COM ports
 */
router.get('/ports', verifyToken, async (req, res) => {
  try {
    const ports = await listAvailablePorts()
    res.json({ success: true, ports })
  } catch (error) {
    console.error('Error listing ports:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * GET /api/thermal/status/:comPort
 * Get printer status
 */
router.get('/status/:comPort', verifyToken, (req, res) => {
  try {
    const { comPort } = req.params
    const status = getPrinterStatus(comPort)
    res.json({ success: true, status })
  } catch (error) {
    console.error('Error getting printer status:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * POST /api/thermal/disconnect/:comPort
 * Disconnect printer
 */
router.post('/disconnect/:comPort', verifyToken, (req, res) => {
  try {
    const { comPort } = req.params
    const success = disconnectThermalPrinter(comPort)
    res.json({
      success,
      message: success ? `Printer disconnected from ${comPort}` : 'Printer not connected'
    })
  } catch (error) {
    console.error('Error disconnecting printer:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * POST /api/thermal/init
 * Initialize thermal printer connection
 * 
 * Request body:
 * {
 *   comPort: "COM3" (optional, default: COM3),
 *   baudRate: 9600 (optional)
 * }
 */
router.post('/init', verifyToken, async (req, res) => {
  try {
    const { comPort = 'COM3', baudRate = 9600 } = req.body

    const success = await initializeThermalPrinter(comPort, baudRate)
    if (success) {
      res.json({
        success: true,
        message: `Connected to printer on ${comPort}`,
        port: comPort
      })
    } else {
      res.status(500).json({
        success: false,
        message: `Failed to connect to ${comPort}. Check the port and ensure printer is connected.`
      })
    }
  } catch (error) {
    console.error('Error initializing printer:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
