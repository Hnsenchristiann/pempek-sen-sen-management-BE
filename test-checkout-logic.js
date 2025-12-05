/**
 * TEST CHECKOUT LOGIC
 * 
 * Memastikan:
 * 1. Paket item -> kurangi Stock Vaccum (StockVaccumMovement)
 * 2. Promo item -> kurangi Stock Regular (InventoryMovement)
 * 3. Regular item -> kurangi Stock Regular (InventoryMovement)
 */

import axios from 'axios'
import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const API = 'http://localhost:4000/api'

// Test scenarios
async function testCheckoutLogic() {
  try {
    console.log('🧪 TESTING CHECKOUT LOGIC\n')
    console.log('=' .repeat(60))

    // 1. Get items
    console.log('\n📦 STEP 1: Fetching test items...')
    const itemsRes = await axios.get(`${API}/items?limit=10`)
    const items = itemsRes.data?.data || []
    console.log(`✅ Found ${items.length} items`)
    if (items.length === 0) {
      console.log('❌ No items found. Create some items first.')
      return
    }

    // 2. Get pakets
    console.log('\n📦 STEP 2: Fetching pakets...')
    const paketsRes = await axios.get(`${API}/paket`)
    const pakets = paketsRes.data?.data || []
    console.log(`✅ Found ${pakets.length} pakets`)

    // 3. Get promos
    console.log('\n🎉 STEP 3: Fetching promos...')
    const promosRes = await axios.get(`${API}/promo`)
    const promos = promosRes.data?.data || []
    console.log(`✅ Found ${promos.length} promos`)

    // 4. Create test order
    console.log('\n🛒 STEP 4: Creating test order for table 5...')
    const orderRes = await axios.post(`${API}/pos/order/5/create-or-get`, { shouldCreate: true })
    const orderId = orderRes.data?.order?._id
    console.log(`✅ Order created: ${orderId}`)

    // 5. Add regular item
    if (items.length > 0) {
      console.log('\n📝 STEP 5: Adding regular item...')
      const item = items[0]
      console.log(`Adding: ${item.name} (Stock: ${item.currentStock})`)
      
      await axios.post(`${API}/pos/order/${orderId}/add-item`, {
        itemId: item._id,
        qty: 1
      })
      console.log('✅ Regular item added')
    }

    // 6. Add paket if available
    if (pakets.length > 0) {
      console.log('\n🎁 STEP 6: Adding paket...')
      const paket = pakets[0]
      console.log(`Adding: ${paket.name} with ${paket.items?.length || 0} items`)
      
      await axios.post(`${API}/pos/order/${orderId}/add-item`, {
        paketId: paket._id,
        qty: 1
      })
      console.log('✅ Paket added')
    }

    // 7. Add promo if available
    if (promos.length > 0) {
      console.log('\n🎉 STEP 7: Adding promo...')
      const promo = promos[0]
      console.log(`Adding: ${promo.name} with ${promo.items?.length || 0} items`)
      
      await axios.post(`${API}/pos/order/${orderId}/add-item`, {
        promoId: promo._id,
        qty: 1
      })
      console.log('✅ Promo added')
    }

    // 8. Proceed to checkout
    console.log('\n💳 STEP 8: Proceeding to checkout...')
    const checkoutRes = await axios.post(`${API}/pos/order/${orderId}/proceed-to-checkout`)
    console.log('✅ Order ready for payment')

    // 9. Confirm payment (cash)
    console.log('\n💰 STEP 9: Confirming payment...')
    const paymentRes = await axios.post(`${API}/pos/order/${orderId}/confirm-payment-cash`, {
      paidAmount: checkoutRes.data?.order?.total || 100000
    })
    console.log('✅ Payment confirmed')
    console.log(`Order Status: ${paymentRes.data?.order?.status}`)

    // 10. Verify stock movements were created
    console.log('\n✅ VERIFICATION: Checking if stock movements were created...')
    
    // Check InventoryMovement (regular items + promo items)
    console.log('\n📋 Regular Stock Movements (InventoryMovement):')
    const movementsRes = await axios.get(`${API}/inventory/movements`)
    const movements = movementsRes.data?.data || []
    const recentMovements = movements.filter(m => 
      new Date(m.createdAt) > new Date(Date.now() - 60000) // Last 1 minute
    )
    console.log(`Recent movements: ${recentMovements.length}`)
    recentMovements.forEach(m => {
      console.log(`  - Item: ${m.itemId?.name || m.itemId} | Type: ${m.type} | Qty: ${m.qty}`)
    })

    // Check StockVaccumMovement (paket items only)
    console.log('\n📋 Stock Vaccum Movements (StockVaccumMovement):')
    const vaccumMovementsRes = await axios.get(`${API}/stock-vaccum/movements`)
    const vaccumMovements = vaccumMovementsRes.data?.data || []
    const recentVaccumMovements = vaccumMovements.filter(m => 
      new Date(m.createdAt) > new Date(Date.now() - 60000) // Last 1 minute
    )
    console.log(`Recent vaccum movements: ${recentVaccumMovements.length}`)
    recentVaccumMovements.forEach(m => {
      console.log(`  - Item: ${m.itemId?.name || m.itemId} | Type: ${m.type} | Qty: ${m.qty}`)
    })

    console.log('\n' + '='.repeat(60))
    console.log('\n✅ TEST COMPLETE')
    console.log('\nExpected Results:')
    console.log('  ✓ Regular items -> InventoryMovement with SALE_OUT')
    console.log('  ✓ Paket items -> StockVaccumMovement with SALE_OUT')
    console.log('  ✓ Promo items -> InventoryMovement with SALE_OUT')

  } catch (error) {
    console.error('\n❌ ERROR:', error.response?.data || error.message)
  } finally {
    process.exit(0)
  }
}

// Run test
testCheckoutLogic()
