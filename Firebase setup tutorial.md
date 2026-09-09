# Firebase setup tutorial

The app can sign in with Google via Firebase Authentication. Follow these steps to connect your app to your own Firebase project.

### Step 1: Create or open a Firebase project

1. Go to the [Firebase Console](https://console.firebase.google.com).
2. Sign in with your Google account.
3. Click **Add project** (or select an existing project).
4. If creating a new project, enter a name and follow the prompts. You can disable Google Analytics if you don’t need it.

### Step 2: Register the app as a web app

1. In your Firebase project, open **Project settings** (gear icon next to “Project overview”).
2. In **Your apps**, click the **Web** icon (`</>`).
3. Enter an app nickname (e.g. “Card Maker”) and optionally set up Firebase Hosting. Click **Register app**.
4. You’ll see a config object like this:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   };
   ```
5. Copy these values — you’ll use them in the next step. You can close the console or click “Continue to console”.

### Step 3: Enable Google sign-in

1. In the Firebase Console, go to **Build** → **Authentication**.
2. Open the **Sign-in method** tab.
3. Click **Google** in the list of providers.
4. Turn **Enable** on, set a **Project support email**, and click **Save**.

### Step 4: Add credentials to the app

1. Open a terminal and **go to the project root** — the folder that contains `package.json` (e.g. `my-react-ts-app`). Create the env file there so Create React App can find it when you run `npm start`.

   **To debug env loading:** from the project root run `npm run check-firebase-env`. It reports whether `.env` / `.env.local` were found and which of the six variable names are set (it does not print secret values).
2. In that folder, copy the example env file:
   - **Windows (PowerShell):**  
     `Copy-Item .env.example .env.local`
   - **macOS / Linux:**  
     `cp .env.example .env.local`
3. Open `.env.local` in an editor and fill in the values from Step 2 (Firebase config):

   | Variable | Value (from Firebase config) |
   |----------|-------------------------------|
   | `REACT_APP_FIREBASE_API_KEY` | `apiKey` |
   | `REACT_APP_FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `REACT_APP_FIREBASE_PROJECT_ID` | `projectId` |
   | `REACT_APP_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
   | `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
   | `REACT_APP_FIREBASE_APP_ID` | `appId` |

   Example:
   ```env
   REACT_APP_FIREBASE_API_KEY=AIza...
   REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   REACT_APP_FIREBASE_PROJECT_ID=your-project-id
   REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
   REACT_APP_FIREBASE_APP_ID=1:123456789:web:abcdef
   ```

4. Save the file. **Do not commit `.env.local` or `.env`** — both are in `.gitignore` and should stay local.

### Step 5: Start (or restart) the dev server from the project root

Environment variables are read only when the dev server starts. From the **same folder that contains package.json** (and your `.env.local`):

1. If the dev server is already running, stop it (e.g. `Ctrl+C`).
2. Run `npm start`.

### Step 6: Sign in from the app

1. Open the app in the browser (e.g. [http://localhost:3000](http://localhost:3000)).
2. In the left panel, open the **Log-in** section.
3. Click **Sign in with Google** and complete the Google sign-in flow.
4. When signed in, the panel shows your account and a **Sign out** option.

---

**Troubleshooting**

- **“Firebase not configured” or “all variables missing”**  
  The app’s `npm start` runs a small wrapper so the dev server always starts with the project root as the working directory (so `.env.local` is found). If you still see the error:  
  - Run **`npm run check-firebase-env`** from the project root; it should report “6/6 variables set”.  
  - **Clear the build cache**: delete the folder `node_modules/.cache` in the project root, then run `npm start` again.  
  - Confirm the env file is in the folder that contains `package.json`: `dir .env*` (Windows) or `ls -la .env*` (Mac/Linux). On Windows, ensure the file is not named `.env.local.txt` (check with `Get-ChildItem -Force .env*`).  
  - Open the browser console (F12) and look for a `[Firebase]` message — it shows whether any `REACT_APP_*` variables were loaded in the running app.

- **Popup blocked or sign-in fails**  
  Allow popups for localhost and try again. If you use an ad blocker, temporarily disable it for localhost.

- **Invalid API key or domain**  
  Confirm the values in `.env.local` match the Firebase Console (Project settings → Your apps). Ensure there are no extra spaces or quotes around the values.
