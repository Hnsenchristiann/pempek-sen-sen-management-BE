import mongoose from 'mongoose'
import PosOrder from '../models/posOrder.js'
import Item from '../models/items.js'
import Paket from '../models/Paket.js'
import InventoryMovement from '../models/inventoryMovement.js'
import path from 'path'
import fs from 'fs'

/**
 * PAKET ITEMS POPULATE FIX (Nov 26, 2025)
 * 
 * Problem: Ketika order dengan paket dikirim ke frontend, paketItems[].itemId hanya ObjectId,
 * bukan object dengan nama, sku, price. Ini membuat dropdown detail di POSTableOrder dan
 * POSCheckout tidak bisa tampil informasi produk.
 * 
 * Solution: Tambah .populate('items.paketItems.itemId') ke semua function yang return order.
 * Mongoose akan fetch detail Item dari collection dan replace ObjectId dengan object lengkap.
 * 
 * Affected functions:
 * - getOrCreateOrderForTable: populate saat fetch order dari DB
 * - addItemToOrder: populate sebelum return response
 * - updateItemQty: populate sebelum return response
 * - removeItem: populate sebelum return response
 * - proceedToCheckout: populate sebelum return response
 * - confirmPaymentCash: populate sebelum return response
 * - confirmPaymentQRIS: populate sebelum return response
 */

// ===== Helpers =====
function todayKey() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

// Helper: Recompute currentStock setelah inventory movement
async function recomputeCurrentStock(itemId) {
  try {
    // Sum all movements for this item
    const movements = await InventoryMovement.aggregate([
      { $match: { itemId: new mongoose.Types.ObjectId(itemId) } },
      { $group: { _id: null, qty: { $sum: '$qty' } } }
    ])
    const total = movements.length ? movements[0].qty : 0
    // Update item's currentStock
    await Item.findByIdAndUpdate(itemId, { currentStock: total })
    return total
  } catch (err) {
    console.error('Error recomputing stock for item', itemId, err)
    return 0
  }
}

// Helper: Auto-adjust order status based on items
async function autoAdjustOrderStatus(order) {
  // Jika order kosong (tidak ada items), status harus OPEN
  if (order.items.length === 0) {
    order.status = 'OPEN'
  }
  // Jika order ada isi tapi statusnya OPEN, biarkan (user bisa move ke AWAITING_PAYMENT lewat checkout)
  // Jika order AWAITING_PAYMENT atau SENT_TO_KITCHEN, jangan ubah
  return order
}

async function generateQueueNumber() {
  const key = todayKey()
  const start = new Date(`${key.slice(0,4)}-${key.slice(4,6)}-${key.slice(6,8)}T00:00:00.000Z`)
  const end = new Date(`${key.slice(0,4)}-${key.slice(4,6)}-${key.slice(6,8)}T23:59:59.999Z`)
  const countToday = await PosOrder.countDocuments({ createdAt: { $gte: start, $lte: end } })
  const next = String(countToday + 1).padStart(3, '0')
  return `${key}-${next}`
}
function computeTotals(items) {
  return items.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0)
}

// Helper: Create inventory movements for each sold item (including paket items)
async function createSaleInventoryMovements(order) {
  try {
    // Gunakan order.createdAt untuk semua inventory movements agar konsisten
    const movementDate = order.createdAt || new Date()
    
    console.log('🔍 Creating inventory movements for order:', {
      orderId: order._id,
      items: order.items.map(it => ({
        itemName: it.itemName,
        isPaket: it.isPaket,
        paketItemsCount: it.paketItems?.length || 0,
        paketItems: it.paketItems
      }))
    })
    
    for (const item of order.items) {
      // Regular item
      if (!item.isPaket) {
        await InventoryMovement.create({
          itemId: item.itemId,
          date: movementDate,
          type: 'SALE_OUT',
          qty: -item.qty,
          note: `Penjualan POS - Queue #${order.queueNumber} (Table ${order.tableNumber})`,
          createdBy: 'POS System',
        })
        await recomputeCurrentStock(item.itemId)
      } else {
        // Paket - reduce stock for each item in paket
        if (item.paketItems && item.paketItems.length > 0) {
          console.log(`📦 Processing paket "${item.itemName}" with ${item.paketItems.length} items`)
          for (const paketItem of item.paketItems) {
            const itemIdToReduce = paketItem.itemId?._id || paketItem.itemId
            const qty = (paketItem.quantity || 1) * item.qty
            
            console.log(`  └─ Reducing item ${itemIdToReduce} by qty ${qty}`)
            
            await InventoryMovement.create({
              itemId: itemIdToReduce,
              date: movementDate,
              type: 'SALE_OUT',
              qty: -qty,
              note: `Penjualan Paket: ${item.itemName} - Queue #${order.queueNumber} (Table ${order.tableNumber})`,
              createdBy: 'POS System',
            })
            await recomputeCurrentStock(itemIdToReduce)
          }
        } else {
          console.log(`⚠️  Paket "${item.itemName}" has no paketItems or empty array`)
        }
      }
    }
  } catch (err) {
    console.error('Error creating sale inventory movements:', err)
  }
}

