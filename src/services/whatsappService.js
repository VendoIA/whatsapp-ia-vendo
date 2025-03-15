// Reemplaza todo el archivo whatsappService.js con esta versión completa
import axios from 'axios';
import dotenv from 'dotenv';

// Asegurarse de que las variables de entorno están cargadas
dotenv.config();

// Extraer y validar token de WhatsApp
const API_TOKEN = process.env.API_TOKEN || 'EAAG5ADAQizcBO0dNGjnN6LdeFZBh9E8tJYiV4Emk4UZBdhEDUPmcxZBspPzZCwC5O3cMtcim3KO1jNSTNQD3ISNavSOZCY4RwwniSJPKZCelBf7yi7UX95flxVo0z7tZBfErlFj3JvZClPfHMWEkcnlQtbVt13W3q486rhMz6s0uVFX2UOrjjbZAcsqQAyE2Ib9XOBVP7h3unxAoGZCBmOwXY1Wr6l2n3Lcv5gjIAZD';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '590286364165416';
const BASE_URL = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

// Verificar configuración
if (API_TOKEN === 'EAAG5ADAQizcBO0dNGjnN6LdeFZBh9E8tJYiV4Emk4UZBdhEDUPmcxZBspPzZCwC5O3cMtcim3KO1jNSTNQD3ISNavSOZCY4RwwniSJPKZCelBf7yi7UX95flxVo0z7tZBfErlFj3JvZClPfHMWEkcnlQtbVt13W3q486rhMz6s0uVFX2UOrjjbZAcsqQAyE2Ib9XOBVP7h3unxAoGZCBmOwXY1Wr6l2n3Lcv5gjIAZD') {
  console.log("⚠️ Usando token de WhatsApp predeterminado, considera configurar uno personalizado en .env");
}

