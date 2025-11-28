import { Router } from 'express'
import Category from '../models/category.js'

const router = Router()

// CREATE
router.post('/', async (req, res) => {
  try {
    const { name, code, isActive = true } = req.body
    if (!name) return res.status(400).json({ message: 'name is required' })
    const doc = await Category.create({ name, code, isActive })
    res.status(201).json(doc)
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'Category name already exists' })
    }
    res.status(500).json({ message: err.message })
  }
})

// LIST (+ optional ?q= search)
router.get('/', async (req, res) => {
  try {
    const { q } = req.query
    const filter = q ? { name: { $regex: q, $options: 'i' } } : {}
    const items = await Category.find(filter).sort({ createdAt: -1 })
    res.json(items)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// GET BY ID
router.get('/:id', async (req, res) => {
  try {
    const doc = await Category.findById(req.params.id)
    if (!doc) return res.status(404).json({ message: 'Not found' })
    res.json(doc)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const { name, code, isActive } = req.body
    const doc = await Category.findByIdAndUpdate(
      req.params.id,
      { $set: { name, code, isActive } },
      { new: true, runValidators: true }
    )
    if (!doc) return res.status(404).json({ message: 'Not found' })
    res.json(doc)
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'Category name already exists' })
    }
    res.status(500).json({ message: err.message })
  }
})

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Category.findByIdAndDelete(req.params.id)
    if (!doc) return res.status(404).json({ message: 'Not found' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
