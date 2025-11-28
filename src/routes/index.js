import { Router } from 'express'
import categoriesRouter from './categories.routes.js'
import itemsRouter from './items.routes.js'
import authRouter from './auth.routes.js'
import inventoryRouter from './inventory.routes.js'
import posRouter from './pos.routes.js'
import thermalRouter from './thermal.routes.js'

const router = Router()

router.get('/', (_, res) => {
  res.json({ version: 'v1', modules: ['auth', 'categories', 'items', 'inventory', 'pos', 'thermal', 'transactions', 'grab'] })
})

router.use('/auth', authRouter)
router.use('/categories', categoriesRouter)
router.use('/items', itemsRouter)
router.use('/inventory', inventoryRouter)
router.use('/pos', posRouter)
router.use('/thermal', thermalRouter)

export default router