/**
 * Status meja diturunkan dari order aktif:
 * - Tidak ada order aktif  -> 'EMPTY'
 * - Ada order OPEN         -> 'OPEN'
 * - Ada order SENT_TO_KITCHEN -> 'OPEN' (masih bisa add item)
 * - Ada order AWAITING_PAYMENT -> 'AWAITING_PAYMENT'
 */
function statusFromActiveOrder(order) {
  if (!order) return 'EMPTY'
  if (order.status === 'AWAITING_PAYMENT') return 'AWAITING_PAYMENT'
  return 'OPEN'
}

// ====== Tables (virtual 10 meja) ======
export async function getTables(_req, res) {
  // Cari order aktif per meja (status != PAID)
  const activeOrders = await PosOrder.aggregate([
    { $match: { status: { $in: ['OPEN', 'SENT_TO_KITCHEN', 'AWAITING_PAYMENT'] } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$tableNumber',
        orderId: { $first: '$_id' },
        status: { $first: '$status' },
      },
    },
  ])

  const map = new Map()
  for (const a of activeOrders) {
    map.set(Number(a._id), { currentOrderId: a.orderId, status: statusFromActiveOrder({ status: a.status }) })
  }

  const tables = []
  for (let n = 1; n <= 10; n++) {
    const info = map.get(n)
    tables.push({
      number: n,
      label: `Table ${n}`,
      currentOrderId: info?.currentOrderId || null,
      status: info?.status || 'EMPTY',
    })
  }
  res.json({ tables })
}

// ===== Orders per table =====
export async function getOrCreateOrderForTable(req, res) {
  const { tableNumber } = req.params
  const num = Number(tableNumber)
  const { shouldCreate = true } = req.body

  // Cari order aktif meja ini (prioritas yang terbaru)
  let order = await PosOrder.findOne({
    tableNumber: num,
    status: { $in: ['OPEN', 'SENT_TO_KITCHEN', 'AWAITING_PAYMENT'] },
  }).sort({ createdAt: -1 })

  // Jika tidak ada order aktif, jangan buat baru jika ingin ambil unpaid orders
  if (!order) {
    if (!shouldCreate) {
      return res.status(404).json({ message: 'No active order for this table' })
    }
    
    const queueNumber = await generateQueueNumber()
    order = await PosOrder.create({
      tableNumber: num,
      queueNumber,
      status: 'OPEN',
      items: [],
      total: 0,
    })
  } else {
    // Populate paketItems.itemId untuk menampilkan detail produk di frontend
    await order.populate('items.paketItems.itemId')
  }

  res.json({ order })
}

