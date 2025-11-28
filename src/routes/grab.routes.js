import { Router } from 'express'
import {
  createGrabOrder,
  getGrabTransactions,
  updateGrabOrderStatus,
  getGrabOrder,
} from '../controller/grabController.js'

const router = Router()

// Create grab order
router.post('/grab/order', createGrabOrder)

// Get grab transactions
router.get('/grab/transactions', getGrabTransactions)

// Get single grab order
router.get('/grab/order/:orderId', getGrabOrder)

// Update grab order status
router.patch('/grab/order/:orderId/status', updateGrabOrderStatus)

export default router
