import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

import {
  getTables,
  getOrCreateOrderForTable,
  addItemToOrder, updateItemQty, updateOrderType, removeItem, saveOrder,
  printToKitchen, proceedToCheckout,
  confirmPaymentCash, confirmPaymentQRIS, getTransactions, getSalesAnalytics,
} from '../controller/posController.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadDir = path.resolve(__dirname, '../../uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ts = Date.now()
    const ext = path.extname(file?.originalname || '') || '.jpg'
    cb(null, `qris_${ts}${ext}`)
  },
})
const upload = multer({ storage })

const router = Router()

// Debug ping
router.get('/pos/_ping', (_req, res) => res.json({ ok: true, from: 'pos.routes' }))

// Meja (virtual 1..10)
router.get('/pos/tables', getTables)

// Order per meja
router.post('/pos/table/:tableNumber/order', getOrCreateOrderForTable)
router.post('/pos/order/:orderId/items', addItemToOrder)
router.put('/pos/order/:orderId/items/:orderItemIndex/qty', updateItemQty)
router.put('/pos/order/:orderId', updateOrderType)  // New: update order type
router.delete('/pos/order/:orderId/items/:orderItemIndex', removeItem)
router.post('/pos/order/:orderId/save', saveOrder)

// Kitchen & Checkout
router.post('/pos/order/:orderId/print-kitchen', printToKitchen)
router.post('/pos/table/:tableNumber/proceed-checkout', proceedToCheckout)

// Payment
router.post('/pos/order/:orderId/pay/cash', confirmPaymentCash)
router.post('/pos/order/:orderId/pay/qris', upload.single('proof'), confirmPaymentQRIS)

// Transactions
router.get('/pos/transactions', getTransactions)

// Sales Analytics
router.get('/pos/analytics', getSalesAnalytics)

export default router
