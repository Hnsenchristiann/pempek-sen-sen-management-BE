import mongoose from 'mongoose'

const InventoryPeriodSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true }, // 1..12
  openingQty: { type: Number, required: true }, // saldo awal bulan
  closingQty: { type: Number, required: true }, // saldo akhir bulan
  computedAt: { type: Date, default: Date.now },
})

InventoryPeriodSchema.index({ itemId: 1, year: 1, month: 1 }, { unique: true })

export default mongoose.model('InventoryPeriod', InventoryPeriodSchema)
