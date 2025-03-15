import { google } from 'googleapis';
import path from 'path';
import config from '../config/env.js';

// Cache para órdenes consultadas recientemente (evitar múltiples llamadas a la API)
const orderCache = {
  orders: {},
  lastFetch: null
};

// Tiempo de expiración del cache (5 minutos)
const CACHE_EXPIRY = 5 * 60 * 1000;

/**
 * Busca órdenes en Google Sheets por nombre de cliente o por fecha
 * @param {string} searchTerm - Término de búsqueda (nombre o fecha)
 * @returns {Promise<Array>} - Lista de órdenes que coinciden con la búsqueda
 */
async function findOrders(searchTerm) {
  try {
    // Verificar si podemos usar el cache
    const now = Date.now();
    if (orderCache.lastFetch && (now - orderCache.lastFetch < CACHE_EXPIRY)) {
      console.log("🔍 Buscando en cache de órdenes...");
      
      // Buscar en órdenes cacheadas
      const results = Object.values(orderCache.orders).filter(order => {
        const searchLower = searchTerm.toLowerCase();
        return (
          order.nombre.toLowerCase().includes(searchLower) ||
          order.fecha.toLowerCase().includes(searchLower) ||
          order.felicitado.toLowerCase().includes(searchLower)
        );
      });
      
      if (results.length > 0) {
        console.log(`✅ Encontradas ${results.length} órdenes en cache`);
        return results;
      }
    }
    
    // Si no hay cache o no se encontró, obtener datos de Google Sheets
    console.log("🔄 Obteniendo órdenes desde Google Sheets...");
    
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(process.cwd(), 'src/credentials', 'credentials.json'),
      scopes: [config.GOOGLECLOUDURL],
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets('v4');
    
    // Obtener todas las órdenes de la hoja
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: 'pedidos', // Nombre de la hoja
      auth: authClient,
    });
    
    // Verificar si hay datos
    if (!response.data.values || response.data.values.length <= 1) {
      console.log("❌ No hay órdenes en la hoja de cálculo");
      return [];
    }
    
    // Procesar los datos (asumiendo que la primera fila son cabeceras)
    const headers = ['nombre', 'felicitado', 'fecha', 'franja_horaria', 'pedido', 'timestamp'];
    const orders = response.data.values.slice(1).map((row, index) => {
      const order = {};
      
      // Mapear valores a propiedades usando nombres de cabecera
      headers.forEach((header, i) => {
        order[header] = row[i] || '';
      });
      
      // Añadir un ID para referencia
      order.id = `ORD-${index + 1}`;
      
      return order;
    });
    
    // Actualizar cache
    orderCache.orders = {};
    orders.forEach(order => {
      orderCache.orders[order.id] = order;
    });
    orderCache.lastFetch = now;
    
    // Buscar coincidencias
    const results = orders.filter(order => {
      const searchLower = searchTerm.toLowerCase();
      return (
        order.nombre.toLowerCase().includes(searchLower) ||
        order.fecha.toLowerCase().includes(searchLower) ||
        order.felicitado.toLowerCase().includes(searchLower)
      );
    });
    
    console.log(`✅ Encontradas ${results.length} órdenes en Google Sheets`);
    return results;
    
  } catch (error) {
    console.error("❌ Error al buscar órdenes:", error);
    throw error;
  }
}

/**
 * Formatea las órdenes para presentarlas al usuario
 * @param {Array} orders - Lista de órdenes
 * @returns {string} - Texto formateado para enviar al usuario
 */
function formatOrdersForDisplay(orders) {
  if (!orders || orders.length === 0) {
    return "No encontré pedidos que coincidan con tu búsqueda. Por favor verifica los datos o intenta con otro término de búsqueda.";
  }
  
  // Limitar a máximo 3 órdenes para no saturar el mensaje
  const displayOrders = orders.slice(0, 3);
  
  let message = `📋 *Encontré ${orders.length} pedido(s):*\n\n`;
  
  displayOrders.forEach((order, index) => {
    message += `*Pedido #${order.id}*\n`;
    message += `👤 Cliente: ${order.nombre}\n`;
    message += `🎁 Para: ${order.felicitado}\n`;
    message += `📅 Fecha: ${order.fecha}\n`;
    message += `⏰ Horario: ${order.franja_horaria}\n`;
    message += `🌸 Detalles: ${order.pedido.substring(0, 50)}${order.pedido.length > 50 ? '...' : ''}\n`;
    
    // Añadir separador entre órdenes
    if (index < displayOrders.length - 1) {
      message += "\n-------------------\n\n";
    }
  });
  
  // Añadir mensaje si hay más órdenes que no se muestran
  if (orders.length > 3) {
    message += `\n\n_Y ${orders.length - 3} pedido(s) más. Por favor, especifica mejor tu búsqueda para ver resultados más precisos._`;
  }
  
  return message;
}

/**
 * Detecta intención de consulta de estado de pedido en un mensaje
 * @param {string} message - Mensaje del usuario
 * @returns {boolean} - True si el mensaje parece ser consulta de estado
 */
function isOrderStatusQuery(message) {
  const statusKeywords = [
    'estado de mi pedido', 'estado de pedido', 'mi pedido', 'mi orden',
    'seguimiento', 'tracking', 'cuando llega', 'cuándo llega',
    'estado', 'consultar pedido', 'consultar orden', 'ver pedido',
    'mi compra', 'mis flores', 'mi entrega', 'dónde está', 'donde esta',
    'ya enviar', 'ya enviaron', 'enviaste', 'entregado'
  ];
  
  const messageLower = message.toLowerCase();
  
  // Verificar si contiene alguna palabra clave
  return statusKeywords.some(keyword => messageLower.includes(keyword));
}

export default {
  findOrders,
  formatOrdersForDisplay,
  isOrderStatusQuery
};