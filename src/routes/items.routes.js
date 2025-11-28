import { Router } from 'express'
import Item from '../models/items.js'
import Category from '../models/category.js'

const router = Router()

// Helper: validasi categoryId (jika dikirim)
const ensureCategory = async (categoryId) => {
  if (!categoryId) return true
  const exists = await Category.exists({ _id: categoryId })
  return !!exists
}

// CREATE
router.post('/', async (req, res) => {
  try {
    const { name, sku, categoryId, price, cost = 0, stock = 0, isActive = true } = req.body
    if (!name) return res.status(400).json({ message: 'name is required' })
    if (price == null || isNaN(price) || Number(price) < 0) {
      return res.status(400).json({ message: 'price must be >= 0' })
    }
    if (cost != null && (isNaN(cost) || Number(cost) < 0)) {
      return res.status(400).json({ message: 'cost must be >= 0' })
    }
    if (!(await ensureCategory(categoryId))) {
      return res.status(400).json({ message: 'categoryId invalid/not found' })
    }

    const doc = await Item.create({ name, sku, categoryId, price, cost, stock, isActive })
    // populate agar FE langsung dapat nama kategori
    await doc.populate('categoryId', 'name code')
    res.status(201).json(doc)
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'Duplicate key (sku/name unique conflict)' })
    }
    res.status(500).json({ message: err.message })
  }
})

// LIST ?q=&categoryId=&active=true
router.get('/', async (req, res) => {
  try {
    const { q, categoryId, active } = req.query
    const filter = {}
    if (q) filter.name = { $regex: q, $options: 'i' }
    if (categoryId) filter.categoryId = categoryId
    if (active === 'true') filter.isActive = true
    if (active === 'false') filter.isActive = false

    const items = await Item.find(filter)
      .populate('categoryId', 'name code')
      .sort({ createdAt: -1 })

    res.json(items)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// GET BY ID
router.get('/:id', async (req, res) => {
  try {
    const doc = await Item.findById(req.params.id).populate('categoryId', 'name code')
    if (!doc) return res.status(404).json({ message: 'Not found' })
    res.json(doc)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const { name, sku, categoryId, price, cost, stock, isActive } = req.body

    if (price != null && (isNaN(price) || Number(price) < 0)) {
      return res.status(400).json({ message: 'price must be >= 0' })
    }
    if (cost != null && (isNaN(cost) || Number(cost) < 0)) {
      return res.status(400).json({ message: 'cost must be >= 0' })
    }
    if (stock != null && (isNaN(stock) || Number(stock) < 0)) {
      return res.status(400).json({ message: 'stock must be >= 0' })
    }
    if (categoryId && !(await ensureCategory(categoryId))) {
      return res.status(400).json({ message: 'categoryId invalid/not found' })
    }

    const doc = await Item.findByIdAndUpdate(
      req.params.id,
      { $set: { name, sku, categoryId, price, cost, stock, isActive } },
      { new: true, runValidators: true }
    ).populate('categoryId', 'name code')

    if (!doc) return res.status(404).json({ message: 'Not found' })
    res.json(doc)
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'Duplicate key (sku/name unique conflict)' })
    }
    res.status(500).json({ message: err.message })
  }
})

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Item.findByIdAndDelete(req.params.id)
    if (!doc) return res.status(404).json({ message: 'Not found' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
