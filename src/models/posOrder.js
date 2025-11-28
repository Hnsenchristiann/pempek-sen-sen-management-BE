import mongoose from 'mongoose'

const PosOrderItemSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  itemName: { type: String, required: true },  // denormalize biar struk cepat
  price: { type: Number, required: true },
  qty: { type: Number, required: true, min: 1 },
  note: { type: String },                      // opsional
  subtotal: { type: Number, required: true },  // price * qty
  isPaket: { type: Boolean, default: false },  // flag untuk paket
  paketItems: [{                                 // untuk paket items
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    quantity: { type: Number, default: 1 }
  }]
}, { _id: false })

const PaymentSchema = new mongoose.Schema({
  method: { type: String, enum: ['CASH', 'QRIS'], required: true },
  paidAmount: { type: Number },      // untuk CASH
  changeAmount: { type: Number },    // untuk CASH
  qrisProofUrl: { type: String },    // untuk QRIS (path upload)
  uploadedAt: { type: Date },         // timestamp ketika image di-upload (untuk auto-delete 7 hari)
  confirmedAt: { type: Date },
}, { _id: false })

const PosOrderSchema = new mongoose.Schema({
  tableNumber: { type: Number, required: true },
  queueNumber: { type: String, required: true }, // ex: 20251020-001
  orderType: { type: String, enum: ['DINE_IN', 'TAKEAWAY'], default: 'DINE_IN' }, // New: order type
  status: { type: String, enum: ['OPEN', 'SENT_TO_KITCHEN', 'AWAITING_PAYMENT', 'PAID'], default: 'OPEN' },
  items: { type: [PosOrderItemSchema], default: [] },
  total: { type: Number, default: 0 },
  kitchenPrintedAt: { type: Date },
  payment: { type: PaymentSchema },
}, { timestamps: true })

// Index untuk efficient cleanup: cari payment dengan uploadedAt > 7 hari
PosOrderSchema.index({ 'payment.uploadedAt': 1 })

export default mongoose.model('PosOrder', PosOrderSchema)
