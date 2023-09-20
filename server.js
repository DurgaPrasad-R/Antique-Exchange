const express = require('express');
const app = express();
const session = require('express-session');
const path = require('path')
app.use(express.json());
app.use(express.urlencoded());

// To use HTML files
app.use(express.static("public"));

// Set the view engine to EJS
app.set('view engine', 'ejs');

const multer = require('multer');

// Set up multer storage and specify the upload directory
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const ejs = require('ejs');
ejs.clearCache();

// Necessary libraries and details for Firebase
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');
var serviceAccount = require("./Key.json");
const port = 3000;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Database
const db = getFirestore();

app.use(session({
  secret: 'qwertypj',
  resave: false,
  saveUninitialized: true,
}));

// Endpoints to serve the HTML files
app.get('/dashboard', async (req, res) => {
  try {
    // Call the fetchSellerItems function to fetch seller items
    const sellerItems = await fetchSellerItems();
    const session = req.session;
    // Render the index.ejs template and pass the sellerItems data as a variable
    res.render('index', { sellerItems , session, globalCategories});
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.get('/signup', (req, res) => {
  res.sendFile(__dirname + '/public/signup.html');
});

app.get('/seller', (req, res) => {
  const session = req.session;
  res.render('seller',{session,globalCategories});
});

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
    });
  }
});

app.post('/login', async (req, res) => {
  const querySnapShot = await db.collection('First')
    .where("Email", "==", req.body.Email)
    .where("Password", "==", req.body.Password)
    .get();

  if (!querySnapShot.empty) {
    const doc = querySnapShot.docs[0];
    const userData = {
      Username: doc.get("Name"),
      Useremail: doc.get("Email")
    };
    req.session.userData = userData;
    // Send a success alert message and then redirect or perform any other actions
    res.send('<script>alert("Login successful."); window.location.href = "/dashboard";</script>');
  } else {
    // User not found, you can send an alert or error message
    res.send('<script>alert("Invalid email or password. Please try again.Try Signing up?"); window.location.href = "/login";</script>');
  }
});

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
        const Name = req.body['item-name'];
        const Price = req.body['item-price'];
        const Category = req.body['item-cat'];
        const Desc = req.body.Description;

        // Create a new seller item document within the subcollection
        await sellerItemsCollection.add({
          SellerEmail: userEmail,
          SellerItemImage: imageFile.buffer.toString('base64'), // Store the image as a base64-encoded string
          SellerItemName: Name,
          SellerItemPrice: Price,
          SellerCategory: Category,
          SellerItemDescription: Desc
        });

        res.send('<script>alert("Seller data added successfully."); window.location.href = "/seller";</script>');
      } else {
        // User's document does not exist, handle it accordingly
        res.send('<script>alert("User does not exist: Please Signup."); window.location.href = "/signup";</script>');
      }
    } catch (error) {
      console.error("Error adding seller data:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    // If user data doesn't exist in the session, handle it accordingly
    res.send('<script>alert("Please login. Before you add the item to sell"); window.location.href = "/login";</script>');
  }
});

const globalCategories = []; // Initialize a global variable to store categories
const fetchSellerItems = async () => {
  try {
    // Query Firestore for seller items and store them in the sellerItems array
    const allUsersSnapshot = await db.collection('First').get();
    const sellerItems = {};

    // Create an array to store promises for subcollection queries
    const subcollectionQueries = [];

    // Iterate through each user document
    allUsersSnapshot.forEach((userDoc) => {
      // Query the "sellerItems" subcollection for the current user
      const sellerItemsQuery = userDoc.ref.collection('sellerItems')
        .limit(6) // Adjust the limit to your desired number of random items per user
        .get()
        .then((snapshot) => {
          const items = [];
          snapshot.forEach((itemDoc) => {
            const itemData = itemDoc.data();
            // Convert the Base64 image data to an image URL for JPG images
            const imageDataURL = 'data:image/jpeg;base64,' + itemData.SellerItemImage; // Use 'image/jpeg' for JPG images
            // Add the image URL to the item data
            itemData.SellerItemImage = imageDataURL;
            items.push(itemData);
          });
          return items;
        });

      // Add the subcollection query promise to the array
      subcollectionQueries.push(sellerItemsQuery);
    });

    // Wait for all subcollection queries to complete
    const subcollectionResults = await Promise.all(subcollectionQueries);

    // Iterate through the results and organize items by category
    subcollectionResults.forEach((items) => {
      items.forEach((item) => {
        const category = item.SellerCategory;
        if (!sellerItems[category]) {
          sellerItems[category] = [];
        }
        sellerItems[category].push(item);
        
        if (!globalCategories.includes(category)) {
          globalCategories.push(category);
        }
      });
    });

    return sellerItems;
  } catch (error) {
    console.error('Error fetching random seller items:', error);
    throw error;
  }
};

