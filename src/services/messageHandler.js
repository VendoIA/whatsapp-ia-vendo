// src/services/messageHandler.js - VERSIÓN CORREGIDA
import whatsappService from './whatsappService.js';
import appendToSheet from './googleSheetsService.js';
import OpenAiService from './improvedDeepseekService.js';
import { google } from 'googleapis';
import path from 'path';
import config from '../config/env.js';

// Buffer para mensajes consecutivos del mismo usuario
// Clase MessageBuffer completa mejorada
class MessageBuffer {
  constructor() {
    this.buffers = {};
    this.timeoutIds = {};
    this.WAIT_TIME = 35000; // 35 segundos (aumentado de 20 para mejor experiencia)
  }

  /**
   * Añade un mensaje al buffer
   */
  addMessage(userId, message, callback, waitTime = null) {
    // Verificación de seguridad para el mensaje
    if (!message || !message.text || !message.text.body) {
      console.error(`❌ Error: Mensaje inválido para usuario ${userId}`);
      return true; // Procesar inmediatamente para evitar errores
    }
    
    const messageText = message.text.body.trim();
    
    // Detectar saludos simples para respuesta inmediata
    if (this.isSimpleGreeting(messageText)) {
      console.log(`👋 Detectado saludo simple, procesando inmediatamente: "${messageText}"`);
      return true; // Procesar inmediatamente
    }
    
    // Cancelar temporizador existente
    if (this.timeoutIds[userId]) {
      clearTimeout(this.timeoutIds[userId]);
      delete this.timeoutIds[userId];
    }
    
    // Inicializar buffer si no existe
    if (!this.buffers[userId]) {
      this.buffers[userId] = {
        messages: [],
        messageObjects: [],
        lastTimestamp: Date.now(),
        currentState: null,
        originalMessageId: null
      };
    }
    
    // Guardar ID del mensaje original
    if (this.buffers[userId].messages.length === 0) {
      this.buffers[userId].originalMessageId = message.id;
    }
    
    // Añadir mensaje al buffer
    this.buffers[userId].messages.push(messageText);
    this.buffers[userId].messageObjects.push(message);
    this.buffers[userId].lastTimestamp = Date.now();
    
    // Verificar si debemos procesar ahora
    if (this.isCompleteMessage(messageText, this.buffers[userId].currentState)) {
      console.log(`✅ Mensaje completo detectado, procesando inmediatamente: "${messageText}"`);
      const combinedMessage = this.getCombinedMessage(userId);
      callback(combinedMessage);
      return false; // Ya se procesó con el callback
    }
    
    // Configurar temporizador
    const effectiveWaitTime = waitTime || this.WAIT_TIME;
    this.timeoutIds[userId] = setTimeout(() => {
      if (this.buffers[userId] && this.buffers[userId].messages.length > 0) {
        console.log(`⏱️ Tiempo de buffer expirado para ${userId}, procesando mensajes combinados`);
        const combinedMessage = this.getCombinedMessage(userId);
        callback(combinedMessage);
      }
      delete this.timeoutIds[userId];
    }, effectiveWaitTime);
    
    console.log(`📥 Mensaje añadido al buffer para ${userId}, esperando más mensajes o timeout`);
    return false; // No procesar ahora, queda en buffer
  }

  /**
   * Obtiene mensaje combinado
   */
  getCombinedMessage(userId) {
    if (!this.buffers[userId] || !this.buffers[userId].messages || this.buffers[userId].messages.length === 0) {
      return null;
    }
    
    const buffer = this.buffers[userId];
    
    // Si solo hay un mensaje, devolver el original sin modificar
    if (buffer.messages.length === 1 && buffer.messageObjects.length === 1) {
      const originalMessage = { ...buffer.messageObjects[0] };
      
      // Limpiar buffer
      this.buffers[userId] = {
        messages: [],
        messageObjects: [],
        lastTimestamp: Date.now(),
        currentState: buffer.currentState,
        originalMessageId: null
      };
      
      return originalMessage;
    }
    
    // Crear mensaje combinado para múltiples mensajes
    const combinedText = buffer.messages.join(' ');
    
    // Crear objeto de respuesta basado en el primer mensaje original
    const firstMessage = buffer.messageObjects[0];
    const combinedMessage = {
      id: buffer.originalMessageId,
      from: firstMessage.from,
      timestamp: buffer.lastTimestamp,
      type: 'text',
      text: {
        body: combinedText
      },
      _combined: true,
      _originalCount: buffer.messages.length,
      _originalMessages: [...buffer.messageObjects]
    };
    
    // Limpiar buffer
    this.buffers[userId] = {
      messages: [],
      messageObjects: [],
      lastTimestamp: Date.now(),
      currentState: buffer.currentState,
      originalMessageId: null
    };
    
    console.log(`🔄 Mensajes combinados para ${userId}: "${combinedText}" (${buffer.messages.length} mensajes)`);
    return combinedMessage;
  }

  /**
   * Actualiza estado actual
   */
  updateState(userId, state) {
    if (!userId) {
      console.log("⚠️ updateState llamado con userId inválido");
      return;
    }

    // Inicializar buffer si no existe
    if (!this.buffers[userId]) {
      this.buffers[userId] = {
        messages: [],
        messageObjects: [],
        lastTimestamp: Date.now(),
        currentState: null,
        originalMessageId: null
      };
    }
    
    // Actualizar estado
    if (typeof state === 'string') {
      this.buffers[userId].currentState = state;
    } else if (typeof state === 'object' && state !== null) {
      this.buffers[userId].currentState = state.step || null;
    }
    
    console.log(`🔄 Estado actualizado para ${userId}: ${this.buffers[userId].currentState}`);
  }

  /**
   * Determina si un mensaje está completo y debe procesarse
   */
  isCompleteMessage(text, currentState) {
    // Si es muy corto, esperar más mensajes
    if (text.length <= 25) {
       // Si parece ser una continuación del mensaje anterior (ej: "Cumple 50 años")
    // no debe tratarse como un mensaje completo
      return false;
    }
    
    // Mensajes con preguntas completas
    if (/\b(cómo|como|qué|que|cuál|cual|cuánto|cuanto|dónde|donde|cuándo|cuando).+\?/.test(text)) {
      return true;
    }
    
    // Mensajes directos de solicitud
    if (/\b(quiero|necesito|dame|envía|envia|manda|busco|por favor)\s+.{10,}/.test(text)) {
      return true;
    }
    
    // Mensajes largos probablemente son completos
    if (text.length > 60) return true;
    
    // Mensajes con signos de puntuación al final
    if (text.endsWith('.') || text.endsWith('!') || text.endsWith('?')) return true;
    
    // Respuestas según el contexto
    if (currentState === 'name' && text.includes(' ') && text.length > 10) return true;
    if ((currentState === 'address' || currentState === 'direccion') && /\d+/.test(text) && text.length > 15) return true;
    if (currentState === 'confirmacion' && /(si|sí|no|claro|ok)/.test(text.toLowerCase())) return true;
    
    return false;
  }

  /**
   * Detecta si es un saludo simple
   */
  isSimpleGreeting(message) {
    if (!message || typeof message !== 'string') return false;
    
    const messageLower = message.toLowerCase().trim();
    const simpleGreetings = [
      'hola', 'hello', 'hi', 'hey', 'buenas', 'buen dia', 
      'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches',
      'saludos', 'que tal', 'qué tal', 'ola', 'ey', 'como estas', 'cómo estás'
    ];
    
    // Es un saludo simple si es exactamente uno de los saludos o comienza con él
    // y es un mensaje corto (menos de 25 caracteres)
    const isSimple = (
      simpleGreetings.includes(messageLower) || 
      simpleGreetings.some(greeting => 
        messageLower === greeting || 
        messageLower === greeting + '!' ||
        messageLower.startsWith(greeting + ' ')
      ) && message.length < 25
    );
    
    if (isSimple) {
      console.log(`🔎 Detectado saludo simple: "${message}"`);
    }
    
    return isSimple;
  }

  /**
   * Limpia buffers antiguos
   */
  cleanup() {
    const now = Date.now();
    const expiredTime = 30 * 60 * 1000; // 30 minutos
    
    Object.keys(this.buffers).forEach(userId => {
      if (now - this.buffers[userId].lastTimestamp > expiredTime) {
        // Limpiar buffer antiguo
        delete this.buffers[userId];
        
        // Limpiar temporizador si existe
        if (this.timeoutIds[userId]) {
          clearTimeout(this.timeoutIds[userId]);
          delete this.timeoutIds[userId];
        }
        
        console.log(`🧹 Buffer antiguo limpiado para ${userId}`);
      }
    });
  }
}

// Clase para humanizar respuestas
class HumanLikeUtils {
  // Añadir variabilidad en respuestas
  static addResponseVariability(response) {
    // Eliminar repeticiones de mensajes comunes
    const commonPhrases = [
      "¿En qué más puedo ayudarte?",
      "¿Hay algo más en lo que pueda ayudarte?",
      "¿Necesitas algo más?"
    ];
    
    let cleanedResponse = response;
    
    commonPhrases.forEach(phrase => {
      // Solo eliminar si está al final
      if (cleanedResponse.endsWith(phrase)) {
        cleanedResponse = cleanedResponse.substring(0, cleanedResponse.length - phrase.length).trim();
      }
    });
    
    // Variedad de puntuación - a veces usar '...' en lugar de '.'
    if (Math.random() > 0.85) {
      cleanedResponse = cleanedResponse.replace(/\.\s+([A-Z])/g, '... $1');
    }
    
    // Añadir pequeñas pausas ocasionales con puntos suspensivos (simular pensamiento humano)
    if (Math.random() > 0.7) {
      const sentences = cleanedResponse.split('. ');
      if (sentences.length > 1) {
        const randomIndex = Math.floor(Math.random() * (sentences.length - 1));
        sentences[randomIndex] = sentences[randomIndex] + "...";
        cleanedResponse = sentences.join('. ');
      }
    }
    
    return cleanedResponse;
  }

