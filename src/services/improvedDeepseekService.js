// src/services/improvedDeepseekService.js
import OpenAI from 'openai';
import config from '../config/env.js';

const client = new OpenAI({
  apiKey: config.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com' // URL base específica para DeepSeek
});

// Función para sanitizar respuestas JSON
const sanitizeJsonResponse = (response) => {
  // Eliminar bloques de código markdown
  let sanitized = response.replace(/```json|```/g, '').trim();
  
  // Buscar el inicio y fin del JSON
  const jsonStart = sanitized.indexOf('{');
  const jsonEnd = sanitized.lastIndexOf('}');
  
  if (jsonStart >= 0 && jsonEnd >= 0) {
    return sanitized.substring(jsonStart, jsonEnd + 1);
  }
  
  return sanitized;
};

/**
 * Servicio mejorado de IA con soporte para múltiples tipos de solicitudes
 * @param {Object} requestData - Objeto con datos de la solicitud
 * @returns {Promise<string>} - Respuesta de la IA
 */
const OpenAiService = async (requestData) => {
  try {
    // Si es un string simple, tratar como en la versión anterior (clasificación)
    if (typeof requestData === 'string') {
      const response = await client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `
Eres un asistente de WhatsApp que clasifica mensajes y gestiona flujos.
Tu trabajo es clasificar el mensaje del usuario en una de estas categorías:
- venta: Cualquier mensaje relacionado con compras, precios, productos, servicios disponibles, catálogos, etc.
- soporte: Cualquier mensaje relacionado con problemas, ayuda, asistencia, dudas técnicas, reclamos, etc.
- agendamiento: Cualquier mensaje relacionado con citas, reservas, programación, etc.
- otro: Si no encaja en ninguna categoría anterior, pero debes indagar que es lo que quiere y preguntar

EJEMPLOS DE VENTA:
- "quiero comprar"
- "necesito un producto"
- "precio"
- "cuánto cuesta"
- "tienen disponible"
- "quiero adquirir"
- "me interesa"
- "hay stock"
- "catálogo"
- "promociones"

EJEMPLOS DE SOPORTE:
- "tengo un problema"
- "necesito ayuda"
- "no funciona"
- "error"
- "consulta"
- "duda"
- "reclamo"
- "devolver"

EJEMPLOS DE AGENDAMIENTO:
- "quiero una cita"
- "agendar"
- "reservar"
- "programar visita"
- "día disponible"
- "horario"
- "calendario"

RESPONDE ÚNICAMENTE con la categoría detectada: "venta", "soporte", "agendamiento" o "otro".
NO AGREGUES ninguna explicación ni texto adicional.
`
          },
          {
            role: 'user',
            content: requestData
          }
        ],
        model: 'deepseek-reasoner'
      });

      // Solo devolver la categoría detectada
      const result = response.choices[0].message.content.trim().toLowerCase();
      return result;
    }
    
    // Procesar solicitudes avanzadas basadas en el tipo de tarea
    let systemPrompt = '';
    let userPrompt = '';
    
    switch (requestData.task) {
      case 'analisis_contexto':
        // Análisis de contexto de conversación
        systemPrompt = requestData.systemPrompt || `
    Eres un asistente de WhatsApp para una florería que analiza conversaciones.
    Analiza el historial de conversación y el mensaje actual del usuario.
    Determina:
    - Tipo de mensaje (pregunta, afirmación, solicitud)
    - Temas mencionados (flores, precios, entrega, etc.)
    - Etapa de compra (exploración, consulta, decisión, agendamiento, pago)
    - Flujo sugerido a seguir (ventas, consulta, agendamiento, pago)
    
    IMPORTANTE: Responde DIRECTAMENTE con un objeto JSON simple, SIN usar bloques de código markdown.
    NO uses \`\`\`json ni \`\`\` en tu respuesta.
    El JSON debe tener este formato exacto:
    {"messageType":"valor","topics":["valor1"],"purchaseStage":"valor","suggestedFlow":"valor","nextActionSuggestion":boolean}
  `;
        
        // Construir el contexto de la conversación para el prompt
        const conversationContext = requestData.conversation.map(msg => 
          `${msg.role === 'user' ? 'Cliente' : 'Asistente'}: ${msg.content}`
        ).join('\n');
        
        userPrompt = `
          HISTORIAL DE CONVERSACIÓN:
          ${conversationContext}
          
          MENSAJE ACTUAL DEL CLIENTE:
          ${requestData.currentMessage}
          
          Analiza esta conversación y devuelve DIRECTAMENTE un objeto JSON con:
          {"messageType":"pregunta|solicitud|afirmacion","topics":["tema1","tema2"],"purchaseStage":"exploracion|consulta|decision|agendamiento|pago","suggestedFlow":"ventas|consulta|agendamiento|pago|none","nextActionSuggestion":true|false}
          
          NO USES BLOQUES DE CÓDIGO MARKDOWN. DEVUELVE SOLO EL OBJETO JSON.
        `;
        break;
        
      case 'generacion_respuesta':
        // Generación de respuestas contextuales
        systemPrompt = requestData.systemPrompt || `
          Eres un asistente virtual de WhatsApp para una florería. Debes ser amable,
          útil y conciso. Responde según el tipo de respuesta solicitada y usa la información
          proporcionada de la florería.
        `;
        
        // Preparar información de productos para el contexto
        const productsInfo = requestData.knowledgeBase ? JSON.stringify(requestData.knowledgeBase) : '';
        
        // Construir contexto de conversación con formato mejorado para evitar repeticiones
        const responseContext = requestData.conversation.map((msg, index) => {
          // Añadir número de mensaje para mejor contexto y prevenir repeticiones
          return `${index+1}. ${msg.role === 'user' ? 'Cliente' : 'Asistente'}: ${msg.content}`;
        }).join('\n');
        
        userPrompt = `
          INFORMACIÓN DE LA FLORERÍA:
          ${productsInfo}
          
          HISTORIAL DE CONVERSACIÓN RECIENTE:
          ${responseContext}
          
          ESTADO ACTUAL DEL USUARIO:
          ${JSON.stringify(requestData.stateInfo)}
          
          INSTRUCCIONES ESPECÍFICAS:
          ${requestData.specificPrompt}
          
          TIPO DE RESPUESTA SOLICITADA: ${requestData.responseType}
          
          INSTRUCCIÓN CRÍTICA:
          - NO repitas el mensaje del usuario en tu respuesta
          - NO comiences tus respuestas con "Dices que...", "Mencionas que...", etc.
          - Responde directamente a la consulta sin reiterar lo que ya dijo el cliente
          - Mantén tus respuestas concisas (máximo 4 oraciones)
          - Sé conversacional pero enfocado en proporcionar información útil
          
          Genera una respuesta apropiada según las indicaciones anteriores.
        `;
        break;
        
      case 'validacion_fecha':
        // Validación de formato de fecha
        systemPrompt = `
          Eres un asistente que valida formatos de fecha. 
          Analiza la entrada del usuario y determina si es una fecha válida en cualquier formato común.
          Si es válida, conviértela al formato DD/MM/YYYY.
        `;
        
        userPrompt = `
          Fecha proporcionada por el usuario: "${requestData.fecha}"
          
          Valida si esto es una fecha válida en cualquier formato (DD/MM/YYYY, D/M/YYYY, etc.).
          Si es válida, formátala como DD/MM/YYYY.
          
          Responde con un JSON así:
          {
            "valid": true|false,
            "formattedDate": "DD/MM/YYYY",
            "error": "mensaje de error si hay uno"
          }
        `;
        break;
        
      case 'validacion_franja':
        // Validación de franja horaria
        systemPrompt = `
          Eres un asistente que valida franjas horarias.
          Analiza la entrada del usuario y determina si corresponde a mañana, tarde o noche.
        `;
        
        userPrompt = `
          Franja horaria proporcionada por el usuario: "${requestData.franja}"
          
          Determina si corresponde a "mañana", "tarde" o "noche".
          Considera variaciones como "en la mañana", "por la tarde", etc.
          
          Responde con un JSON así:
          {
            "valid": true|false,
            "normalizedValue": "mañana|tarde|noche",
            "error": "mensaje de error si hay uno"
          }
        `;
        break;
        
      default:
        // Caso por defecto para solicitudes no específicas
        systemPrompt = `
          Eres un asistente virtual para una florería. Responde de forma amable y concisa.
        `;
        userPrompt = requestData.toString();
    }
    
    // Enviar la solicitud al modelo
    const response = await client.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      model: 'deepseek-reasoner', // Se puede ajustar según la tarea
      max_tokens: 800 // Ajustar según sea necesario
    });

    // CORREGIDO: Procesar la respuesta según el tipo de tarea
    if (requestData.task === 'analisis_contexto') {
      return sanitizeJsonResponse(response.choices[0].message.content.trim());
    } else {
      return response.choices[0].message.content.trim();
    }
    
  } catch (error) {
    console.error('Error en OpenAiService mejorado: ', error);
    
    // Manejar errores según el tipo de solicitud
    if (requestData.task === 'analisis_contexto') {
      return JSON.stringify({
        messageType: "desconocido",
        topics: [],
        purchaseStage: "exploracion",
        suggestedFlow: "none",
        nextActionSuggestion: false
      });
    } else if (requestData.task === 'validacion_fecha') {
      return JSON.stringify({
        valid: false,
        error: "Error al validar la fecha"
      });
    } else if (requestData.task === 'validacion_franja') {
      return JSON.stringify({
        valid: false,
        error: "Error al validar la franja horaria"
      });
    }
    
    return "Error al procesar la solicitud";
  }
};

export default OpenAiService;