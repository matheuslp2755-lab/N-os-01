
import React, { createContext, useContext, useState } from 'react';

const ptMessages = {
  "common": {
    "online": "Online",
    "cancel": "Cancelar",
    "delete": "Excluir",
    "deleting": "Excluindo...",
    "you": "Você",
    "user": "Usuário",
    "send": "Enviar",
    "save": "Salvar",
    "error": "Ocorreu um erro. Tente novamente."
  },
  "login": {
    "title": "Néos",
    "emailLabel": "E-mail",
    "passwordLabel": "Senha",
    "loginButton": "Entrar",
    "loggingInButton": "Entrando...",
    "forgotPassword": "Esqueceu a senha?",
    "noAccount": "Não tem uma conta?",
    "signUpLink": "Cadastre-se",
    "getTheApp": "Baixe o aplicativo.",
    "error": "Falha ao entrar. Verifique suas credenciais.",
    "installHere": "Instale aqui"
  },
  "signup": {
    "title": "Néos",
    "subtitle": "Cadastre-se para ver fotos e vídeos dos seus amigos.",
    "emailLabel": "Endereço de e-mail",
    "usernameLabel": "Nome de usuário",
    "passwordLabel": "Senha",
    "signUpButton": "Cadastre-se",
    "signingUpButton": "Cadastrando...",
    "haveAccount": "Já tem uma conta?",
    "logInLink": "Conectar-se",
    "emailInUseError": "Este e-mail já está em uso.",
    "genericError": "Erro ao criar conta. Tente novamente."
  },
  "header": {
    "title": "Néos",
    "searchPlaceholder": "Pesquisar pessoas...",
    "noResults": "Nenhum resultado.",
    "following": "Seguindo",
    "follow": "Seguir",
    "requested": "Solicitado",
    "notifications": "Notificações",
    "noActivity": "Nenhuma atividade nova.",
    "profile": "Perfil",
    "create": "Criar",
    "createPost": "Publicação",
    "createPulse": "Pulse (Story)",
    "createVibe": "Vibe (Vídeo)",
    "createStatus": "Música ou Texto",
    "vibes": "Vibes",
    "logOut": "Sair",
    "messages": "Direct",
    "home": "Início",
    "accept": "Aceitar",
    "decline": "Recusar",
    "browser": "Navegar na Internet",
    "followNotification": "{username} começou a seguir você.",
    "messageNotification": "{username} enviou uma mensagem.",
    "followRequestNotification": "{username} quer seguir você.",
    "mentionCommentNotification": "{username} mencionou você: \"{commentText}\"",
    "duoRequestNotification": "<b>{username}</b> te convidou para um Duo.",
    "tagRequestNotification": "<b>{username}</b> te marcou numa publicação.",
    "duoAcceptedNotification": "<b>{username}</b> aceitou seu convite de Duo.",
    "tagAcceptedNotification": "<b>{username}</b> aceitou sua marcação."
  },
  "post": {
    "like": "Curtir",
    "comment": "Comentar",
    "republish": "Republicar",
    "forward": "Encaminhar",
    "likes": "curtidas",
    "viewAllComments": "Ver todos os {count} comentários",
    "addComment": "Adicione um comentário...",
    "postButton": "Publicar",
    "delete": "Excluir",
    "editCaption": "Editar legenda",
    "addCaption": "Adicionar legenda",
    "changeMusic": "Trocar música",
    "addMusic": "Adicionar música",
    "tagFriends": "Marcar amigos",
    "inviteDuo": "Convidar Duo",
    "duoPending": "Duo Pendente",
    "duoPartner": "Com {username}",
    "deletePostTitle": "Excluir publicação?",
    "deletePostBody": "Tem certeza? Esta ação não pode ser desfeita.",
    "youRepublicated": "Você republicou",
    "republishedBy": "Republicado por {username}",
    "addToMemory": "Salvar na Memória",
    "anonymousComment": "Modo Anônimo",
    "anonymousCommentTaken": "Esta publicação já possui o limite de 1 comentário anônimo.",
    "vibeAnon": "Néos Anon"
  },
  "gallery": {
    "title": "Nova Publicação",
    "galleryTab": "Galeria",
    "cameraTab": "Câmera",
    "next": "Próximo",
    "selectPhotos": "Selecionar fotos da galeria",
    "capture": "Capturar",
    "cameraError": "Não foi possível acessar a câmera. Verifique as permissões."
  },
  "profile": {
    "editProfile": "Editar Perfil",
    "following": "Seguindo",
    "follow": "Seguir",
    "message": "Mensagem",
    "posts": "publicações",
    "pulses": "pulses",
    "followers": "seguidores",
    "followingCount": "seguindo",
    "logout": "Sair da conta",
    "options": "Opções do Perfil",
    "privateAccountMessage": "Esta conta é privada",
    "privateAccountSuggestion": "Siga para ver suas fotos e vídeos.",
    "privateListsMessage": "Você não pode ver estas listas de uma conta privada.",
    "verifyUser": "Colocar Verificado",
    "unverifyUser": "Remover Verificado",
    "adminVerifyTitle": "Verificar Usuários",
    "searchUserToVerify": "Pesquisar usuário para verificar...",
    "verifyAction": "Verificar",
    "unverifyAction": "Desverificar",
    "addVerifiedLabel": "Verificar Usuários",
    "removeFollower": "Remover",
    "followersModalTitle": "Seguidores",
    "followingModalTitle": "Seguindo",
    "noFollowers": "Nenhum seguidor ainda.",
    "notFollowingAnyone": "Não segue ninguém ainda."
  },
  "editProfile": {
    "title": "Editar Perfil",
    "changePhoto": "Alterar foto do perfil",
    "usernameLabel": "Nome de usuário",
    "nicknameLabel": "Apelido",
    "bioLabel": "Bio",
    "vibeLabel": "Minha Vibe Agora",
    "vibeJoy": "Feliz",
    "vibeAnger": "Estressado",
    "vibeSloth": "Preguiça",
    "profileMusic": "Música do Perfil",
    "noProfileMusic": "Nenhuma música selecionada.",
    "changeMusic": "Trocar música",
    "privateAccount": "Conta Privada",
    "privateAccountInfo": "Apenas seus seguidores poderão ver suas publicações.",
    "submit": "Salvar Alterações",
    "submitting": "Salvando...",
    "updateError": "Erro ao atualizar perfil.",
    "usernameCooldown": "Você só pode alterar seu nome de usuário a cada 30 dias.",
    "nicknameCooldown": "Você só pode alterar seu apelido a cada 15 dias."
  },
  "messages": {
    "title": "Mensagens",
    "newMessage": "Nova mensagem",
    "newMessageTitle": "Nova Mensagem",
    "back": "Voltar",
    "close": "Fechar",
    "loading": "Carregando...",
    "noConversations": "Nenhuma conversa encontrada.",
    "searchUsers": "Pesquisar usuários...",
    "messagePlaceholder": "Escreva uma mensagem...",
    "createGroup": "Criar Grupo",
    "groupName": "Nome do Grupo",
    "groupLimit": "Membros",
    "diariesTitle": "Notas",
    "addNote": "Sua Nota",
    "forwardedPost": "Encaminhou uma publicação",
    "anonymousModeOn": "Ficar Anônimo",
    "anonymousModeOff": "Ficar Online",
    "replyToNote": "Responder à nota de {username}...",
    "deleteConversationTitle": "Excluir Conversa?",
    "deleteConversationBody": "Isso excluirá permanentemente a conversa para ambos.",
    "deleteConversationConfirm": "Excluir",
    "deleteMessage": "Apagar mensagem",
    "videoTooLong": "Vídeos devem ter no máximo 30 segundos.",
    "uploading": "Enviando..."
  },
  "diary": {
    "publish": "Publicar Nota",
    "publishing": "Publicando...",
    "placeholder": "O que você está sentindo?",
    "alreadyPosted": "Você já postou hoje!",
    "empty": "Nada por aqui.",
    "emptySuggestion": "Siga alguém para ver as notas aqui."
  },
  "aiGenerator": {
    "title": "Néos AI Pro",
    "promptLabel": "Imagine o impossível",
    "promptPlaceholder": "Ex: Uma foto cinematográfica de um astronauta em uma festa neon...",
    "generate": "Gerar com IA Pro",
    "generating": "Criando arte...",
    "useImage": "Usar no Post",
    "error": "Erro na geração. Tente novamente.",
    "connectKey": "Conectar Chave AI",
    "keyRequired": "A geração Pro requer uma chave de API do Google.",
    "quality": "Qualidade",
    "ratio": "Formato",
    "billingInfo": "Saiba mais sobre cobrança"
  },
  "browser": {
    "title": "Néos Explorer",
    "placeholder": "Pesquise qualquer coisa na web...",
    "searching": "Navegando na internet...",
    "empty": "O que você quer descobrir hoje?",
    "sources": "Fontes da pesquisa:"
  },
  "createPost": {
    "title": "Nova Publicação",
    "share": "Compartilhar",
    "sharing": "Compartilhando...",
    "captionLabel": "Escreva uma legenda...",
    "addMusic": "Adicionar música"
  },
  "createVibe": {
    "title": "Novo Vibe",
    "publish": "Compartilhar",
    "publishing": "Publicando..."
  },
  "vibeFeed": {
    "loading": "Carregando vibes...",
    "noVibes": "Nenhum vibe encontrado.",
    "comments": "Comentários",
    "addComment": "Escreva um comentário..."
  },
  "createPulse": {
    "title": "Novo Pulse",
    "publishing": "Publicando...",
    "publish": "Compartilhar",
    "location": "Localização",
    "locationPlaceholder": "Pesquisar lugares...",
    "searchingLocations": "Buscando locais próximos...",
    "poll": "Enquete",
    "pollQuestion": "Faça uma pergunta...",
    "pollOption1": "Sim",
    "pollOption2": "Não",
    "countdown": "Contagem Regressiva",
    "countdownTitle": "Dê um nome à contagem...",
    "days": "Dias",
    "hours": "Horas",
    "mins": "Min"
  },
  "createStatus": {
    "title": "Nova Publicação",
    "placeholder": "No que você está pensando?",
    "share": "Compartilhar",
    "sharing": "Compartilhando...",
    "background": "Fundo",
    "font": "Fonte"
  },
  "memories": {
    "new": "Nova",
    "add": "Adicionar",
    "title": "Memórias",
    "edit": "Editar Memória",
    "delete": "Excluir Memória",
    "deleteConfirm": "Tem certeza que deseja excluir esta memória?",
    "selectContent": "Selecionar Conteúdo",
    "next": "Próximo",
    "name": "Nome",
    "create": "Criar",
    "save": "Salvar",
    "uploadPhoto": "Enviar Foto",
    "addToMemoryTitle": "Salvar na Memória",
    "createNew": "Criar Nova Memória",
    "selectCover": "Escolha uma capa",
    "memoryName": "Nome da Memória",
    "creating": "Criando..."
  },
  "welcome": {
    "title": "Bem-vindo ao Néos"
  },
  "resetPassword": {
    "title": "Redefinir Senha",
    "instructions": "Insira seu e-mail para receber o link de recuperação.",
    "emailLabel": "E-mail",
    "backToLogin": "Voltar para Login"
  },
  "forwardModal": {
    "title": "Encaminhar para",
    "search": "Pesquisar amigos...",
    "noFollowing": "Você não segue ninguém ainda.",
    "noResults": "Nenhum usuário encontrado.",
    "send": "Enviar",
    "sending": "Enviando...",
    "sent": "Enviado"
  },
  "call": {
    "call": "Chamada",
    "calling": "Chamando {username}...",
    "incomingCall": "Chamada de {username}",
    "incomingVideoCall": "Vídeo chamada de {username}",
    "answer": "Atender",
    "decline": "Recusar",
    "hangUp": "Desligar",
    "callEnded": "Chamada encerrada",
    "onCallWith": "Em chamada com {username}",
    "shareScreen": "Compartilhar Tela",
    "stopShare": "Parar de Compartilhar",
    "videoCall": "Chamada de Vídeo",
    "voiceCall": "Chamada de Voz",
    "filters": {
        "none": "Normal",
        "bw": "P&B",
        "vintage": "Vintage",
        "soft": "Suave",
        "cool": "Frio",
        "focus": "Foco"
    }
  },
  "musicSearch": {
    "fetchError": "Erro ao buscar músicas",
    "searchError": "Ocorreu um erro durante a busca.",
    "trimInstructions": "Deslize para escolher os 25s ideais",
    "done": "Concluído",
    "suggestions": "Sugestões para você",
    "trending": "Bombando no Néos",
    "lyricsTitle": "Letras sincronizadas"
  },
  "addMusicModal": {
    "title": "Adicionar Música"
  }
};

const LanguageContext = createContext<any>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language] = useState('pt');

  const t = (key: string, replacements?: any): string => {
    let message = key.split('.').reduce((o: any, i) => (o ? o[i] : undefined), ptMessages) || key;
    if (replacements && typeof message === 'string') {
      Object.keys(replacements).forEach(placeholder => {
        message = message.replace(`{${placeholder}}`, String(replacements[placeholder]));
      });
    }
    return message;
  };

  return (
    <LanguageContext.Provider value={{ language, t, loading: false }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
