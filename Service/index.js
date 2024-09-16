import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from 'multer';
import path from 'path'; // Required for handling file paths
import { connectDB, getDB } from './connection.js'; // Import connection.js

// Povezivanje s bazom podataka
connectDB();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase payload limit

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Save files to 'uploads' folder
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage, 
  limits: { fileSize: 10 * 1024 * 1024 } // Set file size limit to 10MB
});

// Serve static files (like uploaded profile pictures)
app.use('/uploads', express.static('uploads'));

// Middleware za autentifikaciju
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access denied" });

  jwt.verify(token, 'your_jwt_secret', (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
};

// Registracija korisnika
app.post("/register", async (req, res) => {
  const { username, password, email } = req.body;

  try {
    const db = getDB(); // Dobijanje instance baze podataka
    const usersCollection = db.collection("users");

    const existingUser = await usersCollection.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ error: "Username or email already taken" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      username,
      password: hashedPassword,
      email,
      profile: {
        bio: "",
        avatar: "",
      },
      leaderboardPosition: null, // Dodajemo polje za poziciju na leaderboardu
    };

    await usersCollection.insertOne(newUser);

    res.status(201).json({ id: newUser._id, username: newUser.username });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Prijava korisnika
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const db = getDB();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id }, 'your_jwt_secret', { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dohvati profil korisnika (zaštićeno)
app.get("/user/profile", authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({ _id: req.user.userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      username: user.username,
      profilePicture: user.profile.avatar,
      email: user.email, // Include email in the response
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Ažuriranje profila korisnika (zaštićeno)
app.put("/user/profile", authenticateToken, async (req, res) => {
  const { username, profilePicture, password } = req.body;

  try {
    const db = getDB();
    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({ _id: req.user.userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const updatedFields = {};
    if (profilePicture) updatedFields["profile.avatar"] = profilePicture;
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updatedFields.password = hashedPassword;
    }

    await usersCollection.updateOne(
      { _id: req.user.userId },
      { $set: updatedFields }
    );

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Dohvati profil korisnika (nezaštićeno)
app.get("/user/profile/:email", async (req, res) => {
  const { email } = req.params;

  try {
    const db = getDB();
    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      username: user.username,
      profilePicture: user.profile.avatar,
      email: user.email, // Include email in the response
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Ažuriranje profila korisnika (nezaštićeno)
app.put("/user/profile", async (req, res) => {
  const { username, profilePicture, password } = req.body;

  try {
    const db = getDB();
    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const updatedFields = {};
    if (profilePicture) updatedFields["profile.avatar"] = profilePicture;
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updatedFields.password = hashedPassword;
    }

    await usersCollection.updateOne({ username }, { $set: updatedFields });

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Dodaj pitanja kviza
app.post("/quiz/questions/add-multiple", async (req, res) => {
  const questionsData = req.body.questions; // Ovo specificira da očekujemo polje "questions"

  if (!Array.isArray(questionsData)) {
    return res.status(400).json({ error: "Data must be an array of questions" });
  }

  try {
    const db = getDB();
    const quizCollection = db.collection("quiz");

    await quizCollection.insertMany(questionsData); // Insert multiple questions into the quiz collection

    res.status(201).json({ message: "Questions added successfully" });
  } catch (error) {
    console.error("Error adding quiz questions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Dohvati pitanja kviza
app.get("/quiz/questions", async (req, res) => {
  try {
    const db = getDB(); // Get database instance
    const quizCollection = db.collection("quiz"); // Reference to the quiz collection

    const questions = await quizCollection.find().toArray(); // Fetch all questions from the quiz collection

    res.json({ questions }); // Return the questions as a JSON response
  } catch (error) {
    console.error("Error fetching quiz questions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add questions to quiz2
app.post("/quiz2/questions/add-multiple", async (req, res) => {
  const questionsData = req.body.questions; // This should be an array of questions

  if (!Array.isArray(questionsData)) {
    return res.status(400).json({ error: "Data must be an array of questions" });
  }

  try {
    const db = getDB();
    const quiz2Collection = db.collection("quiz2");

    await quiz2Collection.insertMany(questionsData);

    res.status(201).json({ message: "Questions added successfully to quiz2" });
  } catch (error) {
    console.error("Error adding quiz2 questions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/quiz2/questions", async (req, res) => {
  try {
    const db = getDB();
    const quiz2Collection = db.collection("quiz2");
    const questions = await quiz2Collection.find().toArray();
    res.json({ questions });
  } catch (error) {
    console.error("Error fetching quiz2 questions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Podnošenje kviza2
app.post("/quiz2/submit", async (req, res) => {
  const { username, answers } = req.body;
  try {
    const db = getDB();
    const quiz2Collection = db.collection("quiz2");
    const leaderboardCollection = db.collection("leaderboard");

    const questions = await quiz2Collection.find().toArray();
    const score = calculateScore(answers, questions);

    await leaderboardCollection.updateOne(
      { username },
      { $set: { username, score } },
      { upsert: true }
    );

    res.json({ score });
  } catch (error) {
    console.error("Error during quiz2 submission:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Fetch leaderboard for Quiz2
app.get("/quiz2/leaderboard", async (req, res) => {
  try {
    const db = getDB();
    const leaderboardCollection = db.collection("leaderboard");

    const leaderboard = await leaderboardCollection.find().sort({ score: -1 }).limit(10).toArray();

    res.json({ leaderboard });
  } catch (error) {
    console.error("Error fetching quiz2 leaderboard:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Podnošenje kviza
app.post("/quiz/submit", async (req, res) => {
  const { username, answers } = req.body;

  try {
    const db = getDB();
    const quizCollection = db.collection("quiz");
    const leaderboardCollection = db.collection("leaderboard");

    const questions = await quizCollection.find().toArray(); // Fetch all questions for comparison

    const score = calculateScore(answers, questions); // Pass questions to score calculation

    // Ažuriranje leaderboarda za korisnika
    await leaderboardCollection.updateOne(
      { username },
      { $set: { username, score } },
      { upsert: true }
    );

    res.json({ score });
  } catch (error) {
    console.error("Error during quiz submission:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Tablica najboljih igrača
app.get("/leaderboard", async (req, res) => {
  try {
    const db = getDB();
    const leaderboardCollection = db.collection("leaderboard");

    const leaderboard = await leaderboardCollection.find().sort({ score: -1 }).limit(10).toArray();

    res.json({ leaderboard });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function calculateScore(userAnswers, questions) {
  const correctAnswers = questions.filter((q, index) => {
    return q.correctAnswer === userAnswers[index];
  });

  return correctAnswers.length;
}

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
