import { Router } from 'express'
import Paket from '../models/Paket.js'
import Category from '../models/category.js'
import Item from '../models/items.js'

const router = Router()

// Helper: validate category exists
const ensureCategory = async (categoryId) => {
  if (!categoryId) return true
  const exists = await Category.exists({ _id: categoryId })
  return !!exists
}

// Helper: validate items exist and convert to proper format
const ensureItems = async (itemsInput) => {
  if (!itemsInput || itemsInput.length === 0) return { valid: true, items: [] }
  
  // Extract item IDs from either format: string or { itemId, quantity }
  const itemIds = itemsInput.map(item => {
    if (typeof item === 'string') return item
    if (typeof item === 'object' && item.itemId) return item.itemId
    return item
  })
  
  const found = await Item.find({ _id: { $in: itemIds } })
  const valid = found.length === itemIds.length
  
  // Convert to items array with quantity
  const itemsWithQty = itemsInput.map(item => {
    if (typeof item === 'string') {
      return { itemId: item, quantity: 1 }
    }
    if (typeof item === 'object' && item.itemId) {
      return { itemId: item.itemId, quantity: item.quantity || 1 }
    }
    return { itemId: item, quantity: 1 }
  })
  
  return { valid, items: itemsWithQty }
}

// CREATE
router.post('/', async (req, res) => {
  try {
    const { name, description, category, items = [], price, isActive = true } = req.body
    
    if (!name) return res.status(400).json({ message: 'name is required' })
    if (!category) return res.status(400).json({ message: 'category is required' })
    if (price == null || isNaN(price) || Number(price) < 0) {
      return res.status(400).json({ message: 'price must be >= 0' })
    }
    
    if (!(await ensureCategory(category))) {
      return res.status(400).json({ message: 'category invalid/not found' })
    }
    
    const itemsValidation = await ensureItems(items)
    if (!itemsValidation.valid) {
      return res.status(400).json({ message: 'some items not found' })
    }

    const doc = await Paket.create({
      name,
      description,
      category,
      items: itemsValidation.items,
      harga: Number(price),
      isActive
    })
    await doc.populate('category', 'name code')
    await doc.populate('items.itemId', 'name sku price')
    res.status(201).json(doc)
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'Duplicate paket name' })
    }
    res.status(500).json({ message: err.message })
  }
})

// LIST ?q=&category=&active=true
router.get('/', async (req, res) => {
  try {
    const { q, category, active } = req.query
    const filter = {}
    
    if (q) filter.name = { $regex: q, $options: 'i' }
    if (category) filter.category = category
    if (active === 'true') filter.isActive = true
    if (active === 'false') filter.isActive = false

    const pakets = await Paket.find(filter)
      .populate('category', 'name code')
      .populate('items.itemId', 'name sku price')
      .sort({ createdAt: -1 })

    res.json(pakets)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// GET BY ID
router.get('/:id', async (req, res) => {
  try {
    const doc = await Paket.findById(req.params.id)
      .populate('category', 'name code')
      .populate('items.itemId', 'name sku price')
    
    if (!doc) return res.status(404).json({ message: 'Not found' })
    res.json(doc)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const { name, description, category, items, price, isActive } = req.body

    if (price != null && (isNaN(price) || Number(price) < 0)) {
      return res.status(400).json({ message: 'price must be >= 0' })
    }
    
    if (category && !(await ensureCategory(category))) {
      return res.status(400).json({ message: 'category invalid/not found' })
    }
    
    let itemsToUpdate = items
    if (items && items.length > 0) {
      const itemsValidation = await ensureItems(items)
      if (!itemsValidation.valid) {
        return res.status(400).json({ message: 'some items not found' })
      }
      itemsToUpdate = itemsValidation.items
    }

    const updateData = { name, description, category, isActive }
    if (price != null) updateData.harga = Number(price)
    if (items) updateData.items = itemsToUpdate

    const doc = await Paket.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('category', 'name code')
      .populate('items.itemId', 'name sku price')

    if (!doc) return res.status(404).json({ message: 'Not found' })
    res.json(doc)
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'Duplicate paket name' })
    }
    res.status(500).json({ message: err.message })
  }
})

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Paket.findByIdAndDelete(req.params.id)
    if (!doc) return res.status(404).json({ message: 'Not found' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