   // Añadir "errores humanos" ocasionales y correcciones
   static addHumanLikeErrors(response) {
    // Solo aplicar ocasionalmente (15% del tiempo)
    if (Math.random() > 0.85) {
      // Patrones de error más realistas basados en comportamiento humano real
      const errorPatterns = [
        // Errores de tipeo de teclas adyacentes
        {pattern: /ción/g, replacement: "ciin", prob: 0.3},
        {pattern: /mente/g, replacement: "mentr", prob: 0.3},
        {pattern: /que/g, replacement: "qur", prob: 0.2},
        // Errores de autocorrector
        {pattern: /envío/g, replacement: "envió", prob: 0.4},
        {pattern: /gustaría/g, replacement: "gustaria", prob: 0.4},
        // Faltas de acentos
        {pattern: /más/g, replacement: "mas", prob: 0.5},
        {pattern: /está/g, replacement: "esta", prob: 0.5},
        // Errores de espaciado como hacen los humanos
        {pattern: / /g, replacement: "  ", prob: 0.1}, // Doble espacio ocasional
        {pattern: /\./g, replacement: ". ", prob: 0.3}, // Espacio después de punto
        // Errores comunes al escribir rápido
        {pattern: /para/g, replacement: "pra", prob: 0.15},
        {pattern: /cuando/g, replacement: "cuadno", prob: 0.2},
        {pattern: /donde/g, replacement: "doned", prob: 0.2}
      ];
      
      // Aplicar un patrón de error aleatorio con más inteligencia
      // Elegir un patrón de error basado en lo que sería más natural para este mensaje
      const potentialPatterns = errorPatterns.filter(pattern => 
        response.match(pattern.pattern) && Math.random() < pattern.prob
      );
      
      if (potentialPatterns.length > 0) {
        const selectedPattern = potentialPatterns[Math.floor(Math.random() * potentialPatterns.length)];
        
        // Aplicar solo en la primera ocurrencia para que parezca más natural
        let modifiedResponse = response.replace(selectedPattern.pattern, (match, offset) => {
          // No modificar al principio de la frase (menos natural)
          if (offset < 10 && Math.random() > 0.3) return match;
          
          // 50% de probabilidad de añadir autocorrección al estilo humano
          if (Math.random() > 0.5) {
            return selectedPattern.replacement + "* " + match;
          }
          return selectedPattern.replacement;
        });
        
        return modifiedResponse;
      }
    }
    
    // Simular un error y corrección humana en frases más largas
    const sentences = response.split('. ');
    if (sentences.length > 1) {
      const randomIndex = Math.floor(Math.random() * sentences.length);
      const sentence = sentences[randomIndex];
      
      // Solo considerar oraciones suficientemente largas
      if (sentence.length > 15) {
        const words = sentence.split(' ');
        if (words.length > 3) {
          const randomWordIndex = Math.floor(Math.random() * (words.length - 1)) + 1;
          const originalWord = words[randomWordIndex];
          
          // No modificar palabras muy cortas o al principio de la oración
          if (originalWord.length > 3 && randomWordIndex > 0) {
            // Crear un typo simple (como una letra cambiada)
            const typoWord = this.createTypo(originalWord);
            
            // Reemplazar con el typo y la corrección
            words[randomWordIndex] = typoWord + "* " + originalWord;
            sentences[randomIndex] = words.join(' ');
            
            return sentences.join('. ');
          }
        }
      }
    }
    
    return response;
  }
  
  // Método auxiliar para crear un typo realista
  static createTypo(word) {
    if (word.length <= 3) return word; // Palabras muy cortas no se modifican
    
    const typoTypes = [
      // Intercambiar letras adyacentes
      () => {
        const pos = Math.floor(Math.random() * (word.length - 2)) + 1;
        return word.substring(0, pos) + word.charAt(pos + 1) + word.charAt(pos) + word.substring(pos + 2);
      },
      // Omitir una letra
      () => {
        const pos = Math.floor(Math.random() * (word.length - 1)) + 1;
        return word.substring(0, pos) + word.substring(pos + 1);
      },
      // Duplicar una letra
      () => {
        const pos = Math.floor(Math.random() * (word.length - 1));
        return word.substring(0, pos) + word.charAt(pos) + word.charAt(pos) + word.substring(pos + 1);
      },
      // Reemplazar con letra cercana en el teclado
      () => {
        const keyboards = {
          'a': 'sq', 'b': 'vn', 'c': 'xv', 'd': 'sf', 'e': 'wr', 'f': 'dg', 'g': 'fh',
          'h': 'gj', 'i': 'uo', 'j': 'hk', 'k': 'jl', 'l': 'kñ', 'm': 'n', 'n': 'bm',
          'o': 'ip', 'p': 'oñ', 'q': 'wa', 'r': 'et', 's': 'ad', 't': 'ry', 'u': 'yi',
          'v': 'cb', 'w': 'qe', 'x': 'zc', 'y': 'tu', 'z': 'xs'
        };
        
        const pos = Math.floor(Math.random() * word.length);
        const char = word.charAt(pos).toLowerCase();
        const replacements = keyboards[char];
        
        if (replacements) {
          const newChar = replacements.charAt(Math.floor(Math.random() * replacements.length));
          return word.substring(0, pos) + newChar + word.substring(pos + 1);
        }
        return word;
      }
    ];
    
    // Elegir un tipo de error aleatorio
    const typoFunc = typoTypes[Math.floor(Math.random() * typoTypes.length)];
    return typoFunc();
  }

  // Usar muletillas y expresiones informales ocasionalmente
  static addConversationalFillers(response, userData) {
    // Solo aplicar a veces (40% del tiempo)
    if (Math.random() > 0.6) {
      const fillers = [
        "Mira, ",
        "Verás, ",
        "Pues bien, ",
        "Bueno, ",
        "A ver, ",
        "Mmm, ",
        "Déjame ver... ",
        "Vamos a ver, "
      ];
      
      // Seleccionar una muletilla aleatoria
      const randomFiller = fillers[Math.floor(Math.random() * fillers.length)];
      
      // Aplicar al principio de la respuesta con primera letra minúscula
      if (response.length > 0) {
        return randomFiller + response.charAt(0).toLowerCase() + response.slice(1);
      }
    }
    
    // Añadir el nombre del usuario ocasionalmente si lo tenemos
    if (userData && userData.name && Math.random() > 0.7) {
      // Añadir nombre al final o al principio alternando
      if (Math.random() > 0.5) {
        return `${userData.name}, ${response}`;
      } else {
        return `${response} ${userData.name}`;
      }
    }
    
    return response;
  }

  // CORREGIDO: Mejorar percepción de tiempo humano (sin usar API de typing)
  static async simulateTypingIndicator(messageLength, messageComplexity = 'normal') {
    try {
      // Parámetros para simular tiempos de escritura humanos
      const baseDelay = messageComplexity === 'complex' ? 1500 : 1000;
      const charsPerSecond = messageComplexity === 'complex' ? 5 : 8;
      
      // Longitud mínima para evitar problemas con mensajes vacíos
      const safeLength = Math.max(messageLength || 10, 10);
      
      // Calcular tiempo total que tomaría escribir este mensaje
      let typingTime = baseDelay + (safeLength / charsPerSecond) * 1000;
      
      // Añadir variabilidad (las personas no escriben a un ritmo constante)
      const variabilityFactor = 0.8 + (Math.random() * 0.4);
      typingTime *= variabilityFactor;
      
      // Limitar el tiempo máximo para no aburrir al usuario
      const maxTypingTime = 5000; // 5 segundos máximo
      typingTime = Math.min(typingTime, maxTypingTime);
      
      console.log(`💬 Simulando escritura por ${Math.round(typingTime/1000)} segundos...`);
      
      // Simplemente esperar el tiempo calculado
      await new Promise(resolve => setTimeout(resolve, typingTime));
      
      return true;
    } catch (error) {
      console.error("Error al simular tiempo de escritura:", error);
      return false;
    }
  }
  
  // Método integrado para generar respuestas humanizadas
  static generateHumanResponse(response, userData = null) {
    let humanizedResponse = response;
    
    // 1. Añadir variabilidad natural (10% del tiempo)
    if (Math.random() > 0.9) {
      const variabilityPatterns = [
        // Personas reales repiten palabras ocasionalmente
        {from: /muy/, to: "muy muy", prob: 0.3},
        // Uso incorrecto de puntuación
        {from: /\.\s+/, to: "... ", prob: 0.2},
        // Errores comunes en español
        {from: /con el/, to: "con el el", prob: 0.2},
        {from: /para/, to: "pra", prob: 0.1},
        // Autocorrector típico
        {from: /ha/, to: "ja", prob: 0.1}
      ];
      
      // Seleccionar un patrón aleatorio
      for (const pattern of variabilityPatterns) {
        if (Math.random() < pattern.prob && humanizedResponse.includes(pattern.from)) {
          humanizedResponse = humanizedResponse.replace(pattern.from, pattern.to);
          break; // Solo aplicar un error por mensaje
        }
      }
    }
    
    // 2. Añadir emojis ocasionales (pero no demasiados)
    if (Math.random() > 0.7 && !humanizedResponse.includes('🌹')) {
      const emojis = ['😊', '👍', '🌷', '🌹', '💐', '✨'];
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      
      // Añadir emoji al final de una oración, no al final del mensaje completo
      const sentences = humanizedResponse.split('. ');
      if (sentences.length > 1) {
        const randomSentence = Math.floor(Math.random() * sentences.length);
        sentences[randomSentence] = sentences[randomSentence] + ' ' + emoji;
        humanizedResponse = sentences.join('. ');
      }
    }
    
    // 3. Añadir muletillas ocasionales si tenemos el nombre del usuario
    if (userData && userData.name && Math.random() > 0.8) {
      if (Math.random() > 0.5) {
        // Añadir el nombre al principio
        humanizedResponse = `${userData.name}, ${humanizedResponse.charAt(0).toLowerCase()}${humanizedResponse.slice(1)}`;
      } else {
        // Añadir confirmación con nombre al final
        const lastChar = humanizedResponse.charAt(humanizedResponse.length - 1);
        // Si ya termina con signo de interrogación, no agregar otro
        if (lastChar === '?') {
          // Insertar el nombre antes del signo de interrogación
          humanizedResponse = humanizedResponse.slice(0, -1) + `, ${userData.name}?`;
        } else {
          humanizedResponse = `${humanizedResponse} ¿De acuerdo, ${userData.name}?`;
        }
      }
    }
    
    // 4. Aplicar variabilidad de respuesta estándar
    humanizedResponse = this.addResponseVariability(humanizedResponse);
    
    // 5. Ocasionalmente añadir errores humanos (15% del tiempo)
    if (Math.random() > 0.85) {
      humanizedResponse = this.addHumanLikeErrors(humanizedResponse);
    }
    
    return humanizedResponse;
  }

  // Método para simular una respuesta "pensada" con tiempos variables
  static async simulateHumanResponse(response, userData = null, options = {}) {
    // Determinar complejidad del mensaje
    const complexity = options.complexity || 
                      (response.length > 100 ? 'complex' : 'normal');
                      
    // 1. Generar contenido humanizado
    const humanizedContent = this.generateHumanResponse(response, userData);
    
    // 2. Calcular y aplicar retraso realista
    await this.simulateTypingIndicator(humanizedContent.length, complexity);
    
    // 3. Devolver el contenido humanizado después del retraso
    return humanizedContent;
  }
  
  // Método para detectar si un mensaje requiere una respuesta rápida
  static requiresQuickResponse(message) {
    const urgentKeywords = [
      'urgente', 'rápido', 'necesito ahora', 'emergencia', 'ya mismo',
      'pronto', 'inmediato', 'ayuda', 'ayúdame', 'problema'
    ];
    
    const messageLower = message.toLowerCase();
    return urgentKeywords.some(keyword => messageLower.includes(keyword));
  }
  