export async function addItemToOrder(req, res) {
  const { orderId } = req.params
  const { itemId, paketId, qty = 1, note } = req.body

  const order = await PosOrder.findById(orderId)
  if (!order) return res.status(404).json({ message: 'Order not found' })
  if (order.status === 'PAID') return res.status(400).json({ message: 'Order already paid' })

  // Handle Paket
  if (paketId) {
    const paket = await Paket.findById(paketId).populate('items.itemId')
    if (!paket) return res.status(404).json({ message: 'Paket not found' })

    console.log('📦 Adding paket to order:', {
      paketId: paket._id,
      paketName: paket.name,
      paketItems: paket.items,
      itemsCount: paket.items?.length
    })

    const price = Number(paket.harga) || 0
    const existIdx = order.items.findIndex(it => String(it.itemId) === String(paket._id) && it.isPaket)
    if (existIdx >= 0) {
      order.items[existIdx].qty += Number(qty)
      order.items[existIdx].subtotal = order.items[existIdx].qty * price
      if (note) order.items[existIdx].note = note
    } else {
      order.items.push({
        itemId: paket._id,
        itemName: paket.name,
        price,
        qty: Number(qty),
        note,
        subtotal: Number(qty) * price,
        isPaket: true,
        paketItems: paket.items, // Store paket items for stock reduction later
      })
    }
  } else {
    // Handle Regular Item
    const item = await Item.findById(itemId)
    if (!item) return res.status(404).json({ message: 'Item not found' })

    const price = Number(item.price) || 0
    const existIdx = order.items.findIndex(it => String(it.itemId) === String(item._id) && !it.isPaket)
    if (existIdx >= 0) {
      order.items[existIdx].qty += Number(qty)
      order.items[existIdx].subtotal = order.items[existIdx].qty * price
      if (note) order.items[existIdx].note = note
    } else {
      order.items.push({
        itemId: item._id,
        itemName: item.name,
        price,
        qty: Number(qty),
        note,
        subtotal: Number(qty) * price,
        isPaket: false,
      })
    }
  }

  order.total = computeTotals(order.items)
  await autoAdjustOrderStatus(order)
  await order.save()
  
  // Populate paketItems.itemId untuk menampilkan detail produk di frontend
  await order.populate('items.paketItems.itemId')
  
  console.log('✅ Order saved with items:', {
    orderId: order._id,
    itemsCount: order.items.length,
    items: order.items.map(it => ({
      itemName: it.itemName,
      isPaket: it.isPaket,
      paketItemsCount: it.paketItems?.length || 0
    }))
  })
  
  res.json({ order })
}

export async function updateItemQty(req, res) {
  const { orderId, orderItemIndex } = req.params
  const { qty } = req.body
  const order = await PosOrder.findById(orderId)
  if (!order) return res.status(404).json({ message: 'Order not found' })

  const idx = Number(orderItemIndex)
  if (Number.isNaN(idx) || !order.items[idx]) return res.status(404).json({ message: 'Order item not found' })

  if (qty <= 0) {
    order.items.splice(idx, 1)
  } else {
    order.items[idx].qty = Number(qty)
    order.items[idx].subtotal = order.items[idx].qty * order.items[idx].price
  }

  order.total = computeTotals(order.items)
  await autoAdjustOrderStatus(order)
  await order.save()
  await order.populate('items.paketItems.itemId')
  res.json({ order })
}

export async function updateOrderType(req, res) {
  try {
    const { orderId } = req.params
    const { orderType } = req.body

    // Validate orderType
    if (!['DINE_IN', 'TAKEAWAY'].includes(orderType)) {
      return res.status(400).json({ message: 'Invalid order type. Must be DINE_IN or TAKEAWAY' })
    }

    // Find and update order
    const order = await PosOrder.findByIdAndUpdate(
      orderId,
      { orderType },
      { new: true }
    ).populate('items.paketItems.itemId')

    if (!order) {
      return res.status(404).json({ message: 'Order not found' })
    }

    res.json({ order, success: true })
  } catch (error) {
    console.error('Error updating order type:', error)
    res.status(500).json({ message: 'Error updating order type', error: error.message })
  }
}

export async function removeItem(req, res) {
  const { orderId, orderItemIndex } = req.params
  const order = await PosOrder.findById(orderId)
  if (!order) return res.status(404).json({ message: 'Order not found' })

  const idx = Number(orderItemIndex)
  if (Number.isNaN(idx) || !order.items[idx]) return res.status(404).json({ message: 'Order item not found' })

  order.items.splice(idx, 1)
  order.total = computeTotals(order.items)
  await autoAdjustOrderStatus(order)
  await order.save()
  await order.populate('items.paketItems.itemId')
  res.json({ order })
}

// Simpan sementara (noop — karena sudah persist tiap aksi)
export async function saveOrder(req, res) {
  const { orderId } = req.params
  const order = await PosOrder.findById(orderId).lean()
  if (!order) return res.status(404).json({ message: 'Order not found' })
  res.json({ ok: true, order })
}

