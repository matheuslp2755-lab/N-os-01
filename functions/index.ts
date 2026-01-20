import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

admin.initializeApp();

const ONESIGNAL_APP_ID = 'e1dcfeb7-6f34-440a-b65c-f61e2b3253a2';
const ONESIGNAL_REST_KEY = 'os_v2_app_4hop5n3pgrcavns46ypcwmstujyv4dga5npeinn5ydjjp2ewvmjih7brfkklwx4gvd774vehuhyt5gwzolbtcru56aob6up6zbrrlxq';

async function sendPushNotification(targetUserId: string, title: string, body: string, data: any = {}) {
    try {
        const payload = {
            app_id: ONESIGNAL_APP_ID,
            include_external_user_ids: [targetUserId],
            headings: { en: title, pt: title },
            contents: { en: body, pt: body },
            data: data,
            priority: 10
        };
        await axios.post('https://onesignal.com/api/v1/notifications', payload, {
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': `Basic ${ONESIGNAL_REST_KEY}` }
        });
    } catch (error: any) { console.error(`Erro Push:`, error.message); }
}

/**
 * Gatilho: Nova Mensagem -> Alerta In-App e Push
 */
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

        // 1. Notificação In-App (Banner)
        await admin.firestore().collection('notifications_in_app').add({
            recipientId,
            title: 'Nova Mensagem',
            body: `${sender?.username || 'Alguém'}: ${msg.text || 'Mídia enviada'}`,
            type: 'message',
            read: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Push Externo
        return sendPushNotification(recipientId, "Néos: Nova Mensagem", `${sender?.username}: ${msg.text || 'Mídia'}`, { type: 'CHAT', conversationId });
    });

/**
 * Gatilho: Curtida em Publicação -> Coração (Bolinha Roxa)
 */
export const onPostLikeNotify = functions.firestore
    .document('posts/{postId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();
        if (newData.likes.length <= oldData.likes.length) return null;

        const likerId = newData.likes[newData.likes.length - 1];
        if (likerId === newData.userId) return null;

        const likerDoc = await admin.firestore().collection('users').doc(likerId).get();
        const liker = likerDoc.data();

        return admin.firestore().collection('users').doc(newData.userId).collection('notifications').add({
            type: 'like_post',
            fromUserId: likerId,
            fromUsername: liker?.username || 'Alguém',
            fromUserAvatar: liker?.avatar || '',
            read: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    });

/**
 * Gatilho: Nova Chamada -> Alerta In-App e Push
 */
export const onNewCallNotify = functions.firestore
    .document('calls/{callId}')
    .onCreate(async (snap, context) => {
        const call = snap.data();
        if (!call || call.status !== 'ringing') return null;

        await admin.firestore().collection('notifications_in_app').add({
            recipientId: call.receiverId,
            title: `Chamada de ${call.type === 'video' ? 'Vídeo' : 'Voz'}`,
            body: `${call.callerUsername} está ligando...`,
            type: 'call',
            read: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return sendPushNotification(call.receiverId, "Néos: Chamada", `${call.callerUsername} chamando...`, { type: 'CALL', callId: context.params.callId });
    });

/**
 * Gatilho: Novo Seguidor -> Coração
 */
export const onNewFollowerNotify = functions.firestore
    .document('users/{userId}/followers/{followerId}')
    .onCreate(async (snap, context) => {
        const { userId, followerId } = context.params;
        const followerDoc = await admin.firestore().collection('users').doc(followerId).get();
        const follower = followerDoc.data();

        return admin.firestore().collection('users').doc(userId).collection('notifications').add({
            type: 'follow',
            fromUserId: followerId,
            fromUsername: follower?.username || 'Alguém',
            fromUserAvatar: follower?.avatar || '',
            read: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    });
