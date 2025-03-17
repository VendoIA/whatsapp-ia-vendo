// src/controllers/webhookController.js - VERSIÓN COMPLETAMENTE REESCRITA
import config from '../config/env.js';
import messageHandler from '../services/messageHandler.js';

// Conjunto para registrar webhooks procesados y evitar duplicados
const processedWebhooks = new Set();

// Objeto simple en lugar de clase para evitar problemas con 'this'
const webhookController = {
  // Método para manejar webhooks entrantes
  handleIncoming: async (req, res) => {
    try {
      // 1. Validación básica de la estructura
      if (!req.body || !req.body.object) {
        console.log("🚫 Webhook con estructura inválida");
        return res.sendStatus(400);
      }
      
      // 2. Crear un identificador único para este webhook
      const webhookHash = createWebhookHash(req.body);
      
      // 3. Verificar si ya procesamos este webhook
      if (processedWebhooks.has(webhookHash)) {
        console.log(`🔁 Webhook duplicado detectado: ${webhookHash.substring(0, 8)}...`);
        return res.sendStatus(200);
      }
      
      // 4. Marcar este webhook como procesado
      processedWebhooks.add(webhookHash);
      
      // Limpieza periódica si hay demasiados hashes almacenados
      if (processedWebhooks.size > 1000) {
        const oldHashes = Array.from(processedWebhooks).slice(0, 500);
        oldHashes.forEach(hash => processedWebhooks.delete(hash));
      }
      
      // 5. Procesar el webhook
      console.log(`📥 Webhook entrante [Hash: ${webhookHash.substring(0, 8)}...]`);
      
      // Variable para rastrear si encontramos mensajes válidos
      let isValidMessage = false;
      
      // Procesar entradas del webhook
      if (req.body.entry && Array.isArray(req.body.entry)) {
        for (const entry of req.body.entry) {
          // Procesar los cambios si existen
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              if (processMessages(change.value, isValidMessage)) {
                isValidMessage = true;
              }
            }
          }
          
          // También verificar mensajes directamente en el valor
          if (entry.value) {
            if (processMessages(entry.value, isValidMessage)) {
              isValidMessage = true;
            }
          }
        }
      }
      
      console.log(`📤 Webhook procesado: ${isValidMessage ? 'con mensajes válidos' : 'sin mensajes válidos'}`);
      return res.sendStatus(200);
    } catch (error) {
      console.error("💥 Error en manejo de webhook:", error);
      return res.sendStatus(500);
    }
  },

  // Método para verificar el webhook
  verifyWebhook: (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      console.log('✅ Webhook verificado correctamente');
    } else {
      console.log('❌ Verificación de webhook fallida');
      res.sendStatus(403);
    }
  }
};

// Función auxiliar para procesar mensajes de un valor de webhook
function processMessages(value, currentValidState) {
  if (!value || !value.messages || !Array.isArray(value.messages)) {
    return currentValidState;
  }
  
  let foundValidMessage = currentValidState;
  
  for (const message of value.messages) {
    // Validar mensaje
    if (!message.id || !message.from) continue;
    
    // Asegurar timestamp correcto
    if (message.timestamp) {
      message.timestamp = parseInt(message.timestamp) * 1000;
    } else {
      message.timestamp = Date.now();
    }
    
    // Preparar información del remitente
    const senderInfo = {
      wa_id: message.from,
      profile: value.contacts && value.contacts[0] ? value.contacts[0] : { name: message.from }
    };
    
    try {
      // Procesar mensaje a través del manejador
      messageHandler.handleIncomingMessage(message, senderInfo);
      foundValidMessage = true;
    } catch (err) {
      console.error(`❌ Error al procesar mensaje [ID: ${message.id}]:`, err);
    }
  }
  
  return foundValidMessage;
}

// Función para generar un hash único para cada webhook
function createWebhookHash(webhookData) {
  try {
    // Extraer IDs de mensajes
    const messageIds = [];
    
    // Recorrer entradas y cambios para encontrar IDs de mensajes
    if (webhookData.entry && Array.isArray(webhookData.entry)) {
      for (const entry of webhookData.entry) {
        // Buscar en changes
        if (entry.changes && Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            if (change.value && change.value.messages && Array.isArray(change.value.messages)) {
              for (const message of change.value.messages) {
                if (message.id) {
                  messageIds.push(message.id);
                }
              }
            }
          }
        }
        
        // Buscar directamente en value
        if (entry.value && entry.value.messages && Array.isArray(entry.value.messages)) {
          for (const message of entry.value.messages) {
            if (message.id) {
              messageIds.push(message.id);
            }
          }
        }
      }
    }
    
    if (messageIds.length > 0) {
      // Ordenar y unir para generar un identificador único
      return messageIds.sort().join('|');
    } else {
      // Si no hay IDs de mensajes, usar una representación limitada del webhook
      return JSON.stringify(webhookData).substring(0, 100);
    }
  } catch (error) {
    console.error("Error al generar hash de webhook:", error);
    // Fallback simple en caso de error
    return new Date().toISOString() + Math.random().toString();
  }
}

export default webhookController;