  // Método para determinar la complejidad de un mensaje
  static getMessageComplexity(message) {
    // Mensajes más largos tienden a ser más complejos
    if (message.length > 150) return 'complex';
    
    // Mensajes con muchas comas o puntos suelen ser elaborados
    const punctuationCount = (message.match(/[,.;:]/g) || []).length;
    if (punctuationCount > 5) return 'complex';
    
    // Preguntas técnicas o específicas
    const technicalWords = [
      'precio', 'costo', 'tamaño', 'medida', 'material', 'duración',
      'garantía', 'proceso', 'envío', 'entrega', 'pago', 'método'
    ];
    
    const messageLower = message.toLowerCase();
    const hasTechnicalContent = technicalWords.some(word => messageLower.includes(word));
    
    if (hasTechnicalContent && message.length > 50) return 'complex';
    
    return 'normal';
  }

  // Método para hacer que las respuestas a consultas similares varíen
  static introduceResponseVariation(response, userId, messageType) {
    // Mantener un registro de respuestas anteriores para evitar repetición
    if (!this.previousResponses) {
      this.previousResponses = new Map();
    }
    
    const userResponses = this.previousResponses.get(userId) || [];
    
    // Comprobar si una respuesta similar se ha enviado recientemente
    const similarResponses = userResponses.filter(prevResponse => {
      // Calcular similitud usando la distancia de Levenshtein simplificada
      const similarity = this.calculateSimilarity(prevResponse.text, response);
      return similarity > 0.7; // Si es más del 70% similar
    });
    
    if (similarResponses.length > 0 && response.length > 30) {
      console.log("🔄 Detectada respuesta similar, introduciendo variación");
      
      // Técnicas para variar la respuesta
      const variationTechniques = [
        // Reorganizar estructura
        (text) => {
          const sentences = text.split('. ').filter(s => s.length > 0);
          if (sentences.length <= 1) return text;
          
          // Reordenar algunas oraciones si hay suficientes
          if (sentences.length > 2) {
            const firstSentence = sentences[0];
            sentences[0] = sentences[1];
            sentences[1] = firstSentence;
          }
          
          return sentences.join('. ');
        },
        
        // Añadir o quitar expresiones conversacionales
        (text) => {
          const conversationalStarters = ["¡Por supuesto! ", "Claro, ", "Desde luego, ", "Mira, ", "Verás, "];
          const starter = conversationalStarters[Math.floor(Math.random() * conversationalStarters.length)];
          
          // Si ya tiene un inicio conversacional, quitarlo, de lo contrario añadirlo
          if (text.match(/^(¡|Claro|Por supuesto|Mira|Verás)/)) {
            return text.replace(/^(¡[^!]+!|Claro,|Por supuesto,|Mira,|Verás,)\s+/, '');
          } else {
            return starter + text.charAt(0).toLowerCase() + text.slice(1);
          }
        },
        
        // Cambiar el tono (más formal o más casual)
        (text) => {
          // Versión más casual
          if (Math.random() > 0.5) {
            return text.replace(/disponemos de/g, "tenemos")
                      .replace(/adquirir/g, "comprar")
                      .replace(/notificar/g, "avisar")
                      .replace(/solicitar/g, "pedir");
          } 
          // Versión más formal
          else {
            return text.replace(/tenemos/g, "disponemos de")
                      .replace(/comprar/g, "adquirir")
                      .replace(/avisar/g, "notificar")
                      .replace(/pedir/g, "solicitar");
          }
        }
      ];
      
      // Aplicar técnicas de variación aleatorias
      const numTechniques = 1 + Math.floor(Math.random() * 2); // Aplicar 1-2 técnicas
      let variedResponse = response;
      
      for (let i = 0; i < numTechniques; i++) {
        const technique = variationTechniques[Math.floor(Math.random() * variationTechniques.length)];
        variedResponse = technique(variedResponse);
      }
      
      // Registrar esta nueva respuesta
      userResponses.push({
        text: variedResponse,
        timestamp: Date.now(),
        type: messageType
      });
      
      // Limitar el historial de respuestas
      while (userResponses.length > 10) {
        userResponses.shift();
      }
      
      this.previousResponses.set(userId, userResponses);
      return variedResponse;
    }
    
    // Si no hay similitud, simplemente registrar y devolver la respuesta original
    userResponses.push({
      text: response,
      timestamp: Date.now(),
      type: messageType
    });
    
    while (userResponses.length > 10) {
      userResponses.shift();
    }
    
    this.previousResponses.set(userId, userResponses);
    return response;
  }
  
  // Método para registrar cuándo se envió la última respuesta a un usuario
  static trackResponseTime(userId) {
    if (!this.lastResponseTimes) {
      this.lastResponseTimes = new Map();
    }
    this.lastResponseTimes.set(userId, Date.now());
  }
  
  // Método auxiliar para calcular similitud entre textos
  static calculateSimilarity(text1, text2) {
    // Si alguno de los textos es vacío, no hay similitud
    if (!text1 || !text2) return 0;
    
    // Normalizar textos (minúsculas, sin acentos, sin signos de puntuación)
    const normalize = (text) => {
      return text
        .toLowerCase()
        .normalize("NFD") // Descomponer acentos
        .replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") // Eliminar puntuación
        .replace(/\s{2,}/g, " "); // Eliminar espacios múltiples
    };
    
    const normalizedText1 = normalize(text1);
    const normalizedText2 = normalize(text2);
    
    // Obtener palabras únicas de cada texto
    const words1 = new Set(normalizedText1.split(/\s+/));
    const words2 = new Set(normalizedText2.split(/\s+/));
    
    // Contar palabras en común
    let commonWords = 0;
    for (const word of words1) {
      if (words2.has(word)) {
        commonWords++;
      }
    }
    
    // Calcular coeficiente de Jaccard
    const totalWords = words1.size + words2.size - commonWords;
    if (totalWords === 0) return 0;
    
    return commonWords / totalWords;
  }
}

// Clase para gestionar perfiles de usuario
class UserProfileManager {
  constructor() {
    this.userProfiles = {};
  }
  
  // Actualizar perfil de usuario con nueva información
  updateUserProfile(userId, newInfo) {
    if (!this.userProfiles[userId]) {
      this.userProfiles[userId] = {
        createdAt: new Date(),
        interactions: 0,
        preferences: {},
        lastInteraction: new Date(),
        knownInfo: {}
      };
    }
    
    const profile = this.userProfiles[userId];
    profile.interactions += 1;
    profile.lastInteraction = new Date();
    
    // Actualizar información conocida
    if (newInfo) {
      profile.knownInfo = { ...profile.knownInfo, ...newInfo };
    }
    
    return profile;
  }
  
  // Extraer información para personalizar mensajes
  getPersonalizationData(userId) {
    const profile = this.userProfiles[userId];
    if (!profile) return null;
    
    // Determinar familiaridad basada en número de interacciones
    let familiarity = 'new'; // < 3 interacciones
    if (profile.interactions > 10) {
      familiarity = 'familiar'; // > 10 interacciones
    } else if (profile.interactions > 3) {
      familiarity = 'returning'; // Entre 3-10 interacciones
    }
    
    // Calcular tiempo desde última interacción
    const hoursSinceLastInteraction = profile.lastInteraction ? 
      Math.round((new Date() - profile.lastInteraction) / (1000 * 60 * 60)) : 0;
    
    // Devolver datos útiles para personalizar
    return {
      name: profile.knownInfo.name,
      familiarity,
      hoursSinceLastInteraction,
      preferences: profile.preferences,
      interactions: profile.interactions
    };
  }
}

// Clase para detectar intenciones avanzadas
class EnhancedIntentDetector {
  // Detecta intención de cancelación
  static isCancellationIntent(message) {
    const cancellationKeywords = [
      'cancelar', 'anular', 'suspender', 'no quiero', 'ya no', 
      'olvidalo', 'olvídalo', 'dejalo', 'déjalo', 'desistir', 
      'retirar pedido', 'quitar pedido', 'eliminar pedido',
      'cambié de opinión', 'cambie de opinion', 'no me interesa ya'
    ];
    
    const messageLower = message.toLowerCase();
    return cancellationKeywords.some(keyword => messageLower.includes(keyword));
  }
  
  // Detecta si el usuario está agradeciendo
  static isThankYouIntent(message) {
    const thankYouKeywords = [
      'gracias', 'muchas gracias', 'te lo agradezco', 'agradecido', 'agradecida',
      'thx', 'thank', 'genial', 'perfecto', 'excelente', 'buenísimo', 'buenisimo',
      'de lujo', 'increíble', 'increible'
    ];
    
    const messageLower = message.toLowerCase();
    return thankYouKeywords.some(keyword => messageLower.includes(keyword));
  }
  
  // Detecta si el usuario está frustrado
  static isFrustrationIntent(message) {
    const frustrationKeywords = [
      'no entiendes', 'no me entiendes', 'no entendiste', 'no es lo que pedí',
      'esto está mal', 'esto esta mal', 'no es correcto', 'error', 'equivocado',
      'frustrante', 'molesto', 'enojado', 'irritado', 'absurdo', 'ridículo',
      'tonto', 'estúpido', 'no sirve', 'no funciona', 'hablar con humano',
      'hablar con persona', 'hablar con alguien real', 'asesor humano', 
      'agente real', 'supervisor', 'queja'
    ];
    
    const messageLower = message.toLowerCase();
    
    // También detectar mensajes cortos en mayúsculas (posible enojo)
    const isAngryShout = messageLower.length > 5 && message === message.toUpperCase();
    
    return frustrationKeywords.some(keyword => messageLower.includes(keyword)) || isAngryShout;
  }
  
  // Detecta si el usuario está consultando estado de pedido
  static isOrderStatusQuery(message) {
    const statusKeywords = [
      'estado de mi pedido', 'estado de pedido', 'mi pedido', 'mi orden',
      'seguimiento', 'tracking', 'cuando llega', 'cuándo llega',
      'estado', 'consultar pedido', 'consultar orden', 'ver pedido',
      'mi compra', 'mis rosas', 'mi entrega', 'dónde está', 'donde esta',
      'ya enviar', 'ya enviaron', 'enviaste', 'entregado'
    ];
    
    const messageLower = message.toLowerCase();
    return statusKeywords.some(keyword => messageLower.includes(keyword));
  }
  
