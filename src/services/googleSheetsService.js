import path from 'path';
import { google } from 'googleapis';

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
        return response;
    } catch (error) {
        console.error(error);   
    }
}

const appendToSheet = async (data) => {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(process.cwd(), 'src/credentials','credentials.json'),
            scopes: [config.GOOGLECLOUDURL], 
        });

        const authCliente = await auth.getClient();
        const spreadsheetId = config.SPREADSHEET_ID

        await addRowToSheet(authCliente, spreadsheetId, data);
        return 'Datos correctamente guardados';

    } catch (error) {
        console.error(error);
    }
}

export default appendToSheet;