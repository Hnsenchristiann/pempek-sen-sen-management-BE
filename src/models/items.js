import mongoose from 'mongoose'

const ItemSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', index: true },
  sku: { type: String, unique: true, sparse: true },
  unit: { type: String, default: 'pcs' },
  price: { type: Number, required: true, min: 0 },
  cost: { type: Number, default: 0, min: 0 }, // Harga cost untuk menghitung profit
  // bukan sumber saldo, hanya cache untuk cepat; dihitung ulang dari snapshot+movement saat butuh
  currentStock: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
})

export default mongoose.model('Item', ItemSchema)
