import whatsappService from './whatsappService.js';

class MessageHandler {
  async handleIncomingMessage(message) {
    if (message?.type === 'text') {
      const IncomingMessage = message.text.body.toLowerCase().trim();

      if(this.isGreetings(IncomingMessage)) {
        await this.sendWelcomeMessage(message.from, message.id);
      }  else {
        const response = `Echo: ${message.text.body}`;
        await whatsappService.sendMessage(message.from, response, message.id);
      }
      await whatsappService.markAsRead(message.id);
    }
  }

  isGreetings(message) {
    const grettings = ['hi', 'hello', 'hey', 'hola', 'ola', 'buenos dias', 'buenas tardes', 'buenas noches', 'precio', 'cotizacion', 'informacion', 'ayuda', 'soporte', 'contacto', 'saludo', 'saludos', 'buen dia', 'buenas tardes', 'buenas noches', 'buenas', 'buen', 'tarde', 'noche', 'dia', 'tardes', 'noches', 'dias'];
    return grettings.includes(message);
  }
async sendWelcomeMessage(to, messageId) {
  const sendWelcomeMessage = `Hola! Soy un bot de WhatsApp. ¿En qué puedo ayudarte?`;
  await whatsappService.sendMessage(to, sendWelcomeMessage, messageId);
  }

}

export default new MessageHandler();