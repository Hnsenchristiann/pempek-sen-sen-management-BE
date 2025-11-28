// src/controller/inventoryController.js
import mongoose from 'mongoose'
import InventoryMovement, { MovementType } from '../models/inventoryMovement.js'
import InventoryPeriod from '../models/inventoryPeriod.js' // opsional (biar ga error kalau masih diregister), tidak dipakai
import Item from '../models/items.js'

/**
 * Kalau OUT kamu sudah disimpan sebagai qty negatif, set ini ke true.
 * Kalau OUT disimpan qty positif dan dibedakan via type 'OUT', biarkan false.
 */
const USE_SIGNED_QTY = false

// --- MATCH itemId aman untuk ObjectId ataupun string (legacy data) ---
function itemMatch(itemId) {
  try {
    const oid = new mongoose.Types.ObjectId(itemId)
    return { $or: [{ itemId: oid }, { itemId }] }
  } catch {
    return { itemId }
  }
}

/* =========================================================
 * Hitung total stok dari SEMUA movement (tanpa batas tanggal)
 * =======================================================*/
async function sumAllMovements(itemId) {
  const match = itemMatch(itemId)
  const pipeline = [{ $match: match }]

  if (USE_SIGNED_QTY) {
    pipeline.push({ $group: { _id: null, qty: { $sum: '$qty' } } })
  } else {
    const OUT = MovementType?.OUT ?? 'OUT'
    pipeline.push({
      $group: {
        _id: null,
        qty: {
          $sum: {
            $cond: [{ $eq: ['$type', OUT] }, { $multiply: ['$qty', -1] }, '$qty'],
          },
        },
      },
    })
  }

  const agg = await InventoryMovement.aggregate(pipeline)
  return agg.length ? agg[0].qty : 0
}

/* =========================================================
 * Recompute currentStock (update ke collection Item)
 * =======================================================*/
async function recomputeCurrentStock(itemId) {
  const total = await sumAllMovements(itemId)
  await Item.findByIdAndUpdate(itemId, { currentStock: total })
  return total
}

/* =========================================================
 * (Opsional) Opening movement saat create item
 * =======================================================*/
export async function createOpeningMovement(itemId, openingQty, byUser) {
  if (!openingQty || openingQty === 0) return
  await InventoryMovement.create({
    itemId,
    date: new Date(),
    type: MovementType?.OPENING ?? 'OPENING',
    qty: openingQty,
    note: 'Opening stock',
    createdBy: byUser || 'system',
  })
  await recomputeCurrentStock(itemId)
}

/* =========================================================
 * CRUD Movements
 * =======================================================*/
export async function createMovement(req, res) {
  try {
    const { itemId, date, type, qty, note } = req.body
    if (!itemId || !date || !type || typeof qty !== 'number') {
      return res.status(400).json({ message: 'itemId, date, type, qty wajib diisi' })
    }

    const mv = await InventoryMovement.create({
      itemId,
      date: new Date(date),
      type,
      qty,
      note,
      createdBy: req.user?.username || 'admin',
    })

    const currentStock = await recomputeCurrentStock(itemId)
    res.json({ ...mv.toObject(), currentStock })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Create movement error' })
  }
}

export async function listMovements(req, res) {
  try {
    const { itemId, dateFrom, dateTo, page = 1, limit = 20, type } = req.query
    const q = {}
    if (itemId) q.itemId = itemId
    if (type) q.type = type
    if (dateFrom || dateTo) {
      q.date = {}
      if (dateFrom) q.date.$gte = new Date(dateFrom)
      if (dateTo) q.date.$lte = new Date(dateTo)
    }
    const skip = (Number(page) - 1) * Number(limit)

    const [rows, total] = await Promise.all([
      InventoryMovement.find(q).sort({ date: -1, _id: -1 }).skip(skip).limit(Number(limit)).lean(),
      InventoryMovement.countDocuments(q),
    ])

    res.json({ rows, total, page: Number(page), limit: Number(limit) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'List movements error' })
  }
}

export async function updateMovement(req, res) {
  try {
    const { id } = req.params
    const { date, type, qty, note } = req.body

    const payload = {}
    if (date) payload.date = new Date(date)
    if (type) payload.type = type
    if (typeof qty === 'number') payload.qty = qty
    if (note) payload.note = note

    const mv = await InventoryMovement.findByIdAndUpdate(id, payload, { new: true })
    if (!mv) return res.status(404).json({ message: 'Movement not found' })

    const currentStock = await recomputeCurrentStock(mv.itemId)
    res.json({ ...mv.toObject(), currentStock })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Update movement error' })
  }
}

export async function deleteMovement(req, res) {
  try {
    const { id } = req.params
    const mv = await InventoryMovement.findByIdAndDelete(id)
    if (!mv) return res.status(404).json({ message: 'Movement not found' })

    const currentStock = await recomputeCurrentStock(mv.itemId)
    res.json({ ok: true, currentStock })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Delete movement error' })
  }
}

/* =========================================================
 * Balance (untuk laporan historis) — kalau mau total terbaru,
 * ambil saja dari field Item.currentStock.
 * =======================================================*/
export async function getBalance(req, res) {
  try {
    const { itemId, asOf } = req.query
    if (!itemId) return res.status(400).json({ message: 'itemId wajib' })

    // Jika asOf TIDAK diberikan → kembalikan total dari SELURUH movement (sama dengan currentStock).
    if (!asOf) {
      const totalNow = await sumAllMovements(itemId)
      return res.json({ itemId, balance: totalNow })
    }

    // Kalau asOf diberikan, kamu bisa tetap hitung historis (opsional).
    const d = new Date(asOf)
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ message: '"asOf" tidak valid' })
    }

    // Historis (exclusive end)
    const match = itemMatch(itemId)
    match.date = { $lt: new Date(d.getTime() + 1) }

    let pipeline
    if (USE_SIGNED_QTY) {
      pipeline = [{ $match: match }, { $group: { _id: null, qty: { $sum: '$qty' } } }]
    } else {
      const OUT = MovementType?.OUT ?? 'OUT'
      pipeline = [
        { $match: match },
        {
          $group: {
            _id: null,
            qty: {
              $sum: {
                $cond: [{ $eq: ['$type', OUT] }, { $multiply: ['$qty', -1] }, '$qty'],
              },
            },
          },
        },
      ]
    }

    const agg = await InventoryMovement.aggregate(pipeline)
    const balance = agg.length ? agg[0].qty : 0
    res.json({ itemId, asOf: d, balance })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Get balance error' })
  }
}

/* =========================================================
 * Close-month — DIABAIKAN (no-op). Hanya return OK untuk FE.
 * =======================================================*/
export async function closeMonth(_req, res) {
  return res.json({ ok: true, note: 'Close-month diabaikan. Perhitungan stok harian tanpa snapshot.' })
}
