import { Router } from 'express'
import {
  getMenuSettings,
  updateMenuSettings,
  getMenusByRole,
} from '../controller/menuController.js'

const router = Router()

// Get all menu settings (admin only, controlled by middleware jika ada)
router.get('/admin/menu-settings', getMenuSettings)

// Update menu visibility/order
router.patch('/admin/menu-settings/:menuKey', updateMenuSettings)

// Get menus for specific role (untuk FE navigation)
router.get('/menus/by-role', getMenusByRole)

export default router