app.get('/category/:categoryName', async (req, res) => {
  try {
    const categoryName = req.params.categoryName;
    const session = req.session
    // Call a function to fetch all items related to the specified category
    const categoryItems = await fetchCategoryItems(categoryName);

    // Render a new template (e.g., category.ejs) to display the category-specific items
    // Pass the categoryItems data as a variable to your template
    // console.log(session.userData)
    res.render('category', { categoryItems , session, globalCategories});
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const fetchCategoryItems = async (category) => {
  try {
    // Query Firestore for all items in the specified category
    const categoryItemsSnapshot = await db.collection('First').get();

    const categoryItems = [];
    const categorySubItems = [];

    categoryItemsSnapshot.forEach(async (userDoc) => {
      const subcollectionRef = userDoc.ref.collection('sellerItems');

      // Query the subcollection for items in the specified category
      const categoryItemsQuery = subcollectionRef.where('SellerCategory', '==', category).get();

      categorySubItems.push(categoryItemsQuery);
    });

    const subCategoryQueries = await Promise.all(categorySubItems);

    subCategoryQueries.forEach((categorySnapShot) => {
      categorySnapShot.forEach((itemDoc) => {
        const itemData = itemDoc.data();
        // Convert the Base64 image data to an image URL for JPG images
        const imageDataURL = 'data:image/jpeg;base64,' + itemData.SellerItemImage; // Use 'image/jpeg' for JPG images
        // Add the image URL to the item data
        itemData.SellerItemImage = imageDataURL;
        categoryItems.push(itemData);
      });
    });

    return categoryItems;
  } catch (error) {
    console.error('Error fetching category items:', error);
    throw error;
  }
};

app.get('/item/:categoryName/:itemName', async (req, res) => {
  try {
    const categoryName = req.params.categoryName;
    const itemName = req.params.itemName;
    const session = req.session

    // Call the function to fetch item details by name in the specified category
    const itemDetails = await fetchItemDetailsByNameInCategory(categoryName, itemName);

    // Render a new template (e.g., item-details.ejs) to display the item details
    // Pass the itemDetails data as a variable to your template
    res.render('itemdetails', { itemDetails , session, globalCategories});
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const fetchItemDetailsByNameInCategory = async (category, itemName) => {
  try {
    // Query Firestore for the item details based on the item's name and category
    const itemQuerySnapshot = await db.collection('First').get();

    const itemDetails = [];
    const itemSubDetails = [];

    itemQuerySnapshot.forEach(async (userDoc) => {
      const subcollectionRef = userDoc.ref.collection('sellerItems');
      // Query the subcollection for items in the specified category with the given name
      const itemQuery = subcollectionRef
        .where('SellerCategory', '==', category)
        .where('SellerItemName', '==', itemName)
        .get();
      itemSubDetails.push(itemQuery);
    });

    const subItemQueries = await Promise.all(itemSubDetails);

    subItemQueries.forEach((itemSnapShot) => {
      itemSnapShot.forEach((itemDoc) => {
        const itemData = itemDoc.data();

        // Convert the Base64 image data to an image URL for JPG images
        const imageDataURL = 'data:image/jpeg;base64,' + itemData.SellerItemImage;
        // Add the image URL to the item details
        itemData.SellerItemImage = imageDataURL;
        itemDetails.push(itemData);
      });
    });

    return itemDetails[0];
  } catch (error) {
    console.error('Error fetching item details by name in category:', error);
    throw error;
  }
};

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    } else {
      // Redirect the user to the login page or any other desired action after logout
      res.redirect('/login');
    }
  });
});

app.listen(port, () => {
  console.log(`App listening on port http://localhost:${port}/dashboard`);
});