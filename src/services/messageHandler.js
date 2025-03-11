import whatsappService from './whatsappService.js';
import appendToSheet from './googleSheetsService.js';
import OpenAiService from './deepseekOpenAiService.js';

class MessageHandler {
  constructor() {
    this.appointmentState = {};
    this.assistantState = {};
  }

  async handleIncomingMessage(message, senderInfo) {
    if (message?.type === 'text') {
      const IncomingMessage = message.text.body.toLowerCase().trim();

      // Verifica si el usuario está en un flujo activo
      if (this.appointmentState[message.from]) {
        await this.handleAppointmentFlow(message.from, IncomingMessage, message.id);
      } else if (this.assistantState[message.from]) {
        await this.handleAssistantFlow(message.from, IncomingMessage, message.id);
      } else if (this.isGreeting(IncomingMessage)) {
        await this.sendWelcomeMessage(message.from, message.id, senderInfo);
      } else if (IncomingMessage === 'catalogo') {
        await this.sendMedia(message.from, message.id);
      } else if (IncomingMessage === 'agendar') {
        await this.handleAppointmentFlow(message.from, IncomingMessage, message.id);
      } else if (IncomingMessage === 'consulta') {
        await this.handleAssistantFlow(message.from, IncomingMessage, message.id);
      } else {
        const response = `Echo: ${message.text.body}`;
        await whatsappService.sendMessage(message.from, response, message.id);
      }

      await whatsappService.markAsRead(message.id);
    }
  }

  isGreeting(message) {
    const greetings = [
      'hi', 'hello', 'hey', 'hola', 'ola', 'buenos dias', 'buenas tardes',
      'buenas noches', 'precio', 'cotizacion', 'informacion', 'ayuda',
      'soporte', 'contacto', 'saludo', 'saludos', 'buen dia', 'tarde',
      'noche', 'dia', 'tardes', 'noches', 'dias'
    ];
    return greetings.includes(message);
  }

  getSenderName(senderInfo) {
    return senderInfo?.profile?.name || senderInfo.wa_id || '';
  }

  async sendWelcomeMessage(to, messageId, senderInfo) {
    const name = this.getSenderName(senderInfo);
    const sendWelcomeMessage = `Hola! ${name}, soy un bot de WhatsApp con GenIA. ¿En qué puedo ayudarte?`;
    await whatsappService.sendMessage(to, sendWelcomeMessage, messageId);
  }

  async sendMedia(to) {
    const mediaUrl = 'https://s3.us-east-2.amazonaws.com/prueba.api.whatsapp/Copia+de+Catalogo+Dommo+%5BTama%C3%B1o+original%5D.pdf';
    const caption = 'Catálogo Dommo';
    const type = 'document';

    await whatsappService.sendMediaMessage(to, type, mediaUrl, caption);
  }

  completeAppointment(to) {
    const appointment = this.appointmentState[to];
    delete this.appointmentState[to];

    const userData = [
      to,
      appointment.name,
      appointment.felicitado,
      appointment.fecha,
      appointment.franjaHoraria,
      appointment.pedido,
      new Date().toISOString()
    ];

    appendToSheet(userData);

    return `Gracias por agendar tu cita.
    Resumen de tu cita:
    
    Nombre: ${appointment.name}
    Felicitado: ${appointment.felicitado}
    Fecha: ${appointment.fecha}
    Franja horaria: ${appointment.franjaHoraria}
    Pedido: ${appointment.pedido}
    
    Nos pondremos en contacto contigo cuando tengas la cita`;
  }

