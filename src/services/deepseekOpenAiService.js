import OpenAI from 'openai';
import config from '../config/env.js';

const client = new OpenAI({
    apiKey: config.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com'  // URL base específica para DeepSeek
});

const OpenAiService = async (message) => {
    try {
        const response = await client.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant.'  // Mensaje del sistema más claro
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            model: 'deepseek-chat'
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error en OpenAiService:', error);  // Mensaje de error más descriptivo
        return 'Ocurrió un error al procesar tu consulta. Por favor, intenta de nuevo más tarde.';
    }
};

export default OpenAiService;