// Kitchen print
// Helper: Generate ESCPOS format untuk thermal printer 58mm
/**
 * ESC/POS (Epson Standard Code for Point of Sale)
 * Format binary untuk thermal printer 58mm (standard untuk kitchen/kasir)
 * 
 * Layout KITCHEN TICKET:
 * ================
 *        DAPUR
 * ================
 * ORDER #: 20251126-001
 * TABLE: 5
 * TIME: 14:30:45
 * ================
 * ITEMS:
 * [02] PEMPEK TELUR
 *   [PAKET ITEMS]:
 *     • 2x Pempek Telur
 *     • 1x Cuko
 * [01] ES TEH
 *   → Jangan pakai gula
 * ================
 * MAKAN DITEMPAT
 * 
 * Layout dirancang agar kitchen staff tahu:
 * 1. DAPUR header (jelas ini untuk kitchen)
 * 2. Nomor order (untuk tahu urutan)
 * 3. Meja mana (untuk tahu di mana customer)
 * 4. Item apa aja (tanpa harga - cuma urutan bikin)
 * 5. Qty sangat besar & menonjol
 * 6. Note khusus (ada yang skip/extra)
 * 7. Paket breakdown (jika ada paket)
 * 8. Order type (MAKAN DITEMPAT / BUNGKUS)
 */
function generateKitchenTicketEscpos(order) {
  const ESC = '\x1b'
  const GS = '\x1d'
  const LF = '\x0a'
  
  let output = ''
  
  // Initialize
  output += ESC + '@'  // Reset printer
  output += ESC + 'E\x01'  // BOLD ON
  
  // ============ HEADER: DAPUR ============
  output += ESC + 'a\x01'  // CENTER
  output += LF
  output += GS + '!' + '\x77'  // 4x width + 4x height (sangat besar)
  output += 'DAPUR' + LF
  output += GS + '!' + '\x00'  // Reset size
  output += ESC + 'a\x00'  // LEFT align
  output += LF
  
  // ============ ORDER INFO ============
  output += '=====================================\n'
  output += ' ORDER: ' + String(order.queueNumber || 'XXX').padStart(3, '0') + LF
  output += ' TABLE: ' + String(order.tableNumber || '-') + LF
  output += ' TIME : ' + new Date(order.createdAt).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }) + LF
  output += '=====================================\n'
  output += LF
  
  // ============ ITEMS SECTION ============
  for (const item of order.items) {
    // QUANTITY - VERY LARGE & BOLD
    output += GS + '!' + '\x77'  // 4x size
    output += '[' + String(item.qty).padStart(2, '0') + ']' + LF
    
    // Item name - bold
    output += GS + '!' + '\x11'  // 2x width
    output += item.itemName.toUpperCase().substring(0, 22) + LF
    output += GS + '!' + '\x00'  // Reset size
    
    // Notes if any
    if (item.note) {
      output += '  → NOTE: ' + item.note.substring(0, 20) + LF
    }
    
    // Paket items breakdown
    if (item.isPaket && item.paketItems && item.paketItems.length > 0) {
      output += '  [PAKET ITEMS]:' + LF
      for (const pItem of item.paketItems) {
        const pQty = (pItem.quantity || 1) * item.qty
        const pName = pItem.itemId?.name || pItem.name || 'Item'
        output += '    • ' + pQty + 'x ' + pName.substring(0, 18) + LF
      }
    }
    
    output += LF
  }
  
  output += '=====================================\n'
  output += LF
  
  // ============ ORDER TYPE ============
  output += ESC + 'a\x01'  // CENTER
  output += GS + '!' + '\x31'  // 2x size
  const orderType = order.orderType === 'TAKEAWAY' ? 'BUNGKUS' : 'MAKAN DITEMPAT'
  output += orderType + LF
  output += GS + '!' + '\x00'  // Reset
  output += ESC + 'a\x00'  // LEFT
  output += LF
  
  // RUSH INDICATOR
  if (order.priority === 'RUSH' || order.isRush) {
    output += ESC + 'a\x01'  // CENTER
    output += GS + '!' + '\x77'  // 4x size
    output += '!!! SEGERA !!!' + LF
    output += GS + '!' + '\x00'  // Reset
    output += ESC + 'a\x00'  // LEFT
    output += LF
  }
  
  // Timestamp
  output += 'PRINTED: ' + new Date().toLocaleString('id-ID') + LF
  
  // Paper cut
  output += LF + LF + LF
  output += GS + 'V\x42\x00'  // Full cut
  
  return output
}

