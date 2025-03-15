import path from 'path';
import { google } from 'googleapis';
import config from '../config/env.js';  // Añadido import de config

const sheets = google.sheets('v4');

async function addRowToSheet(auth, spreadsheetId, values){
    const request = {
        spreadsheetId,
        range: 'pedidos', // Nombre de la hoja donde se van a insertar los datos en el sheet
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
            values: [values],
        },
        auth,
    }

    try {
        const response = (await sheets.spreadsheets.values.append(request)).data;
        console.log("✅ Datos añadidos a Google Sheets con éxito:", response);
        return response;
    } catch (error) {
        console.error("❌ Error al añadir datos a Google Sheets:", error);   
        throw error; // Propagar el error para mejor manejo
    }
}

const appendToSheet = async (data) => {
    try {
        console.log("📊 Intentando guardar datos en Google Sheets:", data);
        
        // Verificar que existe la configuración necesaria
        if (!config.GOOGLECLOUDURL || !config.SPREADSHEET_ID) {
            throw new Error("Falta configuración de Google Sheets en variables de entorno");
        }
        
        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(process.cwd(), 'src/credentials', 'credentials.json'),
            scopes: [config.GOOGLECLOUDURL], 
        });

        const authCliente = await auth.getClient();
        const spreadsheetId = config.SPREADSHEET_ID;

        await addRowToSheet(authCliente, spreadsheetId, data);
        console.log("✅ Datos guardados en Google Sheets correctamente");
        return 'Datos correctamente guardados';

    } catch (error) {
        console.error("❌ Error en appendToSheet:", error);
        throw error; // Propagar el error para mejor manejo
    }
}

export default appendToSheet;