const mongoose = require('mongoose');

const ProfilePicsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.SchemaTypes.String,
        required: true,
        unique: true
    },
    fileName: {
        type: mongoose.SchemaTypes.String,
        required: true,
        unique: false
    },
    image: {
        data: {
            type: mongoose.SchemaTypes.String,
            required: true,
            unique : false
        },
    }
});

module.exports = mongoose.model('ProfilePic', ProfilePicsSchema);