  // NUEVO: Detecta si un mensaje contiene información de dirección
  static isAddressMessage(message) {
    const addressKeywords = [
      'calle', 'carrera', 'avenida', 'diagonal', 'transversal', 'dirección',
      'direccion', 'cr', 'cra', 'cl', 'av', 'diag', 'trans', 'kra', 'enviar a'
    ];
    
    const cityKeywords = [
      'bogota', 'bogotá', 'medellin', 'medellín', 'cali', 'barranquilla',
      'bucaramanga', 'en', 'ciudad'
    ];
    
    const messageLower = message.toLowerCase();
    
    // Patrones de dirección (números seguidos de sufijos comunes)
    const hasAddressPattern = /\d+\s*[a-z]?\s*[\-#]?\s*\d+/i.test(messageLower);
    
    return (
      addressKeywords.some(keyword => messageLower.includes(keyword)) ||
      (hasAddressPattern && cityKeywords.some(city => messageLower.includes(city)))
    );
  }
  
  // NUEVO: Detecta si un mensaje es respuesta a una solicitud previa
  static isResponseToRequest(message, previousQuestion) {
    if (!previousQuestion) return false;
    
    const messageLower = message.toLowerCase();
    const previousLower = previousQuestion.toLowerCase();
    
    // Verificar si es una respuesta directa a preguntas comunes
    if (previousLower.includes('nombre') && /^[A-Za-záéíóúÁÉÍÓÚñÑ\s]{2,30}$/.test(messageLower)) {
      return 'name_response';
    }
    
    if (previousLower.includes('dirección') && EnhancedIntentDetector.isAddressMessage(messageLower)) {
      return 'address_response';
    }
    
    if (previousLower.includes('teléfono') || previousLower.includes('telefono') || 
        previousLower.includes('contacto') || previousLower.includes('whatsapp')) {
      const hasNumbers = /\d+/.test(messageLower);
      if (hasNumbers || messageLower.includes('este') || messageLower.includes('mismo')) {
        return 'contact_response';
      }
    }
    
    return false;
  }
}

// Clase principal de manejo de mensajes con correcciones
class MessageHandler {
  constructor() {
    this.appointmentState = {};
    this.assistantState = {};
    this.interactionCounter = {};
    this.conversationHistory = {}; // Historial de conversación para contexto
    
    // Cache de mensajes procesados para evitar duplicados
    this.processedMessages = new Map();
    
    // Cache de timestamps de mensajes para validación secuencial
    this.messageTimestamps = new Map();
    
    // Inicializar el buffer de mensajes
    this.messageBuffer = new MessageBuffer();
    
    // Inicializar gestor de perfiles de usuario
    this.userProfiles = new UserProfileManager();
    
    // Asegurarse de que estas propiedades estén disponibles
    this.processingMessages = new Map();
    this.MAX_PROCESSING_TIME = 5 * 60 * 1000;
    
    // Cache para órdenes consultadas recientemente
    this.orderCache = {
      orders: {},
      lastFetch: null
    };
      
    // Tiempo de expiración del cache (5 minutos)
    this.CACHE_EXPIRY = 5 * 60 * 1000;
    
    // Configurar limpieza periódica del buffer
    setInterval(() => {
      this.messageBuffer.cleanup();
    }, 5 * 60 * 1000); // Cada 5 minutos

    // Nuevo: Timestamp de último mensaje procesado por usuario
    this.lastProcessedTimestamp = new Map();
    
    // Nuevo: Tiempo de enfriamiento entre mensajes (en milisegundos)
    this.COOLDOWN_TIME = 10000; // 10 segundos
    
    // Base de conocimiento de productos
    this.productKnowledge = {
      // Información general
      general: "Somos una tienda de regalos con sede de despacho en Bogotá a todo el país de Colombia. Ofrecemos rosas preservadas y productos personalizados que duran de 1-4 años. Nuestro lema es 'Regalar es amar'.",
      
      // Categorías de productos
      categorias: "Nuestras categorías principales son: Rosas preservadas, Rosa Santa, Virgen Santa, Rosa Duo y Rosita Eterna.",
      
      // Tamaños disponibles
      tamaños: {
        premium: "30cm de altura, presentación grande en cúpula de cristal con base de madera.",
        mini: "16cm de altura, presentación pequeña en cúpula de cristal con base de madera.",
        rositaEterna: "Tamaño híbrido, con rosa grande como la Premium pero altura reducida como la Mini."
      },
      
      // Información específica de productos
      productos: {
        rosasPreservadas: {
          descripcion: "Estas rosas son completamente naturales, duran de 1-4 años totalmente vivas. Vienen en cúpulas de cristal con base de madera y luces LED.",
          tamaños: ["Premium (30cm)", "Mini (16cm)"],
          precios: "Rosa preservada Premium: $149.000. Rosa preservada Mini: $89.000.",
          colores: ["roja", "rosa", "lila", "azul cielo", "azul oscuro", "blanco", "amarillo", "salmon", "negro", "naranja", "fucsia (solo Premium)", "verde (solo Premium)"],
          caracteristicas: "Todas vienen con base de madera, cúpula de cristal, luces LED y lazo decorativo a tono con el color de la rosa."
        },
        
        significadosColores: {
          rojo: "Representa el amor, la pasión y enamoramiento. Perfecto para enamorar y conquistar.",
          rosa: "Simboliza la dulzura del amor, la esperanza y afecto. Perfecto para decirle que la quieres.",
          lila: "Representa el amor, la pasión y enamoramiento. Perfecto para enamorar y conquistar.",
          azulCielo: "Representa confianza y la lealtad.",
          azulOscuro: "Simboliza la verdad, la estabilidad y la seriedad. Evoca la creatividad y equilibrio emocional.",
          blanco: "Simboliza la pureza, perfección, paz y unión familiar.",
          amarillo: "Simboliza la belleza y narcis, representa la juventud y la amistad.",
          salmon: "Representa la bondad, el cariño y el amor sincero.",
          negro: "Simboliza el amor eterno, amor incondicional o luto.",
          naranja: "Es símbolo de amistad confiable. Así mismo de alegría.",
          fucsia: "Representa la fuerza de los sentimientos y espíritu.",
          verde: "Simboliza la naturaleza, estabilidad y armonía."
        },
        
        rositaEterna: {
          descripcion: "Lo bueno viene en envase pequeño. La rosa es grande como la Premium y bajita como la Mini. Incluye prado preservado y jardín de piedra.",
          precio: "$120.000",
          caracteristicas: "Viene en cúpula de cristal con base de madera, prado preservado y jardín de piedra."
        },
        
        rosaSanta: {
          descripcion: "Protege tus seres queridos y tu hogar. Bendice a todo aquel que amas.",
          tamaños: ["Premium (30cm)", "Mini (16cm)"],
          precios: "Rosa Santa Premium: $180.000. Rosa Santa Mini: $100.000.",
          caracteristicas: "Incluye una imagen religiosa junto con la rosa preservada en la cúpula de cristal."
        },
        
        virgenSanta: {
          descripcion: "Protege tus seres queridos y tu hogar. Bendice a todo aquel que amas.",
          tamaños: ["Premium (30cm)", "Mini (16cm)"],
          precios: "Virgen Santa Premium: $140.000. Virgen Santa Mini: $75.000.",
          caracteristicas: "Incluye una imagen de la Virgen junto con la rosa preservada en la cúpula de cristal."
        },
        
        rosaDuo: {
          descripcion: "Dos rosas preservadas en una misma cúpula.",
          precio: "$189.000",
          caracteristicas: "Ambas rosas son de tamaño Premium, puedes escoger los colores y el orden. Tiempo estimado de duración de 1-4 años."
        }
      },
      
      // Proceso de compra
      procesosCompra: {
        general: "Nuestro proceso de compra es sencillo y rápido. Puedes hacer tu pedido a través de WhatsApp, indicando qué productos te interesan.",
        pasos: [
          "1. Selecciona los productos que deseas comprar de nuestro catálogo",
          "2. Contáctanos por WhatsApp al (57) 320 7826946",
          "3. Para productos personalizados, es necesario un abono del 50% para empezar a hacer tu regalo",
          "4. Programa la fecha y hora de entrega",
          "5. Recibe tus flores preservadas en la puerta de tu casa"
        ],
        metodosPago: "Nequi, bancolombia, daviplata, pse. Es necesario un abono del 50% para iniciar el pedido, ya que son productos 100% personalizados.",
        tiemposEntrega: "Nuestros tiempos de entrega estimados son de 2 a 5 días hábiles. Cuando hay promociones, lanzamientos o combos pueden presentarse demoras adicionales."
      },
      
      // Políticas y servicios
      servicios: {
        domicilio: "Servicio de entrega a domicilio disponible en toda Colombia desde Bogotá.",
        garantia: "La garantía de nuestros productos preservados es de 1 año. Por favor siempre revisar al momento de llegar antes de firmar el recibido de la transportadora.",
        devoluciones: "No se hacen devoluciones de dinero por ningún motivo, ya que son detalles 100% únicos e irrepetibles. Para compensación del cliente se da otro producto del mismo valor."
      },
    
      // Contacto
      contacto: {
        telefono: "(57) 320 7826946",
        email: "dommo.colombia@gmail.com",
        instagram: "@__dommo.co__"
      }


    };
  }

  isSimpleGreeting(message) {
    if (!message || typeof message !== 'string') return false;
    
    const messageLower = message.toLowerCase().trim();
    const simpleGreetings = [
      'hola', 'hello', 'hi', 'hey', 'buenas', 'buen dia', 
      'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches',
      'saludos', 'que tal', 'qué tal', 'ola', 'ey', 'como estas', 'cómo estás'
    ];
    
    // Es un saludo simple si es exactamente uno de los saludos o comienza con él
    // y es un mensaje corto (menos de 25 caracteres)
    const isSimple = (
      simpleGreetings.includes(messageLower) || 
      simpleGreetings.some(greeting => 
        messageLower === greeting || 
        messageLower === greeting + '!' ||
        messageLower.startsWith(greeting + ' ')
      ) && message.length < 25
    );
    
    if (isSimple) {
      console.log(`🔎 Detectado saludo simple: "${message}"`);
    }
    
    return isSimple;
  }

