import express from 'express'
import bcryptjs from 'bcryptjs'
import User from '../models/User.js'

const router = express.Router()

// ============ Get All Users ============
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-passwordHash')
    res.json(users)
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ message: 'Failed to fetch users' })
  }
})

// ============ Get User By ID ============
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash')
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json(user)
  } catch (error) {
    console.error('Error fetching user:', error)
    res.status(500).json({ message: 'Failed to fetch user' })
  }
})

// ============ Create User ============
router.post('/users', async (req, res) => {
  try {
    const { username, role, password } = req.body

    // Validation
    if (!username || !role || !password) {
      return res.status(400).json({ message: 'Username, role, and password are required' })
    }

    // Check if user exists
    const existing = await User.findOne({ username })
    if (existing) {
      return res.status(400).json({ message: 'Username already exists' })
    }

    // Hash password
    const hash = await bcryptjs.hash(password, 10)

    // Create user
    const user = new User({
      username,
      role,
      passwordHash: hash,
    })
    await user.save()

    // Return without password
    const userObj = user.toObject()
    delete userObj.passwordHash
    res.status(201).json(userObj)
  } catch (error) {
    console.error('Error creating user:', error)
    res.status(500).json({ message: 'Failed to create user' })
  }
})

// ============ Update User ============
router.put('/users/:id', async (req, res) => {
  try {
    const { username, role, password } = req.body
    const userId = req.params.id

    const user = await User.findById(userId)
    if (!user) return res.status(404).json({ message: 'User not found' })

    // Check if new username already exists (if changed)
    if (username && username !== user.username) {
      const existing = await User.findOne({ username })
      if (existing) {
        return res.status(400).json({ message: 'Username already exists' })
      }
      user.username = username
    }

    // Update role if provided - no validation, accept any role value
    if (role) {
      user.role = role
    }

    // Update password if provided
    if (password) {
      user.passwordHash = await bcryptjs.hash(password, 10)
    }

    await user.save()

    // Return without password
    const userObj = user.toObject()
    delete userObj.passwordHash
    res.json(userObj)
  } catch (error) {
    console.error('Error updating user:', error)
    res.status(500).json({ message: 'Failed to update user' })
  }
})

// ============ Delete User ============
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json({ message: 'User deleted successfully' })
  } catch (error) {
    console.error('Error deleting user:', error)
    res.status(500).json({ message: 'Failed to delete user' })
  }
})

export default router
