const express = require('express')
const app = express()
const ejs = require('ejs')
const port = 3000

// Set the view engine to EJS
app.set('view engine', 'ejs');

// To use html files
app.use(express.static("public"))

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

app.listen(port, () => {
  console.log(`App listening on port http://localhost:${port}`)
})