  // MÉTODO PRINCIPAL PARA MANEJAR MENSAJES ENTRANTES - VERSIÓN CORREGIDA
  async handleIncomingMessage(message, senderInfo) {
    try {
      // Validación básica del mensaje
      if (!message || !message.id || !message.from || !message.type || message.type !== 'text' || !message.text || !message.text.body) {
        console.log("❌ Mensaje no válido, ignorando");
        return;
      }

      // NUEVO: Verificar si hay un mensaje reciente de este usuario
      const userId = message.from;
      const lastProcessedTime = this.lastProcessedTimestamp.get(userId) || 0;
      const now = Date.now();
      const timeSinceLastProcessed = now - lastProcessedTime;
      
      // Si es un mensaje muy cercano en tiempo al anterior, forzar combinación
      if (timeSinceLastProcessed < 5000) { // 5 segundos
        console.log(`⚡ Mensaje muy cercano al anterior (${Math.round(timeSinceLastProcessed/1000)}s), forzando combinación`);
        
        // Siempre añadir al buffer, nunca procesar inmediatamente
        this.messageBuffer.addMessage(
          userId,
          message,
          (combinedMessage) => {
            this.processMessage(combinedMessage, senderInfo);
          }
        );
        
        return;
      }
      
      // Evitar procesar mensajes duplicados
      if (this.processedMessages.has(message.id)) {
        console.log(`🔄 Mensaje duplicado [ID: ${message.id}], ignorando`);
        return;
      }
      
      const incomingMessage = message.text.body.trim();
      
      console.log(`📩 Mensaje recibido de ${message.from}: "${incomingMessage}"`);
      
      // CORRECCIÓN: Utilizar el buffer antes de procesar el mensaje
      // Esto permitirá agrupar mensajes relacionados y procesarlos juntos
      const shouldProcessNow = this.messageBuffer.addMessage(
        message.from,
        message,
        (combinedMessage) => {
          // Esta función callback se ejecutará cuando el buffer esté listo para procesar
          this.processMessage(combinedMessage, senderInfo);
        }
      );
      
      // Si el buffer indica que debemos procesar inmediatamente, lo hacemos
      if (shouldProcessNow) {
        await this.processMessage(message, senderInfo);
      } else {
        // Si no, el mensaje queda en buffer y se procesará después
        console.log(`📌 Mensaje añadido al buffer para ${message.from}`);
      }
      
    } catch (error) {
      console.error("🔥 ERROR GLOBAL en handleIncomingMessage:", error);
      console.error(error.stack);
      
      try {
        const errorMsg = "Lo siento, estoy teniendo problemas en este momento. Por favor, intenta de nuevo en un momento o escribe 'catálogo' para ver nuestros productos.";
        await whatsappService.sendMessage(message.from, errorMsg, message.id);
      } catch (finalError) {
        console.error("💀 Error fatal:", finalError);
      }
    }
  }

  // MÉTODO PRINCIPAL PARA PROCESAR MENSAJES - Corregido para manejar mensajes combinados del buffer
  // MÉTODO PRINCIPAL PARA PROCESAR MENSAJES - Corregido para manejar mensajes combinados del buffer
// MÉTODO PRINCIPAL PARA PROCESAR MENSAJES - Corregido para manejar mensajes combinados del buffer
// MÉTODO PARA PROCESAR MENSAJES BASADO EN ANÁLISIS CONTEXTUAL
async processMessage(message, senderInfo) {
  try {
    const incomingMessage = message.text.body.trim();
    const userId = message.from;

    // NUEVO: Verificar si hay un mensaje reciente en procesamiento
    const lastProcessedTime = this.lastProcessedTimestamp.get(userId) || 0;
    const now = Date.now();
    const timeSinceLastProcessed = now - lastProcessedTime;
    
    // Si ha pasado poco tiempo desde el último mensaje procesado
    if (timeSinceLastProcessed < this.COOLDOWN_TIME && !message._forceProceed) {
      console.log(`⏱️ Mensaje recibido durante periodo de enfriamiento (${Math.round(timeSinceLastProcessed/1000)}s), añadiendo a buffer`);
      
      // Añadir este mensaje al buffer en lugar de procesarlo inmediatamente
      this.messageBuffer.addMessage(
        userId,
        message,
        (combinedMessage) => {
          // Forzar procesamiento después del tiempo de espera
          combinedMessage._forceProceed = true;
          this.processMessage(combinedMessage, senderInfo);
        },
        this.COOLDOWN_TIME - timeSinceLastProcessed // Esperar el tiempo restante
      );
      
      return;
    }

    // NUEVO: Actualizar timestamp de este mensaje
    this.lastProcessedTimestamp.set(userId, now);
    
    // Log de recepción del mensaje
    console.log(`🔄 MENSAJE PROCESADO [${new Date().toISOString()}]: "${incomingMessage}"`);
    console.log(`De: ${userId}, ID: ${message.id}`);
    
    // Actualizar historial de conversación
    try {
      this.updateConversationHistory(userId, 'user', incomingMessage);
      console.log("✅ Historial de conversación actualizado");
    } catch (historyError) {
      console.error("❌ Error al actualizar historial:", historyError);
    }
    
    // Marcar mensaje como leído
    try {
      const readResult = await whatsappService.markAsRead(message.id);
      if (readResult.success) {
        console.log("✅ Mensaje marcado como leído");
      } else {
        console.log("⚠️ No se pudo marcar como leído pero continuando el flujo");
      }
    } catch (markReadError) {
      console.error("❌ Error al marcar mensaje como leído:", markReadError.message);
    }
    
    // VERIFICAR si es un saludo simple antes de continuar con el análisis
    if (this.isSimpleGreeting(incomingMessage)) {
      console.log("👋 Detectado saludo simple, respondiendo directamente");
      try {
        await this.sendWelcomeMessage(message.from, message.id, senderInfo);
        this.finishMessageProcessing(message.from, message.id);
        return;
      } catch (welcomeError) {
        console.error("❌ Error al enviar saludo:", welcomeError);
        // Si falla, continuamos con el flujo normal
      }
    }
    
    // Si no es un saludo o falló el envío, continuar con análisis contextual
    const contextAnalysis = await this.analyzeConversationContext(message.from, incomingMessage);
    
    // Sistema de decisión basado en el análisis contextual
    await this.executeContextualAction(message, contextAnalysis, senderInfo);
    
  } catch (globalError) {
    console.error("❌ ERROR GLOBAL en processMessage:", globalError);
    
    // Intentar enviar una respuesta de error humanizada
    try {
      const errorMessage = "Parece que estamos experimentando algunos problemas técnicos. ¿Podrías intentarlo de nuevo en unos momentos?";
      await whatsappService.sendMessage(message.from, errorMessage, message.id);
      this.updateConversationHistory(message.from, 'assistant', errorMessage);
    } catch (finalError) {
      console.error("💀 Error fatal:", finalError);
    }
    
    // Intentar limpiar el estado para evitar bloquear mensajes futuros
    try {
      this.finishMessageProcessing(message.from, message.id);
    } catch (error) {
      // Ignorar cualquier error en esta etapa final
    }
  }
}



// NUEVO: Sistema inteligente de decisión y ejecución basado en el análisis contextual
async executeContextualAction(message, contextAnalysis, senderInfo) {
  const userId = message.from;
  const messageId = message.id;
  const incomingMessage = message.text.body.trim();
  
  // NUEVO: Verificar primero si es un saludo simple, sin depender del análisis de la IA
  if (this.isSimpleGreeting(incomingMessage)) {
    console.log("👋 Detectado saludo simple, priorizando respuesta de bienvenida");
    try {
      await this.sendWelcomeMessage(userId, messageId, senderInfo);
      console.log("✅ Mensaje de bienvenida enviado en respuesta a saludo");
      this.finishMessageProcessing(userId, messageId);
      return;
    } catch (welcomeError) {
      console.error("❌ Error al enviar saludo:", welcomeError);
      // Si falla, continuamos con el flujo normal
    }
  }

  
  // Determinar la acción más apropiada basada en el análisis
  const specificAction = contextAnalysis.specificAction || "responder_consulta";
  
  console.log(`🧠 Ejecutando acción contextual: ${specificAction}`);
  
  // Estructura de decisión basada en la acción específica
  switch(specificAction) {
    case "enviar_catalogo":
      // Si la IA determinó que el usuario quiere el catálogo
      console.log("📚 Solicitado catálogo según análisis contextual");
      try {
        await this.sendMedia(userId, messageId);
        console.log("✅ Catálogo enviado por decisión contextual");
        return;
      } catch (catalogError) {
        console.error("❌ Error al enviar catálogo:", catalogError);
        // Continuar con respuesta genérica si falla
      }
      break;
      
    case "iniciar_agendamiento":
      // Si la IA determinó que el usuario quiere agendar
      console.log("📅 Iniciando flujo de agendamiento según análisis contextual");
      try {
        // Iniciar flujo de agendamiento
        this.appointmentState[userId] = { step: 'name' };
        
        // Generar mensaje de inicio de agendamiento
        const agendaMsg = await this.generateContextualResponse(
          userId,
          'iniciar_agendamiento',
          'Genera una respuesta para iniciar el proceso de agendamiento pidiendo los datos del cliente'
        );
        
        // Simular escritura
        await HumanLikeUtils.simulateTypingIndicator(agendaMsg.length);
        
        // Enviar mensaje
        await whatsappService.sendMessage(userId, agendaMsg, messageId);
        this.updateConversationHistory(userId, 'assistant', agendaMsg);
        return;
      } catch (agendamientoError) {
        console.error("❌ Error al iniciar agendamiento:", agendamientoError);
        // Continuar con respuesta genérica si falla
      }
      break;
      
    case "continuar_agendamiento":
      // Si hay un flujo de agendamiento en curso
      if (this.appointmentState[userId]) {
        console.log("📝 Continuando flujo de agendamiento existente");
        try {
          await this.handleAppointmentFlow(userId, message.text.body, messageId);
          return;
        } catch (appointmentError) {
          console.error("❌ Error en flujo de agendamiento:", appointmentError);
          // Continuar con respuesta genérica si falla
        }
      }
      break;
      
    case "consultar_pedido":
      // Si la IA determinó que el usuario quiere consultar un pedido
      console.log("🔍 Consultando estado de pedido según análisis contextual");
      try {
        await this.handleOrderStatusQuery(userId, message.text.body, messageId);
        return;
      } catch (orderQueryError) {
        console.error("❌ Error al consultar pedido:", orderQueryError);
        // Continuar con respuesta genérica si falla
      }
      break;
      
    case "responder_saludo":
      // Si es un saludo simple
      console.log("👋 Respondiendo a saludo según análisis contextual");
      try {
        await this.sendWelcomeMessage(userId, messageId, senderInfo);
        return;
      } catch (welcomeError) {
        console.error("❌ Error al enviar bienvenida:", welcomeError);
        // Continuar con respuesta genérica si falla
      }
      break;
      
    // Otros casos específicos que puedes agregar...
      
    case "responder_consulta":
    default:
      // Respuesta general usando IA
      console.log("💬 Generando respuesta contextual general");
      
      // Determinar el tipo de respuesta basado en el análisis
      let promptType = 'general';
      let promptSpecific;
      
      // Configurar prompt según el contexto
      if (contextAnalysis.messageType === 'pregunta') {
        promptType = 'consulta';
        promptSpecific = `
          El usuario está haciendo una consulta sobre: "${message.text.body}".
          Su etapa de compra es: ${contextAnalysis.purchaseStage}.
          Los temas mencionados son: ${contextAnalysis.topics.join(', ')}.
          
          ${contextAnalysis.nextActionSuggestion ? 
            `Después de tu respuesta principal, incluye en el mismo mensaje una breve sugerencia
            relacionada con los temas mencionados.` : 
            `Genera una respuesta clara y directa, sin sugerencias adicionales.`}
        `;
      } else if (contextAnalysis.suggestedFlow === 'ventas') {
        promptType = 'venta';
        promptSpecific = `
          El usuario está en un flujo de ventas y dice: "${message.text.body}". 
          Su etapa de compra es: ${contextAnalysis.purchaseStage}. 
          ${contextAnalysis.nextActionSuggestion ? 
            `Después de tu respuesta principal, incluye una breve sugerencia
            de siguiente paso (ver catálogo, elegir producto, agendar entrega, etc.).` : 
            `Genera una respuesta que impulse la venta.`}
        `;
      } else {
        // Para casos generales
        promptSpecific = `
          El usuario dice: "${message.text.body}". Genera una respuesta útil según el contexto.
          ${contextAnalysis.nextActionSuggestion ? 
            `Al final, incluye una breve sugerencia de siguiente paso relacionada con la tienda.` : 
            ``}
        `;
      }
      
      try {
        // Generar respuesta con IA
        let response = await this.generateContextualResponse(userId, promptType, promptSpecific);
        
        // Humanizar respuesta
        const userData = this.userProfiles.getPersonalizationData(userId);
        response = HumanLikeUtils.addResponseVariability(response);
        
        // Añadir errores humanos ocasionalmente (solo 10% del tiempo)
        if (Math.random() > 0.9) {
          response = HumanLikeUtils.addHumanLikeErrors(response);
        }
        
        // Añadir retraso humanizado
        await HumanLikeUtils.simulateTypingIndicator(response.length);
        
        // Enviar respuesta
        await whatsappService.sendMessage(userId, response, messageId);
        this.updateConversationHistory(userId, 'assistant', response);
      } catch (responseError) {
        console.error("❌ Error al generar respuesta:", responseError);
        
        // Respuesta de fallback
        const fallbackMsg = "Lo siento, no pude procesar tu mensaje correctamente. ¿Podrías intentar explicarlo de otra forma?";
        await whatsappService.sendMessage(userId, fallbackMsg, messageId);
        this.updateConversationHistory(userId, 'assistant', fallbackMsg);
      }
      break;
  }
  
  // Asegurarse de finalizar el procesamiento del mensaje
  this.finishMessageProcessing(userId, messageId);
}

