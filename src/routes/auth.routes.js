/**
 * SESSION TIMEOUT MECHANISM (30 minutes inactivity):
 * 
 * Frontend Implementation:
 * - Track lastActivityTime (updated setiap user action atau 30s)
 * - Cek setiap 10s: apakah (now - lastActivityTime) > 30 menit
 * - Jika ya → auto logout
 * - User tetap logged in selama aktif (tidak perlu refresh)
 * 
 * Backend Implementation:
 * - JWT expiry 7 days (untuk failsafe, tapi usually frontend auto-logout duluan)
 * - /api/auth/refresh-activity endpoint untuk keep-alive
 */

import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import User from '../models/user.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

// POST /api/auth/login { username, password }
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) return res.status(400).json({ message: 'username & password required' })

    const user = await User.findOne({ username })
    if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid credentials' })

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' })

    const payload = { sub: user._id, username: user.username, role: user.role }
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })

    res.json({ 
      token, 
      user: { id: user._id, username: user.username, role: user.role },
      loginTime: new Date().toISOString()  // Frontend track activity dari sini
    })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// GET /api/auth/me  (Authorization: Bearer <token>)
router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization || ''
    const [, token] = auth.split(' ')
    if (!token) return res.status(401).json({ message: 'No token' })

    const data = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(data.sub).select('username role isActive')
    if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid token' })

    res.json({ user, currentTime: new Date().toISOString() })
  } catch (e) {
    res.status(401).json({ message: 'Unauthorized' })
  }
})

export default router
// POST /api/auth/refresh-activity
// Frontend call ini untuk update lastActivityTime di backend
// (Optional: jika perlu track di server. Untuk now, frontend-only tracking sudah cukup)
router.post('/refresh-activity', (req, res) => {
  try {
    const auth = req.headers.authorization || ''
    const [, token] = auth.split(' ')
    if (!token) return res.status(401).json({ message: 'No token' })

    const data = jwt.verify(token, JWT_SECRET)
    res.json({ 
      success: true, 
      currentTime: new Date().toISOString() 
    })
  } catch (e) {
    res.status(401).json({ message: 'Unauthorized' })
  }
})
