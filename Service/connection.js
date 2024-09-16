import { MongoClient } from 'mongodb';

const uri = "mongodb+srv://aedelinski:280620AD@gamers1.vm61zoy.mongodb.net/?retryWrites=true&w=majority";

let db;

export const connectDB = async () => {
  try {
    const client = new MongoClient(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await client.connect();
    db = client.db("gamers_challenge"); // Naziv baze podataka
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB", error);
  }
};

export const getDB = () => {
  if (!db) {
    throw new Error("Database not connected. Call connectDB first.");
  }
  return db;
};