  // CORREGIDO: Método mejorado para verificar si un mensaje está siendo procesado
isMessageBeingProcessed(userId, messageId) {
  const now = Date.now();
  
  // Limpiar entradas expiradas
  for (const [key, data] of this.processingMessages.entries()) {
    if (now - data.timestamp > this.MAX_PROCESSING_TIME) {
      this.processingMessages.delete(key);
    }
  }
  
  // Verificar si este mensaje específico ya está siendo procesado
  const messageKey = `${userId}_${messageId}`;
  if (this.processingMessages.has(messageKey)) {
    console.log(`🔄 Mensaje específico ${messageId} ya está siendo procesado`);
    return {
      isProcessing: true,
      isSelf: true,
      data: this.processingMessages.get(messageKey)
    };
  }
  
  // Verificar si hay otros mensajes activos para este usuario
  // y si el último mensaje se envió hace menos de 5 segundos
  const userMessages = Array.from(this.processingMessages.values())
    .filter(data => data.userId === userId && (now - data.timestamp) < 5000);
  
  if (userMessages.length > 0) {
    console.log(`⚠️ Usuario ${userId} ya tiene ${userMessages.length} mensaje(s) reciente(s) en procesamiento`);
    
    // Registrar que este mensaje está relacionado con un procesamiento activo
    this.processingMessages.set(messageKey, {
      userId,
      messageId,
      timestamp: now,
      isRelated: true,
      relatedTo: userMessages[0].messageId
    });
    
    return {
      isProcessing: true,
      isSelf: false,
      isRelated: true,
      data: userMessages[0]
    };
  }
  
  // No hay mensajes en procesamiento, registrar este como nuevo
  this.processingMessages.set(messageKey, {
    userId,
    messageId,
    timestamp: now,
    isRelated: false
  });
  
  return {
    isProcessing: false
  };
}

  // CORREGIDO: Método mejorado para marcar cuando finaliza el procesamiento
  finishMessageProcessing(userId, messageId) {
    // Eliminar este mensaje específico
    const processingKey = `${userId}_${messageId}`;
    this.processingMessages.delete(processingKey);
    
    // Eliminar también mensajes relacionados para este usuario
    const keysToDelete = [];
    
    for (const [key, data] of this.processingMessages.entries()) {
      if (data.userId === userId && 
         (data.relatedTo === messageId || Date.now() - data.timestamp > 10000)) {
        keysToDelete.push(key);
      }
    }
    
    // Eliminar fuera del bucle para evitar modificar durante la iteración
    keysToDelete.forEach(key => {
      this.processingMessages.delete(key);
    });
    
    if (keysToDelete.length > 0) {
      console.log(`✅ Procesamiento finalizado para ${userId}. Eliminados ${keysToDelete.length + 1} registros.`);
    }
  }

  // CORREGIDO: Método para verificar si un mensaje es válido y debe ser procesado
  isValidIncomingMessage(message) {
    // 1. Verificar que el mensaje tenga la estructura básica necesaria
    if (!message || !message.id || !message.from || !message.type || message.type !== 'text') {
      console.log("❌ Estructura de mensaje no válida, ignorando");
      return false;
    }
    
    // 2. Verificar si ya procesamos este ID de mensaje (duplicado)
    if (this.isMessageProcessed(message.id)) {
      console.log(`🔄 Mensaje duplicado detectado [ID: ${message.id}], ignorando`);
      return false;
    }
    
    // 3. Validación de timestamp - evitar mensajes muy antiguos o futuros
    const now = Date.now();
    const messageTimestamp = message.timestamp || now; // Si no hay timestamp, usar ahora
    const tooOld = now - messageTimestamp > 60000 * 10; // 10 minutos
    const tooFuture = messageTimestamp - now > 10000; // 10
    
    if (tooOld) {
      console.log(`⏰ Mensaje demasiado antiguo [ID: ${message.id}], ignorando`);
      return false;
    }
    
    if (tooFuture) {
      console.log(`⏰ Mensaje con timestamp futuro [ID: ${message.id}], ignorando`);
      return false;
    }
    
    // 4. Verificar contenido mínimo válido
    if (!message.text || !message.text.body || message.text.body.trim() === '') {
      console.log(`📭 Mensaje con cuerpo vacío [ID: ${message.id}], ignorando`);
      return false;
    }
    
    // 5. Verificar secuencia lógica - evitar mensajes fuera de secuencia
    // Almacenar timestamp del último mensaje de este usuario
    const lastTimestamp = this.messageTimestamps.get(message.from) || 0;
    this.messageTimestamps.set(message.from, messageTimestamp);
    
    // Si el mensaje es más antiguo que el último recibido de este usuario
    if (lastTimestamp > 0 && messageTimestamp < lastTimestamp - 60000) { // 1 minuto de tolerancia
      console.log(`⏱️ Mensaje fuera de secuencia [ID: ${message.id}], ignorando`);
      return false;
    }
    
    return true;
  }

  isMessageProcessed(messageId) {
    return this.processedMessages.has(messageId);
  }

  // Método para marcar un mensaje como procesado
  markMessageAsProcessed(messageId) {
    this.processedMessages.set(messageId, Date.now());
    
    // Limpiar mensajes antiguos (más de 1 hora)
    const oneHourAgo = Date.now() - 3600000;
    for (const [id, timestamp] of this.processedMessages.entries()) {
      if (timestamp < oneHourAgo) {
        this.processedMessages.delete(id);
      }
    }
  }

  // NUEVO: Método mejorado para actualizar estado del buffer
  updateBufferState(userId, message) {
    // Vaciar el buffer para este usuario si hay un mensaje en proceso
    const lastProcessedTime = this.lastProcessedTimestamp.get(userId) || 0;
    const now = Date.now();
    
    if (now - lastProcessedTime < this.COOLDOWN_TIME) {
      // Hay un mensaje reciente, forzar limpieza del buffer
      if (this.messageBuffer.buffers[userId]) {
        console.log(`🧹 Limpiando buffer de ${userId} para prevenir respuestas duplicadas`);
        this.messageBuffer.buffers[userId] = {
          messages: [],
          messageObjects: [],
          lastTimestamp: now,
          currentState: this.messageBuffer.buffers[userId].currentState,
          originalMessageId: null
        };
      }
    }
    
    // Método existente...
  }

  // Método para actualizar historial de conversaciones
  updateConversationHistory(userId, role, message) {
    if (!this.conversationHistory[userId]) {
      this.conversationHistory[userId] = [];
    }

    // Evitar duplicación de mensajes (verificar si el último mensaje es idéntico)
    const lastMessage = this.conversationHistory[userId].length > 0 ? 
      this.conversationHistory[userId][this.conversationHistory[userId].length - 1] : null;
    
    if (lastMessage && lastMessage.role === role && lastMessage.content === message) {
      console.log("⚠️ Evitando duplicación de mensaje en historial");
      return; // No agregar duplicados
    }

    // Mantener historial de tamaño limitado (últimos 8 mensajes)
    if (this.conversationHistory[userId].length > 8) {
      this.conversationHistory[userId].shift();
    }

    this.conversationHistory[userId].push({
      role: role, // 'user' o 'assistant'
      content: message,
      timestamp: Date.now()
    });
    
    console.log(`📝 Historial actualizado para ${userId}. Mensajes: ${this.conversationHistory[userId].length}`);
  }

