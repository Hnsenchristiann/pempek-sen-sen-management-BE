import mongoose from 'mongoose'


export const connectDB = async (mongoUri) => {
try {
await mongoose.connect(mongoUri, { dbName: 'pempek_sen_sen' })
console.log('✅ MongoDB connected')
} catch (err) {
console.error('❌ MongoDB connection error:', err.message)
process.exit(1)
}
}