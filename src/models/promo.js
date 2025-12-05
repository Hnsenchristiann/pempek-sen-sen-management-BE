import mongoose from 'mongoose'

/**
 * Promo - Bundle items yang diskon
 * Konsep sama seperti Paket, tapi:
 * - Paket: bundle items dari Stock Vaccum
 * - Promo: bundle items dari stock reguler (dengan diskon)
 * 
 * Flow:
 * 1. Admin buat Promo di halaman baru (mirip Paket)
 * 2. Promo punya items dari stock reguler + harga promo
 * 3. Saat checkout, kurangi stock reguler (bukan Stock Vaccum)
 */

const PromoSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    description: String,
    originalPrice: {
      type: Number,
      default: 0,
      min: 0
    },
    promoPrice: {
      type: Number,
      required: true,
      min: 0
    },
    discount: {
      type: Number,
      default: 0  // Calculated: originalPrice - promoPrice
    },
    discountPercentage: {
      type: Number,
      default: 0
    },
    items: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Item',
          required: true
        },
        quantity: {
          type: Number,
          default: 1,
          min: 1
        },
        notes: String
      }
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    validFrom: Date,
    validUntil: Date,
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true }
)

// Calculate discount before save
PromoSchema.pre('save', function(next) {
  if (this.originalPrice && this.promoPrice) {
    this.discount = this.originalPrice - this.promoPrice
    this.discountPercentage = Math.round(
      ((this.originalPrice - this.promoPrice) / this.originalPrice) * 100
    )
  }
  next()
})

const Promo = mongoose.model('Promo', PromoSchema)
export default Promo