  // MÉTODO PRINCIPAL PARA ANÁLISIS DE CONTEXTO DE LA CONVERSACIÓN CON IA
async analyzeConversationContext(userId, currentMessage) {
  try {

    // NUEVO: Detectar saludos primero para evitar análisis innecesario
    if (this.isSimpleGreeting(currentMessage)) {
      console.log("👋 Detectado saludo en análisis de contexto, saltando análisis completo");
      return {
        messageType: "saludo",
        topics: [],
        purchaseStage: "exploracion",
        suggestedFlow: "none",
        nextActionSuggestion: false,
        specificAction: "responder_saludo"
      };
    }

    // Construir contexto de conversación limitado (evitar repeticiones)
    let historyContext = this.conversationHistory[userId] || [];
    if (historyContext.length > 6) {
      historyContext = historyContext.slice(-6); // Usar los últimos 6 mensajes
    }
    
    // Construir prompt para análisis de contexto
    const analysisPrompt = {
      task: 'analisis_contexto',
      systemPrompt: `
        Eres un asistente de WhatsApp para una tienda de rosas preservadas que analiza conversaciones.
        Analiza el historial de conversación y el mensaje actual del usuario.
        Determina lo siguiente:
        1. Tipo de mensaje (pregunta, afirmación, solicitud, etc.)
        2. Temas principales mencionados (rosas, precios, entrega, etc.)
        3. Etapa de compra (exploración, consulta, decisión, agendamiento, pago)
        4. Flujo sugerido a seguir (ventas, consulta, agendamiento, pago)
        5. Si se debe sugerir un siguiente paso
        6. ACCIÓN ESPECÍFICA a tomar (enviar_catalogo, responder_consulta, iniciar_agendamiento, etc.)
        
        IMPORTANTE: EVALÚA SI EL USUARIO ESTÁ SOLICITANDO O HA ACEPTADO VER EL CATÁLOGO
        
        Responde con un objeto JSON sin formato de código.
        NO uses bloques de código markdown (\`\`\`json) al principio ni al final.
        El formato debe ser exactamente:
        {"messageType":"valor","topics":["valor1","valor2"],"purchaseStage":"valor","suggestedFlow":"valor","nextActionSuggestion":true/false,"specificAction":"valor"}
      `,
      conversation: historyContext,
      currentMessage: currentMessage,
      knowledgeBase: {
        productos: Object.keys(this.productKnowledge.productos),
        agendamiento: true,
        procesosCompra: true
      }
    };

    // Enviar a la IA para análisis contextual
    let analysisResult = await OpenAiService(analysisPrompt);

    // Limpiar posibles bloques de código markdown o texto adicional
    analysisResult = analysisResult.replace(/```json|```/g, '').trim();

    // Si empieza con comentarios o caracteres no JSON, intentar encontrar el inicio del JSON
    const jsonStart = analysisResult.indexOf('{');
    const jsonEnd = analysisResult.lastIndexOf('}');
    
    if (jsonStart >= 0 && jsonEnd >= 0) {
      analysisResult = analysisResult.substring(jsonStart, jsonEnd + 1);
    }

    // Parsearlo como JSON y devolverlo
    try {
      const parsedResult = JSON.parse(analysisResult);
      console.log("✅ Análisis de contexto completado:", parsedResult);
      return parsedResult;
    } catch (parseError) {
      console.error("Error al parsear resultado de análisis:", parseError);
      console.log("Texto que intentó parsear:", analysisResult);
      
      // Valor por defecto en caso de error
      return {
        messageType: "desconocido",
        topics: [],
        purchaseStage: "exploracion",
        suggestedFlow: "none",
        nextActionSuggestion: false,
        specificAction: "responder_consulta"
      };
    }
  } catch (error) {
    console.error("Error en análisis de contexto:", error);
    
    // Valor por defecto en caso de error
    return {
      messageType: "desconocido",
      topics: [],
      purchaseStage: "exploracion",
      suggestedFlow: "none",
      nextActionSuggestion: false,
      specificAction: "responder_consulta"
    };
  }
}

  // CORREGIDO: Versión mejorada del flujo asistente con IA para evitar respuestas duplicadas
  // CORREGIDO: Versión mejorada del flujo asistente con IA para evitar respuestas duplicadas
async handleAssistantFlowWithAI(to, message, messageId, contextAnalysis, isCombinedMessage = false) {
  try {
    // MODIFICACIÓN: Eliminamos la verificación de duplicados aquí
    // ya que se maneja en processMessage y pasamos isCombinedMessage como parámetro
    
    // Inicializar estado si no existe
    if (!this.assistantState[to]) {
      this.assistantState[to] = { step: 'general_inquiry' };
    }
    
    const state = this.assistantState[to];
    
    // Incrementar el contador
    if (!this.interactionCounter[to]) {
      this.interactionCounter[to] = 1;
    } else {
      this.interactionCounter[to]++;
    }
    
    // Configurar tipo de respuesta basado en análisis
    const isQuery = contextAnalysis.messageType === 'pregunta' || 
                  contextAnalysis.messageType === 'consulta' ||
                  this.isQueryMessage(message.toLowerCase());
    
    let promptType = 'general';
    let promptSpecific;

    // Verificar si debemos incluir sugerencia
    const includeSuggestion = contextAnalysis.nextActionSuggestion && 
                             (this.interactionCounter[to] % 3 === 0); // Sugerir cada 3 interacciones

    // Configurar prompt específico basado en tipo de mensaje
    if (isQuery) {
      promptType = 'consulta_con_sugerencia';
      
      promptSpecific = `
        El usuario está haciendo una consulta sobre: "${message}".
        Su etapa de compra es: ${contextAnalysis.purchaseStage}.
        Los temas mencionados son: ${contextAnalysis.topics.join(', ')}.
        
        ${includeSuggestion ? 
          `Después de tu respuesta principal, incluye en el mismo mensaje una breve sugerencia
          relacionada con los temas mencionados.` : 
          `Genera una respuesta clara y directa, sin sugerencias adicionales.`}
      `;
    }
    else if (state.step === 'sales_interaction') {
      promptType = 'venta';
      
      promptSpecific = `
        El usuario está en un flujo de ventas y dice: "${message}". 
        Su etapa de compra es: ${contextAnalysis.purchaseStage}. 
        ${includeSuggestion ? 
          `Después de tu respuesta principal, incluye en el mismo mensaje una breve sugerencia
          de siguiente paso (ver catálogo, elegir producto, agendar entrega, etc.).` : 
          `Genera una respuesta que impulse la venta.`}
      `;
    } 
    else if (state.step === 'support_interaction') {
      promptType = 'soporte';
      
      promptSpecific = `
        El usuario necesita soporte y dice: "${message}". 
        ${includeSuggestion ? 
          `Al final, incluye una breve sugerencia de siguiente paso.` : 
          `Genera una respuesta de asistencia útil.`}
      `;
    }
    else {
      promptSpecific = `
        El usuario dice: "${message}". Genera una respuesta útil según el contexto.
        ${includeSuggestion ? 
          `Al final, incluye una breve sugerencia de siguiente paso relacionada con la tienda.` : 
          ``}
      `;
    }

    console.log(`✅ Generando respuesta tipo ${promptType} (incluye sugerencia: ${includeSuggestion ? 'sí' : 'no'})`);
    
    // Generar respuesta con IA
    let response = await this.generateContextualResponse(to, promptType, promptSpecific);
    
    // Humanizar respuesta
    response = HumanLikeUtils.addResponseVariability(response);
    
    // Añadir errores humanos ocasionalmente (solo 10% del tiempo)
    if (Math.random() > 0.9) {
      response = HumanLikeUtils.addHumanLikeErrors(response);
    }
    
    // Añadir retraso humanizado (usando la versión corregida, solo con setTimeout)
    await HumanLikeUtils.simulateTypingIndicator(response.length);
    
    // Actualizar estado según análisis de IA
    if (contextAnalysis.suggestedFlow === 'agendamiento' && 
        (this.isPositiveResponse(message) || message.toLowerCase().includes('agendar'))) {
      // Iniciar flujo de agendamiento
      this.appointmentState[to] = { step: 'name' };
      delete this.assistantState[to]; // Limpiar estado del asistente
      
      const agendaMsg = await this.generateContextualResponse(
        to,
        'iniciar_agendamiento',
        'El usuario quiere agendar. Genera una respuesta para iniciar el proceso pidiendo su nombre'
      );
      
      await whatsappService.sendMessage(to, agendaMsg, messageId);
      this.updateConversationHistory(to, 'assistant', agendaMsg);
      
      // Marcar como finalizado después de enviar
      this.finishMessageProcessing(to, messageId);
      return;
    }
    
    // Enviar la respuesta al usuario
    await whatsappService.sendMessage(to, response, messageId);
    this.updateConversationHistory(to, 'assistant', response);
    
    // Actualizar el estado según el análisis
    if (contextAnalysis.messageType === 'pregunta') {
      state.intent = 'query';
    } else if (contextAnalysis.suggestedFlow !== 'none') {
      state.step = `${contextAnalysis.suggestedFlow}_interaction`;
    }
    
    console.log("✅ Respuesta IA de flujo asistente enviada");
    
    // Marcar como finalizado
    this.finishMessageProcessing(to, messageId);

  } catch (error) {
    console.error("❌ Error en flujo asistente IA:", error);
    
    try {
      await whatsappService.sendMessage(to, 'Ocurrió un error. Por favor, intenta de nuevo.', messageId);
      this.updateConversationHistory(to, 'assistant', 'Ocurrió un error. Por favor, intenta de nuevo.');
    } catch (msgError) {
      console.error("💀 Error al enviar mensaje de error:", msgError);
    }
    
    // Asegurarse de limpiar el estado incluso en caso de error
    this.finishMessageProcessing(to, messageId);
  }
}

  // CORREGIDO: Método para enviar bienvenida sin usar simulación de escritura de la API
  async sendWelcomeMessage(to, messageId, senderInfo) {
    try {
      console.log(`👋 Enviando mensaje de bienvenida a ${to}`);
      
      // Marcar como leído de forma segura
      try {
        await whatsappService.markAsRead(messageId);
      } catch (readError) {
        console.log("⚠️ No se pudo marcar como leído pero continuando");
      }
      
      // Obtener nombre del usuario si está disponible
      const userName = senderInfo?.profile?.name || '';
      const greeting = userName ? `¡Hola ${userName}!` : "¡Hola!";
      
      // Mensaje de bienvenida simple pero efectivo
      const welcomeMessages = [
        `${greeting} Soy el asistente virtual de Dommo. Tenemos hermosas rosas preservadas que duran hasta 4 años. ¿En qué puedo ayudarte hoy? 🌹`,
        `${greeting} Bienvenido a Dommo, donde encontrarás rosas preservadas únicas. ¿Te gustaría ver nuestro catálogo? 🌹`,
        `${greeting} Gracias por contactar a Dommo. Ofrecemos rosas preservadas en diferentes tamaños y colores. ¿Qué te gustaría saber? 🌹`
      ];
      
      // Seleccionar un mensaje aleatorio para dar variedad
      const welcomeMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
      
      // Añadir retraso humanizado antes de responder 
      // Usando simulateTypingIndicator de HumanLikeUtils en lugar de la API
      await HumanLikeUtils.simulateTypingIndicator(welcomeMessage.length);
      
      // Enviar mensaje
      await whatsappService.sendMessage(to, welcomeMessage, messageId);
      
      // Actualizar historial
      this.updateConversationHistory(to, 'assistant', welcomeMessage);
      
      // Actualizar estado del asistente
      this.assistantState[to] = { 
        step: 'welcome_sent',
        intent: 'greeting'
      };
      
      console.log("✅ Mensaje de bienvenida enviado correctamente");
      return true;
    } catch (error) {
      console.error("❌ Error al enviar mensaje de bienvenida:", error);
      
      // Intentar con un mensaje ultrasimple como fallback
      try {
        const fallbackMsg = "¡Hola! Bienvenido a Dommo. ¿En qué puedo ayudarte?";
        await whatsappService.sendMessage(to, fallbackMsg, messageId);
        this.updateConversationHistory(to, 'assistant', fallbackMsg);
      } catch (fallbackError) {
        console.error("💀 Error fatal:", fallbackError);
      }
      
      return false;
    }
  }

  // Funciones de detección mejoradas
  isGreeting(message) {
    const messageLower = message.toLowerCase().trim();
    const greetings = ['hey', 'hola', 'ola', 'buenos días', 'buenas tardes', 'buenas noches', 'saludos'];
    return greetings.some(greeting => messageLower.includes(greeting)) && message.length < 15;
  }