export async function printToKitchen(req, res) {
  const { orderId } = req.params
  const order = await PosOrder.findById(orderId).populate('items.paketItems.itemId')
  if (!order) return res.status(404).json({ message: 'Order not found' })
  if (order.items.length === 0) return res.status(400).json({ message: 'No items to print' })

  order.status = 'SENT_TO_KITCHEN'
  order.kitchenPrintedAt = new Date()
  await order.save()

  // Generate ESCPOS format
  const escposData = generateKitchenTicketEscpos(order)
  
  console.log('📤 Kitchen Ticket Generated:', {
    orderId: order._id,
    queueNumber: order.queueNumber,
    itemsCount: order.items.length,
    escposLength: escposData.length
  })
  
  // Return ESCPOS data untuk thermal printer
  res.json({ 
    success: true,
    type: 'KITCHEN_TICKET',
    escposData,  // For thermal printer
    queueNumber: order.queueNumber,
    message: 'Kitchen ticket generated for AutoPrint'
  })
}

// Proceed checkout
export async function proceedToCheckout(req, res) {
  const { tableNumber } = req.params
  const num = Number(tableNumber)
  // Bisa checkout dari OPEN atau SENT_TO_KITCHEN (print to kitchen tidak wajib)
  const order = await PosOrder.findOne({
    tableNumber: num,
    status: { $in: ['OPEN', 'SENT_TO_KITCHEN'] },
  }).sort({ createdAt: -1 })

  if (!order) return res.status(404).json({ message: 'No open order for this table' })
  if (order.items.length === 0) return res.status(400).json({ message: 'Order has no items' })

  order.status = 'AWAITING_PAYMENT'
  await order.save()
  await order.populate('items.paketItems.itemId')
  res.json({ order })
}

// Pembayaran CASH
/**
 * Generate Receipt ESCPOS Format (58mm Thermal)
 * 
 * Layout:
 * =====================================
 *              PS
 *        STRUK PEMBAYARAN
 *       Pempek Sen Sen
 *     Terima Kasih Berbelanja
 * =====================================
 * No Antrian : 001
 * Meja       : 5
 * Waktu      : 14:30
 * =====================================
 * ITEM             QTY  HARGA
 * - - - - - - - - - - - - - - - - - - - 
 * Pempek Telur      2  Rp 20.000
 * Es Teh            1  Rp 5.000
 * - - - - - - - - - - - - - - - - - - - 
 * 
 *              TOTAL
 *           Rp 25.000
 * 
 * =====================================
 * Metode  : CASH
 * Bayar   : Rp 50.000
 * Kembali : Rp 25.000
 * =====================================
 *          TERIMA KASIH
 *    Semoga puas dengan layanan kami
 * =====================================
 */
function generateReceiptEscpos(order, payment) {
  const ESC = '\x1b'
  const GS = '\x1d'
  const LF = '\x0a'
  
  let output = ''
  
  // Initialize
  output += ESC + '@'  // Reset
  output += ESC + 'E\x01'  // BOLD ON
  
  // ============ LOGO / HEADER ============
  output += ESC + 'a\x01'  // CENTER
  output += LF
  output += GS + '!' + '\x77'  // 4x size (super besar)
  output += 'PS' + LF
  output += GS + '!' + '\x00'  // Reset size
  output += LF
  
  // TITLE
  output += GS + '!' + '\x31'  // 2x size
  output += 'STRUK PEMBAYARAN' + LF
  output += GS + '!' + '\x00'  // Reset
  output += 'Pempek Sen Sen' + LF
  output += 'Terima Kasih Berbelanja' + LF
  output += LF
  
  // ============ SEPARATOR & ORDER INFO ============
  output += ESC + 'a\x00'  // LEFT
  output += '=====================================\n'
  output += 'No Antrian : ' + String(order.queueNumber || 'XXX').padStart(3, '0') + LF
  output += 'Meja       : ' + String(order.tableNumber || '-') + LF
  output += 'Waktu      : ' + new Date(order.createdAt).toLocaleString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  }) + LF
  output += '=====================================\n'
  output += LF
  
  // ============ ITEMS HEADER ============
  output += 'ITEM             QTY  HARGA' + LF
  output += '- - - - - - - - - - - - - - - - - - - \n'
  
  // ITEMS
  for (const item of order.items) {
    const name = (item.itemName || 'Item').substring(0, 16).padEnd(16)
    const qty = String(item.qty).padStart(2)
    const subtotal = formatRupiah(item.subtotal || 0).substring(0, 11).padStart(11)
    output += name + qty + ' ' + subtotal + LF
  }
  
  output += '- - - - - - - - - - - - - - - - - - - \n'
  output += LF
  
  // ============ TOTAL ============
  output += ESC + 'a\x01'  // CENTER
  output += GS + '!' + '\x31'  // 2x size
  output += 'TOTAL' + LF
  output += formatRupiah(order.total) + LF
  output += GS + '!' + '\x00'  // Reset
  output += ESC + 'a\x00'  // LEFT
  output += LF + LF
  
  // ============ PAYMENT INFO ============
  output += '=====================================\n'
  output += 'Metode  : ' + (payment.method || 'CASH').substring(0, 15).padEnd(15) + LF
  output += 'Bayar   : ' + formatRupiah(payment.paidAmount || 0) + LF
  output += 'Kembali : ' + formatRupiah(payment.changeAmount || 0) + LF
  output += '=====================================\n'
  output += LF
  
  // ============ FOOTER ============
  output += ESC + 'a\x01'  // CENTER
  output += GS + '!' + '\x11'  // 2x width
  output += 'TERIMA KASIH' + LF
  output += GS + '!' + '\x00'  // Reset
  output += 'Semoga puas dengan layanan kami' + LF
  output += new Date().toLocaleString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  }) + LF
  output += LF
  
  // Paper cut
  output += LF + LF + LF
  output += GS + 'V\x42\x00'
  
  return output
}

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount || 0)
}

