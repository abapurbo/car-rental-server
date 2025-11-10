require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 4000;
const admin = require("firebase-admin");
// Decode Firebase Service Account
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware
app.use(cors());
app.use(express.json());

// Firebase Verify Middleware
const verifyFirebase = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' })
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.token_email = decoded.email
    next();
  } catch (err) {
    return res.status(401).send({ message: 'unauthorized access' })

  }
};

const uri = `mongodb+srv://${process.env.DB_USER_NAME}:${process.env.DB_USER_PASS}@cluster0.p9igsxk.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  await client.connect();

  const userCollection = client.db("rentwheels").collection("users");

  // Create User (protected)
  app.post("/users", verifyFirebase, async (req, res) => {
    try {
      const user = req.body;

      const result = await userCollection.insertOne(user);
      res.send({ success: true, result });
    } catch (err) {
      res.status(500).send({ message: err.message });
    }
  });

  console.log("Connected to MongoDB ✅");
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
