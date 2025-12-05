import mongoose from 'mongoose'

/**
 * Stock Vaccum - Inventory untuk Paket saja
 * Terpisah dari stock biasa (untuk items reguler)
 * 
 * Konsep:
 * - Stock reguler: untuk penjualan item individual
 * - Stock Vaccum: untuk penjualan paket (digunakan saat checkout)
 * 
 * Flow:
 * 1. Admin manage Stock Vaccum di halaman baru
 * 2. Saat paket dipilih di POS, ambil dari Stock Vaccum
 * 3. Saat checkout, kurangi Stock Vaccum (bukan stock reguler)
 */

const StockVaccumSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true
    },
    currentStock: {
      type: Number,
      default: 0,
      min: 0
    },
    minimumStock: {
      type: Number,
      default: 10
    },
    notes: String,
    lastRestockedAt: Date,
    lastRestockedBy: String,
  },
  { timestamps: true }
)

// Index untuk quick lookup
StockVaccumSchema.index({ itemId: 1 })
StockVaccumSchema.index({ currentStock: 1 })

const StockVaccum = mongoose.model('StockVaccum', StockVaccumSchema)
export default StockVaccum