  async handleAppointmentFlow(to, message, messageId) {
    try {
      if (!this.appointmentState[to]) {
        this.appointmentState[to] = { step: 'name' };
        const response = '¿Cuál es el nombre de la persona que quieres felicitar?';
        await whatsappService.sendMessage(to, response, messageId);
        return;
      }

      const state = this.appointmentState[to];
      let response;

      switch (state.step) {
        case 'name':
          state.name = message;
          state.step = 'felicitado';
          response = '¿Cuál es el nombre de la persona que quieres felicitar?';
          break;
        case 'felicitado':
          state.felicitado = message;
          state.step = 'fecha';
          response = '¿Cuál es la fecha del domicilio?';
          break;
        case 'fecha':
          state.fecha = message;
          state.step = 'franja-horaria';
          response = '¿En qué franja horaria deseas la entrega?';
          break;
        case 'franja-horaria':
          state.franjaHoraria = message;
          state.step = 'pedido';
          response = '¿Qué deseas pedir?';
          break;
        case 'pedido':
          state.pedido = message;
          state.step = 'confirmacion';
          response = '¿Deseas confirmar la cita? Responde "sí" o "no".';
          break;
        case 'confirmacion':
          if (message.toLowerCase() === 'sí' || message.toLowerCase() === 'si') {
            response = this.completeAppointment(to);
          } else if (message.toLowerCase() === 'no') {
            response = 'Cita cancelada. Puedes empezar de nuevo cuando quieras.';
            delete this.appointmentState[to];
          } else {
            response = 'Por favor, responde con "sí" o "no".';
          }
          break;
        default:
          response = 'No entendí tu respuesta. Vamos a comenzar de nuevo.';
          delete this.appointmentState[to];
      }

      if (!response) {
        response = 'Ocurrió un error. Por favor, intenta de nuevo.';
      }

      await whatsappService.sendMessage(to, response, messageId);
    } catch (error) {
      console.error('Error en el flujo de agendamiento:', error);
      await whatsappService.sendMessage(
        to,
        'Hubo un error en el flujo. Por favor, intenta de nuevo.',
        messageId
      );
    }
  }

  async handleAssistantFlow(to, message, messageId) {
    try {
        // Si no hay estado, iniciar el flujo
        if (!this.assistantState[to]) {
            this.assistantState[to] = { step: 'question' };
            const response = '¿Cuál es tu consulta?';
            await whatsappService.sendMessage(to, response, messageId);
            return;
        }

        const state = this.assistantState[to];
        let response;

        if (state.step === 'question') {
            // Obtener la respuesta de la IA
            response = await OpenAiService(message);
            await whatsappService.sendMessage(to, response, messageId);
            
            // Preguntar si desea continuar
            state.step = 'ask_continue';
            const continueMessage = '¿Tienes alguna otra pregunta sobre el producto o deseas continuar con tu pedido?';
            await whatsappService.sendMessage(to, continueMessage, messageId);
        } else if (state.step === 'ask_continue') {
            // Analizar la respuesta del usuario
            const userResponse = message.toLowerCase();
            if (userResponse.includes('no') || userResponse.includes('gracias') || userResponse.includes('eso es todo') || userResponse.includes('continuar con el pedido')) {
                // Cerrar el flujo si el usuario no quiere más consultas
                response = 'Gracias por tu consulta. Si necesitas más ayuda, no dudes en contactarnos nuevamente.';
                await whatsappService.sendMessage(to, response, messageId);
                delete this.assistantState[to]; // Eliminar el estado para cerrar el flujo
            } else {
                // Volver al estado de pregunta si el usuario quiere continuar
                state.step = 'question';
                response = 'Por favor, haz tu siguiente consulta.';
                await whatsappService.sendMessage(to, response, messageId);
            }
        } else {
            // Reiniciar si el estado es inválido
            response = 'No entendí tu respuesta. Vamos a comenzar de nuevo.';
            await whatsappService.sendMessage(to, response, messageId);
            delete this.assistantState[to];
        }
    } catch (error) {
        console.error('Error en el flujo de asistente:', error);
        await whatsappService.sendMessage(
            to,
            'Hubo un error en el flujo. Por favor, intenta de nuevo.',
            messageId
        );
   }  }
}

export default new MessageHandler();