import GrabOrder from '../models/grabOrder.js'
import Item from '../models/items.js'
import InventoryMovement from '../models/inventoryMovement.js'
import mongoose from 'mongoose'

// Helper: Recompute currentStock setelah inventory movement
async function recomputeCurrentStock(itemId) {
  try {
    const movements = await InventoryMovement.aggregate([
      { $match: { itemId: new mongoose.Types.ObjectId(itemId) } },
      { $group: { _id: null, qty: { $sum: '$qty' } } }
    ])
    const total = movements.length ? movements[0].qty : 0
    await Item.findByIdAndUpdate(itemId, { currentStock: total })
    return total
  } catch (err) {
    console.error('Error recomputing stock for item', itemId, err)
    return 0
  }
}

// Helper: Create inventory movements untuk grab order
async function createGrabInventoryMovements(order) {
  try {
    // Gunakan order.createdAt untuk semua inventory movements agar konsisten
    const movementDate = order.createdAt || new Date()
    
    for (const item of order.items) {
      await InventoryMovement.create({
        itemId: item.itemId,
        date: movementDate,
        type: 'SALE_OUT', // Tipe penjualan grab
        qty: -item.qty, // Negatif untuk pengurangan
        note: `Penjualan Grab - Order #${order.grabNumber}`,
        createdBy: 'Grab System',
      })
      // Recompute stock untuk item ini
      await recomputeCurrentStock(item.itemId)
    }
  } catch (err) {
    console.error('Error creating grab inventory movements:', err)
    // Jangan throw - tetap lanjutkan order meskipun inventory gagal
  }
}
async function generateGrabNumber() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const dateKey = `${yyyy}${mm}${dd}`

  const start = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`)
  const end = new Date(`${yyyy}-${mm}-${dd}T23:59:59.999Z`)
  const countToday = await GrabOrder.countDocuments({
    createdAt: { $gte: start, $lte: end },
  })

  const seq = String(countToday + 1).padStart(3, '0')
  return `GRB-${dateKey}-${seq}`
}

// Helper compute total
function computeTotal(items) {
  return items.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0)
}

/**
 * Create Grab Order
 * Body: { grabNumber (optional), items: [{ itemId, qty, note }] }
 */
export async function createGrabOrder(req, res) {
  try {
    const { grabNumber: customGrabNumber, items } = req.body

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Items tidak boleh kosong' })
    }

    // Generate grab number jika tidak disediakan
    const grabNumber = customGrabNumber || (await generateGrabNumber())

    // Fetch item details dan calculate subtotal
    const processedItems = []
    let totalAmount = 0

    for (const item of items) {
      const dbItem = await Item.findById(item.itemId)
      if (!dbItem) {
        return res
          .status(404)
          .json({ message: `Item ${item.itemId} tidak ditemukan` })
      }

      const price = Number(dbItem.price) || 0
      const qty = Number(item.qty) || 1
      const subtotal = price * qty

      processedItems.push({
        itemId: dbItem._id,
        itemName: dbItem.name,
        price,
        qty,
        subtotal,
        note: item.note || '',
      })

      totalAmount += subtotal
    }

    // Create grab order
    const grabOrder = await GrabOrder.create({
      grabNumber,
      items: processedItems,
      total: totalAmount,
      status: 'PENDING',
    })

    // Populate paketItems.itemId jika ada
    await grabOrder.populate('items.paketItems.itemId')

    res.status(201).json({ order: grabOrder })
  } catch (error) {
    console.error('Error creating grab order:', error)
    res.status(500).json({ message: 'Error creating grab order', error: error.message })
  }
}

/**
 * Get all Grab Transactions
 * Query: page, limit, status, startDate, endDate
 */
export async function getGrabTransactions(req, res) {
  try {
    const { page = 1, limit = 20, status, startDate, endDate } = req.query

    const skip = (Number(page) - 1) * Number(limit)
    const query = {}

    // Filter by status jika ada
    if (status && status !== 'ALL') {
      query.status = status
    }

    // Filter by date jika ada
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    const total = await GrabOrder.countDocuments(query)
    const transactions = await GrabOrder.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean()

    res.json({
      total,
      page: Number(page),
      limit: Number(limit),
      data: transactions,
    })
  } catch (error) {
    console.error('Error getting grab transactions:', error)
    res.status(500).json({ message: 'Error fetching transactions' })
  }
}

/**
 * Update Grab Order Status
 */
export async function updateGrabOrderStatus(req, res) {
  try {
    const { orderId } = req.params
    const { status } = req.body

    const validStatuses = ['PENDING', 'READY', 'COMPLETED', 'CANCELLED']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' })
    }

    const order = await GrabOrder.findByIdAndUpdate(
      orderId,
      { status },
      { new: true }
    )

    if (!order) {
      return res.status(404).json({ message: 'Grab order not found' })
    }

    // Create inventory movements jika status berubah ke COMPLETED
    if (status === 'COMPLETED') {
      await createGrabInventoryMovements(order)
    }

    // Populate paketItems.itemId jika ada
    await order.populate('items.paketItems.itemId')

    res.json({ order })
  } catch (error) {
    console.error('Error updating grab order:', error)
    res.status(500).json({ message: 'Error updating grab order' })
  }
}

/**
 * Get single Grab Order
 */
export async function getGrabOrder(req, res) {
  try {
    const { orderId } = req.params
    const order = await GrabOrder.findById(orderId)

    if (!order) {
      return res.status(404).json({ message: 'Grab order not found' })
    }

    // Populate paketItems.itemId jika ada
    await order.populate('items.paketItems.itemId')

    res.json({ order })
  } catch (error) {
    console.error('Error getting grab order:', error)
    res.status(500).json({ message: 'Error fetching grab order' })
  }
}
