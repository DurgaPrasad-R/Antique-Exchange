const express = require('express')
const app = express()
const session = require('express-session')
app.use(express.json())
app.use(express.urlencoded())

const multer = require('multer');

// Set up multer storage and specify the upload directory
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const ejs = require('ejs')
ejs.clearCache();
// Necessary libraries and details for Firebase
const admin = require("firebase-admin");
const { getFirestore} = require('firebase-admin/firestore');
var serviceAccount = require("./Key.json");
const port = 3000

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// database
const db = getFirestore();

// Set the view engine to EJS
app.set('view engine', 'ejs');

// To use html files
app.use(express.static("public"))

app.use(session({
  secret: 'qwertypj',
  resave: false,
  saveUninitialized: true,
}));

// End points to serve the HTML files
app.get('/', (req, res) => {
  res.render('index',{});
})

app.get('/login', (req, res) => {
  res.sendFile(__dirname+'/public/login.html')
})

app.get('/signup', (req, res) => {
  res.sendFile(__dirname+'/public/signup.html')
})

app.get('/seller', (req,res) => {
  res.sendFile(__dirname+'/public/seller.html')
})

// Endpoints for API
app.post('/signup', async (req, res) => {
  const email = req.body.Email;

  // Check if the user with the provided email already exists
  const existingUser = await db.collection('First')
    .where('Email', '==', email)
    .get();

  if (!existingUser.empty) {
    // User already exists, redirect to the login page or send a message
    res.send('<script>alert("User with this email already exists. Please login."); window.location.href = "/login";</script>');
  } else {
    // User is not registered, proceed with the signup
    await db.collection('First').add({
      Name: req.body.Name,
      Email: email, // Use the email from the request
      Password: req.body.Password
    }).then(() => {
      // Send a success message and then redirect to the login page
      res.send('<script>alert("Signup Successful. Please login."); window.location.href = "/login";</script>');
    })
  }
})




app.post('/login', async (req, res) => {
  const querySnapShot = await db.collection('First')
    .where("Email", "==", req.body.Email)
    .where("Password", "==", req.body.Password)
    .get()

  if (!querySnapShot.empty) {
    const doc = querySnapShot.docs[0]
    const userData = {
      Username: doc.get("Name"),
      Useremail: doc.get("Email")
    }
    req.session.userData = userData;
    // Send a success alert message and then redirect or perform any other actions
    res.send('<script>alert("Login successful."); window.location.href = "/";</script>')
  } else {
    // User not found, you can send an alert or error message
    res.send('<script>alert("Invalid email or password. Please try again.Try Signing up?"); window.location.href = "/login";</script>');
  }
})

// TODO if and only if user logs in
app.post('/seller-data', upload.single('itemImage'), async (req, res) => {
  const userEmail = req.session.userData ? req.session.userData.Useremail : null;

  if (userEmail) {
    try {
      // Retrieve the user's document based on their email
      const querySnapshot = await db.collection('First')
        .where("Email", "==", userEmail)
        .get();

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];

        // Create a reference to the "sellerItems" subcollection
        const sellerItemsCollection = userDoc.ref.collection('sellerItems');

        // Access the uploaded image file from req.file
        const imageFile = req.file;
        const fileSizeLimit = 1024 * 1024;
        if (!imageFile) {
          return res.status(400).send('No file uploaded.');
        }

        if (imageFile.size > fileSizeLimit) {
          return res.status(400).send('File size exceeds the 1MB limit.');
        }

        // Get other data from the form submission
        const Price = req.body['item-price'];
        const Category = req.body['item-cat'];
        const Desc = req.body.Description;

        // Create a new seller item document within the subcollection
        await sellerItemsCollection.add({
          SellerItemImage: imageFile.buffer.toString('base64'), // Store the image as a base64-encoded string
          SellerItemPrice: Price,
          SellerCategory: Category,
          SellerItemDescription: Desc
        });

        res.send("Seller data added successfully");
      } else {
        // User's document does not exist, handle it accordingly
        res.status(404).send("User not found in the 'First' collection");
      }
    } catch (error) {
      console.error("Error adding seller data:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    // If user data doesn't exist in the session, handle it accordingly
    res.status(401).json({ error: "User email not found in session" });
  }
});

app.listen(port, () => {
  console.log(`App listening on port http://localhost:${port}`)
})