export async function confirmPaymentCash(req, res) {
  const { orderId } = req.params
  const { paidAmount } = req.body

  let order = await PosOrder.findById(orderId)
  if (!order) return res.status(404).json({ message: 'Order not found' })
  if (order.status !== 'AWAITING_PAYMENT') return res.status(400).json({ message: 'Order not ready to pay' })

  const paid = Number(paidAmount) || 0
  if (paid < order.total) return res.status(400).json({ message: 'Paid amount less than total' })

  const change = paid - order.total
  order.payment = {
    method: 'CASH',
    paidAmount: paid,
    changeAmount: change,
    confirmedAt: new Date(),
  }
  order.status = 'PAID'
  order.markModified('payment')
  await order.save()

  // Refresh dari DB
  order = await PosOrder.findById(orderId)

  console.log('✅ CASH Payment Confirmed:', {
    orderId: order._id,
    queueNumber: order.queueNumber,
    paidAmount: order.payment?.paidAmount,
    changeAmount: order.payment?.changeAmount,
  })

  // Create inventory movements for sold items
  await createSaleInventoryMovements(order)

  // Populate paketItems.itemId
  await order.populate('items.paketItems.itemId')

  // Generate ESCPOS untuk Bluetooth printer
  const escposData = generateReceiptEscpos(order, order.payment)

  res.json({ 
    success: true,
    type: 'RECEIPT',
    escposData,
    queueNumber: order.queueNumber,
    total: order.total,
    paidAmount: order.payment.paidAmount,
    changeAmount: order.payment.changeAmount,
    message: 'Payment confirmed. Receipt ready for Bluetooth printer'
  })
}

