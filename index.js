require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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

  const carCollection = client.db("rentwheels").collection("all_cars");
  const carBookings = client.db('rentwheels').collection('userCarBookings')

  try {
    // await client.connect();

    //  scearch cars from carCollection database in mongodb
    app.get('/cars', async (req, res) => {
      const search = req.query.search || '';
      try {
        const cars = await carCollection.find({ car_name: { $regex: search, $options: 'i' } }).toArray();
        res.send(cars)
      }
      catch (error) {
        res.status(500).send({ success: false, message: "Not Found" });
      }
    })

    app.get('/latest-cars', async (req, res) => {
      const result = await carCollection.find().sort({ createdAt: -1 }).limit(6).toArray()
      res.send(result)
    })
    //my car listing
    app.get('/my-listing-cars', verifyFirebase, async (req, res) => {
      try {
        const email = req.query.email;
        console.log(email)
        if (email !== req.token_email) {
          return res.status(403).send({ message: 'Forbidden access' });
        }

        const cursor = carCollection.find({ providerEmail: email });
        const result = await cursor.toArray();

        res.send(result);
      } catch (error) {
        console.error('Error fetching user cars:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });
    app.get('/all-cars', async (req, res) => {
      const result = await carCollection.find().toArray();
      res.send(result);
    })
    // top reated car
    app.get('/top-rated-cars', async (req, res) => {
      const result = await carCollection.find().sort({ rent_price: 1 }).limit(4).toArray()
      res.send(result)
    })

    // specific car
    app.get('/car-details/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await carCollection.findOne(query)
      res.send(result);
    })
    app.get('/form-data/:id', verifyFirebase, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await carCollection.findOne(query);
      res.send(result)
    })

    //  Get all bookings for a specific user
    app.get('/booking-all-car', verifyFirebase, async (req, res) => {
      try {
        const email = req.query.email;
        // unauthorized check
        if (email !== req.token_email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }
        // find bookings for this user
        const result = await carBookings.find({ user_email: email }).toArray();
        if (result.length === 0) {
          return res.status(404).send({ message: "No bookings found" });
        }
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: "Server error", error: error.message });
      }
    });

    // POST /car-booking
    app.post('/car-booking', verifyFirebase, async (req, res) => {
      try {
        const bookingInfo = req.body;
        const carId = bookingInfo.car_id;

        // Check if car exists
        const car = await carCollection.findOne({ _id: new ObjectId(carId) });
        console.log(car)
        if (!car) {
          return res.status(404).send({ success: false, message: 'Car not found' });
        }

        // Check if car is already booked
        if (car.status === 'unavailable') {
          return res.status(400).send({ success: false, message: 'This car is already booked by another user' });
        }

        // Insert booking
        const newBooking = {
          ...bookingInfo,
          booking_date: new Date(),
          status: 'confirmed',
        };
        const bookingResult = await carBookings.insertOne(newBooking);

        // Update car status
        const carUpdateResult = await carCollection.updateOne(
          { _id: new ObjectId(carId) },
          { $set: { status: 'unavailable' } }
        );

        res.send({
          success: true,
          message: 'Car booked successfully!',
          bookingResult,
          carUpdateResult,
        });

      } catch (error) {
        console.error(error);
        res.status(500).send({ success: false, message: 'Car booking failed!', error: error.message });
      }
    })


    //   update car info
    app.patch('/update-car/:id', verifyFirebase, async (req, res) => {
      const id = req.params.id;
      const carInfo = req.body;
      const query = { _id: new ObjectId(id) }
      const option = {}
      const updateCar = {
        $set: {
          car_name: carInfo.car_name,
          category: carInfo.category,
          description: carInfo.description,
          rent_price: carInfo.rent_price,
          location: carInfo.location,
          image: carInfo.image

        }
      }
      const result = await carCollection.updateOne(query, updateCar, option);
      res.send(result);

    })
    // Create User (protected)
    app.post("/all-cars", verifyFirebase, async (req, res) => {
      try {

        const car = req.body;
        const emailFromToken = req.token_email;
        const newCar = {
          ...car,
          createdAt: new Date(),
          status: 'available'
        }
        console.log(newCar)
        // Check if user and email exist
        if (!car?.providerEmail) {
          return res.status(400).send({ success: false, message: "User email missing" });
        }

        // Verify that the token email matches the user's email
        if (emailFromToken !== car.providerEmail) {
          return res.status(403).send({ success: false, message: "Unauthorized access" });
        }

        // Insert the user data into the collection
        const result = await carCollection.insertOne(newCar);

        return res.send({ success: true, result });
      } catch (err) {
        console.error("Error inserting user:", err.message);
        return res.status(500).send({ success: false, message: err.message });
      }
    });



    // delete car specific
    app.delete('/delete-car/:id', verifyFirebase, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await carCollection.deleteOne(query);
      res.send(result);
    })

    console.log("Connected to MongoDB ✅");
  }
  finally {

  }


}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
