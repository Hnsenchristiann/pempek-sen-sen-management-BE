import mongoose from 'mongoose'

/**
 * Stock Vaccum Movement - Track all stock movements for Stock Vaccum items
 * Similar to InventoryMovement but for stock vaccum only
 */

const StockVaccumMovementSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true
    },
    date: {
      type: Date,
      required: true,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['PENAMBAHAN', 'PENGURANGAN', 'CORRECTION', 'SALE_OUT', 'PURCHASE_IN'],
      required: true
    },
    qty: {
      type: Number,
      required: true
    },
    note: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
  },
  { timestamps: true }
)

// Compound index untuk quick lookup by itemId + date
StockVaccumMovementSchema.index({ itemId: 1, date: -1 })
// Type index untuk filtering by movement type
StockVaccumMovementSchema.index({ type: 1 })

const StockVaccumMovement = mongoose.model('StockVaccumMovement', StockVaccumMovementSchema)
export default StockVaccumMovement
