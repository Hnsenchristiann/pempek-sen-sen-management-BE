/**
 * Thermal Printer Controller
 * Handles printing via COM Port (Serial connection)
 * Works with any thermal printer connected via USB/Serial
 */

import { SerialPort } from 'serialport'

// Keep track of serial port instances
const serialPorts = {}

/**
 * Initialize serial connection to thermal printer
 * @param {string} comPort - COM port (e.g., 'COM3', '/dev/ttyUSB0')
 * @param {number} baudRate - Baud rate (usually 9600, 19200, or 115200)
 * @returns {Promise<boolean>} - true if successful
 */
export async function initializeThermalPrinter(comPort = 'COM3', baudRate = 9600) {
  return new Promise((resolve) => {
    try {
      // If already connected, close first
      if (serialPorts[comPort]) {
        serialPorts[comPort].close()
      }

      const port = new SerialPort({
        path: comPort,
        baudRate: baudRate,
        autoOpen: false
      })

      port.on('error', (err) => {
        console.error(`Serial port error (${comPort}):`, err.message)
        resolve(false)
      })

      port.on('open', () => {
        console.log(`✅ Thermal printer connected on ${comPort} @ ${baudRate} baud`)
        serialPorts[comPort] = port
        resolve(true)
      })

      port.open()
    } catch (error) {
      console.error('Error initializing thermal printer:', error.message)
      resolve(false)
    }
  })
}

/**
 * Send ESCPOS data to thermal printer
 * @param {string} escposData - ESCPOS format string
 * @param {string} comPort - COM port (default: COM3)
 * @returns {Promise<boolean>} - true if sent successfully
 */
export async function printToThermalPrinter(escposData, comPort = 'COM3') {
  return new Promise((resolve) => {
    try {
      // Get the serial port instance
      const port = serialPorts[comPort]

      if (!port || !port.isOpen) {
        console.warn(`⚠️ Printer not connected on ${comPort}, initializing...`)
        // Try to initialize
        initializeThermalPrinter(comPort).then((success) => {
          if (success) {
            // Retry after initialization
            printToThermalPrinter(escposData, comPort).then(resolve)
          } else {
            resolve(false)
          }
        })
        return
      }

      console.log(`🖨️ Sending ${escposData.length} bytes to printer on ${comPort}...`)

      // Send data to printer
      port.write(escposData, (error) => {
        if (error) {
          console.error('Error writing to printer:', error.message)
          resolve(false)
          return
        }

        console.log('✅ Print data sent to thermal printer')

        // Add small delay to ensure data is processed
        setTimeout(() => {
          resolve(true)
        }, 300)
      })
    } catch (error) {
      console.error('Error sending to thermal printer:', error.message)
      resolve(false)
    }
  })
}

/**
 * List available COM ports
 * @returns {Promise<Array>} - Array of available ports
 */
export async function listAvailablePorts() {
  try {
    const ports = await SerialPort.list()
    console.log('Available COM ports:', ports)
    return ports.map(port => ({
      path: port.path,
      manufacturer: port.manufacturer || 'Unknown',
      productId: port.productId || 'Unknown',
      vendorId: port.vendorId || 'Unknown'
    }))
  } catch (error) {
    console.error('Error listing ports:', error.message)
    return []
  }
}

/**
 * Disconnect thermal printer
 * @param {string} comPort - COM port
 */
export function disconnectThermalPrinter(comPort = 'COM3') {
  try {
    const port = serialPorts[comPort]
    if (port && port.isOpen) {
      port.close()
      delete serialPorts[comPort]
      console.log(`✅ Printer on ${comPort} disconnected`)
      return true
    }
    return false
  } catch (error) {
    console.error('Error disconnecting printer:', error.message)
    return false
  }
}

/**
 * Get printer status
 * @param {string} comPort - COM port
 */
export function getPrinterStatus(comPort = 'COM3') {
  const port = serialPorts[comPort]
  if (!port) {
    return { connected: false, message: `No printer on ${comPort}` }
  }
  return {
    connected: port.isOpen,
    port: comPort,
    message: port.isOpen ? `Connected on ${comPort}` : `Disconnected from ${comPort}`
  }
}
