/**
 * CHECKOUT LOGIC - STOCK REDUCTION
 * 
 * Implementasi di: BE/src/controller/posController.js -> createSaleInventoryMovements()
 * 
 * Ada 3 tipe item yang bisa dijual di POS:
 * 
 * 1. REGULAR ITEM (Pempek Biasa)
 *    - isPaket: false
 *    - isPromo: false
 *    - Saat checkout, stock berkurang di: InventoryMovement (regular stock)
 *    - Movement type: SALE_OUT
 *    - Qty berkurang sesuai qty item
 *    
 * 2. PAKET (Bundle dari Stock Vaccum)
 *    - isPaket: true
 *    - isPromo: false
 *    - Saat checkout, stock berkurang di: StockVaccumMovement (Stock Vaccum)
 *    - Movement type: SALE_OUT
 *    - Qty berkurang = paket item qty * jumlah paket dibeli
 *    - Contoh: Paket berisi [2x Pempek Telur, 1x Cuko], dibeli 3 paket
 *      → Pempek Telur berkurang 6 (2*3)
 *      → Cuko berkurang 3 (1*3)
 *    
 * 3. PROMO (Bundle dari stock reguler dengan diskon)
 *    - isPaket: true
 *    - isPromo: true
 *    - Saat checkout, stock berkurang di: InventoryMovement (regular stock)
 *    - Movement type: SALE_OUT
 *    - Qty berkurang = promo item qty * jumlah promo dibeli
 *    - Sama seperti Paket tapi kurangi di InventoryMovement bukan StockVaccumMovement
 * 
 * ===== FLOW =====
 * 
 * 1. Customer add item ke order
 *    - addItemToOrder() set isPaket/isPromo flag dan store paket/promo items
 * 
 * 2. Customer checkout
 *    - proceedToCheckout() tidak reduce stock (hanya siap untuk payment)
 * 
 * 3. Confirm payment (cash/QRIS)
 *    - confirmPaymentCash() / confirmPaymentQRIS()
 *    - Call createSaleInventoryMovements()
 *    - Loop semua items di order
 *    - Berdasarkan isPaket + isPromo flag, tentukan tipe movement:
 *      * Regular: Create InventoryMovement with qty -item.qty
 *      * Paket: Create StockVaccumMovement for each paket item
 *      * Promo: Create InventoryMovement for each promo item
 * 
 * ===== MODELS INVOLVED =====
 * 
 * Item (regular items)
 * Paket (bundle with Stock Vaccum items)
 * Promo (bundle with regular items)
 * InventoryMovement (tracks regular stock changes)
 * StockVaccumMovement (tracks Stock Vaccum changes)
 * 
 * ===== FIELD REFERENCES =====
 * 
 * Paket model:
 *   - items[]: { itemId: ObjectId, quantity: Number }
 *   - harga: Number
 * 
 * Promo model:
 *   - items[]: { itemId: ObjectId, quantity: Number }
 *   - promoPrice: Number (bukan "harga", beda dengan Paket!)
 * 
 * PosOrder item:
 *   - itemId: ObjectId (Paket ID atau Promo ID jika isPaket=true)
 *   - isPaket: Boolean (true untuk Paket atau Promo)
 *   - isPromo: Boolean (true hanya untuk Promo)
 *   - paketItems: Array (dari Paket/Promo.items, disimpan saat add item)
 *   - qty: Number (jumlah Paket/Promo dibeli)
 * 
 * ===== VALIDATION POINTS =====
 * 
 * ✓ Frontend (POSTableOrder.vue):
 *   - isPaket flag di set saat add paket/promo
 *   - isPromo flag di set hanya untuk promo
 * 
 * ✓ Backend (posController.js):
 *   - Logic branches by isPaket && !isPromo (Paket) vs isPaket && isPromo (Promo)
 *   - StockVaccumMovement created for Paket (line 129-133)
 *   - InventoryMovement created for Promo (line 149-156)
 */
