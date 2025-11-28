import express from 'express'
import Role from '../models/Role.js'
import User from '../models/User.js'

const router = express.Router()

/**
 * GET /api/roles
 * Fetch all roles
 */
router.get('/roles', async (req, res) => {
  try {
    const roles = await Role.find().sort({ createdAt: -1 })
    res.json({ success: true, data: roles })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch roles', error: error.message })
  }
})

/**
 * GET /api/roles/:id
 * Fetch specific role
 */
router.get('/roles/:id', async (req, res) => {
  try {
    const role = await Role.findById(req.params.id)
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' })
    }
    res.json({ success: true, data: role })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch role', error: error.message })
  }
})

/**
 * POST /api/roles
 * Create new role
 */
router.post('/roles', async (req, res) => {
  try {
    const { name, description, permissions } = req.body

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Role name is required' })
    }

    // Check duplicate role name
    const existing = await Role.findOne({ name: name.trim() })
    if (existing) {
      return res.status(400).json({ success: false, message: 'Role name already exists' })
    }

    const role = new Role({
      name: name.trim(),
      description: description || '',
      permissions: permissions || []
    })

    await role.save()
    res.status(201).json({ success: true, message: 'Role created successfully', data: role })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create role', error: error.message })
  }
})

/**
 * PUT /api/roles/:id
 * Update role
 * If role name changes, auto-update all users with that role
 */
router.put('/roles/:id', async (req, res) => {
  try {
    const { name, description, permissions } = req.body

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Role name is required' })
    }

    // Check if name is being changed and if new name already exists
    const currentRole = await Role.findById(req.params.id)
    if (!currentRole) {
      return res.status(404).json({ success: false, message: 'Role not found' })
    }

    const oldName = currentRole.name
    const newName = name.trim()

    if (oldName !== newName) {
      const duplicate = await Role.findOne({ name: newName })
      if (duplicate) {
        return res.status(400).json({ success: false, message: 'Role name already exists' })
      }

      // Auto-update all users with old role name to new role name
      await User.updateMany(
        { role: oldName },
        { $set: { role: newName } }
      )
    }

    const role = await Role.findByIdAndUpdate(
      req.params.id,
      {
        name: newName,
        description: description || '',
        permissions: permissions || []
      },
      { new: true }
    )

    res.json({ success: true, message: 'Role updated successfully', data: role })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update role', error: error.message })
  }
})

/**
 * DELETE /api/roles/:id
 * Delete role
 */
router.delete('/roles/:id', async (req, res) => {
  try {
    const role = await Role.findByIdAndDelete(req.params.id)
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' })
    }
    res.json({ success: true, message: 'Role deleted successfully', data: role })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete role', error: error.message })
  }
})

export default router
