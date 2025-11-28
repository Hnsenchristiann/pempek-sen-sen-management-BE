import mongoose from 'mongoose'


const CategorySchema = new mongoose.Schema(
{
name: { type: String, required: true, trim: true, unique: true },
code: { type: String, trim: true },
isActive: { type: Boolean, default: true },
},
{ timestamps: true }
)


export default mongoose.model('Category', CategorySchema)