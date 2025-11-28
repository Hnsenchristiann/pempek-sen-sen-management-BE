import MenuSettings from '../models/menuSettings.js'

/**
 * Get all menu settings
 */
export async function getMenuSettings(req, res) {
  try {
    const menus = await MenuSettings.find().sort({ section: 1, order: 1 }).lean()
    res.json({ menus })
  } catch (error) {
    console.error('Error fetching menu settings:', error)
    res.status(500).json({ message: 'Error fetching menu settings' })
  }
}

/**
 * Update menu visibility/order/roles
 */
export async function updateMenuSettings(req, res) {
  try {
    const { menuKey } = req.params
    const { visible, order, roles } = req.body

    const updateData = {}
    if (typeof visible === 'boolean') updateData.visible = visible
    if (typeof order === 'number') updateData.order = order
    if (Array.isArray(roles) && roles.length > 0) updateData.roles = roles

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No fields to update' })
    }

    const menu = await MenuSettings.findOneAndUpdate(
      { menuKey },
      updateData,
      { new: true }
    )

    if (!menu) {
      return res.status(404).json({ message: 'Menu not found' })
    }

    res.json({ menu })
  } catch (error) {
    console.error('Error updating menu settings:', error)
    res.status(500).json({ message: 'Error updating menu settings' })
  }
}

/**
 * Get menus visible for specific role
 */
export async function getMenusByRole(req, res) {
  try {
    const { role } = req.query

    if (!role) {
      return res.status(400).json({ message: 'Role parameter required' })
    }

    const menus = await MenuSettings.find({
      visible: true,
      roles: { $in: [role] },
    })
      .sort({ section: 1, order: 1 })
      .lean()

    res.json({ menus })
  } catch (error) {
    console.error('Error fetching menus by role:', error)
    res.status(500).json({ message: 'Error fetching menus' })
  }
}
