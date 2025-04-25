import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import bodyParser from "body-parser";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import fs from "fs";
import fetch from "node-fetch"; // Ensure this is installed for API calls

// Firebase configuration (hardcoded for now)
const firebaseConfig = {
    apiKey: "AIzaSyA_1hoEtwJkF_lJC1Jnp4dgQhTdHBrmTJ4",
    authDomain: "clifixer.firebaseapp.com",
    projectId: "clifixer",
    storageBucket: "clifixer.firebasestorage.app",
    messagingSenderId: "318234897260",
    appId: "1:318234897260:web:18b58b8df79059bd486149",
    measurementId: "G-WECQ09G5K5",
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const app = express();
const DATA_DIR = path.resolve("./data");
const MAX_FILE_SIZE = 1024 * 1024; // 1MB max

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Pour parser les body en JSON (important pour les POST)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Helper function to clean AI response
const cleanAIResponse = (response) => {
    return response.replace(/<\/?[^>]+(>|$)/g, "").trim(); // Remove HTML tags and trim
};

const port = process.env.PORT || 3000;

async function verifyUserWithEmailAndPassword(email, password) {
    const apiKey = "AIzaSyA_1hoEtwJkF_lJC1Jnp4dgQhTdHBrmTJ4"; // Ton apiKey Firebase
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
        }),
    });
    if (!response.ok) {
        return null;
    }
    return await response.json();
}

// Serve les fichiers statiques (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, "public")));

// Route GET
app.get("/api/sdk", (req, res) => {
    res.json({ message: "Hello from my API!" });
});

// Route POST
app.post("/api/sdk", async (req, res) => {
    try {
        const email = req.headers["x-npmrescue-email"];
        const pass = req.headers["x-npmrescue-pass"];

        // Vérifie l'utilisateur
        const user = await verifyUserWithEmailAndPassword(email, pass);
        if (!user) {
            return res.status(401).json({ error: "Email ou mot de passe incorrect" });
        }

        // Parse request body
        const contentType = req.headers["Content-Type"];
        let context = null;
        let message = null;

         if (contentType.includes("application/x-www-form-urlencoded")) {
            // body: context=...&message=...
                context = JSON.parse(req.body.context);
                message = req.body.message;
            
        } else {
            return res.status(415).json({ error: "Format non supporté" });
        }

        // Handle x-npmrescue-request header
        const buglixRequest = req.headers["x-npmrescue-request"];
        if (buglixRequest === "init") {
            if (!user) {
                return res
                    .status(401)
                    .json({ error: "Email ou mot de passe incorrect" });
            } else {
                return res.status(200).json({ success: "Correct" });
            }
        } else if (buglixRequest === "analyze") {
            if (!user) {
                return res
                    .status(401)
                    .json({ error: "Email ou mot de passe incorrect" });
            }

            if (!context) {
                return res.status(400).json({ error: "Données vides ou non valides" });
            }

            // Save data securely
            const payload = {
                timestamp: new Date().toISOString(),
                ip: req.ip,
                context,
            };

            // Prepare chat history
            const chatHistory = [
                {
                    role: "system",
                    content: `Tu es Npmrescue, un assistant IA expert en npm et en développement JavaScript, conçu pour aider les développeurs à résoudre leurs problèmes npm rapidement et efficacement. Ton ton est amical, fun, et professionnel. Voici le contexte d’un projet npm :

**Contexte du projet** :
{payload_json}

**Instructions** :
1. Analyse le payload ci-dessus pour identifier les problèmes potentiels ou les erreurs npm (ex. : commandes échouées, dépendances obsolètes, problèmes réseau, incohérences).
2. Si des commandes comme npmList, npmOutdated, ou npmDoctor ont success: false, explique pourquoi elles ont échoué (ex. : problème réseau, timeout, erreur dans le projet).
3. Vérifie les champs comme recentNpmErrors, versionMismatches, et npmDoctor.issues pour signaler tout problème critique (ex. : erreurs npm, vulnérabilités).
4. Si des correctifs automatiques (autofix) sont possibles, propose-les sous forme de modifications de fichiers (ex. : mettre à jour une dépendance dans package.json, ajouter un champ manquant).
5. Retourne un JSON avec :
   - message : Un message clair et concis pour l’utilisateur expliquant les problèmes et les solutions proposées. Si un autofix est disponible, termine le message par "Veux-tu appliquer cet autofix ? Tape npmrescue autofix pour le faire ! 🚀".
   - autofix : Une liste d’objets, chaque objet contenant :
     - file : Le nom du fichier à modifier (ex. : package.json).
     - originalContent : Le contenu actuel du fichier (au format texte ou JSON stringifié).
     - newContent : Le nouveau contenu à appliquer (au format texte ou JSON stringifié).
6. Si aucun correctif automatique n’est possible, mets autofix: [].
7. Sois concis, mais assure-toi que tes solutions sont actionnables et utiles.

**Exemple de réponse** :
{
  "message": "Salut ! J’ai analysé ton projet npm et voici ce que j’ai trouvé : \n- npmOutdated a échoué car tu n’as pas de connexion Internet (networkAvailable: false). Vérifie ta connexion et réessaie.\n- En attendant, je peux mettre à jour axios de 1.8.4 à 1.8.5 dans ton package.json pour qu’il soit prêt dès que tu seras en ligne.\nVeux-tu appliquer cet autofix ? Tape npmrescue autofix pour le faire ! 🚀",
  "autofix": [
    {
      "file": "package.json",
      "originalContent": "{\"dependencies\": {\"axios\": \"1.8.4\", \"lz-string\": \"1.5.0\", \"chalk\": \"5.4.1\"}}",
      "newContent": "{\"dependencies\": {\"axios\": \"1.8.5\", \"lz-string\": \"1.5.0\", \"chalk\": \"5.4.1\"}}"
    }
  ]
}

**Ton tour !** Réponds avec un JSON structuré basé sur le payload ci-dessus.`,
                },
                { role: "user", content: message },
            ];

            // Call Groq API
            const response = await fetch(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer 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`, // Hardcoded API key for now
                    },
                    body: JSON.stringify({
                        messages: chatHistory,
                        model: "llama3-8b-8192",
                        temperature: 1.0,
                        max_tokens: 500,
                    }),
                }
            );

            const responseData = await response.json();
            if (response.ok && responseData.choices?.[0]?.message?.content) {
                const assistantMessage = cleanAIResponse(
                    responseData.choices[0].message.content
                );
                return res.json({ success: true, content: assistantMessage });
            } else {
                return res
                    .status(500)
                    .json({ error: "Erreur API", details: responseData });
            }
        }
    } catch (error) {
        console.error("Erreur:", error);
        res.status(500).json({ error: "Erreur interne", details: error.message });
    }
});

// Démarrage du serveur
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
