import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

admin.initializeApp();

const ONESIGNAL_APP_ID = "efd9d119-b1c7-40d6-944c-1b3d4b749aaa";
const ONESIGNAL_REST_API_KEY = "NDg0MWVlNDMtNmJkNi00MzYwLWExODAtNzkxYmQ0NzEyMTFk"; // Opcional, se o OneSignal exigir autenticação no backend

/**
 * Função central para enviar notificação via OneSignal API
 */
async function sendOneSignalNotification(targetUserId: string, title: string, body: string, data: any = {}) {
    try {
        const payload = {
            app_id: ONESIGNAL_APP_ID,
            include_external_user_ids: [targetUserId],
            headings: { "en": title, "pt": title },
            contents: { "en": body, "pt": body },
            data: {
                ...data,
                click_action: 'https://' + process.env.GCLOUD_PROJECT + '.web.app'
            }
        };

        const response = await axios.post('https://onesignal.com/api/v1/notifications', payload, {
            headers: {
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('OneSignal: Notificação enviada com sucesso:', response.data);
    } catch (error: any) {
        console.error('OneSignal: Erro ao enviar notificação:', error.response?.data || error.message);
    }
}

export const onNewMessageNotify = functions.firestore
    .document('conversations/{conversationId}/messages/{messageId}')
    .onCreate(async (snap, context) => {
        const msg = snap.data();
        if (!msg || msg.senderId === 'system') return null;

        const { conversationId } = context.params;
        const convDoc = await admin.firestore().collection('conversations').doc(conversationId).get();
        const convData = convDoc.data();
        if (!convData) return null;

        const recipientId = (convData.participants as string[]).find(uid => uid !== msg.senderId);
        if (!recipientId) return null;

        const senderDoc = await admin.firestore().collection('users').doc(msg.senderId).get();
        const sender = senderDoc.data();

        // 1. Notificação In-App (Firestore)
        await admin.firestore().collection('notifications_in_app').add({
            recipientId,
            title: 'Nova Mensagem',
            body: `${sender?.username || 'Alguém'}: ${msg.text || 'Mídia enviada'}`,
            type: 'message',
            read: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Envio via OneSignal
        return sendOneSignalNotification(
            recipientId, 
            `Néos: @${sender?.username || 'Alguém'}`, 
            msg.text || 'Enviou uma mídia para você',
            { conversationId, type: 'CHAT' }
        );
    });

export const onNewCallNotify = functions.firestore
    .document('calls/{callId}')
    .onCreate(async (snap, context) => {
        const call = snap.data();
        if (!call || call.status !== 'ringing') return null;

        return sendOneSignalNotification(
            call.receiverId,
            'Chamada no Néos',
            `${call.callerUsername} está te ligando...`,
            { callId: context.params.callId, type: 'CALL' }
        );
    });

export const onPostLikeNotify = functions.firestore
    .document('posts/{postId}')
    .onUpdate(async (change) => {
        const newData = change.after.data();
        const oldData = change.before.data();
        if (!newData.likes || newData.likes.length <= (oldData.likes?.length || 0)) return null;

        const likerId = newData.likes[newData.likes.length - 1];
        if (likerId === newData.userId) return null;

        const likerDoc = await admin.firestore().collection('users').doc(likerId).get();
        const liker = likerDoc.data();

        return sendOneSignalNotification(
            newData.userId,
            'Néos: Nova curtida',
            `@${liker?.username || 'Alguém'} curtiu sua publicação!`,
            { postId: change.after.id, type: 'LIKE' }
        );
    });