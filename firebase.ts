
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  limit, 
  doc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp,
  getDoc,
  updateDoc,
  addDoc,
  orderBy,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  writeBatch,
  increment
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject, uploadString } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBscsAkO_yJYfVVtCBh3rNF8Cm51_HLW54",
  authDomain: "teste-rede-fcb99.firebaseapp.com",
  databaseURL: "https://teste-rede-fcb99-default-rtdb.firebaseio.com",
  projectId: "teste-rede-fcb99",
  storageBucket: "teste-rede-fcb99.firebasestorage.app",
  messagingSenderId: "1006477304115",
  appId: "1:1006477304115:web:79deabb2a1e97951df5e46"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { 
  auth, 
  db,
  storage,
  collection,
  query,
  where,
  getDocs, 
  limit,
  doc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp,
  storageRef,
  uploadBytes,
  uploadString,
  getDownloadURL,
  getDoc,
  updateDoc,
  addDoc,
  orderBy,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  writeBatch,
  deleteObject,
  increment
};
