import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

admin.initializeApp();

const ONESIGNAL_APP_ID = 'e1dcfeb7-6f34-440a-b65c-f61e2b3253a2';
const ONESIGNAL_REST_KEY = 'os_v2_app_4hop5n3pgrcavns46ypcwmstujyv4dga5npeinn5ydjjp2ewvmjih7brfkklwx4gvd774vehuhyt5gwzolbtcru56aob6up6zbrrlxq';

/**
 * Função genérica para enviar push via REST API do OneSignal
 */
async function sendPushNotification(targetUserId: string, title: string, body: string, data: any = {}) {
    try {
        const payload = {
            app_id: ONESIGNAL_APP_ID,
            // Alveja o usuário pelo UID do Firebase que foi vinculado no frontend via OneSignal.login()
            include_external_user_ids: [targetUserId],
            headings: { en: title, pt: title },
            contents: { en: body, pt: body },
            data: data,
            priority: 10, // Prioridade alta para despertar o celular
            android_visibility: 1,
            ios_badgeType: 'Increase',
            ios_badgeCount: 1,
            web_buttons: data.type === 'CALL' ? [
                { id: 'answer', text: 'Atender', icon: 'https://cdn-icons-png.flaticon.com/512/5585/5585856.png' }
            ] : []
        };

        const response = await axios.post(
            'https://onesignal.com/api/v1/notifications',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Authorization': `Basic ${ONESIGNAL_REST_KEY}`
                }
            }
        );
        console.log(`Push enviado para ${targetUserId}:`, response.data);
        return response.data;
    } catch (error: any) {
        console.error(`Erro ao enviar push para ${targetUserId}:`, error?.response?.data || error.message);
        return null;
    }
}

/**
 * Gatilho: Nova Mensagem no Chat
 */
export const onNewMessagePush = functions.firestore
    .document('conversations/{conversationId}/messages/{messageId}')
    .onCreate(async (snap, context) => {
        const msg = snap.data();
        if (!msg || msg.senderId === 'system') return null;

        const { conversationId } = context.params;
        
        // Busca a conversa para identificar o destinatário
        const convDoc = await admin.firestore().collection('conversations').doc(conversationId).get();
        const convData = convDoc.data();
        if (!convData) return null;

        const recipientId = (convData.participants as string[]).find(uid => uid !== msg.senderId);
        if (!recipientId) return null;

        // Busca o nome de quem enviou
        const senderDoc = await admin.firestore().collection('users').doc(msg.senderId).get();
        const senderName = senderDoc.data()?.username || "Alguém";

        const pushTitle = "Néos: Nova Mensagem";
        const pushBody = `${senderName}: ${msg.text || '📷 Enviou uma foto/vídeo'}`;

        return sendPushNotification(recipientId, pushTitle, pushBody, {
            type: 'CHAT',
            conversationId: conversationId
        });
    });

/**
 * Gatilho: Nova Chamada de Vídeo ou Voz
 */
export const onNewCallPush = functions.firestore
    .document('calls/{callId}')
    .onCreate(async (snap, context) => {
        const call = snap.data();
        // Dispara o push apenas se o status for 'ringing' (início da chamada)
        if (!call || call.status !== 'ringing') return null;

        const callerName = call.callerUsername || "Alguém";
        const callTypeLabel = call.type === 'video' ? 'Vídeo' : 'Voz';

        const pushTitle = `Chamada de ${callTypeLabel}`;
        const pushBody = `${callerName} está ligando para você...`;

        return sendPushNotification(call.receiverId, pushTitle, pushBody, {
            type: 'CALL',
            callId: context.params.callId,
            isVideo: call.type === 'video'
        });
    });
