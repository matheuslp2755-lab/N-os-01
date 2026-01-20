import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

/**
 * Função auxiliar para buscar todos os tokens ativos de um usuário
 * e enviar a mensagem para cada um deles via FCM.
 */
async function sendFCMToUser(userId: string, payload: admin.messaging.MessagingPayload) {
    try {
        const tokensSnap = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('fcm_tokens')
            .get();

        if (tokensSnap.empty) {
            console.log(`Néos FCM: Nenhum token encontrado para o usuário ${userId}`);
            return;
        }

        const tokens = tokensSnap.docs.map(d => d.data().token);
        
        // Envio em lote para todos os dispositivos do usuário
        const response = await admin.messaging().sendToDevice(tokens, payload);
        
        // Limpeza de tokens inválidos
        response.results.forEach((result, index) => {
            const error = result.error;
            if (error) {
                console.error('Falha no envio para token:', tokens[index], error);
                if (error.code === 'messaging/invalid-registration-token' ||
                    error.code === 'messaging/registration-token-not-registered') {
                    // Remover token expirado
                    tokensSnap.docs[index].ref.delete();
                }
            }
        });
    } catch (error) {
        console.error('Erro ao processar envio FCM:', error);
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

        // 1. Notificação In-App
        await admin.firestore().collection('notifications_in_app').add({
            recipientId,
            title: 'Nova Mensagem',
            body: `${sender?.username || 'Alguém'}: ${msg.text || 'Mídia enviada'}`,
            type: 'message',
            read: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Envio FCM para todos os dispositivos
        const fcmPayload: admin.messaging.MessagingPayload = {
            notification: {
                title: 'Néos: Nova Mensagem',
                body: `${sender?.username || 'Alguém'}: ${msg.text || 'Mídia'}`,
                icon: '/favicon.ico',
                clickAction: 'FLUTTER_NOTIFICATION_CLICK' // Padrão para abrir a app/site
            },
            data: {
                type: 'CHAT',
                conversationId: conversationId
            }
        };

        return sendFCMToUser(recipientId, fcmPayload);
    });

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

        const fcmPayload: admin.messaging.MessagingPayload = {
            notification: {
                title: 'Chamada Néos',
                body: `${call.callerUsername} está te ligando...`,
                icon: '/favicon.ico'
            },
            data: {
                type: 'CALL',
                callId: context.params.callId
            }
        };

        return sendFCMToUser(call.receiverId, fcmPayload);
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

        // Notificação Interna (Bolinha)
        await admin.firestore().collection('users').doc(newData.userId).collection('notifications').add({
            type: 'like_post',
            fromUserId: likerId,
            fromUsername: liker?.username || 'Alguém',
            fromUserAvatar: liker?.avatar || '',
            read: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Notificação Push
        const fcmPayload: admin.messaging.MessagingPayload = {
            notification: {
                title: 'Néos: Curtida',
                body: `${liker?.username || 'Alguém'} curtiu sua publicação.`,
                icon: '/favicon.ico'
            }
        };

        return sendFCMToUser(newData.userId, fcmPayload);
    });