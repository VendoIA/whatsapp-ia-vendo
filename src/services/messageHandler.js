// src/services/messageHandler.js - VERSIÓN MEJORADA CON IA INTELIGENTE, HUMANIZADA Y MANEJO DE MENSAJES MÚLTIPLES
import whatsappService from './whatsappService.js';
import appendToSheet from './googleSheetsService.js';
import OpenAiService from './improvedDeepseekService.js';
import { google } from 'googleapis';
import path from 'path';
import config from '../config/env.js';

// Buffer para mensajes consecutivos del mismo usuario
class MessageBuffer {
  constructor() {
    this.buffers = {};
    this.timeoutIds = {};
    this.WAIT_TIME = 10000; // 10 segundos
}


  /**
   * Añade un mensaje al buffer
   */
  /**
 * Añade un mensaje al buffer
 */
addMessage(userId, message, callback, waitTime = null) {
  // Verificación de seguridad para el mensaje
  if (!message || !message.text || !message.text.body) {
    console.error(`❌ Error: Mensaje inválido para usuario ${userId}`);
    return true; // Procesar inmediatamente para evitar errores
  }
  
  // Cancelar temporizador existente
  if (this.timeoutIds[userId]) {
    clearTimeout(this.timeoutIds[userId]);
    delete this.timeoutIds[userId];
  }
  
  const messageText = message.text.body.trim();
  
  // Asegurarse de que el buffer exista con todos sus campos inicializados
  if (!this.buffers[userId]) {
    this.buffers[userId] = {
      messages: [], // Inicializar explícitamente como array vacío
      messageObjects: [], // NUEVO: Guardar objetos de mensaje completos
      lastTimestamp: Date.now(),
      currentState: null,
      originalMessageId: null
    };
  }
  
  // Verificación extra para asegurarnos que messages y messageObjects son arrays
  if (!Array.isArray(this.buffers[userId].messages)) {
    this.buffers[userId].messages = [];
  }
  if (!Array.isArray(this.buffers[userId].messageObjects)) {
    this.buffers[userId].messageObjects = [];
  }
  
  const buffer = this.buffers[userId];
  
  // Guardar ID original
  if (buffer.messages.length === 0) {
    buffer.originalMessageId = message.id;
  }
  
  // Añadir mensaje al buffer
  buffer.messages.push(messageText);
  buffer.messageObjects.push(message); // NUEVO: Guardar objeto completo
  buffer.lastTimestamp = Date.now();
  
  // Configurar tiempo de espera
  const effectiveWaitTime = waitTime || this.WAIT_TIME;
  
  // MEJORADO: Verificar si debe procesarse ahora
  if (this.isCompleteResponse(messageText, buffer.currentState)) {
    const combinedMessage = this.getCombinedMessage(userId);
    callback(combinedMessage);
    return true;
  }
  
  // Configurar temporizador
  this.timeoutIds[userId] = setTimeout(() => {
    if (this.buffers[userId] && this.buffers[userId].messages.length > 0) {
      const combinedMessage = this.getCombinedMessage(userId);
      callback(combinedMessage);
    }
    delete this.timeoutIds[userId];
  }, effectiveWaitTime);
  
  return false;
}

  /**
   * Obtiene mensaje combinado
   */
  /**
 * Obtiene mensaje combinado
 */
getCombinedMessage(userId) {
  if (!this.buffers[userId] || !this.buffers[userId].messages || this.buffers[userId].messages.length === 0) {
    return null;
  }
  
  const buffer = this.buffers[userId];
  
  // Crear mensaje combinado
  const combinedText = buffer.messages.join(' ');
  
  // NUEVO: Guardar referencia a los mensajes originales
  const originalMessages = buffer.messageObjects ? [...buffer.messageObjects] : [];
  
  // Crear objeto de respuesta
  const combinedMessage = {
    id: buffer.originalMessageId,
    from: userId,
    timestamp: buffer.lastTimestamp,
    type: 'text',
    text: {
      body: combinedText
    },
    _combined: true,
    _originalCount: buffer.messages.length,
    _originalMessages: originalMessages // NUEVO: Guardar referencia a mensajes originales
  };
  
  // Limpiar buffer
  this.buffers[userId] = {
    messages: [],
    messageObjects: [],
    lastTimestamp: Date.now(),
    currentState: buffer.currentState,
    originalMessageId: null
  };
  
  return combinedMessage;
}

  /**
   * Actualiza estado actual
   */
  // Corrección para el método updateState en la clase MessageBuffer

/**
 * Actualiza estado actual
 */
updateState(userId, state) {
  // Verificar que userId existe y es válido
  if (!userId) {
    console.log("⚠️ updateState llamado con userId inválido");
    return; // Salir temprano si userId no es válido
  }

  // Asegurarse de que el buffer existe para este userId
  if (!this.buffers[userId]) {
    this.buffers[userId] = {
      messages: [],
      messageObjects: [], // Asegurarse de que esta propiedad esté inicializada
      lastTimestamp: Date.now(),
      currentState: null,
      originalMessageId: null
    };
  }
  
  // Manejar estado como string o objeto
  if (typeof state === 'string') {
    this.buffers[userId].currentState = state;
  } else if (typeof state === 'object' && state !== null) {
    this.buffers[userId].currentState = state.step || null;
  }
}

  /**
   * Determina si un mensaje parece completo
   */
  /**
 * Determina si un mensaje parece completo
 */
isCompleteResponse(text, currentState) {
  // MEJORADO: Detectar mejor cuando un mensaje es completo
  
  // Mensajes con preguntas completas (incluyen verbo y signo de interrogación)
  const hasCompleteQuestion = /\b(cómo|como|qué|que|cuál|cual|cuánto|cuanto|dónde|donde|cuándo|cuando).+\?/.test(text);
  if (hasCompleteQuestion) return true;
  
  // Mensajes con solicitud directa (imperativo + objeto)
  const hasDirectRequest = /\b(quiero|necesito|dame|envía|envia|manda|busco)\s+.{5,}/.test(text);
  if (hasDirectRequest) return true;
  
  // Si el mensaje es muy largo, probablemente es completo
  if (text.length > 40) return true;
  
  // Si contiene puntuación final, probablemente es completo
  if (text.endsWith('.') || text.endsWith('!') || text.endsWith('?')) return true;
  
  // Reglas específicas según el estado actual
  if (currentState === 'name' && text.includes(' ') && text.length > 10) return true;
  if ((currentState === 'address' || currentState === 'direccion') && /\d+/.test(text) && text.length > 15) return true;
  
  return false;
}

  /**
   * Limpia buffers antiguos
   */
  cleanup() {
    const now = Date.now();
    const expiredTime = 30 * 60 * 1000;
    
    Object.keys(this.buffers).forEach(userId => {
      if (now - this.buffers[userId].lastTimestamp > expiredTime) {
        delete this.buffers[userId];
        
        if (this.timeoutIds[userId]) {
          clearTimeout(this.timeoutIds[userId]);
          delete this.timeoutIds[userId];
        }
      }
    });
  }
}

