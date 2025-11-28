import mongoose from 'mongoose'

const MenuSettingsSchema = new mongoose.Schema(
  {
    menuKey: { type: String, required: true, unique: true }, // e.g., 'dashboard', 'pos', 'grab', 'categories', etc
    section: { type: String, required: true }, // e.g., 'dashboards', 'pos', 'master', 'history'
    label: { type: String, required: true }, // e.g., 'Dashboard', 'POS'
    icon: { type: String, required: true }, // e.g., 'mdi-view-dashboard'
    route: { type: String, required: true }, // e.g., '/', '/pos'
    roles: { type: [String], required: true }, // e.g., ['adminsensen', 'kasirsensen']
    visible: { type: Boolean, default: true }, // toggle on/off
    order: { type: Number, default: 0 }, // sort order per section
  },
  { timestamps: true }
)

export default mongoose.model('MenuSettings', MenuSettingsSchema)
