import express from 'express'
import StockVaccum from '../models/stockVaccum.js'
import StockVaccumMovement from '../models/stockVaccumMovement.js'
import Item from '../models/items.js'

const router = express.Router()

// ======================== MOVEMENTS ENDPOINTS (DEFINE BEFORE :itemId ROUTES) ========================

/**
 * GET /api/stock-vaccum/movements
 * Get all movements for Stock Vaccum (with filters)
 */
router.get('/movements', async (req, res) => {
  try {
    const { itemId, dateFrom, dateTo, page = 1, limit = 10, type } = req.query

    // Build filter
    const filter = {}
    if (itemId) filter.itemId = itemId
    if (type) filter.type = type
    if (dateFrom || dateTo) {
      filter.date = {}
      if (dateFrom) filter.date.$gte = new Date(dateFrom)
      if (dateTo) {
        const to = new Date(dateTo)
        to.setHours(23, 59, 59, 999)
        filter.date.$lte = to
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)

    const [rows, total] = await Promise.all([
      StockVaccumMovement.find(filter)
        .populate('itemId', 'name sku price')
        .populate('createdBy', 'username')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      StockVaccumMovement.countDocuments(filter)
    ])

    res.json({
      success: true,
      rows,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    })
  } catch (error) {
    console.error('Error fetching movements:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/stock-vaccum/movements
 * Create new movement record
 */
router.post('/movements', async (req, res) => {
  try {
    const { itemId, date, type, qty, note, createdBy } = req.body

    if (!itemId || !type || qty === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'itemId, type, and qty are required' 
      })
    }

    // Verify item exists
    const item = await Item.findById(itemId)
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' })
    }

    // Create movement record
    const movement = await StockVaccumMovement.create({
      itemId,
      date: date ? new Date(date) : new Date(),
      type,
      qty: Number(qty),
      note,
      createdBy
    })

    // Update Stock Vaccum currentStock
    const stock = await StockVaccum.findOne({ itemId })
    if (stock) {
      stock.currentStock += Number(qty)
      await stock.save()
    }

    await movement.populate('itemId', 'name sku price')

    res.status(201).json({ success: true, data: movement })
  } catch (error) {
    console.error('Error creating movement:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/stock-vaccum/movements/:id
 * Update movement record
 */
router.put('/movements/:id', async (req, res) => {
  try {
    const { date, type, qty, note } = req.body
    const id = req.params.id

    // Get old movement to calculate difference
    const oldMovement = await StockVaccumMovement.findById(id)
    if (!oldMovement) {
      return res.status(404).json({ success: false, message: 'Movement not found' })
    }

    const qtyDifference = Number(qty) - oldMovement.qty

    // Update movement
    const movement = await StockVaccumMovement.findByIdAndUpdate(
      id,
      {
        date: date ? new Date(date) : oldMovement.date,
        type: type || oldMovement.type,
        qty: Number(qty),
        note
      },
      { new: true }
    ).populate('itemId', 'name sku price')

    // Adjust Stock Vaccum
    if (qtyDifference !== 0) {
      await StockVaccum.findOneAndUpdate(
        { itemId: movement.itemId },
        { $inc: { currentStock: qtyDifference } }
      )
    }

    res.json({ success: true, data: movement })
  } catch (error) {
    console.error('Error updating movement:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/stock-vaccum/movements/:id
 * Delete movement record
 */
router.delete('/movements/:id', async (req, res) => {
  try {
    const id = req.params.id

    const movement = await StockVaccumMovement.findById(id)
    if (!movement) {
      return res.status(404).json({ success: false, message: 'Movement not found' })
    }

    // Reverse the movement from Stock Vaccum
    await StockVaccum.findOneAndUpdate(
      { itemId: movement.itemId },
      { $inc: { currentStock: -movement.qty } }
    )

    await StockVaccumMovement.findByIdAndDelete(id)

    res.json({ success: true, message: 'Movement deleted' })
  } catch (error) {
    console.error('Error deleting movement:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/stock-vaccum/balance
 * Get current balance (total stock) for an item
 */
router.get('/balance', async (req, res) => {
  try {
    const { itemId } = req.query

    if (!itemId) {
      return res.status(400).json({ 
        success: false, 
        message: 'itemId is required' 
      })
    }

    const stock = await StockVaccum.findOne({ itemId }).populate('itemId', 'name')

    if (!stock) {
      return res.status(404).json({ 
        success: false, 
        message: 'Stock vaccum not found',
        balance: 0
      })
    }

    res.json({
      success: true,
      balance: stock.currentStock,
      stock
    })
  } catch (error) {
    console.error('Error fetching balance:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/stock-vaccum/close-month
 * Close month snapshot (optional - for accounting purposes)
 */
router.post('/close-month', async (req, res) => {
  try {
    const { itemId, year, month } = req.body

    if (!itemId || !year || !month) {
      return res.status(400).json({ 
        success: false, 
        message: 'itemId, year, and month are required' 
      })
    }

    // Get current balance
    const stock = await StockVaccum.findOne({ itemId })
    if (!stock) {
      return res.status(404).json({ success: false, message: 'Stock vaccum not found' })
    }

    // Create snapshot record at end of month
    const lastDayOfMonth = new Date(year, month, 0, 23, 59, 59, 999)

    const snapshot = await StockVaccumMovement.create({
      itemId,
      date: lastDayOfMonth,
      type: 'CORRECTION',
      qty: 0,
      note: `Snapshot - Tutup Bulan ${month}/${year}`,
      createdBy: null
    })

    res.json({
      success: true,
      message: 'Bulan ditutup',
      snapshot,
      balance: stock.currentStock
    })
  } catch (error) {
    console.error('Error closing month:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ======================== STANDARD CRUD ENDPOINTS (DEFINE AFTER MOVEMENTS) ========================

/**
 * GET /api/stock-vaccum
 * Get all stock vaccum
 */
router.get('/', async (req, res) => {
  try {
    const stocks = await StockVaccum.find()
      .populate('itemId', 'name sku price')
      .sort({ itemId: 1 })
    
    res.json({
      success: true,
      data: stocks,
      total: stocks.length
    })
  } catch (error) {
    console.error('Error fetching stock vaccum:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/stock-vaccum/:itemId
 * Get stock vaccum for specific item
 */
router.get('/:itemId', async (req, res) => {
  try {
    const stock = await StockVaccum.findOne({ itemId: req.params.itemId })
      .populate('itemId', 'name sku price')
    
    if (!stock) {
      return res.status(404).json({ success: false, message: 'Stock vaccum not found' })
    }
    
    res.json({ success: true, data: stock })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/stock-vaccum
 * Create/Initialize stock vaccum for item
 */
router.post('/', async (req, res) => {
  try {
    const { itemId, currentStock, minimumStock, notes } = req.body
    
    if (!itemId) {
      return res.status(400).json({ success: false, message: 'itemId is required' })
    }
    
    // Check jika sudah ada
    let stock = await StockVaccum.findOne({ itemId })
    if (stock) {
      return res.status(400).json({ success: false, message: 'Stock vaccum already exists for this item' })
    }
    
    // Verify item exists
    const item = await Item.findById(itemId)
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' })
    }
    
    // Create stock vaccum
    stock = await StockVaccum.create({
      itemId,
      currentStock: currentStock || 0,
      minimumStock: minimumStock || 10,
      notes,
      lastRestockedAt: new Date(),
      lastRestockedBy: req.body.restockedBy || 'System'
    })
    
    await stock.populate('itemId', 'name sku price')
    
    res.status(201).json({ success: true, data: stock })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/stock-vaccum/:itemId
 * Update stock vaccum
 */
router.put('/:itemId', async (req, res) => {
  try {
    const { currentStock, minimumStock, notes } = req.body
    
    const stock = await StockVaccum.findOneAndUpdate(
      { itemId: req.params.itemId },
      {
        currentStock,
        minimumStock,
        notes,
        lastRestockedAt: new Date(),
        lastRestockedBy: req.body.restockedBy || 'System'
      },
      { new: true }
    ).populate('itemId', 'name sku price')
    
    if (!stock) {
      return res.status(404).json({ success: false, message: 'Stock vaccum not found' })
    }
    
    res.json({ success: true, data: stock })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/stock-vaccum/:itemId/reduce
 * Reduce stock vaccum (used when order is paid)
 */
router.post('/:itemId/reduce', async (req, res) => {
  try {
    const { quantity } = req.body
    
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid quantity' })
    }
    
    const stock = await StockVaccum.findOne({ itemId: req.params.itemId })
    if (!stock) {
      return res.status(404).json({ success: false, message: 'Stock vaccum not found' })
    }
    
    if (stock.currentStock < quantity) {
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient stock vaccum. Available: ${stock.currentStock}` 
      })
    }
    
    stock.currentStock -= quantity
    await stock.save()
    
    res.json({ success: true, data: stock })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/stock-vaccum/:itemId
 * Delete stock vaccum
 */
router.delete('/:itemId', async (req, res) => {
  try {
    const stock = await StockVaccum.findOneAndDelete({ itemId: req.params.itemId })
    
    if (!stock) {
      return res.status(404).json({ success: false, message: 'Stock vaccum not found' })
    }
    
    res.json({ success: true, message: 'Stock vaccum deleted' })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router