// Clase para humanizar respuestas
// Clase para humanizar respuestas
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
      // MEJORA: Patrones de error más realistas basados en comportamiento humano real
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
        // MEJORA: Errores de espaciado como hacen los humanos
        {pattern: / /g, replacement: "  ", prob: 0.1}, // Doble espacio ocasional
        {pattern: /\./g, replacement: ". ", prob: 0.3}, // Espacio después de punto
        // Errores comunes al escribir rápido
        {pattern: /para/g, replacement: "pra", prob: 0.15},
        {pattern: /cuando/g, replacement: "cuadno", prob: 0.2},
        {pattern: /donde/g, replacement: "doned", prob: 0.2}
      ];
      
      // MEJORA: Errores más complejos y realistas en frases
      // A veces enviar un mensaje y luego "corregirlo"
      if (Math.random() > 0.85 && response.length > 40) {
        // Dividir en frases
        const sentences = response.split('. ');
        if (sentences.length > 1) {
          // Seleccionar una frase aleatoria para introducir un error
          const randomIndex = Math.floor(Math.random() * sentences.length);
          const originalSentence = sentences[randomIndex];
          
          // Si la frase es lo suficientemente larga
          if (originalSentence.length > 20) {
            // Crear una versión con error
            const words = originalSentence.split(' ');
            // Elegir una palabra al azar para cambiar
            if (words.length > 3) {
              const wordIndex = Math.floor(Math.random() * words.length);
              // Solo modificar palabras de cierta longitud
              if (words[wordIndex].length > 3) {
                // Crear un typo
                const originalWord = words[wordIndex];
                const typoWord = this.createTypo(originalWord);
                words[wordIndex] = typoWord;
                
                // Reconstruir la frase con el error
                sentences[randomIndex] = words.join(' ');
                
                // Simular que el bot envía un mensaje con error y luego lo corrige
                return sentences.join('. ') + "\n\n*" + originalWord + ""; // Asterisco como corrección
              }
            }
          }
        }
      }
      
      // MEJORA: Aplicar un patrón de error aleatorio con más inteligencia
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
          
          // MEJORA: 50% de probabilidad de añadir autocorrección al estilo humano
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

  // Mejorar percepción de tiempo humano (añadir retrasos variables)
  static async simulateTypingIndicator(messageLength, messageComplexity = 'normal') {
    // Calcular retraso basado en la longitud del mensaje
    // Un humano real tardaría más en escribir mensajes más largos
    const baseDelay = messageComplexity === 'complex' ? 1500 : 1000; // 1-1.5 segundos base
    const perCharDelay = messageComplexity === 'complex' ? 30 : 20; // 20-30ms por caracter (simular velocidad de escritura)
    
    // Longitud mínima para evitar NaN
    const safeLength = Math.max(messageLength || 10, 10);
    
    // MEJORA: Simular pausas durante la escritura como lo haría una persona real
    // Si es un mensaje largo, añadir pausas aleatorias (como si la persona estuviera pensando)
    let pauseFactor = 1.0;
    if (safeLength > 80) {
      // Mensajes largos tienen pausas más frecuentes
      pauseFactor = 0.7 + (Math.random() * 0.8); // Entre 0.7 y 1.5
      
      // Para mensajes muy largos, añadir una "pausa de pensamiento" adicional
      if (safeLength > 150 && Math.random() > 0.6) {
        // 40% de probabilidad de añadir una pausa extra en mensajes largos
        const thinkingPause = 1000 + (Math.random() * 2000); // 1-3 segundos adicionales
        await new Promise(resolve => setTimeout(resolve, thinkingPause));
      }
    }
    
    // Añadir variabilidad natural - las personas no escriben a ritmo constante
    const variabilityFactor = 0.7 + (Math.random() * 0.6); // Entre 0.7 y 1.3
    
    // Añadir pausa de "pensamiento" para mensajes complejos
    const thinkingPause = messageComplexity === 'complex' ? 
                        2000 + (Math.random() * 3000) : 0;
    
    // Calcular retraso con algo de aleatoriedad
    const typingDelay = baseDelay + (safeLength * perCharDelay * variabilityFactor * pauseFactor);
    
    // MEJORA: Modular el retraso según si es una primera respuesta o una continuación
    // Si acabamos de responder un mensaje hace poco, responder más rápido al siguiente
    const lastResponseTime = this.lastResponseTimes?.get(message?.from) || 0;
    const timeSinceLastResponse = Date.now() - lastResponseTime;
    
    let continuationFactor = 1.0;
    if (timeSinceLastResponse < 10000) { // Menos de 10 segundos desde la última respuesta
      // Responder más rápido a preguntas de seguimiento
      continuationFactor = 0.6 + (Math.random() * 0.2); // Entre 0.6 y 0.8
    }
    
    // Limitar el retraso máximo a 8 segundos para no frustrar a los usuarios
    const cappedDelay = Math.min(typingDelay * continuationFactor + thinkingPause, 8000);
    
    // Aplicar el retraso
    return new Promise(resolve => setTimeout(resolve, cappedDelay));
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

  // Añade este método al final de la clase HumanLikeUtils, justo antes de cerrar la clase con }
static async simulateTypingIndicator(to, messageLength, messageId, complexity = 'normal') {
  try {
    // Parámetros para simular tiempos de escritura humanos
    const baseDelay = complexity === 'complex' ? 2000 : 1200;
    const charsPerSecond = complexity === 'complex' ? 5 : 8;
    
    // Longitud mínima para evitar problemas con mensajes vacíos
    const safeLength = Math.max(messageLength || 10, 10);
    
    // Calcular tiempo total que tomaría escribir este mensaje
    let typingTime = baseDelay + (safeLength / charsPerSecond) * 1000;
    
    // Añadir variabilidad (las personas no escriben a un ritmo constante)
    const variabilityFactor = 0.8 + (Math.random() * 0.4);
    typingTime *= variabilityFactor;
    
    // Limitar el tiempo máximo para no aburrir al usuario
    const maxTypingTime = 8000; // 8 segundos máximo
    typingTime = Math.min(typingTime, maxTypingTime);
    
    console.log(`💬 Simulando escritura por ${Math.round(typingTime/1000)} segundos...`);
    
    // Para mensajes muy largos, enviar una indicación visual
    if (typingTime > 5000 && safeLength > 100) {
      const intermediateTime = Math.floor(typingTime / 3);
      await new Promise(resolve => setTimeout(resolve, intermediateTime));
      
      // 30% de probabilidad de enviar mensaje intermedio
      if (Math.random() > 0.7) {
        try {
          const typingIndicators = [
            "Escribiendo...",
            "...",
            "Un momento...",
            "Preparando respuesta..."
          ];
          
          const indicator = typingIndicators[Math.floor(Math.random() * typingIndicators.length)];
          await whatsappService.sendMessage(to, indicator, messageId);
          
          await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (err) {
          console.log("⚠️ No se pudo enviar indicador intermedio");
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, typingTime - intermediateTime));
    } else {
      // Para mensajes cortos, simplemente esperar el tiempo calculado
      await new Promise(resolve => setTimeout(resolve, typingTime));
    }
    
    return true;
  } catch (error) {
    console.error("Error al simular indicador de escritura:", error);
    return false;
  }
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

  // MEJORA: Método para hacer que las respuestas a consultas similares varíen
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

  // Método auxiliar para calcular similitud entre textos (simplificado)
  static calculateSimilarity(str1, str2) {
    // Si las longitudes son muy diferentes, considerar baja similitud
    const lengthDiff = Math.abs(str1.length - str2.length) / Math.max(str1.length, str2.length);
    if (lengthDiff > 0.3) return 0;
    
    // Comparar palabras en común
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(w => words2.includes(w));
    const similarity = (2 * commonWords.length) / (words1.length + words2.length);
    
    return similarity;
  }

  // MEJORA: Método para registrar cuándo se envió la última respuesta a un usuario
  static trackResponseTime(userId) {
    if (!this.lastResponseTimes) {
      this.lastResponseTimes = new Map();
    }
    this.lastResponseTimes.set(userId, Date.now());
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

// Clase principal de manejo de mensajes
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
  
  // NUEVO: Inicializar el buffer de mensajes
  this.messageBuffer = new MessageBuffer();
  
  // Inicializar gestor de perfiles de usuario
  this.userProfiles = new UserProfileManager();
  
   // Asegurarse de que estas propiedades estén disponibles
   this.processingMessages = new Map();
   this.MAX_PROCESSING_TIME = 5 * 60 * 1000;
   
   // Inicializar el buffer de mensajes
   this.messageBuffer = new MessageBuffer();

  // Cache para órdenes consultadas recientemente
  this.orderCache = {
    orders: {},
    lastFetch: null
  };
    
    // Tiempo de expiración del cache (5 minutos)
  this.CACHE_EXPIRY = 5 * 60 * 1000;
  
  // Nuevo: Seguimiento de mensajes en procesamiento
  this.processingMessages = new Map();
  
  // Tiempo máximo permitido para procesamiento (5 minutos)
  this.MAX_PROCESSING_TIME = 5 * 60 * 1000;

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
  isMessageBeingProcessed(userId, messageId) {
    const now = Date.now();
    
    // Limpiar entradas expiradas
    for (const [key, data] of this.processingMessages.entries()) {
      if (now - data.timestamp > this.MAX_PROCESSING_TIME) {
        this.processingMessages.delete(key);
      }
    }
    
    // Verificar si existe un procesamiento activo para este usuario
    const userProcessing = Array.from(this.processingMessages.values())
      .filter(data => data.userId === userId && now - data.timestamp < 30000); // 30 segundos
    
    // Si hay mensajes en procesamiento para este usuario, registrarlo
    if (userProcessing.length > 0) {
      console.log(`⚠️ Usuario ${userId} ya tiene ${userProcessing.length} mensaje(s) en procesamiento`);
      
      // Registrar que este mensaje está relacionado con un procesamiento activo
      const processingKey = `${userId}_${messageId}`;
      this.processingMessages.set(processingKey, {
        userId,
        messageId,
        timestamp: now,
        isRelated: true,  // Marcar como relacionado a un procesamiento existente
        relatedTo: userProcessing[0].messageId // Relacionado con el mensaje más antiguo
      });
      
      return true;
    }
    
    // No hay mensajes en procesamiento, registrar este como nuevo
    const processingKey = `${userId}_${messageId}`;
    this.processingMessages.set(processingKey, {
      userId,
      messageId,
      timestamp: now,
      isRelated: false
    });
    
    return false;
  }
  
  // Agregar este método para marcar cuando finaliza el procesamiento
  finishMessageProcessing(userId, messageId) {
    const processingKey = `${userId}_${messageId}`;
    this.processingMessages.delete(processingKey);
    
    // Limpiar también mensajes relacionados
    for (const [key, data] of this.processingMessages.entries()) {
      if (data.userId === userId && data.relatedTo === messageId) {
        this.processingMessages.delete(key);
      }
    }
  }

  // Verificar si un mensaje es válido y debe ser procesado
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
    const tooFuture = messageTimestamp - now > 10000; // 10 segundos en el futuro (por diferencias de reloj)
    
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
      content: message
    });
    
    console.log(`📝 Historial actualizado para ${userId}. Mensajes: ${this.conversationHistory[userId].length}`);
  }

  // MÉTODO PRINCIPAL PARA MANEJAR MENSAJES ENTRANTES
  // MÉTODO PRINCIPAL PARA MANEJAR MENSAJES ENTRANTES
  async handleIncomingMessage(message, senderInfo) {
    try {
      // Validación completa del mensaje
      if (!this.isValidIncomingMessage(message)) {
        return; // El método isValidIncomingMessage ya registra el motivo del rechazo
      }
      
      // Marcar mensaje como procesado
      this.markMessageAsProcessed(message.id);
      
      // AÑADIR: Un control para evitar procesar mensajes que son parte de una secuencia
      const isPartOfSequence = message._isPartOfSequence || false;
      
      // NUEVO: Verificar si hay conversación activa en curso
      const hasActiveFlow = this.appointmentState[message.from] || 
                            (this.assistantState[message.from] && 
                             this.assistantState[message.from].expectingResponse);
      
      // NUEVO: Determinar el contexto actual más específico
      let currentState = 'unknown';
      let lastQuestion = null;
      
      if (this.appointmentState[message.from]) {
        currentState = this.appointmentState[message.from].step;
        lastQuestion = this.appointmentState[message.from].lastQuestion || null;
      } else if (this.assistantState[message.from]) {
        currentState = this.assistantState[message.from].step;
        lastQuestion = this.assistantState[message.from].lastQuestion || null;
      }
      
      // NUEVO: Actualizar el estado en el buffer con más contexto
      // Añadir manejo de errores para la actualización de estado
      try {
        this.messageBuffer.updateState(message.from, {
          step: currentState,
          lastQuestion: lastQuestion,
          hasActiveFlow: hasActiveFlow
        });
      } catch (stateError) {
        console.log(`⚠️ Error al actualizar estado en buffer: ${stateError.message}`);
        // No interrumpir el flujo por un error en la actualización del estado
      }
      
      // NUEVO: Restaurar el ID de mensaje original para mantener el contexto
      let contextMessageId = message.id;
      if (this.conversationHistory[message.from] && 
          this.conversationHistory[message.from].length > 0) {
        
        const lastAssistantMessage = this.conversationHistory[message.from]
          .filter(msg => msg.role === 'assistant')
          .pop();
        
        if (lastAssistantMessage && lastAssistantMessage.messageId) {
          // Usar el último ID de mensaje del asistente para mantener el hilo
          contextMessageId = lastAssistantMessage.messageId;
        }
      }
      
      // Agregar mensaje al buffer con tiempo de espera adaptativo y manejo de errores
      const bufferWaitTime = hasActiveFlow ? 15000 : 10000; // Aumentado a 10 segundos para mensajes normales
      
      let shouldProcessNow = false;
      try {
        shouldProcessNow = this.messageBuffer.addMessage(
          message.from, 
          message, 
          (combinedMessage) => {
            // Este callback se ejecutará cuando se complete el tiempo de espera
            if (combinedMessage) {
              console.log(`📦 Procesando mensaje combinado [${combinedMessage._originalCount} mensajes]: "${combinedMessage.text.body}"`);
              
              // NUEVO: Marcar todos los mensajes originales como parte de una secuencia
              if (combinedMessage._originalMessages && combinedMessage._originalMessages.length > 1) {
                combinedMessage._originalMessages.forEach(msg => {
                  if (msg.id !== combinedMessage.id) {
                    msg._isPartOfSequence = true;
                  }
                });
              }
              
              // NUEVO: Marcar cuál es el mensaje más reciente para evitar respuestas duplicadas
              combinedMessage._isRecentMessage = true;
              
              // Asegurarse de preservar el contexto
              combinedMessage.contextMessageId = contextMessageId;
              this.processMessage(combinedMessage, senderInfo);
            }
          },
          bufferWaitTime  // Pasar el tiempo de espera adaptativo
        );
      } catch (bufferError) {
        console.error(`❌ Error al agregar mensaje al buffer: ${bufferError.message}`);
        shouldProcessNow = true; // Procesar inmediatamente en caso de error
      }
      
      // Si debe procesarse ahora, hacerlo inmediatamente
      if (shouldProcessNow) {
        let combinedMessage = null;
        try {
          combinedMessage = this.messageBuffer.getCombinedMessage(message.from);
        } catch (combineError) {
          console.error(`❌ Error al combinar mensaje: ${combineError.message}`);
          // Si falla la combinación, usar el mensaje original
          combinedMessage = {
            ...message,
            _isRecentMessage: true,
            _originalCount: 1
          };
        }
        
        if (combinedMessage) {
          console.log(`📦 Procesando mensaje inmediatamente [${combinedMessage._originalCount || 1} mensajes]: "${combinedMessage.text.body}"`);
          
          // NUEVO: Marcar todos los mensajes originales como parte de una secuencia
          if (combinedMessage._originalMessages && combinedMessage._originalMessages.length > 1) {
            combinedMessage._originalMessages.forEach(msg => {
              if (msg.id !== combinedMessage.id) {
                msg._isPartOfSequence = true;
              }
            });
          }
          
          // NUEVO: Marcar cuál es el mensaje más reciente para evitar respuestas duplicadas
          combinedMessage._isRecentMessage = true;
          
          // Asegurarse de preservar el contexto
          combinedMessage.contextMessageId = contextMessageId;
          await this.processMessage(combinedMessage, senderInfo);
        }
      } else if (!isPartOfSequence) {
        // MODIFICADO: Solo registrar el mensaje en buffer si no es parte de una secuencia ya procesada
        console.log(`⏳ Mensaje añadido al buffer para posible combinación: "${message.text.body}"`);
        
        // Indicador de "escribiendo" solo para secuencias nuevas
        // Simulación de escritura para secuencias nuevas (70% del tiempo)
        if (hasActiveFlow && Math.random() > 0.3) {
          try {
            // Simular brevemente que está escribiendo (mensaje más corto por ser respuesta rápida)
            const simulatedLength = Math.min(30, message.text.body.length);
            await HumanLikeUtils.simulateTypingIndicator(
              message.from,
              simulatedLength,
              message.id,
              'normal' // Complejidad normal para respuestas rápidas
            );
            console.log(`💬 Simulación de escritura activada para: ${message.from}`);
          } catch (typingError) {
            console.log(`⚠️ No se pudo simular escritura: ${typingError.message}`);
          }
        }
      } else {
        console.log(`🔄 Mensaje identificado como parte de secuencia, no requiere respuesta independiente: "${message.text.body}"`);
      }
      
      // Limpiar periódicamente buffers antiguos
      if (Math.random() < 0.1) { // 10% de probabilidad para no hacerlo en cada mensaje
        try {
          this.messageBuffer.cleanup();
        } catch (cleanupError) {
          console.log(`⚠️ Error en limpieza de buffers: ${cleanupError.message}`);
        }
      }
      
    } catch (globalError) {
      console.error("🔥 ERROR GLOBAL en handleIncomingMessage:", globalError);
      try {
        // Mensaje de error más amigable usando la utilidad de humanización
        const errorMessage = HumanLikeUtils.generateHumanResponse(
          'Lo siento, estamos experimentando un problema técnico. ¿Puedes intentar de nuevo en unos minutos?'
        );
        
        await whatsappService.sendMessage(
          message.from, 
          errorMessage, 
          message.id
        );
        await whatsappService.markAsRead(message.id);
      } catch (finalError) {
        console.error("💀 Error fatal:", finalError);
      }
    }
  }
  
  // NUEVO: Método para procesar el mensaje una vez combinado
  // MÉTODO PRINCIPAL PARA PROCESAR MENSAJES
  async processMessage(message, senderInfo) {
    try {
      // NUEVO: Verificar si es un mensaje combinado y evitar respuesta repetida
      if (message._originalCount > 1) {
        console.log(`📊 Detectado mensaje combinado (${message._originalCount} mensajes), procesando como conversación completa`);
      }
    
      // NUEVO: Si se está respondiendo a un mensaje previo como parte de una secuencia, saltarlo
      if (!message._isRecentMessage && message._isPartOfSequence) {
        console.log("🔄 Omitiendo respuesta a mensaje dentro de secuencia ya procesada");
        await whatsappService.markAsRead(message.id);
        return;
      }
      
      // Verificar procesamiento de mensajes con manejo de errores
      let processingCheck = false;
      try {
        processingCheck = this.isMessageBeingProcessed(message.from, message.id);
      } catch (processingError) {
        console.log(`⚠️ Error al verificar procesamiento: ${processingError.message}`);
        // Continuar con processingCheck = false
      }
      
      if (processingCheck) {
        console.log(`🔀 Este mensaje está relacionado con otro en procesamiento. Ajustando flujo.`);
        
        const userProcessingMessages = Array.from(this.processingMessages.values())
    .filter(data => data.userId === message.from);
  
  // Calcular tiempo desde primera y última respuesta del asistente
  const recentResponses = this.conversationHistory[message.from]
    ?.filter(msg => msg.role === 'assistant')
    ?.slice(-2);
  
  const lastResponseTime = recentResponses && recentResponses.length > 0 
    ? Date.now() - (recentResponses[recentResponses.length - 1].timestamp || 0) 
    : 60000;
  
  // IMPORTANTE: Bloquear totalmente el procesamiento de mensajes relacionados
  // si hay otros mensajes en procesamiento o respuestas recientes (< 15 seg)
  if (userProcessingMessages.length > 0 || lastResponseTime < 15000) {
    console.log(`⏱️ Bloqueando respuesta para mensaje relacionado: ${userProcessingMessages.length} mensajes en procesamiento, ${Math.round(lastResponseTime/1000)}s desde última respuesta`);
    
    // Solo registrar mensaje en historial pero NO generar respuesta
    this.updateConversationHistory(message.from, 'user', message.text.body.trim());
    
    try {
      // Marcar como leído sin que falle todo el proceso
      const readResult = await whatsappService.markAsRead(message.id);
      if (!readResult.success) {
        console.log("⚠️ No se pudo marcar como leído pero continuando el flujo");
      }
    } catch (markReadError) {
      console.error("❌ Error al marcar como leído:", markReadError.message);
    }
    
    // Acumular contexto para el mensaje principal
    try {
      // Identificar el mensaje principal al que está relacionado este
      const relatedMessages = userProcessingMessages.filter(data => !data.isRelated);
      
      if (relatedMessages.length > 0) {
        const mainMessageId = relatedMessages[0].messageId;
        console.log(`✅ Acumulando contexto para mensaje principal: ${mainMessageId}`);
        
        // Guardar referencia al texto para incluirlo en el análisis
        if (!this.accumulatedContext) {
          this.accumulatedContext = new Map();
        }
        
        const existingContext = this.accumulatedContext.get(message.from) || {
          mainMessageId: mainMessageId,
          texts: []
        };
        
        existingContext.texts.push(message.text.body.trim());
        this.accumulatedContext.set(message.from, existingContext);
        console.log(`📝 Contexto acumulado: ${existingContext.texts.length} mensajes`);
      }
      
      // Marcar explícitamente que este mensaje ha sido procesado
      this.finishMessageProcessing(message.from, message.id);
    } catch (error) {
      console.error("Error al actualizar contexto acumulado:", error);
    }
    
    return;
  }
}
  
      const incomingMessage = message.text.body.trim();
      const incomingMessageLower = incomingMessage.toLowerCase();
      
      // Log de recepción del mensaje
      console.log(`🔄 MENSAJE PROCESADO [${new Date().toISOString()}]: "${incomingMessage}"`);
      console.log(`De: ${message.from}, ID: ${message.id}`);
      
      // Actualizar historial de conversación - PUNTO DE POSIBLE FALLA #1
      try {
        this.updateConversationHistory(message.from, 'user', incomingMessage);
        console.log("✅ Historial de conversación actualizado");
      } catch (historyError) {
        console.error("❌ Error al actualizar historial:", historyError);
        // Continuar con el procesamiento a pesar del error
      }
      
      // Marcar mensaje como leído - PUNTO DE POSIBLE FALLA #2
      try {
        const readResult = await whatsappService.markAsRead(message.id);
        if (readResult.success) {
          console.log("✅ Mensaje marcado como leído");
        } else {
          // El error ya ha sido registrado en el servicio, no interrumpir el flujo
          console.log("⚠️ No se pudo marcar como leído pero continuando el flujo");
        }
      } catch (markReadError) {
        // Captura extra por si acaso, pero no debería ocurrir con el nuevo servicio
        console.error("❌ Error al marcar mensaje como leído:", markReadError.message);
        // Continuar con el procesamiento a pesar del error
      }
      
      // NUEVO: Si es un saludo simple, enviar respuesta de bienvenida directa sin análisis
      if (this.isGreeting(incomingMessageLower) && incomingMessage.length < 10) {
        console.log("🙋 Detectado saludo simple, enviando bienvenida...");
        
        try {
          await this.sendWelcomeMessage(message.from, message.id, senderInfo);
          console.log("✅ Respuesta de bienvenida enviada correctamente");
          
          // Finalizar procesamiento
          this.finishMessageProcessing(message.from, message.id);
          return;
        } catch (greetingError) {
          console.error("❌ Error al enviar saludo:", greetingError);
          // Continuar con el procesamiento normal como fallback
        }
      }
      
      // Analizar contexto de la conversación - PUNTO DE POSIBLE FALLA #3
      console.log("🔍 Analizando contexto de la conversación...");

      let contextToAnalyze = incomingMessage;

if (this.accumulatedContext && this.accumulatedContext.has(message.from)) {
  const accumulatedData = this.accumulatedContext.get(message.from);
  
  // Solo usar el contexto acumulado si este mensaje es el principal
  if (accumulatedData.mainMessageId === message.id) {
    // Combinar todos los mensajes para un análisis más completo
    const allTexts = [incomingMessage, ...accumulatedData.texts];
    contextToAnalyze = allTexts.join(' ');
    
    console.log(`🔄 Usando contexto acumulado para análisis: ${allTexts.length} mensajes combinados`);
    
    // Limpiar después de usar
    this.accumulatedContext.delete(message.from);
  }
}

      let contextAnalysis;
      try {
        contextAnalysis = await this.analyzeConversationContext(message.from, contextToAnalyze);
        console.log("✅ Análisis de contexto completado:", contextAnalysis);
      } catch (analysisError) {
        console.error("❌ Error en análisis de contexto:", analysisError);
        // Si falla el análisis, usar un análisis básico para seguir operando
        contextAnalysis = {
          messageType: "desconocido",
          topics: [],
          purchaseStage: "exploracion",
          suggestedFlow: "none",
          nextActionSuggestion: false
        };
      }
      
      // Si el usuario está pidiendo el catálogo, enviarlo - PUNTO DE POSIBLE FALLA #4
      const catalogKeywords = ['catálogo', 'catalogo', 'productos', 'ver productos', 'tienes productos', 'quiero ver'];
      if (catalogKeywords.some(keyword => incomingMessageLower.includes(keyword))) {
        console.log("📚 Detectada solicitud de catálogo");
        try {
          await this.sendMedia(message.from, message.id);
          console.log("✅ Catálogo enviado correctamente");
          
          // Finalizar procesamiento
          this.finishMessageProcessing(message.from, message.id);
          return;
        } catch (catalogError) {
          console.error("❌ Error al enviar catálogo:", catalogError);
          // Continuar con el flujo normal si falla el envío del catálogo
        }
      }
      
      // Si es una consulta de estado de pedido, manejarla - PUNTO DE POSIBLE FALLA #5
      if (EnhancedIntentDetector.isOrderStatusQuery(incomingMessage)) {
        console.log("🔍 Detectada consulta de estado de pedido");
        try {
          await this.handleOrderStatusQuery(message.from, incomingMessage, message.id);
          console.log("✅ Consulta de estado procesada correctamente");
          
          // Finalizar procesamiento
          this.finishMessageProcessing(message.from, message.id);
          return;
        } catch (orderQueryError) {
          console.error("❌ Error al manejar consulta de estado:", orderQueryError);
          // Continuar con el flujo normal si falla la consulta de estado
        }
      }
      
      // Si hay un estado de agendamiento activo, manejarlo - PUNTO DE POSIBLE FALLA #6
      if (this.appointmentState[message.from]) {
        console.log("📅 Continuando flujo de agendamiento activo");
        try {
          await this.handleAppointmentFlow(message.from, incomingMessage, message.id);
          console.log("✅ Flujo de agendamiento procesado correctamente");
          
          // Finalizar procesamiento
          this.finishMessageProcessing(message.from, message.id);
          return;
        } catch (appointmentError) {
          console.error("❌ Error en flujo de agendamiento:", appointmentError);
          // Si falla el flujo de agendamiento, intentar con flujo asistente general
        }
      }
      
      // Respuesta general usando IA - PUNTO DE POSIBLE FALLA #7
      console.log("🤖 Utilizando flujo de asistente IA para generar respuesta");
      try {
        await this.handleAssistantFlowWithAI(message.from, incomingMessage, message.id, contextAnalysis);
        console.log("✅ Respuesta de asistente IA generada correctamente");
      } catch (aiError) {
        console.error("❌ Error en flujo de asistente IA:", aiError);
        
        // FALLBACK: Enviar respuesta genérica si todo lo demás falla
        const fallbackResponse = "Lo siento, estoy teniendo problemas para procesar tu mensaje. ¿Podrías intentarlo de nuevo o formular tu pregunta de otra manera?";
        try {
          await whatsappService.sendMessage(message.from, fallbackResponse, message.id);
          console.log("✅ Respuesta de fallback enviada correctamente");
          this.updateConversationHistory(message.from, 'assistant', fallbackResponse);
        } catch (fallbackError) {
          console.error("💥 ERROR FATAL: Incluso el fallback falló:", fallbackError);
        }
      }
      
      // Finalizar procesamiento
      try {
        this.finishMessageProcessing(message.from, message.id);
        console.log("✅ Procesamiento de mensaje finalizado correctamente");
      } catch (cleanupError) {
        console.log(`⚠️ Error en limpieza final: ${cleanupError.message}`);
        // Error no crítico, se puede ignorar
      }
      
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

  // MÉTODO PARA ANÁLISIS DE CONTEXTO DE LA CONVERSACIÓN CON IA
  // MÉTODO PARA ANÁLISIS DE CONTEXTO DE LA CONVERSACIÓN CON IA
  async analyzeConversationContext(userId, currentMessage) {
    try {
      // NUEVO: Evitar análisis repetitivos del mismo mensaje
      if (!this.lastAnalysis) {
        this.lastAnalysis = {};
        this.lastAnalysisResult = {};
      }
      
      const lastAnalysisKey = `${userId}_last_analysis`;
      if (this.lastAnalysis[lastAnalysisKey] === currentMessage) {
        console.log("🔄 Reutilizando análisis previo para evitar duplicación");
        return this.lastAnalysisResult[lastAnalysisKey] || {
          messageType: "desconocido",
          topics: [],
          purchaseStage: "exploracion",
          suggestedFlow: "none",
          nextActionSuggestion: false
        };
      }
      
      // Guardar este mensaje para evitar duplicación
      this.lastAnalysis[lastAnalysisKey] = currentMessage;
      
      // Construir prompt para análisis de contexto
      const historyContext = this.conversationHistory[userId] || [];
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
          
          IMPORTANTE: Responde con un objeto JSON sin formato de código.
          NO uses bloques de código markdown (\`\`\`json) al principio ni al final.
          El formato debe ser exactamente:
          {"messageType":"valor","topics":["valor1","valor2"],"purchaseStage":"valor","suggestedFlow":"valor","nextActionSuggestion":true/false}
        `,
        conversation: historyContext,
        currentMessage: currentMessage,
        knowledgeBase: {
          productos: Object.keys(this.productKnowledge.productos),
          agendamiento: true,
          procesosCompra: true
        }
      };

      // Enviar a la IA
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
        
        // Guardar resultado para referencia futura
        this.lastAnalysisResult[lastAnalysisKey] = parsedResult;
        
        return parsedResult;
      } catch (parseError) {
        console.error("Error al parsear resultado de análisis:", parseError);
        console.log("Texto que intentó parsear:", analysisResult);
        
        // Valor por defecto en caso de error
        const defaultResult = {
          messageType: "desconocido",
          topics: [],
          purchaseStage: "exploracion",
          suggestedFlow: "none",
          nextActionSuggestion: false
        };
        
        // Guardar resultado por defecto
        this.lastAnalysisResult[lastAnalysisKey] = defaultResult;
        
        return defaultResult;
      }
    } catch (error) {
      console.error("Error en análisis de contexto:", error);
      
      // Valor por defecto en caso de error
      return {
        messageType: "desconocido",
        topics: [],
        purchaseStage: "exploracion",
        suggestedFlow: "none",
        nextActionSuggestion: false
      };
    }
  }

  async mergeRelatedMessageContext(userId, currentMessageId, relatedMessageId) {
    try {
      console.log(`🔄 Fusionando contexto de mensajes relacionados: ${currentMessageId} con ${relatedMessageId}`);
      
      // Obtener historial de conversación reciente
      const history = this.conversationHistory[userId] || [];
      if (history.length < 2) return false;
      
      // Extraer últimos mensajes del usuario para combinarlos
      const userMessages = history
        .filter(msg => msg.role === 'user')
        .slice(-3); // Considerar solo los últimos 3 mensajes
      
      if (userMessages.length < 2) return false;
      
      // Combinar mensajes para análisis de contexto unificado
      const combinedMessage = userMessages
        .map(msg => msg.content)
        .join(" ");
      
      console.log(`🔄 Contexto combinado para análisis: "${combinedMessage}"`);
      
      // Realizar análisis unificado
      const unifiedAnalysis = await this.analyzeConversationContext(userId, combinedMessage);
      
      // Guardar análisis unificado para usarlo en la próxima respuesta
      if (!this.unifiedContextAnalysis) {
        this.unifiedContextAnalysis = new Map();
      }
      
      this.unifiedContextAnalysis.set(userId, {
        analysis: unifiedAnalysis,
        timestamp: Date.now(),
        relatedMessageIds: [currentMessageId, relatedMessageId]
      });
      
      console.log(`✅ Análisis unificado de contexto completado:`, unifiedAnalysis);
      return true;
    } catch (error) {
      console.error("❌ Error al fusionar contexto de mensajes:", error);
      return false;
    }
  }

  // MÉTODO PARA GENERAR RESPUESTAS CONTEXTUALES CON IA
  // MÉTODO PARA GENERAR RESPUESTAS CONTEXTUALES CON IA
async generateContextualResponse(userId, responseType, specificPrompt) {
  try {
    // Construir contexto de conversación limitado (solo últimos 4-6 mensajes para evitar repeticiones)
    let historyContext = this.conversationHistory[userId] || [];
    if (historyContext.length > 6) {
      historyContext = historyContext.slice(-6); // Solo usar los últimos 6 mensajes
    }
    
    // Información de estado actual
    const currentState = {
      assistantState: this.assistantState[userId] || { step: 'unknown' },
      appointmentState: this.appointmentState[userId],
      interactionCount: this.interactionCounter[userId] || 0
    };
    
    // Instrucción explícita para no repetir lo que dijo el usuario
    const noRepeatInstruction = `
      INSTRUCCIÓN CRÍTICA: 
      1. NUNCA repitas exactamente lo que el usuario acaba de decir
      2. Responde a su consulta/mensaje directamente sin reiterarlo
      3. No uses frases como "dices que...", "mencionas que...", "preguntas sobre..."
      4. Respuestas claras y concisas, sin redundancias, no tan extensas
    `;
    
    // Construir prompt completo (CORREGIDO)
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
        4. No incluyas emojis excesivos, solo 1-2 si son relevantes, no los uses siempre.
        5. No te presentes ni te despidas en cada mensaje.
        
        ${noRepeatInstruction}
      `,
      specificPrompt: `${specificPrompt}\n\n${noRepeatInstruction}`,
      conversation: historyContext,
      stateInfo: currentState,
      knowledgeBase: this.productKnowledge
    };
    
    // Enviar a la IA
    console.log(`🤖 Generando respuesta tipo: ${responseType}`);
    const rawResponse = await OpenAiService(responsePrompt);
    
    // Limpiar y verificar la respuesta
    let cleanedResponse = rawResponse.trim();
    
    // Verificar si la respuesta contiene repetición del último mensaje del usuario
    const lastUserMessage = historyContext.length > 0 ? 
      historyContext.filter(msg => msg.role === 'user').pop() : null;
    
    if (lastUserMessage && cleanedResponse.includes(lastUserMessage.content)) {
      console.log("⚠️ Detectada repetición del mensaje del usuario en la respuesta, corrigiendo...");
      // Simplificar respuesta para evitar repetición
      cleanedResponse = cleanedResponse.replace(lastUserMessage.content, "");
      cleanedResponse = cleanedResponse.replace(/^[^a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ]+/, ""); // Limpiar caracteres iniciales
      cleanedResponse = cleanedResponse.charAt(0).toUpperCase() + cleanedResponse.slice(1); // Primera letra mayúscula
    }
    
    // NUEVO: Verificar si esta respuesta es similar a alguna reciente
    if (this.isResponseSimilarToRecent && typeof this.isResponseSimilarToRecent === 'function') {
      const similarityCheck = this.isResponseSimilarToRecent(userId, cleanedResponse);
      
      if (similarityCheck && similarityCheck.isDuplicate) {
        console.log("⚠️ Evitando respuesta duplicada, modificando respuesta...");
        
        // Opciones para diversificar respuestas
        const diversificationOptions = [
          // Agregar un prefijo aclaratorio
          () => `Para aclarar mejor, ${cleanedResponse}`,
          
          // Reformular completamente con un nuevo prompt
          async () => {
            const newPrompt = `
              ${specificPrompt}
              
              IMPORTANTE: Genera una respuesta COMPLETAMENTE DIFERENTE a esta:
              "${similarityCheck.similarResponse}"
              
              La nueva respuesta debe aportar información adicional o enfocarse en otro aspecto.
            `;
            
            // Generar nueva respuesta con énfasis en diferenciación
            const newResponse = await OpenAiService({
              task: 'generacion_respuesta',
              responseType: responseType + '_alternativo',
              systemPrompt: `
                Genera una respuesta alternativa que aporte información nueva
                y diferente sobre el mismo tema. Evita repetir conceptos.
              `,
              specificPrompt: newPrompt,
              conversation: this.conversationHistory[userId] || [],
              stateInfo: {}, // Estado simplificado
              knowledgeBase: this.productKnowledge
            });
            
            return newResponse;
          },
          
          // Enfocarse en un aspecto específico no mencionado antes
          () => {
            // Encontrar aspectos específicos para enfatizar basado en el tipo
            const aspects = {
              'venta': 'precio, disponibilidad y entrega',
              'soporte': 'garantía y cuidados del producto',
              'agendamiento': 'horarios y opciones de entrega',
              'general': 'personalización y opciones disponibles',
              'consulta': 'detalles técnicos y características'
            };
            
            const focusAspect = aspects[responseType] || 'detalles adicionales';
            return `Además, respecto a ${focusAspect}, te comento que ${cleanedResponse}`;
          }
        ];
        
        // Elegir aleatoriamente una estrategia de diversificación
        const strategy = diversificationOptions[Math.floor(Math.random() * diversificationOptions.length)];
        
        try {
          // Aplicar la estrategia (algunas pueden ser asíncronas)
          const diversifiedResponse = await strategy();
          if (diversifiedResponse) {
            cleanedResponse = diversifiedResponse;
          }
        } catch (diversificationError) {
          console.log("⚠️ Error al diversificar respuesta:", diversificationError.message);
          // Si hay error en la diversificación, usar la respuesta original
        }
      }
    }
    
    // Si la respuesta está vacía o es demasiado corta después de limpiarla, usar respuesta predeterminada
    if (!cleanedResponse || cleanedResponse.length < 10) {
      console.log("⚠️ Respuesta demasiado corta después de limpieza, usando respuesta predeterminada");
      const defaultResponses = {
        'catalogo_enviado': "¿Hay algún producto específico que te interese? También puedo explicarte el proceso de compra si lo deseas.",
        'consulta': "Lo siento, no tengo información específica sobre esa consulta ahora mismo. ¿Puedo ayudarte con otra cosa?",
        'iniciar_agendamiento': "Para agendar tu pedido, necesito algunos datos. ¿Cuál es tu nombre completo?",
        'iniciar_pago': "Para procesar tu pago, te indico los métodos disponibles: Nequi, Bancolombia, Daviplata y PSE. ¿Cuál prefieres?",
        'general': "Gracias por tu mensaje. ¿Puedo ayudarte con información sobre nuestros productos o servicios?",
        'sugerencia': "¿Te gustaría ver nuestro catálogo o agendar una entrega?",
        'bienvenida': "¡Hola! Soy tu asistente virtual de la tienda de rosas preservadas. ¿En qué puedo ayudarte hoy?"
      };
      
      return defaultResponses[responseType] || "¿En qué más puedo ayudarte?";
    }
    
    return cleanedResponse;
  } catch (error) {
    console.error("Error al generar respuesta contextual:", error);
    
    // Proporcionar respuestas predeterminadas basadas en el tipo de respuesta solicitado
    const fallbackResponses = {
      'bienvenida': "¡Hola! Soy tu asistente virtual de la tienda de rosas preservadas. ¿En qué puedo ayudarte hoy?",
      'catalogo_enviado': "¿Hay algún producto específico que te interese? También puedo explicarte el proceso de compra si lo deseas.",
      'consulta': "Entiendo tu consulta. Déjame brindarte la información que necesitas.",
      'venta': "Tenemos hermosas rosas preservadas en diferentes presentaciones y colores. ¿Te gustaría conocer nuestro catálogo?",
      'soporte': "Estoy aquí para ayudarte. ¿Podrías darme más detalles sobre tu consulta?",
      'agendamiento': "Para agendar tu pedido, necesito algunos datos. ¿Podemos comenzar con tu nombre completo?",
      'iniciar_agendamiento': "Para agendar tu pedido, necesito algunos datos. ¿Cuál es tu nombre completo?"
    };
    
    return fallbackResponses[responseType] || "Lo siento, tuve un problema al generar una respuesta. ¿Puedo ayudarte con otra cosa?";
  }
}

  // MÉTODO PARA MANEJAR EL FLUJO DE ASISTENTE USANDO IA MEJORADA
  async handleAssistantFlowWithAI(to, message, messageId, contextAnalysis) {
    try {
      // NUEVO: Verificar si ya hay un mensaje en procesamiento para este usuario
      let isRelatedMessage = false;
      try {
        isRelatedMessage = this.isMessageBeingProcessed(to, messageId);
      } catch (processingError) {
        console.log(`⚠️ Error al verificar procesamiento: ${processingError.message}`);
        // Continuar con isRelatedMessage = false
      }
      
      if (isRelatedMessage) {
        console.log(`🔀 Detectado mensaje relacionado [${messageId}], ajustando respuesta`);
        
        // En lugar de duplicar, mejorar respuesta anterior o generar una respuesta de seguimiento
        // especial que combine el contexto de ambos mensajes
        const combineContext = true; 
      }
  
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
      
      // MODIFICADO: Verificar explícitamente si es una consulta/pregunta aquí 
      // para evitar procesamiento duplicado
      const isQuery = contextAnalysis.messageType === 'pregunta' || 
                      contextAnalysis.messageType === 'consulta' ||
                      this.isQueryMessage(message.toLowerCase());
      
      // Configurar prompt específico según el estado actual y análisis
      let promptType = 'general';
      let promptSpecific;
  
      // Verificar si debemos incluir sugerencia en la misma respuesta
      const includeSuggestion = contextAnalysis.nextActionSuggestion && 
                               (this.interactionCounter[to] % 3 === 0); // Sugerir cada 3 interacciones
  
      // MODIFICADO: Usar lógica unificada para mensajes de consulta vs generales
      if (isQuery) {
        // Manejar caso de consulta específica
        promptType = 'consulta_con_sugerencia';
        
        promptSpecific = `
          El usuario está haciendo una consulta sobre: "${message}".
          Su etapa de compra es: ${contextAnalysis.purchaseStage}.
          Los temas mencionados son: ${contextAnalysis.topics.join(', ')}.
          
          ${includeSuggestion ? 
            `Después de tu respuesta principal, incluye en el mismo mensaje una breve sugerencia
            relacionada con los temas mencionados. La sugerencia debe guiar al usuario hacia un 
            siguiente paso natural.` : 
            `Genera una respuesta clara y directa, sin sugerencias adicionales.`}
        `;
      }
      // Personalizar según el estado actual para casos NO-consulta
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
      else if (state.intent === 'suggest_appointment') {
        promptType = 'sugerir_agendamiento';
        promptSpecific = `
          El usuario está considerando agendar y dice: "${message}". 
          Genera una respuesta que incentive el agendamiento y pregunte directamente si desea proceder.
        `;
      }
      else {
        // Para casos generales
        promptSpecific = `
          El usuario dice: "${message}". Genera una respuesta útil según el contexto.
          ${includeSuggestion ? 
            `Al final, incluye una breve sugerencia de siguiente paso relacionada con la tienda.` : 
            ``}
        `;
      }
  
      // Generar respuesta con IA (que ahora posiblemente incluye sugerencia)
      let response = await this.generateContextualResponse(to, promptType, promptSpecific);
  
      console.log(`✅ Generando respuesta tipo ${promptType} (incluye sugerencia: ${includeSuggestion ? 'sí' : 'no'})`);
      
      // Verificar si existe un análisis de contexto unificado reciente
if (this.unifiedContextAnalysis && this.unifiedContextAnalysis.has(to)) {
  const unifiedData = this.unifiedContextAnalysis.get(to);
  const isRecent = (Date.now() - unifiedData.timestamp) < 30000; // 30 segundos
  
  if (isRecent && Array.isArray(unifiedData.relatedMessageIds) && 
      unifiedData.relatedMessageIds.includes(messageId)) {
    // Usar el análisis unificado en lugar del individual
    console.log(`🔄 Usando análisis de contexto unificado para evitar respuestas duplicadas`);
    contextAnalysis = unifiedData.analysis;
    
    // Limpiar después de usar para evitar reutilización inapropiada
    setTimeout(() => {
      this.unifiedContextAnalysis.delete(to);
    }, 5000);
  }
}
      // Humanizar respuesta
      const userData = this.userProfiles.getPersonalizationData(to);
      response = HumanLikeUtils.addResponseVariability(response);
      
      // Añadir errores humanos ocasionalmente (solo 10% del tiempo en este caso)
      if (Math.random() > 0.9) {
        response = HumanLikeUtils.addHumanLikeErrors(response);
      }
      
      // Añadir retraso humanizado
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
      
      // Asegurarse de llamar finishMessageProcessing correctamente
      try {
        this.finishMessageProcessing(to, messageId);
      } catch (cleanupError) {
        console.log(`⚠️ Error menor limpiando estado de procesamiento: ${cleanupError.message}`);
      }
  
    } catch (error) {
      console.error("❌ Error en flujo asistente IA:", error);
      await whatsappService.sendMessage(to, 'Ocurrió un error. Por favor, intenta de nuevo.', messageId);
      this.updateConversationHistory(to, 'assistant', 'Ocurrió un error. Por favor, intenta de nuevo.');
      
      // Aún así, tratar de limpiar el procesamiento
      try {
        this.finishMessageProcessing(to, messageId);
      } catch (cleanupError) {
        console.log(`⚠️ Error en limpieza: ${cleanupError.message}`);
      }
    }
  }

  // MÉTODO MEJORADO PARA FLUJO DE AGENDAMIENTO CON SOPORTE PARA MENSAJES MÚLTIPLES
  async handleAppointmentFlow(to, message, messageId) {
    try {
      if (!this.appointmentState[to]) {
        this.appointmentState[to] = { step: 'name' };
        
        // Usar IA para generar mensaje inicial
        let response = await this.generateContextualResponse(
          to, 
          'iniciar_agendamiento',
          'Genera un mensaje para iniciar el proceso de agendamiento pidiendo el nombre del cliente'
        );
        
        // Humanizar respuesta
        response = HumanLikeUtils.addResponseVariability(response);
        
        // Añadir retraso humanizado
        await HumanLikeUtils.simulateTypingIndicator(response.length);
        
        await whatsappService.sendMessage(to, response, messageId);
        this.updateConversationHistory(to, 'assistant', response);
        return;
      }

      const state = this.appointmentState[to];
      let response;
      let promptType = 'agendamiento';
      let nextStep = state.step;

      // NUEVO: Parsear mensajes múltiples con inteligencia
      const messageParts = this.parseMultipleInputs(message, state.step);
      
      // NUEVO: Registrar información adicional encontrada para usarla después
      if (messageParts.additionalInfo) {
        for (const [key, value] of Object.entries(messageParts.additionalInfo)) {
          if (!state[key] && value) {
            console.log(`💡 Detectada información adicional en mensaje: ${key} = ${value}`);
            state[key] = value;
          }
        }
      }
      
      // Usar el mensaje principal para el flujo actual
      const mainMessage = messageParts.mainPart;

      switch (state.step) {
        case 'name':
          state.name = mainMessage;
          
          // Si ya detectamos la dirección en el mismo mensaje, avanzar dos pasos
          if (state.direccion || state.felicitado) {
            if (state.direccion) {
              nextStep = 'fecha';  // Saltamos dirección porque ya la tenemos
              promptType = 'agendamiento_solicitud_fecha';
            } else {
              nextStep = 'felicitado';
              promptType = 'agendamiento_solicitud_felicitado';
            }
          } else {
            nextStep = 'felicitado';
            promptType = 'agendamiento_solicitud_felicitado';
          }
          break;
          
        case 'felicitado':
          state.felicitado = mainMessage;
          
          // Si ya detectamos la fecha en el mismo mensaje, avanzar
          if (state.fecha) {
            nextStep = 'franja_horaria';
            promptType = 'agendamiento_solicitud_franja';
          } else if (state.direccion) {
            nextStep = 'fecha';
            promptType = 'agendamiento_solicitud_fecha';
          } else {
            nextStep = 'fecha';
            promptType = 'agendamiento_solicitud_fecha';
          }
          break;
          
        case 'fecha':
          // Usar IA para validar formato de fecha
          const fechaValidationPrompt = {
            task: 'validacion_fecha',
            fecha: mainMessage
          };
          
          let fechaValidation = await OpenAiService(fechaValidationPrompt);
          
          // Limpiar cualquier formato markdown del JSON antes de parsearlo
          fechaValidation = fechaValidation.replace(/```json|```/g, '').trim();
          
          // Buscar el inicio y final del JSON si hay texto adicional
          const jsonStart = fechaValidation.indexOf('{');
          const jsonEnd = fechaValidation.lastIndexOf('}') + 1;
          
          if (jsonStart >= 0 && jsonEnd > jsonStart) {
            fechaValidation = fechaValidation.substring(jsonStart, jsonEnd);
          }
          
          try {
            const fechaResult = JSON.parse(fechaValidation);
            
            if (!fechaResult.valid) {
              promptType = 'agendamiento_fecha_invalida';
              // No actualizar nextStep para mantener en este paso
            } else {
              state.fecha = fechaResult.formattedDate; // Usar fecha formateada
              
              // Si ya detectamos la franja horaria en el mensaje, avanzar
              if (state.franja_horaria) {
                nextStep = 'pedido';
                promptType = 'agendamiento_solicitud_pedido';
              } else {
                nextStep = 'franja_horaria';
                promptType = 'agendamiento_solicitud_franja';
              }
            }
          } catch (jsonError) {
            console.error("Error al parsear resultado de validación de fecha:", jsonError);
            console.log("Texto que intentó parsear:", fechaValidation);
            
            // Manejar el error suavemente para el usuario
            promptType = 'agendamiento_fecha_invalida';
            // No actualizar nextStep para mantener en este paso
          }
          break;
          
        case 'franja_horaria':
          // Usar IA para validar franja horaria
          const franjaValidationPrompt = {
            task: 'validacion_franja',
            franja: mainMessage
          };
          
          let franjaValidation = await OpenAiService(franjaValidationPrompt);
          
          // Limpiar cualquier formato markdown del JSON antes de parsearlo
          franjaValidation = franjaValidation.replace(/```json|```/g, '').trim();
          
          // Buscar el inicio y final del JSON si hay texto adicional
          const franjaJsonStart = franjaValidation.indexOf('{');
          const franjaJsonEnd = franjaValidation.lastIndexOf('}') + 1;
          
          if (franjaJsonStart >= 0 && franjaJsonEnd > franjaJsonStart) {
            franjaValidation = franjaValidation.substring(franjaJsonStart, franjaJsonEnd);
          }
          
          try {
            const franjaResult = JSON.parse(franjaValidation);
            
            if (!franjaResult.valid) {
              promptType = 'agendamiento_franja_invalida';
              // No actualizar nextStep para mantener en este paso
            } else {
              state.franja_horaria = franjaResult.normalizedValue; // Usar valor normalizado
              
              // Si ya detectamos información del pedido en el mensaje, avanzar
              if (state.pedido) {
                nextStep = 'confirmacion';
                promptType = 'agendamiento_solicitud_confirmacion';
              } else {
                nextStep = 'pedido';
                promptType = 'agendamiento_solicitud_pedido';
              }
            }
          } catch (jsonError) {
            console.error("Error al parsear resultado de validación de franja:", jsonError);
            console.log("Texto que intentó parsear:", franjaValidation);
            
            // Manejar el error suavemente para el usuario
            promptType = 'agendamiento_franja_invalida';
            // No actualizar nextStep para mantener en este paso
          }
          break;
          
        case 'pedido':
          if (!mainMessage.trim()) {
            promptType = 'agendamiento_pedido_invalido';
          } else {
            state.pedido = mainMessage;
            
            // Si ya detectamos dirección en el mensaje, usarla
            if (state.direccion) {
              nextStep = 'confirmacion';
              promptType = 'agendamiento_solicitud_confirmacion';
            } else {
              // Pedir dirección si no se ha proporcionado antes
              nextStep = 'direccion';
              promptType = 'agendamiento_solicitud_direccion';
            }
          }
          break;
          
        case 'direccion':
          state.direccion = mainMessage;
          nextStep = 'confirmacion';
          promptType = 'agendamiento_solicitud_confirmacion';
          break;
          
        case 'confirmacion':
          if (this.isPositiveResponse(mainMessage)) {
            // Completar el agendamiento
            response = this.completeAppointment(to);
            this.updateConversationHistory(to, 'assistant', response);
            
            // Añadir retraso humanizado
            await HumanLikeUtils.simulateTypingIndicator(response.length);
            
            await whatsappService.sendMessage(to, response, messageId);
            
            // Enviar mensaje de seguimiento generado por IA
            const followupPrompt = `
              El usuario ha completado el agendamiento exitosamente. 
              Datos: Nombre: ${state.name}, Felicitado: ${state.felicitado}, 
              Fecha: ${state.fecha}, Franja: ${state.franja_horaria}, 
              Pedido: ${state.pedido}, Dirección: ${state.direccion || 'No proporcionada'}.
              
              Genera un mensaje de seguimiento amable ofreciendo asistencia adicional.
            `;
            
            let followupMsg = await this.generateContextualResponse(to, 'agendamiento_completado', followupPrompt);
            
            // Humanizar respuesta
            followupMsg = HumanLikeUtils.addResponseVariability(followupMsg);
            
            // Añadir retraso humanizado (más largo para simular procesamiento)
            await HumanLikeUtils.simulateTypingIndicator(followupMsg.length * 1.5);
            
            await whatsappService.sendMessage(to, followupMsg, messageId);
            this.updateConversationHistory(to, 'assistant', followupMsg);
            
            return;
          } else if (mainMessage.toLowerCase().includes('no')) {
            promptType = 'agendamiento_cancelado';
            delete this.appointmentState[to];
            // Reiniciar el estado de asistente
            this.assistantState[to] = { step: 'general_inquiry' };
          } else {
            promptType = 'agendamiento_confirmacion_invalida';
            // No actualizar nextStep
          }
          break;
          
        default:
          promptType = 'agendamiento_reinicio';
          delete this.appointmentState[to];
          this.assistantState[to] = { step: 'general_inquiry' };
      }

      // Actualizar el paso si es necesario
      if (nextStep !== state.step) {
        state.step = nextStep;
      }

      // NUEVO: Generar un prompt que tenga en cuenta la información extra detectada
      let extraInfoText = '';
      if (messageParts.additionalInfo && Object.keys(messageParts.additionalInfo).length > 0) {
        extraInfoText = `También se detectó información adicional que se ha guardado: ${
          Object.entries(messageParts.additionalInfo)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ')
        }.`;
      }

      // Generar respuesta contextual con IA
      const promptSpecific = `
        El usuario está en el paso "${state.step}" del proceso de agendamiento y respondió: "${message}".
        ${state.name ? `Nombre: ${state.name}.` : ''}
        ${state.felicitado ? `Felicitado: ${state.felicitado}.` : ''}
        ${state.fecha ? `Fecha: ${state.fecha}.` : ''}
        ${state.franja_horaria ? `Franja: ${state.franja_horaria}.` : ''}
        ${state.pedido ? `Pedido: ${state.pedido}.` : ''}
        ${state.direccion ? `Dirección: ${state.direccion}.` : ''}
        ${extraInfoText}
        
        Genera una respuesta apropiada para este paso del agendamiento.
      `;
      
      response = await this.generateContextualResponse(to, promptType, promptSpecific);
      
      // Humanizar respuesta
      response = HumanLikeUtils.addResponseVariability(response);
      
      // Añadir retraso humanizado
      await HumanLikeUtils.simulateTypingIndicator(response.length);
      
      await whatsappService.sendMessage(to, response, messageId);
      this.updateConversationHistory(to, 'assistant', response);

      console.log(`✅ Flujo de agendamiento paso "${state.step}" completado`);
    } catch (error) {
      console.error("❌ Error en flujo de agendamiento:", error);
      await whatsappService.sendMessage(to, 'Hubo un error en el flujo. Por favor, intenta de nuevo.', messageId);
      this.updateConversationHistory(to, 'assistant', 'Hubo un error en el flujo. Por favor, intenta de nuevo.');
    }
  }

  // NUEVO: Método para parsear mensajes múltiples y extraer información relevante
  parseMultipleInputs(message, currentStep) {
  // Por defecto, usamos todo el mensaje como la parte principal
  const result = {
    mainPart: message,
    additionalInfo: {}
  };
  
  // Análisis contextual basado en patrones
  const addressPattern = /\b(calle|carrera|avenida|diagonal|transversal|cr|cra|cl|av|diag|trans|kra)[\s\.]*\d+[\s\w\-\.#]+/i;
  const cityPattern = /\b(en|de)\s+([a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+)\b/i;
  const phonePattern = /\b(numero|teléfono|telefono|tel|celular|contacto|whatsapp|#)\s*[\d\-\+]+\b/i;
  const namePattern = /\b([A-Za-záéíóúÁÉÍÓÚüÜñÑ]{2,}\s+[A-Za-záéíóúÁÉÍÓÚüÜñÑ]{2,})\b/;
  
  // Dividir el mensaje en partes si contiene separadores comunes
  const parts = message.split(/[,.;:\n]+/).map(part => part.trim()).filter(part => part.length > 0);
  
  if (parts.length <= 1) {
    // Buscar información en el mensaje completo si no hay múltiples partes
    const addressMatch = message.match(addressPattern);
    const cityMatch = message.match(cityPattern);
    const phoneMatch = message.match(phonePattern);
    const nameMatch = message.match(namePattern);
    
    if (addressMatch) result.additionalInfo.direccion = addressMatch[0];
    if (cityMatch) result.additionalInfo.ciudad = cityMatch[2];
    if (phoneMatch) result.additionalInfo.contacto = phoneMatch[0];
    if (nameMatch && currentStep !== 'name') result.additionalInfo.nombre = nameMatch[1];
    
    return result;
  }
  
  // La primera parte suele ser la respuesta principal al paso actual
  result.mainPart = parts[0];
  
  // Analizar el resto de partes para detectar información adicional
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // Detectar dirección
    const addressMatch = part.match(addressPattern);
    if (addressMatch) {
      result.additionalInfo.direccion = addressMatch[0];
      // Si esta es la primera parte y estamos en otro paso, actualizar la parte principal
      if (i === 0 && currentStep !== 'direccion') {
        result.mainPart = addressMatch[0];
      }
      continue;
    }
    
    // Detectar ciudad
    const cityMatch = part.match(cityPattern);
    if (cityMatch) {
      result.additionalInfo.ciudad = cityMatch[2];
      continue;
    }
    
    // Detectar contacto
    const phoneMatch = part.match(phonePattern);
    if (phoneMatch) {
      result.additionalInfo.contacto = phoneMatch[0];
      continue;
    }
    
    // Detectar posibles nombres
    const nameMatch = part.match(namePattern);
    if (nameMatch && part.length > 5) {
      // Determinar si es nombre o felicitado basado en el contexto
      if (currentStep === 'name') {
        result.mainPart = nameMatch[1];
      } else if (currentStep === 'felicitado') {
        result.mainPart = nameMatch[1];
      } else {
        result.additionalInfo.nombre = nameMatch[1];
      }
      continue;
    }
    
    // Detectar fecha
    const dateMatch = part.match(/\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?/);
    if (dateMatch) {
      result.additionalInfo.fecha = dateMatch[0];
      if (currentStep === 'fecha') {
        result.mainPart = dateMatch[0];
      }
      continue;
    }
    
    // Detectar franja horaria
    if (
      part.toLowerCase().includes('mañana') || 
      part.toLowerCase().includes('tarde') || 
      part.toLowerCase().includes('noche') ||
      part.toLowerCase().includes('hora') ||
      /\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m|p\.m)/i.test(part)
    ) {
      result.additionalInfo.franja_horaria = part;
      if (currentStep === 'franja_horaria') {
        result.mainPart = part;
      }
      continue;
    }
    
    // Si el paso actual es 'pedido' o partes largas podrían ser un pedido
    if ((currentStep === 'pedido' || part.length > 15) && 
        !result.additionalInfo.pedido &&
        !part.match(addressPattern) && 
        !part.match(phonePattern)) {
      result.additionalInfo.pedido = part;
    }
  }
  
  // Optimización: si tenemos dirección y ciudad separadas, combinarlas
  if (result.additionalInfo.direccion && result.additionalInfo.ciudad) {
    result.additionalInfo.direccion_completa = 
      `${result.additionalInfo.direccion}, ${result.additionalInfo.ciudad}`;
  }
  
  return result;
}

isResponseSimilarToRecent(userId, proposedResponse, timeWindow = 60000) {
  // Obtener el historial de conversación del usuario
  const history = this.conversationHistory[userId] || [];
  
  // Si no hay historial, no puede haber respuestas similares
  if (history.length < 2) return false;
  
  // Filtrar solo respuestas del asistente recientes
  const recentResponses = history
    .filter(msg => msg.role === 'assistant')
    .slice(-3); // Considerar solo las últimas 3 respuestas
  
  // Verificar si alguna respuesta reciente es similar
  for (const pastResponse of recentResponses) {
    // Calculamos similitud
    const similarity = this.calculateTextSimilarity(
      proposedResponse,
      pastResponse.content
    );
    
    // Si la similitud es alta, consideramos que es una respuesta duplicada
    if (similarity > 0.6) { // Umbral de 60% de similitud
      console.log(`🔄 Detectada respuesta similar (${Math.round(similarity * 100)}% de similitud)`);
      return {
        isDuplicate: true,
        similarResponse: pastResponse.content,
        similarity
      };
    }
  }
  
  return {
    isDuplicate: false
  };
}

// Método auxiliar para calcular similitud entre textos
calculateTextSimilarity(text1, text2) {
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

  // MÉTODO MEJORADO DE COMPLETAR CITA CON CONEXIÓN A GOOGLE SHEETS
  completeAppointment(to) {
    try {
      const appointment = this.appointmentState[to];
      
      // Validación de datos completos antes de guardar
      if (!appointment.name || !appointment.felicitado || !appointment.fecha || 
          !appointment.franja_horaria || !appointment.pedido) {
        console.error("❌ Datos de cita incompletos:", appointment);
        return "Lo siento, faltan datos en tu cita. Por favor, intenta el proceso nuevamente.";
      }
      
      const userData = [
        appointment.name,
        appointment.felicitado,
        appointment.fecha,
        appointment.franja_horaria,
        appointment.pedido,
        appointment.direccion || "No proporcionada",
        new Date().toISOString()
      ];
      
      console.log("📊 Intentando guardar cita en Google Sheets:", userData);
      
      // Guardar en Google Sheets y manejar posibles errores
      try {
        appendToSheet(userData);
        console.log("✅ Cita guardada en Google Sheets correctamente");
      } catch (sheetError) {
        console.error("❌ Error guardando en Google Sheets:", sheetError);
        // No lanzar error, continuar con el flujo para dar buena experiencia al usuario
      }
      
      // Limpiar estado de agendamiento
      delete this.appointmentState[to];
      
      // Reiniciar el estado de asistente para continuar la conversación
      this.assistantState[to] = { 
        step: 'post_appointment',
        lastAction: 'appointment_completed'
      };
      
      // Reiniciar el contador de interacciones
      this.interactionCounter[to] = 0;
      
      // Actualizar perfil de usuario con la información de la cita
      this.userProfiles.updateUserProfile(to, {
        name: appointment.name,
        lastAppointment: {
          felicitado: appointment.felicitado,
          fecha: appointment.fecha,
          pedido: appointment.pedido,
          direccion: appointment.direccion
        }
      });
      
      return `¡Gracias por agendar tu pedido!\n\nResumen:\nNombre: ${appointment.name}\nFelicitado: ${appointment.felicitado}\nFecha: ${appointment.fecha}\nFranja horaria: ${appointment.franja_horaria}\nPedido: ${appointment.pedido}\n${appointment.direccion ? `Dirección: ${appointment.direccion}\n` : ''}Nos pondremos en contacto contigo pronto para confirmar los detalles.`;
    } catch (error) {
      console.error("❌ Error al completar cita:", error);
      return "Lo siento, hubo un problema al guardar tu cita. Por favor, intenta nuevamente o contáctanos directamente.";
    }
  }

  // MÉTODOS AUXILIARES MEJORADOS
  
  // Método para enviar catálogo
  async sendMedia(to, messageId) {
    try {
      console.log(`📤 Enviando catálogo a ${to}`);
      
      const mediaUrl = 'https://s3.us-east-2.amazonaws.com/prueba.api.whatsapp/Copia+de+Catalogo+Dommo+%5BTama%C3%B1o+original%5D.pdf';
      const caption = 'Catálogo Dommo';
      const type = 'document';
      
      try {
        // Añadir retraso humanizado antes de enviar (simular que lo está buscando)
        await HumanLikeUtils.simulateTypingIndicator(2000); // Retraso base de 2 segundos
        
        await whatsappService.sendMediaMessage(to, type, mediaUrl, caption, messageId);
        console.log("✅ Documento enviado correctamente");
        
        // Asegurar que se establece el estado del asistente para continuar la conversación
        this.assistantState[to] = { 
          step: 'sales_interaction', 
          intent: 'catalog_inquiry',
          catalogSent: true // Marcador específico para saber que acabamos de enviar el catálogo
        };
        
        // Enviar mensaje de seguimiento después del catálogo (usando IA)
        let followupMsg = await this.generateContextualResponse(
          to,
          'catalogo_enviado',
          'Acabamos de enviar el catálogo. Genera un mensaje de seguimiento ofreciendo ayuda adicional'
        );
        
        // Humanizar respuesta
        followupMsg = HumanLikeUtils.addResponseVariability(followupMsg);
        
        // Añadir retraso humanizado
        await HumanLikeUtils.simulateTypingIndicator(followupMsg.length);
        
        await whatsappService.sendMessage(to, followupMsg, messageId);
        this.updateConversationHistory(to, 'assistant', followupMsg);
        
        return true;
      } catch (mediaError) {
        console.error("❌ Error al enviar documento:", mediaError);
        
        // Alternativa: enviar como texto con enlace
        const catalogoMsg = `Aquí tienes nuestro catálogo de productos 📑\n\n${mediaUrl}\n\nPuedes descargarlo haciendo clic en el enlace. ¿Hay algún producto específico que te interese? También puedo explicarte el proceso de compra.`;
        
        await whatsappService.sendMessage(to, catalogoMsg, messageId);
        this.updateConversationHistory(to, 'assistant', catalogoMsg);
        console.log("✅ Enlace de catálogo enviado como alternativa");
        
        // Establecer estado igual que arriba
        this.assistantState[to] = { 
          step: 'sales_interaction', 
          intent: 'catalog_inquiry',
          catalogSent: true
        };
        
        return true;
      }
    } catch (error) {
      console.error("🔥 Error al enviar catálogo:", error);
      // Mensaje de error amigable
      const errorMsg = "Lo siento, tuve un problema al enviarte el catálogo. Puedes acceder a nuestro catálogo en línea en este enlace: https://s3.us-east-2.amazonaws.com/prueba.api.whatsapp/Copia+de+Catalogo+Dommo+%5BTama%C3%B1o+original%5D.pdf";
      await whatsappService.sendMessage(to, errorMsg, messageId);
      this.updateConversationHistory(to, 'assistant', errorMsg);
      throw error;
    }
  }

  // Método para enviar bienvenida (mejorado con IA)
  // Método para enviar bienvenida (mejorado con IA y manejo de errores)
async sendWelcomeMessage(to, messageId, senderInfo) {
  try {
    const senderName = this.getSenderName(senderInfo);
    
    // Actualizar perfil de usuario con el nombre
    this.userProfiles.updateUserProfile(to, {
      name: senderName,
      firstContact: new Date()
    });
    
    // MENSAJE PREDETERMINADO (en caso de que falle la IA)
    let welcomeMessage = `¡Hola${senderName ? ' ' + senderName : ''}! Soy el asistente virtual de la tienda de rosas preservadas. ¿En qué puedo ayudarte hoy?`;
    
    try {
      // Intentar generar mensaje personalizado con IA
      const welcomePrompt = `
        El usuario ${senderName} acaba de saludar por primera vez.
        Genera un mensaje de bienvenida personalizado, amable y conciso.
        Menciona que eres un asistente virtual y ofrece ayuda con productos o información.
      `;
      
      const aiResponse = await this.generateContextualResponse(to, 'bienvenida', welcomePrompt);
      
      // Si la IA respondió correctamente, usar su respuesta
      if (aiResponse && aiResponse.length > 20) {
        welcomeMessage = aiResponse;
        console.log("✅ Respuesta de bienvenida generada por IA");
      }
    } catch (aiError) {
      console.error("⚠️ Error al generar bienvenida con IA, usando mensaje predeterminado:", aiError);
      // Continuar con el mensaje predeterminado
    }
    
    // Humanizar respuesta
    try {
      welcomeMessage = HumanLikeUtils.addResponseVariability(welcomeMessage);
    } catch (humanizeError) {
      console.error("⚠️ Error al humanizar respuesta:", humanizeError);
      // Continuar con el mensaje sin humanizar
    }
    
    // Añadir retraso humanizado antes de responder
    try {
      await HumanLikeUtils.simulateTypingIndicator(
        to,
        welcomeMessage.length,
        messageId,
        'normal'
      );
    } catch (typingError) {
      console.error("⚠️ Error al simular escritura:", typingError);
      // Continuar sin simulación
    }
    
    // Enviar respuesta de bienvenida
    await whatsappService.sendMessage(to, welcomeMessage, messageId);
    
    // Actualizar historial de conversación
    this.updateConversationHistory(to, 'assistant', welcomeMessage);
    console.log("✅ Mensaje de bienvenida enviado");
    
    return true;
  } catch (error) {
    console.error("❌ Error al enviar bienvenida:", error);
    
    // Mensaje de respaldo en caso de error fatal
    try {
      const fallbackMsg = `¡Hola! Soy el asistente virtual de la tienda de rosas preservadas. ¿En qué puedo ayudarte hoy?`;
      await whatsappService.sendMessage(to, fallbackMsg, messageId);
      this.updateConversationHistory(to, 'assistant', fallbackMsg);
      
      return true;
    } catch (fallbackError) {
      console.error("💥 Error fatal al enviar mensaje de respaldo:", fallbackError);
      return false;
    }
  }
}

  // Método para obtener nombre del remitente
  getSenderName(senderInfo) {
    return senderInfo?.profile?.name || senderInfo.wa_id || '';
  }

  // Funciones de detección mejoradas
  // Funciones de detección mejoradas
isGreeting(message) {
  const messageLower = message.toLowerCase();
  
  // Saludos comunes
  const greetings = ['hey', 'hola', 'ola', 'buenos días', 'buenas tardes', 'buenas noches', 'saludos', 'qué tal', 'buen día'];
  
  // MEJORA: Detectar si el saludo es parte de una pregunta o consulta completa
  const questionPattern = /\?/;
  const requestPattern = /(necesito|quiero|busco|dame)/;
  
  // Si el mensaje contiene un saludo pero también una pregunta o solicitud,
  // posiblemente es una consulta completa y no solo un saludo
  const containsGreeting = greetings.some(greeting => messageLower.includes(greeting));
  const isCompleteMessage = questionPattern.test(messageLower) || requestPattern.test(messageLower);
  
  // Si es un mensaje completo con saludo + consulta, no tratarlo solo como saludo
  if (containsGreeting && isCompleteMessage && message.length > 15) {
    console.log("🔍 Mensaje contiene saludo y consulta/pregunta, tratando como consulta completa");
    return false;
  }
  
  return containsGreeting;
}

  isQueryMessage(message) {
    const messageLower = message.toLowerCase();
    
    // Detección normal de preguntas
    if (message.includes('?')) {
      return true;
    }
    
    // Detectar palabras interrogativas comunes en español
    const questionWords = ['que', 'qué', 'cual', 'cuál', 'como', 'cómo', 'donde', 'dónde', 
      'cuando', 'cuándo', 'cuanto', 'cuánto', 'por qué', 'quién', 'quien', 'dime', 'explica', 'háblame'];
    
    // Detectar consultas explícitas
    const queryPhrases = ['me puedes', 'puedes', 'podrías', 'podrias', 'me gustaría saber', 
      'quiero saber', 'dame', 'dime', 'explica', 'info', 'información', 'cuéntame', 'cuentame',
      'me gustaria', 'proceso', 'como es', 'cómo es', 'pasos', 'procedimiento'];
    
    // Detección para preguntas sobre procesos de compra
    const purchaseKeywords = [
      'proceso de compra', 'comprar', 'adquirir', 'pedido', 'ordenar', 'pagar', 
      'cómo compro', 'como compro', 'forma de pago', 'método de pago', 'envío',
      'entrega', 'domicilio', 'hacer un pedido', 'realizar compra', 'proceso'
    ];
    
    return questionWords.some(word => messageLower.startsWith(word)) ||
           queryPhrases.some(phrase => messageLower.includes(phrase)) ||
           purchaseKeywords.some(keyword => messageLower.includes(keyword));
  }

  isPositiveResponse(message) {
    const messageLower = message.toLowerCase();
    const positiveKeywords = ['sí', 'si', 'claro', 'por supuesto', 'me gustaría', 'ok', 'okay', 'vale', 'bueno', 'está bien', 'de acuerdo', 'adelante'];
    return positiveKeywords.some(keyword => messageLower.includes(keyword));
  }
}

export default new MessageHandler();