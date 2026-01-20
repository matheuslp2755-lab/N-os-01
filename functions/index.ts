import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

/**
 * Função central para enviar notificação push para todos os dispositivos de um usuário
 */
async function sendPushToUser(userId: string, title: string, body: string, data: any = {}) {
    try {
        const tokensSnap = await admin.firestore()
            .collection('users')
            .doc(userId)
            .collection('fcm_tokens')
            .get();

        if (tokensSnap.empty) return;

        const tokens = tokensSnap.docs.map(d => d.data().token);
        
        const payload: admin.messaging.MessagingPayload = {
            notification: {
                title,
                body,
                icon: 'https://firebasestorage.googleapis.com/v0/b/teste-rede-fcb99.appspot.com/o/assets%2Ficon-192.png?alt=media',
                clickAction: 'https://' + process.env.GCLOUD_PROJECT + '.web.app'
            },
            data: {
                ...data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
            }
        };

        const response = await admin.messaging().sendToDevice(tokens, payload);
        
        // Cleanup de tokens inválidos
        const cleanup: Promise<any>[] = [];
        response.results.forEach((result, index) => {
            const error = result.error;
            if (error) {
                if (error.code === 'messaging/invalid-registration-token' ||
                    error.code === 'messaging/registration-token-not-registered') {
                    cleanup.push(tokensSnap.docs[index].ref.delete());
                }
            }
        });
        await Promise.all(cleanup);
    } catch (error) {
        console.error('FCM Send Error:', error);
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

        // 2. Envio Push FCM real
        return sendPushToUser(
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

        return sendPushToUser(
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

        await admin.firestore().collection('users').doc(newData.userId).collection('notifications').add({
            type: 'like_post',
            fromUserId: likerId,
            fromUsername: liker?.username || 'Alguém',
            fromUserAvatar: liker?.avatar || '',
            read: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return sendPushToUser(
            newData.userId,
            'Néos: Nova curtida',
            `@${liker?.username || 'Alguém'} curtiu sua publicação!`,
            { postId: change.after.id, type: 'LIKE' }
        );
    });