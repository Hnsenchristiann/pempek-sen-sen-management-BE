import mongoose from 'mongoose'

export const MovementType = {
  OPENING: 'OPENING',            // saat buat item pertama kali
  ADJUSTMENT_ADD: 'PENAMBAHAN',   // tambah harian / pembelian manual
  ADJUSTMENT_SUB: 'PENGURANGAN',   // koreksi berkurang
  SALE_OUT: 'SALE_OUT',               // penjualan (nanti POS)
  PURCHASE_IN: 'PURCHASE_IN',         // pembelian (jika nanti diintegrasi)
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
  CORRECTION: 'CORRECTION',           // koreksi opname
}

const InventoryMovementSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
  date: { type: Date, required: true, index: true }, // tanggal efektif movement
  type: { type: String, enum: Object.values(MovementType), required: true, index: true },
  qty: { type: Number, required: true },             // + untuk masuk, - untuk keluar
  note: { type: String },
  meta: { type: mongoose.Schema.Types.Mixed },       // ruang fleksibel
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String }, // simpan username/kasir
})

InventoryMovementSchema.index({ itemId: 1, date: 1 })

export default mongoose.model('InventoryMovement', InventoryMovementSchema)
