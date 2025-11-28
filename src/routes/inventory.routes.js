import { Router } from 'express'
import {
  createMovement, listMovements, updateMovement, deleteMovement,
  getBalance, closeMonth
} from '../controller/inventoryController.js'

const r = Router()

r.get('/movements', listMovements)
r.post('/movements', createMovement)
r.put('/movements/:id', updateMovement)
r.delete('/movements/:id', deleteMovement)

r.get('/balance', getBalance)
r.post('/close-month', closeMonth)

export default r
