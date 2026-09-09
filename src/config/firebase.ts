/**
 * Firebase app, Auth, Realtime Database, Firestore, and Storage.
 * Initializes only when firebaseCredentials are set (via .env).
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { firebaseCredentials, isFirebaseConfigured } from './firebaseCredentials';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let database: Database | null = null;
let firestore: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (isFirebaseConfigured && firebaseCredentials) {
  if (getApps().length === 0) {
    app = initializeApp(firebaseCredentials);
    auth = getAuth(app);
    if (firebaseCredentials.databaseURL) {
      database = getDatabase(app);
    }
    firestore = getFirestore(app);
    storage = getStorage(app);
  } else {
    app = getApps()[0] as FirebaseApp;
    auth = getAuth(app);
    if (firebaseCredentials.databaseURL) {
      database = getDatabase(app);
    }
    firestore = getFirestore(app);
    storage = getStorage(app);
  }
}

export { app, auth, database, firestore, storage, isFirebaseConfigured };
