import express from 'express'
import Promo from '../models/promo.js'

const router = express.Router()

/**
 * GET /api/promo
 * Get all promos
 */
router.get('/', async (req, res) => {
  try {
    const promos = await Promo.find()
      .populate('items.itemId', 'name sku price')
      .sort({ createdAt: -1 })
    
    res.json({
      success: true,
      data: promos,
      total: promos.length
    })
  } catch (error) {
    console.error('Error fetching promos:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/promo/:id
 * Get single promo
 */
router.get('/:id', async (req, res) => {
  try {
    const promo = await Promo.findById(req.params.id)
      .populate('items.itemId', 'name sku price')
    
    if (!promo) {
      return res.status(404).json({ success: false, message: 'Promo not found' })
    }
    
    res.json({ success: true, data: promo })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/promo
 * Create new promo
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, originalPrice, promoPrice, items, validFrom, validUntil, createdBy } = req.body
    
    if (!name || !promoPrice) {
      return res.status(400).json({ 
        success: false, 
        message: 'name and promoPrice are required' 
      })
    }
    
    const promo = await Promo.create({
      name,
      description,
      originalPrice: originalPrice || promoPrice,
      promoPrice,
      items: items || [],
      validFrom,
      validUntil,
      createdBy: createdBy || 'Admin',
      isActive: true
    })
    
    await promo.populate('items.itemId', 'name sku price')
    
    res.status(201).json({ success: true, data: promo })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * PUT /api/promo/:id
 * Update promo
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, description, originalPrice, promoPrice, items, isActive, validFrom, validUntil, updatedBy } = req.body
    
    const promo = await Promo.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        originalPrice: originalPrice || promoPrice,
        promoPrice,
        items,
        isActive,
        validFrom,
        validUntil,
        updatedBy: updatedBy || 'Admin'
      },
      { new: true }
    ).populate('items.itemId', 'name sku price')
    
    if (!promo) {
      return res.status(404).json({ success: false, message: 'Promo not found' })
    }
    
    res.json({ success: true, data: promo })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * DELETE /api/promo/:id
 * Delete promo
 */
router.delete('/:id', async (req, res) => {
  try {
    const promo = await Promo.findByIdAndDelete(req.params.id)
    
    if (!promo) {
      return res.status(404).json({ success: false, message: 'Promo not found' })
    }
    
    res.json({ success: true, message: 'Promo deleted' })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router
