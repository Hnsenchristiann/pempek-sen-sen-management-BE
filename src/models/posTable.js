import mongoose from 'mongoose'

const PosTableSchema = new mongoose.Schema({
  number: { type: Number, required: true, unique: true }, // 1..10
  label: { type: String }, // optional label
  currentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PosOrder', default: null },
  status: { type: String, enum: ['EMPTY', 'OPEN', 'AWAITING_PAYMENT'], default: 'EMPTY' },
}, { timestamps: true })

export default mongoose.model('PosTable', PosTableSchema)
