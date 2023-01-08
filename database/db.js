require('dotenv').config();
const mongoose = require('mongoose');
mongoose.set('strictQuery', false);

mongoose.connect( process.env.DB_URL ,{ useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('connected to database'))
    .catch((err) => console.log(err));