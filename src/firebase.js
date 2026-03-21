// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:            "AIzaSyDnJIlbo5m7z7Us87RO84YyY0Ep10V6SPE",
  authDomain:        "dental-jab-web.firebaseapp.com",
  projectId:         "dental-jab-web",
  storageBucket:     "dental-jab-web.firebasestorage.app",
  messagingSenderId: "1005855518571",
  appId:             "1:1005855518571:web:d4943e1b721781e85e262e",
};

const app = initializeApp(firebaseConfig);

export const db   = getFirestore(app);  // 공고 / 알림 / 유저데이터 저장
export const auth = getAuth(app);        // 익명 인증