  isQueryMessage(message) {
    const messageLower = message.toLowerCase();
    return message.includes('?') || ['qué', 'que', 'cómo', 'como', 'dónde', 'donde', 'cuándo', 'cuando'].some(word => 
      messageLower.includes(word + ' ')
    );
  }

  isPositiveResponse(message) {
    const messageLower = message.toLowerCase();
    return ['sí', 'si', 'claro', 'ok', 'está bien', 'perfecto'].some(word => messageLower.includes(word));
  }

  // Método para enviar catálogo
  async sendMedia(to, messageId) {
    try {
      console.log(`📤 Enviando catálogo simple a ${to}`);
      
      const mediaUrl = 'https://s3.us-east-2.amazonaws.com/prueba.api.whatsapp/Copia+de+Catalogo+Dommo+%5BTama%C3%B1o+original%5D.pdf';
      const caption = 'Catálogo Dommo';
      const type = 'document';
      
      try {
        // Enviar documento directamente
        await whatsappService.sendMediaMessage(to, type, mediaUrl, caption, messageId);
        console.log("✅ Documento enviado correctamente");
        
        // Establecer estado básico
        this.assistantState[to] = { step: 'sales_interaction' };
        
        // Añadir retraso humanizado
        await HumanLikeUtils.simulateTypingIndicator(150);
        
        // Enviar mensaje de seguimiento simple
        const followupMsg = "Aquí tienes nuestro catálogo. ¿Hay algún producto que te llame la atención?";
        await whatsappService.sendMessage(to, followupMsg, messageId);
        this.updateConversationHistory(to, 'assistant', followupMsg);
        
        return true;
      } catch (mediaError) {
        console.error("❌ Error al enviar documento:", mediaError);
        
        // Alternativa: enviar como texto con enlace
        const catalogoMsg = `¡Claro! Te comparto el enlace a nuestro catálogo: ${mediaUrl}`;
        await whatsappService.sendMessage(to, catalogoMsg, messageId);
        this.updateConversationHistory(to, 'assistant', catalogoMsg);
        
        return true;
      }
    } catch (error) {
      console.error("❌ Error general al enviar catálogo:", error);
      
      // Mensaje de error básico
      const errorMsg = "Lo siento, no pude enviarte el catálogo en este momento.";
      await whatsappService.sendMessage(to, errorMsg, messageId);
      this.updateConversationHistory(to, 'assistant', errorMsg);
      
      return false;
    }
  }

  // Método para obtener nombre del remitente
  getSenderName(senderInfo) {
    return senderInfo?.profile?.name || senderInfo.wa_id || '';
  }

  // Método para manejar consultas de estado de pedido
  async handleOrderStatusQuery(to, message, messageId) {
    try {
      console.log("🔍 Procesando consulta de estado de pedido");
      
      // Extraer posibles términos de búsqueda
      const possibleSearchTerms = this.extractSearchTerms(message);
      let foundOrders = [];
      
      if (possibleSearchTerms.length > 0) {
        // Buscar con cada término hasta encontrar resultados
        for (const term of possibleSearchTerms) {
          console.log(`🔍 Buscando con término: "${term}"`);
          const results = await this.findOrders(term);
          
          if (results.length > 0) {
            foundOrders = results;
            break;
          }
        }
      } else {
        // Si no hay términos claros, intentar con el historial
        const userHistory = this.appointmentState[to] || {};
        if (userHistory.name) {
          console.log(`🔍 Buscando con nombre del usuario: "${userHistory.name}"`);
          foundOrders = await this.findOrders(userHistory.name);
        }
      }
      
      // Preparar respuesta
      let response;
      if (foundOrders.length > 0) {
        response = this.formatOrdersForDisplay(foundOrders);
      } else {
        // Generar respuesta contextual con IA para "no encontrado"
        response = await this.generateContextualResponse(
          to,
          'consulta_estado_no_encontrado',
          `El usuario está consultando por el estado de su pedido pero no encontramos coincidencias. 
           Mensaje original: "${message}".
           Genera una respuesta amable pidiendo más información para poder buscar su pedido (nombre, fecha, etc).`
        );
      }
      
      // Humanizar la respuesta
      response = HumanLikeUtils.addResponseVariability(response);
      
      // Personalizar con datos del usuario
      const userData = this.userProfiles.getPersonalizationData(to);
      response = HumanLikeUtils.addConversationalFillers(response, userData);
      
      // Añadir retraso humanizado antes de responder
      await HumanLikeUtils.simulateTypingIndicator(response.length);
      
      // Enviar respuesta
      await whatsappService.sendMessage(to, response, messageId);
      this.updateConversationHistory(to, 'assistant', response);
      
      console.log("✅ Respuesta de estado de pedido enviada");
      return true;
    } catch (error) {
      console.error("❌ Error al consultar estado de pedido:", error);
      return false;
    }
  }
  
  // Método para extraer posibles términos de búsqueda de un mensaje
  extractSearchTerms(message) {
    const terms = [];
    
    // Expresiones regulares para detectar nombres, fechas, etc.
    const dateRegex = /(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/g;
    const nameRegex = /(?:(?:me llamo|soy|para|de|cliente|nombre|pedido de)\s+)([A-Za-zÁáÉéÍíÓóÚúÜüÑñ\s]{2,25})(?:\s|$|,|\.|;)/i;
    
    // Extraer fechas
    const dateMatches = message.matchAll(dateRegex);
    for (const match of dateMatches) {
      terms.push(match[0]);
    }
    
    // Extraer posibles nombres
    const nameMatch = message.match(nameRegex);
    if (nameMatch && nameMatch[1]) {
      // Limpiar y añadir el nombre
      const name = nameMatch[1].trim();
      if (name.length > 2) {
        terms.push(name);
      }
    }
    
    // Dividir el mensaje en palabras y buscar palabras significativas
    const words = message.split(/\s+/);
    for (const word of words) {
      // Solo considerar palabras que parezcan nombres propios
      if (word.length > 3 && /^[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+$/.test(word)) {
        terms.push(word);
      }
    }
    
    return [...new Set(terms)]; // Eliminar duplicados
  }
  
  // Método para buscar órdenes en Google Sheets
  async findOrders(searchTerm) {
    try {
      // Verificar si podemos usar el cache
      const now = Date.now();
      if (this.orderCache.lastFetch && (now - this.orderCache.lastFetch < this.CACHE_EXPIRY)) {
        console.log("🔍 Buscando en cache de órdenes...");
        
        // Buscar en órdenes cacheadas
        const results = Object.values(this.orderCache.orders).filter(order => {
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
      this.orderCache.orders = {};
      orders.forEach(order => {
        this.orderCache.orders[order.id] = order;
      });
      this.orderCache.lastFetch = now;
      
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
  
  // Método para formatear órdenes
  formatOrdersForDisplay(orders) {
    if (!orders || orders.length === 0) {
      return "No encontré pedidos que coincidan con tu búsqueda. Por favor, verifica los datos o intenta con otro término de búsqueda.";
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

  // MÉTODO GENERADOR DE RESPUESTAS CONTEXTUALES
  async generateContextualResponse(userId, responseType, specificPrompt) {
    try {
      // Construir contexto de conversación limitado
      let historyContext = this.conversationHistory[userId] || [];
      if (historyContext.length > 6) {
        historyContext = historyContext.slice(-6);
      }
      
      // Información de estado actual
      const currentState = {
        assistantState: this.assistantState[userId] || { step: 'unknown' },
        appointmentState: this.appointmentState[userId],
        interactionCount: this.interactionCounter[userId] || 0
      };
      
      // Construir prompt completo
      const responsePrompt = {
        task: 'generacion_respuesta',
        responseType: responseType,
        systemPrompt: `
          Eres un asistente virtual de WhatsApp para una tienda de rosas preservadas. Tu objetivo es ser amable,
          útil y conciso. Responde según el tipo de respuesta solicitada y usa la información de la 
          tienda proporcionada. Las respuestas deben ser naturales y conversacionales, entre 1-4 oraciones.
          
          IMPORTANTE: 
          1. Nunca inventes información que no esté en la base de conocimiento.
          2. Si no sabes algo, sugiere preguntar a un agente humano.
          3. Respuestas breves y concisas, máximo 4 oraciones.
          4. No incluyas emojis excesivos, solo 1-2 si son relevantes.
          5. No te presentes ni te despidas en cada mensaje.
          
          INSTRUCCIÓN CRÍTICA: 
          1. NUNCA repitas exactamente lo que el usuario acaba de decir
          2. Responde a su consulta/mensaje directamente sin reiterarlo
          3. No uses frases como "dices que...", "mencionas que...", "preguntas sobre..."
        `,
        specificPrompt: specificPrompt,
        conversation: historyContext,
        stateInfo: currentState,
        knowledgeBase: this.productKnowledge
      };
      
      // Enviar a la IA
      const rawResponse = await OpenAiService(responsePrompt);
      
      // Limpiar y verificar la respuesta
      let cleanedResponse = rawResponse.trim();
      
      // Verificar si hay un uso excesivo de emojis (más de 3)
      const emojiCount = (cleanedResponse.match(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
      if (emojiCount > 3) {
        // Reducir a máximo 2 emojis
        cleanedResponse = cleanedResponse.replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, function(match, offset, string) {
          return offset < 50 || offset > string.length - 50 ? match : '';
        });
      }
      
      // Verificar que la respuesta no está vacía
      if (!cleanedResponse || cleanedResponse.length < 10) {
        // Respuestas predeterminadas según el tipo
        const defaultResponses = {
          'venta': "Tenemos hermosas rosas preservadas en diferentes presentaciones y colores. ¿Te gustaría conocer nuestro catálogo?",
          'consulta': "Entiendo tu consulta. ¿Te gustaría que te explique más sobre nuestros productos o precios?",
          'iniciar_agendamiento': "Para agendar tu pedido, necesito algunos datos. ¿Cuál es tu nombre completo?",
          'general': "Gracias por tu mensaje. ¿Puedo ayudarte con información sobre nuestros productos o servicios?"
        };
        
        return defaultResponses[responseType] || "¿En qué más puedo ayudarte?";
      }
      
      return cleanedResponse;
    } catch (error) {
      console.error("Error al generar respuesta contextual:", error);
      
      // Proporcionar respuestas predeterminadas
      const fallbackResponses = {
        'venta': "Tenemos hermosas rosas preservadas en diferentes presentaciones y colores. ¿Te gustaría conocer nuestro catálogo?",
        'consulta': "Entiendo tu consulta. Tenemos opciones desde $89.000 para la Mini hasta $149.000 para la Premium.",
        'iniciar_agendamiento': "Para agendar tu pedido, necesito algunos datos. ¿Cuál es tu nombre completo?",
        'general': "Gracias por tu mensaje. ¿Puedo ayudarte con información sobre nuestros productos o servicios?"
      };
      
      return fallbackResponses[responseType] || "¿En qué más puedo ayudarte?";
    }
  }
}

export default new MessageHandler();