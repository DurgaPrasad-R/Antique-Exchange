const express = require('express');
const app = express();
const session = require('express-session');
const passwordHash = require('password-hash');
app.use(express.json());
app.use(express.urlencoded());

// To use HTML files
app.use(express.static("public"));

// Set the view engine to EJS
app.set('view engine', 'ejs');

const multer = require('multer');

const storage = multer.diskStorage({
  // To save uploaded files to the "uploads" folder
  destination: function (req, file, cb) {
    cb(null, 'public/uploads'); 
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
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
    // Rendering the index.ejs template and passing the sellerItems, session and globalCategories as a variable.
    res.render('index', { sellerItems, session, globalCategories });
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
  const userEmail = req.session.userData ? req.session.userData.Useremail : null;

    if (!userEmail) {
      // Redirects to the login page when the user didn't login
      res.redirect('/login');
      return;
    }
  const session = req.session;
  res.render('seller', { session, globalCategories });
});

// Endpoints for API
app.post('/signup', async (req, res) => {
  const email = req.body.Email;

  // Checking if the user with the provided email already exists
  const existingUser = await db.collection('First')
    .where('Email', '==', email)
    .get();

  if (!existingUser.empty) {
    // User already exists, redirect to the login page
    res.send(`
    <html>
    <head>
      <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
    </head>
    <body>
      <script>
        swal({
          title: "Info!",
          text: "User with this email already exists. Please login.",
          icon: "info",
          button: "OK"
        }).then(() => {
          window.location.href = "/login";
        });
      </script>
    </body>
    </html>
  `);
  } else {
    // User is not registered, details added to db
    await db.collection('First').add({
      Name: req.body.Name,
      Email: email,
      Password: passwordHash.generate(req.body.Password)
    }).then(() => {
      // Sending a success message and then redirect to the login page
      res.send(`
      <html>
      <head>
        <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
      </head>
      <body>
        <script>
          swal({
            title: "Success!",
            text: "Signup Successful. Please login.",
            icon: "success",
            button: "OK"
          }).then(() => {
            window.location.href = "/login";
          });
        </script>
      </body>
      </html>
    `);
    });
  }
});

app.post('/login', async (req, res) => {
  const querySnapShot = await db.collection('First')
    .where("Email", "==", req.body.Email)
    .get();

  if (!querySnapShot.empty) {
    const doc = querySnapShot.docs[0];
    const PasswordHash = doc.get("Password");

    if (passwordHash.verify(req.body.Password, PasswordHash)) {
      const userData = {
        Username: doc.get("Name"),
        Useremail: doc.get("Email")
      };
      req.session.userData = userData;
      // Send a success alert message and then redirect or perform any other actions
      res.send(
        `
    <html>
    <head>
      <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
    </head>
    <body>
      <script>
        swal({
          title: "Success!",
          text: "Login successful.",
          icon: "success",
          button: "OK"
        }).then(() => {
          window.location.href = "/dashboard";
        });
      </script>
    </body>
    </html>
  `);
    } else {
      res.send(`
        <html>
        <head>
          <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
        </head>
        <body>
          <script>
            swal({
              title: "Invalid!",
              text: "Invalid email or password. Please try again.",
              icon: "warning",
              button: "OK"
            }).then(() => {
              window.location.href = "/login";
            });
          </script>
        </body>
        </html>
        `);
    }
  } else {
    // User not found, you can send an alert or error message
    res.send(`
      <html>
      <head>
        <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
      </head>
      <body>
        <script>
          swal({
            title: "Info!",
            text: "Email Not Found.Try Again?",
            icon: "info",
            button: "OK"
          }).then(() => {
            window.location.href = "/login";
          });
        </script>
      </body>
      </html>
      `);
  }
});

app.post('/seller-data', upload.single('itemImage'), async (req, res) => {
  const userEmail = req.session.userData ? req.session.userData.Useremail : null;

  if (userEmail) {
    try {
      // Retrieving the user's document based on their email
      const querySnapshot = await db.collection('First')
        .where("Email", "==", userEmail)
        .get();

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];

        // Creating a reference to the "sellerItems" subcollection
        const sellerItemsCollection = userDoc.ref.collection('sellerItems');

        // To Access the uploaded image file from req.file
        const imageFile = req.file;
        const fileSizeLimit = 1024 * 1024;
        if (!imageFile) {
          return res.status(400).send('No file uploaded.');
        }

        if (imageFile.size > fileSizeLimit) {
          return res.status(400).send('File size exceeds the 1MB limit.');
        }

        // retrieving other data from the form submission
        const Name = req.body['item-name'];
        const Price = req.body['item-price'];
        const Category = req.body['item-cat'];
        const Desc = req.body.Description;

        // Creating a new seller item document within the subcollection
        await sellerItemsCollection.add({
          SellerEmail: userEmail,
          SellerItemImage: '/uploads/' + imageFile.filename,
          SellerItemName: Name,
          SellerItemPrice: Price,
          SellerCategory: Category,
          SellerItemDescription: Desc
        });

        res.send(`
        <html>
        <head>
          <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
        </head>
        <body>
          <script>
            swal({
              title: "Success!",
              text: "Seller data added successfully.",
              icon: "success",
              button: "OK"
            }).then(() => {
              window.location.href = "/seller";
            });
          </script>
        </body>
        </html>
      `);
      } else {
        res.send(`
        <html>
        <head>
          <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
        </head>
        <body>
          <script>
            swal({
              title: "Failed!",
              text: "User does not exist: Please Signup.",
              icon: "warning",
              button: "OK"
            }).then(() => {
              window.location.href = "/signup";
            });
          </script>
        </body>
        </html>
        `);
      }
    } catch (error) {
      console.error("Error adding seller data:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.send(`
    <html>
    <head>
      <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
    </head>
    <body>
      <script>
        swal({
          title: "Info!",
          text: "Please login. Before you add the item to sell",
          icon: "info",
          button: "OK"
        }).then(() => {
          window.location.href = "/login";
        });
      </script>
    </body>
    </html>
  `);
  }
});

const globalCategories = []; // Initializing a global variable to store categories
const fetchSellerItems = async () => {
  try {
    // Quering Firestore for seller items and store them in the sellerItems array
    const allUsersSnapshot = await db.collection('First').get();
    const sellerItems = {};

    const subcollectionQueries = [];

    allUsersSnapshot.forEach((userDoc) => {
      // Query the "sellerItems" subcollection for the current user
      const sellerItemsQuery = userDoc.ref.collection('sellerItems')
        .limit(20)
        .get()
        .then((snapshot) => {
          const items = [];
          snapshot.forEach((itemDoc) => {
            const itemData = itemDoc.data();
            const imagePathOrURL = itemData.SellerItemImage;
            itemData.SellerItemImage = imagePathOrURL;
            items.push(itemData);
          });
          return items;
        });

      // Add the subcollection query promise to the array
      subcollectionQueries.push(sellerItemsQuery);
    });

    // Waiting for all subcollection queries to complete
    const subcollectionResults = await Promise.all(subcollectionQueries);

    // Iterating through the results and organize items by category
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
    // Calling a function to fetch all items related to the specified category
    const categoryItems = await fetchCategoryItems(categoryName);
    res.render('category', { categoryItems, session, globalCategories });
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

      const categoryItemsQuery = subcollectionRef.where('SellerCategory', '==', category).get();

      categorySubItems.push(categoryItemsQuery);
    });

    const subCategoryQueries = await Promise.all(categorySubItems);

    subCategoryQueries.forEach((categorySnapShot) => {
      categorySnapShot.forEach((itemDoc) => {
        const itemData = itemDoc.data();
        const imagePathOrURL = itemData.SellerItemImage;
        itemData.SellerItemImage = imagePathOrURL;
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

    // Call the function to fetch item details by name in the specified category
    const itemDetails = await fetchItemDetailsByNameInCategory(categoryName, itemName);
    req.session.itemDetails = itemDetails;
    const session = req.session;
    res.render('itemdetails', { itemDetails, session, globalCategories });
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
        const imagePathOrURL = itemData.SellerItemImage;
        itemData.SellerItemImage = imagePathOrURL;
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
      // Redirect the user to the dashboard page
      res.redirect('/dashboard');
    }
  });
});

app.get('/wishlist', async (req, res) => {
  const session = req.session;
  const userEmail = req.session.userData ? req.session.userData.Useremail : null;

  if (!userEmail) {
    res.send(`
    <html>
    <head>
      <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
    </head>
    <body>
      <script>
        swal({
          title: "Info!",
          text: "Please login. Before you add to wishlist!",
          icon: "info",
          button: "OK"
        }).then(() => {
          window.location.href = "/login";
        });
      </script>
    </body>
    </html>
  `);
  } else {
    const querySnapshot = await db.collection('First')
      .where("Email", "==", userEmail)
      .get();
    const userDoc = querySnapshot.docs[0];
    const itemDetails = {
      SellerItemName: req.session.itemDetails.SellerItemName,
      SellerCategory: req.session.itemDetails.SellerCategory,
      SellerItemPrice: req.session.itemDetails.SellerItemPrice,
      SellerItemImage: req.session.itemDetails.SellerItemImage
    };
    const currentWishlist = userDoc.data().wishlist || [];

    const itemExists = currentWishlist.some(item => {
      return (
        item.SellerItemName === itemDetails.SellerItemName &&
        item.SellerItemPrice === itemDetails.SellerItemPrice &&
        item.SellerItemImage === itemDetails.SellerItemImage
      );
    });
    if (itemExists) {
      // Display a message that the item is already in the wishlist
      res.send(`
        <html>
        <head>
          <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
        </head>
        <body>
          <script>
            swal({
              title: "Already added!",
              text: "Item already in your wishlist.",
              icon: "info",
              button: "OK"
            }).then(() => {
              window.location.href = "/dashboard";
            });
          </script>
        </body>
        </html>
      `);
    } else {
      currentWishlist.push(itemDetails);
      
      // Update the user's wishlist in the database
      await userDoc.ref.update({ wishlist: currentWishlist });

      // Display the success message using SweetAlert
      res.send(`
        <html>
        <head>
          <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
        </head>
        <body>
          <script>
            swal({
              title: "Success!",
              text: "Item added to your wishlist.",
              icon: "success",
              button: "OK"
            }).then(() => {
              window.location.href = "/dashboard";
            });
          </script>
        </body>
        </html>
      `);
    }
}
});

app.get('/wishlistDetails', async (req, res) => {
  const session = req.session;
  const userEmail = req.session.userData ? req.session.userData.Useremail : null;

  if (!userEmail) {
    res.send(`
    <html>
    <head>
      <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
    </head>
    <body>
      <script>
        swal({
          title: "Info!",
          text: "Please login. Before you view your wishlist",
          icon: "info",
          button: "OK"
        }).then(() => {
          window.location.href = "/login";
        });
      </script>
    </body>
    </html>
  `);
  } else {
    try {
      const querySnapshot = await db.collection('First')
        .where("Email", "==", userEmail)
        .get();
      const userDoc = querySnapshot.docs[0];

      if (!userDoc.exists) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const wishlist = userDoc.data().wishlist || [];

      // Render a template to display the wishlist items
      res.render('wishlistData', { wishlist, session, globalCategories });
    } catch (error) {
      console.error('Error fetching wishlist:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

app.get('/remove-from-wishlist/:itemName', async (req, res) => {
  const session = req.session;
  const userEmail = req.session.userData ? req.session.userData.Useremail : null;

  if (!userEmail) {
    res.send(`
    <html>
    <head>
      <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
    </head>
    <body>
      <script>
        swal({
          title: "Info!",
          text: "Please login before removing from wishlist",
          icon: "info",
          button: "OK"
        }).then(() => {
          window.location.href = "/login";
        });
      </script>
    </body>
    </html>
  `);
  } else {
    const itemNameToRemove = req.params.itemName;

    const querySnapshot = await db.collection('First')
      .where("Email", "==", userEmail)
      .get();
    const userDoc = querySnapshot.docs[0];
    
    const currentWishlist = userDoc.data().wishlist;

    // Find the index of the item with the matching itemName in the wishlist
    const itemIndex = currentWishlist.findIndex(item => item.SellerItemName === itemNameToRemove);

    currentWishlist.splice(itemIndex, 1);

    // Update the user's wishlist in the database
    await userDoc.ref.update({ wishlist: currentWishlist });
    // Display the success message using SweetAlert
    res.send(`
    <html>
    <head>
      <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
    </head>
    <body>
      <script>
        swal({
          title: "Success!",
          text: "Item removed from your wishlist.",
          icon: "success",
          button: "OK"
        }).then(() => {
          window.location.href = "/wishlistDetails";
        });
      </script>
    </body>
    </html>
  `);
  }
});

app.post('/place-order', async (req, res) => {
  // Retrieve the item details from the request's hidden input field
  const userEmail = req.session.userData ? req.session.userData.Useremail : null;
  if (userEmail){
    try {
      // Retrieve the user's document based on their email
      const querySnapshot = await db.collection('First')
        .where("Email", "==", userEmail)
        .get();

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];

        // Create a reference to the "orders" subcollection
        const ordersCollection = userDoc.ref.collection('orders');
        const itemDetailsJson = req.body.itemDetails;

          // Parse the JSON string back to an object
          const itemDetails = JSON.parse(itemDetailsJson);

          // Retrieve other order details from the form fields
          const nDays = req.body.NDays;
          const fullName = req.body.FullName;
          const mobile = req.body.Mobile;
          const pincode = req.body.Pincode;
          const flat = req.body.Flat;
          const street = req.body.Street;
          const landmark = req.body.Landmark;
          const townCity = req.body['Town/City'];
          const state = req.body.State;
          const quantity = req.body.No;
          const TotalPrice = quantity*nDays*itemDetails.SellerItemPrice;
          // Store the order details in the session
          orderData = {
            itemDetails,
            quantity,
            nDays,
            TotalPrice,
            fullName,
            mobile,
            pincode,
            flat,
            street,
            landmark,
            townCity,
            state,
            orderDate: new Date(),
            orderID: Math.floor(Math.random()*10000)
          };

          req.session.orderDetails = orderData;
          // console.log(req.session);

          // Add the order data to the "orders" subcollection
          await ordersCollection.add(orderData);

          // Redirect to the order confirmation page
          res.redirect('/order-confirmation');
        } else {
          res.send('<script>alert("User does not exist: Please Signup."); window.location.href = "/signup";</script>');
        }
    } catch (error) {
      console.error('Error parsing item details:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } else {
    res.send(`
    <html>
    <head>
      <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script>
    </head>
    <body>
      <script>
        swal({
          title: "Info!",
          text: "Please login. Before you buy any item",
          icon: "info",
          button: "OK"
        }).then(() => {
          window.location.href = "/login";
        });
      </script>
    </body>
    </html>
  `);
  }
});

app.get('/orders', async (req, res) => {
  try {
    const userEmail = req.session.userData ? req.session.userData.Useremail : null;

    if (!userEmail) {
      // Handle the case where the user is not logged in
      res.redirect('/login'); // Redirect to the login page
      return;
    }

    // Query Firestore to get the user's document
    const userQuerySnapshot = await db.collection('First')
      .where('Email', '==', userEmail)
      .get();

    if (!userQuerySnapshot.empty) {
      const userDoc = userQuerySnapshot.docs[0];

      // Query the "orders" subcollection for the user's orders
      const ordersSnapshot = await userDoc.ref.collection('orders')
        .orderBy('orderDate', 'desc') // Order by date in descending order (most recent first)
        .get();

      const orders = [];

      ordersSnapshot.forEach((orderDoc) => {
        const orderData = orderDoc.data();
        orders.push(orderData);
      });
      const session = req.session;
      // Render a template to display the user's order history
      res.render('orders', { orders, globalCategories, session });
    } else {
      // Handle the case where the user's document doesn't exist
      res.send('<script>alert("User does not exist: Please Signup."); window.location.href = "/signup";</script>');
    }
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/order-details/:orderID', async (req, res) => {
  try {
    // Check if the user is authenticated
    const userEmail = req.session.userData ? req.session.userData.Useremail : null;
    const orderID = req.params.orderID;
    
    if (!userEmail) {
      // Redirect to the login page
      res.redirect('/login'); // You can customize this behavior
      return;
    }
    const userQuerySnapshot = await db.collection('First')
    .where('Email', '==', userEmail)
    .get();
    const userDoc = userQuerySnapshot.docs[0];
    // Access the 'orders' subcollection within the user document
    const ordersCollection = userDoc.ref.collection('orders');
    // query the 'orders' subcollection based on 'orderID'
    const orderQuerySnapshot = await ordersCollection.get();
    const session = req.session;
    orderQuerySnapshot.forEach((orderDoc) => {
      if (orderDoc.data().orderID == orderID){
        const orderedData = orderDoc.data();
        res.render("orderDetails",{orderedData,session,globalCategories})
      }
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Add a route for the order confirmation page
app.get('/order-confirmation', (req, res) => {
  // Retrieve the order details from the session
  const session = req.session;
  // Render the order confirmation page and pass the order details as variables
  res.render('orderconfirmation', { session, globalCategories});
});

app.listen(port, () => {
  console.log(`App listening on port http://localhost:${port}/dashboard`);
});