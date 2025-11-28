import mongoose from 'mongoose'

const GrabOrderSchema = new mongoose.Schema(
  {
    grabNumber: { type: String, required: true, unique: true }, // e.g., "GRB-20241124-001"
    items: [
      {
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        itemName: { type: String, required: true },
        price: { type: Number, required: true },
        qty: { type: Number, required: true, default: 1 },
        subtotal: { type: Number, required: true },
        note: { type: String, default: '' },
        isPaket: { type: Boolean, default: false },  // flag untuk paket
        paketItems: [{                                 // untuk paket items
          itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
          quantity: { type: Number, default: 1 }
        }]
      },
    ],
    total: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      enum: ['PENDING', 'READY', 'COMPLETED', 'CANCELLED'],
      default: 'PENDING',
    },
  },
  { timestamps: true }
)

export default mongoose.model('GrabOrder', GrabOrderSchema)