// Get all transactions (paid orders)
export async function getTransactions(req, res) {
  const { page = 1, limit = 20, startDate, endDate } = req.query

  const skip = (Number(page) - 1) * Number(limit)
  const query = { status: 'PAID' }

  // Filter by date jika ada
  if (startDate || endDate) {
    query.createdAt = {}
    if (startDate) query.createdAt.$gte = new Date(startDate)
    if (endDate) query.createdAt.$lte = new Date(endDate)
  }

  const total = await PosOrder.countDocuments(query)
  const transactions = await PosOrder.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .select('_id queueNumber tableNumber items total payment confirmedAt createdAt')
    .lean()

  // Format transactions untuk response
  const data = transactions.map(tx => {
    console.log('Transaction payment field:', {
      id: tx._id,
      method: tx.payment?.method,
      paidAmount: tx.payment?.paidAmount,
      qrisProofUrl: tx.payment?.qrisProofUrl,
    })
    return {
      _id: tx._id,
      queueNumber: tx.queueNumber,
      tableNumber: tx.tableNumber,
      items: tx.items,
      total: tx.total,
      paymentMethod: tx.payment?.method || 'UNKNOWN',
      paidAmount: tx.payment?.paidAmount || 0,
      change: tx.payment?.changeAmount || 0,
      qrisProofUrl: tx.payment?.qrisProofUrl || null,
      confirmedAt: tx.payment?.confirmedAt || tx.createdAt,
    }
  })

  res.json({
    total,
    page: Number(page),
    limit: Number(limit),
    data,
  })
}
// Pembayaran QRIS (file sudah di-handle multer di routes)
export async function confirmPaymentQRIS(req, res) {
  const { orderId } = req.params
  const file = req.file
  if (!file) return res.status(400).json({ message: 'QRIS proof is required' })

  let order = await PosOrder.findById(orderId)
  if (!order) return res.status(404).json({ message: 'Order not found' })
  if (order.status !== 'AWAITING_PAYMENT') return res.status(400).json({ message: 'Order not ready to pay' })

  order.payment = {
    method: 'QRIS',
    paidAmount: order.total,
    changeAmount: 0,
    qrisProofUrl: `/uploads/${file.filename}`,
    uploadedAt: new Date(),
    confirmedAt: new Date(),
  }
  order.status = 'PAID'
  order.markModified('payment')
  await order.save()

  // Refresh dari DB
  order = await PosOrder.findById(orderId)

  console.log('✅ QRIS Payment Confirmed:', {
    orderId: order._id,
    queueNumber: order.queueNumber,
    paidAmount: order.payment?.paidAmount,
    qrisProofUrl: order.payment?.qrisProofUrl,
    filename: file.filename,
  })

  // Create inventory movements for sold items
  await createSaleInventoryMovements(order)

  // Populate paketItems.itemId
  await order.populate('items.paketItems.itemId')

  // Generate ESCPOS untuk Bluetooth printer
  const escposData = generateReceiptEscpos(order, order.payment)

  res.json({ 
    success: true,
    type: 'RECEIPT',
    escposData,
    queueNumber: order.queueNumber,
    total: order.total,
    paidAmount: order.payment.paidAmount,
    qrisProofUrl: order.payment.qrisProofUrl,
    message: 'QRIS payment confirmed. Receipt ready for Bluetooth printer'
  })
}

// Sales Analytics - Laporan dengan daily/monthly/yearly period
export async function getSalesAnalytics(req, res) {
  try {
    const { period = 'daily', limit = 10 } = req.query

    // Fetch all paid orders
    const orders = await PosOrder.find({ status: 'PAID' }).sort({ createdAt: 1 }).lean()

    // Group data berdasarkan period
    const groupedData = {}
    let totalOrders = 0
    let totalItemsSold = 0
    let totalRevenue = 0
    const itemMap = new Map()

    for (const order of orders) {
      let key
      const date = new Date(order.createdAt)
      
      if (period === 'daily') {
        // Format: YYYY-MM-DD
        const yyyy = date.getFullYear()
        const mm = String(date.getMonth() + 1).padStart(2, '0')
        const dd = String(date.getDate()).padStart(2, '0')
        key = `${yyyy}-${mm}-${dd}`
      } else if (period === 'monthly') {
        // Format: YYYY-MM
        const yyyy = date.getFullYear()
        const mm = String(date.getMonth() + 1).padStart(2, '0')
        key = `${yyyy}-${mm}`
      } else {
        // yearly: YYYY
        const yyyy = date.getFullYear()
        key = String(yyyy)
      }

      if (!groupedData[key]) {
        groupedData[key] = { orders: 0, revenue: 0, itemsSold: 0 }
      }

      groupedData[key].orders += 1
      groupedData[key].revenue += Number(order.total) || 0
      totalOrders += 1
      totalRevenue += Number(order.total) || 0

      // Count items sold
      for (const item of order.items) {
        groupedData[key].itemsSold += item.qty
        totalItemsSold += item.qty

        // Track top items
        const itemId = String(item.itemId)
        if (!itemMap.has(itemId)) {
          itemMap.set(itemId, {
            itemId: item.itemId,
            itemName: item.itemName,
            price: item.price,
            qty: 0,
            subtotal: 0,
          })
        }
        const data = itemMap.get(itemId)
        data.qty += item.qty
        data.subtotal += item.subtotal
      }
    }

    // Convert grouped data to chart format
    const chartData = Object.entries(groupedData).map(([key, data]) => ({
      date: key,
      day: key, // for daily
      month: key, // for monthly
      year: key, // for yearly
      ...data
    }))

    // Get top items
    const topItems = Array.from(itemMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 3)

    res.json({
      period,
      totalOrders,
      totalItemsSold,
      totalRevenue,
      chartData: chartData.slice(-Number(limit)), // Last N periods
      topItems,
    })
  } catch (err) {
    console.error('Error fetching sales analytics:', err)
    res.status(500).json({ message: 'Error fetching sales analytics' })
  }
}