const whatsappService = {
  async sendMessage(to, text, messageId) {
    // Sanitizar el texto de entrada - MEJORA CRÍTICA
    const sanitizedText = this.sanitizeText(text);
    
    try {
      // Verificar que el texto no esté vacío
      if (!sanitizedText || sanitizedText.trim() === '') {
        console.error('❌ ERROR: Intentando enviar un mensaje con texto vacío');
        // Si está vacío, enviar un mensaje predeterminado
        text = "Lo siento, no pude generar una respuesta apropiada. ¿Puedo ayudarte de otra manera?";
      }

      console.log(`📲 Enviando mensaje a ${to}: "${sanitizedText.substring(0, 50)}${sanitizedText.length > 50 ? '...' : ''}"`);
      
      const body = {
        messaging_product: 'whatsapp',
        to: to,
        text: { body: sanitizedText } // Usar el texto sanitizado
      };

      // Añadir context solo si messageId está presente
      if (messageId) {
        body.context = {
          message_id: messageId
        };
      }

      console.log('📤 Datos del mensaje:', JSON.stringify(body, null, 2));
      
      const response = await axios.post(
        BASE_URL,
        body,
        {
          headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`✅ Mensaje enviado correctamente:`, response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error sending message:', error);
      
      // Intento adicional con un mensaje simplificado si falla
      if (sanitizedText && sanitizedText.length > 250) {
        try {
          console.log('🔄 Intentando nuevamente con un mensaje más corto...');
          const shortText = sanitizedText.substring(0, 200) + "... (Mensaje truncado)";
          
          const simpleBody = {
            messaging_product: 'whatsapp',
            to: to,
            text: { body: shortText }
          };
          
          if (messageId) {
            simpleBody.context = { message_id: messageId };
          }
          
          const retryResponse = await axios.post(
            BASE_URL,
            simpleBody,
            {
              headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log('✅ Mensaje simplificado enviado correctamente:', retryResponse.data);
          return retryResponse.data;
        } catch (retryError) {
          console.error('❌ Error al enviar mensaje simplificado:', retryError);
        }
      }
      
      throw error;
    }
  },

  // Método para sanitizar texto y prevenir errores de WhatsApp API
  sanitizeText(text) {
    if (!text) return "Lo siento, ocurrió un error al generar el mensaje.";
    
    // Convertir a string si no lo es
    const textStr = String(text);
    
    // Remover caracteres especiales problemáticos
    return textStr
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Caracteres de control
      .replace(/\u200B/g, '') // Zero-width space
      .replace(/\uFEFF/g, '') // BOM
      .trim();
  },

  async markAsRead(messageId) {
    // Si no se proporciona un messageId, no hacer nada
    if (!messageId) {
      console.log("⚠️ Se intentó marcar como leído sin ID de mensaje");
      return { success: false, error: "No message ID provided" };
    }
    
    try {
      console.log(`📖 Intentando marcar mensaje como leído: ${messageId}`);
      
      const response = await axios.post(
        BASE_URL,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId
        },
        {
          headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('✅ Mensaje marcado como leído');
      return { success: true, data: response.data };
    } catch (error) {
      // Verificar si es un error de permisos de WhatsApp
      const isPermissionError = 
        error.response?.data?.error?.message?.includes("permission") ||
        error.response?.headers?.['www-authenticate']?.includes("permission");
      
      if (isPermissionError) {
        console.log("⚠️ Error de permisos al marcar como leído: La aplicación no tiene permisos para esta acción");
        console.log("ℹ️ Para habilitar esta función, verifica los permisos de tu aplicación en WhatsApp Business API");
        // No interrumpir el flujo por este error específico
        return { 
          success: false, 
          error: "Permission denied", 
          info: "This feature requires additional permissions in WhatsApp Business API"
        };
      } else {
        // Para otros errores, registrar pero no interrumpir
        console.error('❌ Error al marcar como leído:', error.message);
        return { success: false, error: error.message };
      }
    }
  },

  async sendMediaMessage(to, type, url, caption, messageId) {
    try {
      console.log(`📤 Enviando mensaje multimedia tipo ${type} a ${to}`);
      
      const body = {
        messaging_product: 'whatsapp',
        to: to,
        type: type,
        [type]: {
          link: url,
          caption: this.sanitizeText(caption || ''),
          filename: type === 'document' ? 'CatalogoDommo.pdf' : undefined
        }
      };

      // Añadir context solo si messageId está presente
      if (messageId) {
        body.context = {
          message_id: messageId
        };
      }

      console.log('📤 Datos del mensaje multimedia:', JSON.stringify(body, null, 2));

      const response = await axios.post(
        BASE_URL,
        body,
        {
          headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('✅ Mensaje multimedia enviado correctamente');
      return response.data;
    } catch (error) {
      console.error('❌ Error al enviar mensaje multimedia:', error);
      
      // Fallback a mensaje de texto si falla el envío multimedia
      try {
        console.log('🔄 Intentando enviar enlace como texto plano...');
        const fallbackText = `No pude enviar el archivo directamente, pero puedes descargarlo en este enlace:\n\n${url}`;
        
        await this.sendMessage(to, fallbackText, messageId);
        console.log('✅ Enlace enviado como texto plano');
        
        return { success: true, fallback: true };
      } catch (fallbackError) {
        console.error('❌ Error al enviar fallback de texto:', fallbackError);
      }
      
      throw error;
    }
  },

  // Método para simular indicador de escritura
  async simulateTyping(to, messageId) {
    try {
      console.log(`⌨️ Simulando indicador de escritura para ${to}`);
      
      const body = {
        messaging_product: 'whatsapp',
        to: to,
        status: 'typing'
      };
      
      if (messageId) {
        body.context = {
          message_id: messageId
        };
      }
      
      const response = await axios.post(
        BASE_URL,
        body,
        {
          headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('✅ Indicador de escritura enviado');
      return response.data;
    } catch (error) {
      console.error('❌ Error al simular escritura:', error);
      // No propagar el error
      return { success: false };
    }
  }
};

export default whatsappService;