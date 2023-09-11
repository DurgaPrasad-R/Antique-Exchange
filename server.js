const express = require('express')
const app = express()
app.use(express.json())
app.use(express.urlencoded())
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
app.post('/signup',async (req,res)=>{
  console.log(req.body)
  await db.collection('First').add({
    
    Name: req.body.Name,
    Email: req.body.Email,
    Password: req.body.Password
}).then(()=>{
    res.send("Signup Successful")
})
})

app.listen(port, () => {
  console.log(`App listening on port http://localhost:${port}`)
})