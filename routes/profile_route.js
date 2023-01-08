const { Router } = require('express');
const User = require('../database/schemas/User');
const ProfilePic = require('../database/schemas/ProfilePic');
const fs = require('fs'); 
const FileReader = require('file-api').FileReader;


const router = Router();

 
//middleware to check authorization (aka if user is logged in)
router.use((req, resp, next) => {
    if (!req.session.loggedIn) {
        resp.sendStatus(403);
        return;
    }
    next();
});

router.get('/', (request, response) => {
    response.sendStatus(404);
});

router.get('/:username', async (request, response) => {    

    //check username parameter existence in request
    if (request.params.username == "") {
        request.params.username = request.session.username;
    }

    let user = (await User.find({username: request.params.username}))[0];

    if (!user) {
        response.sendStatus(404);
        return;
    }

    let img = (await ProfilePic.find({userId: user.userId}))[0].image.data;  //retrieve image buffer from db
    //if profile requested is not the user's, show preview of other's profile??
    response.render('profile.ejs', {uname: request.params.username,
        image: img,  //fetch image here, user.image or sth like that
    });
});


router.post('/:username/uploadProfilePic', async (request, response, next) => {
    if (request.params.username != request.session.username) {
        response.sendStatus(403);
        return;
    }
    /**
     * reminder: profile picture image document looks like this
     * {
     *   fileName : string,
     *   image : {
     *     data : string
     *   }
     * }
     * extract fileName and image from request.body, and get userId from User.find({...}) 
     */

    let img = request.body;

    if (img.fileName == "" || !img.image.data) {
        response.sendStatus(400);
        return;
    }


    let user_id = (await User.find({username: request.params.username}))[0].userId;
    let imageObject = {
        fileName: img.fileName,
        image: {
            data: img.image.data
        }
    }

    console.log(imageObject.image.data);
    //save imageObejct
    //send response for successful/failed saving attempt
    fs.writeFileSync('a.png', Buffer.from((imageObject.image.data.slice(imageObject.image.data.indexOf(',')+1))).slice(0,-1));

    try {
        await ProfilePic.updateOne({userId: user_id}, { $set: {

            fileName: imageObject.fileName,
            image: {
                data: Buffer.from(request.body.image.data).toString('base64')
            }
        }});
        response.render('profile.ejs', {
            uname: request.params.username,
            image: request.body.image.data
        });
        console.log("image uploaded");
    } catch (error) {
        console.log(error);
        response.json({status: false, msg:"Failed to upload profile image"});
    }
    next();
});

router.post('/:username/changeUsername', async (request, response) => {
    if (request.params.username != request.session.username) {
        response.sendStatus(403);
        return;
    }
    let body = request.body;
    if (!body || !body.newUsername || body.newUsername == "") {
        response.sendStatus(400);
        return
    }

    //check if username exists
    let existing_user = (await User.find({username: body.newUsername}))[0]
    if (existing_user) {
        response.json({status: false, msg: "Username already exists"});
        return;
    }

    //update the user in db and session
    try {
        let user = (await User.find({username: request.session.username}))[0];
        User.findByIdAndUpdate( user._id.toString(), {username: body.newUsername},
        function (err, docs) {
            if (err){
                console.log(err)
            } else{
                console.log("Updated User Counter");
            }
        });
        request.session.username = body.newUsername;
        //redirect the user to the new url '/profile/:newUsername'
        response.json({status: true, msg: "Successfully changed username", location: "http://localhost:8000/profile/" + body.newUsername});

    } catch (err) {
        console.error(err);
        response.json({status: false, msg: "Could not update the username"});
        return;
    }
});





module.exports = router;
