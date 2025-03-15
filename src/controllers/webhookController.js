// src/controllers/webhookController.js - VERSIÓN MEJORADA ANTI-DUPLICACIÓN
import config from '../config/env.js';
import messageHandler from '../services/messageHandler.js';

// Registro de webhooks para depuración y prevención de duplicados
const processedWebhooks = new Set();

class WebhookController {
  constructor() {
    // Bind methods to preserve 'this' context
    this.handleIncoming = this.handleIncoming.bind(this);
    this.verifyWebhook = this.verifyWebhook.bind(this);
    this.calculateWebhookHash = this.calculateWebhookHash.bind(this);
  }

  // Corrige el método handleIncoming en webhookController.js

async handleIncoming(req, res) {
  try {
    // 1. Validación inicial de la estructura del webhook
    if (!req.body || !req.body.object || !req.body.entry || !Array.isArray(req.body.entry) || req.body.entry.length === 0) {
      console.log("🚫 Webhook con estructura inválida");
      return res.sendStatus(400);
    }
    
    // 2. Identificar el webhook con un hash para detectar duplicados
    const webhookHash = this.calculateWebhookHash(req.body);
    
    // 3. Verificar si este webhook ya fue procesado
    if (processedWebhooks.has(webhookHash)) {
      console.log(`🔁 Webhook duplicado detectado [Hash: ${webhookHash.substring(0, 8)}...]`);
      return res.sendStatus(200); // Responder OK pero no procesar
    }
    
    // 4. Registrar este webhook como procesado
    processedWebhooks.add(webhookHash);
    
    // Limpieza periódica del conjunto de webhooks procesados
    if (processedWebhooks.size > 1000) {
      // Si hay demasiados hashes almacenados, limpiar los más antiguos
      const webhooksArray = Array.from(processedWebhooks);
      const toRemove = webhooksArray.slice(0, 500); // Eliminar los 500 más antiguos
      toRemove.forEach(hash => processedWebhooks.delete(hash));
      console.log(`🧹 Limpieza de caché de webhooks: ${toRemove.length} eliminados`);
    }
    
    // 5. Procesar el webhook
    console.log(`📥 Webhook entrante [Hash: ${webhookHash.substring(0, 8)}...]`);
    
    let isValidMessage = false;
    
    // Recorrer la estructura de datos del webhook para encontrar mensajes
    // CORREGIDO: La estructura del webhook puede variar, verificar ambos formatos
    for (const entry of req.body.entry) {
      // CORREGIDO: Comprobar si estamos usando 'changes' o 'messages' en la estructura
      // Para formato antiguo con 'changes'
      if (entry.changes && Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (!change.value || !change.value.messages || !Array.isArray(change.value.messages)) continue;
          
          for (const message of change.value.messages) {
            // Solo procesar mensajes con ID y timestamp válidos
            if (!message.id) continue;
            
            // Añadir el timestamp al objeto message para validación posterior
            if (message.timestamp) {
              message.timestamp = parseInt(message.timestamp) * 1000; // Convertir a milisegundos
            } else {
              message.timestamp = Date.now(); // Usar timestamp actual si no existe
            }
            
            const senderInfo = {
              wa_id: message.from,
              profile: change.value.contacts && change.value.contacts[0] ? 
                change.value.contacts[0] : { name: message.from }
            };
            
            try {
              // Procesar el mensaje a través del messageHandler
              await messageHandler.handleIncomingMessage(message, senderInfo);
              isValidMessage = true;
            } catch (err) {
              console.error(`❌ Error al procesar mensaje [ID: ${message.id}]:`, err);
            }
          }
        }
      }
      
      // Para formato nuevo directo en el valor
      if (entry.value && entry.value.messages && Array.isArray(entry.value.messages)) {
        for (const message of entry.value.messages) {
          // Solo procesar mensajes con ID y timestamp válidos
          if (!message.id) continue;
          
          // Añadir el timestamp al objeto message para validación posterior
          if (message.timestamp) {
            message.timestamp = parseInt(message.timestamp) * 1000; // Convertir a milisegundos
          } else {
            message.timestamp = Date.now(); // Usar timestamp actual si no existe
          }
          
          const senderInfo = {
            wa_id: message.from,
            profile: entry.value.contacts && entry.value.contacts[0] ? 
              entry.value.contacts[0] : { name: message.from }
          };
          
          try {
            // Procesar el mensaje a través del messageHandler
            await messageHandler.handleIncomingMessage(message, senderInfo);
            isValidMessage = true;
          } catch (err) {
            console.error(`❌ Error al procesar mensaje [ID: ${message.id}]:`, err);
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
}

  verifyWebhook(req, res) {
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

  // Función para calcular un hash único para un webhook
  calculateWebhookHash(webhookData) {
    try {
      // Extraer IDs de mensajes y timestamps
      const messageIds = [];
      let entries = webhookData.entry || [];
      
      for (const entry of entries) {
        if (!entry.changes) continue;
        
        for (const change of entry.changes) {
          if (!change.value || !change.value.messages) continue;
          
          for (const message of change.value.messages) {
            if (message.id) {
              messageIds.push(message.id);
            }
          }
        }
      }
      
      if (messageIds.length === 0) {
        // Si no hay mensajes, usar toda la estructura
        return JSON.stringify(webhookData);
      }
      
      // Devolver un identificador único basado en los IDs de los mensajes
      return messageIds.sort().join('|');
    } catch (e) {
      // En caso de error, usar un método más simple
      return JSON.stringify(webhookData).substring(0, 100);
    }
  }
}

export default new WebhookController();