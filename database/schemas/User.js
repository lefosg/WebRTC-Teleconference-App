const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    userId: {
        type: mongoose.SchemaTypes.String,
        required: true,
        unique: true
    },
    username: {
        type: mongoose.SchemaTypes.String,
        required: true,
        unique: true
    },
    publicKey: {
        type: mongoose.SchemaTypes.String,
        required: true,
        unique: true
    },
    credentialID: {
        type: mongoose.SchemaTypes.String,
        required: true,
        unique: true
    },
    signCounter: {
        type: mongoose.SchemaTypes.Number,
        required: true,
        unique: false
    },
    createdAt: {
        type: mongoose.SchemaTypes.Date,
        required: true,
        default: new Date()
    }
});

module.exports = mongoose.model('users', UserSchema);

