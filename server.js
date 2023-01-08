const cookieParser = require('cookie-parser');
const expressSession = require('express-session');
const express = require('express');
const fs = require('fs');
const rimraf = require("rimraf");
const app = express();
const cors = require('cors'); //fixme: fix cors, note: somehow it fixed itself
//.env
require('dotenv').config();
const PORT = process.env.PORT;
//https server
const https = require('https');

let privateKey = fs.readFileSync('./security/cert.key');
let certificate = fs.readFileSync('./security/cert.pem');
let credentials = {key: privateKey, cert: certificate};
httpsServer = https.createServer(credentials, app);

const io = require('socket.io')(httpsServer);
const MongoStore = require('connect-mongo'); //db
const { exec } = require('child_process');
require('./database/db');
const { randomBase64URLBuffer } = require('./helper'); //for the secrete used in sessions
const User = require('./database/schemas/User'); //the description of the user object saved in database
const dl = require('delivery');

httpsServer.listen(PORT, () => console.log("Running HTTP express server at https://localhost:"+PORT));
//run peerjs server for finding peers and assigning ids
exec("peerjs --port 3001", (error, stdout, stderr) => {
    if (error) {
        console.log(`error: ${error.message}`);
        return;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
    }
    console.log(`stdout: ${stdout}`);
});

/* ----- session ----- */
app.use(expressSession({
    secret: randomBase64URLBuffer(12),
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: process.env.DB_URL }),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}))
app.use(cookieParser())

//make api completely public//

app.set('view engine', 'ejs')
app.use(express.static("public"));
//app.set('views', './views');

app.use(express.json());
app.use(express.urlencoded());
//print type of request and url in every request
app.use((request, response, next) => {
    console.log(request.method, request.url);
    next();
});


//main route page

app.get("/", (request, response) => {
    response.render("index");
});

//other routes
//room route
app.get('/room/', (request, response) => {
    response.redirect('/room/testRoom');
});

app.get('/room/:roomId', (request, response) => {
    if (request.params.roomId)
        response.render('room', {
            roomId: request.params.roomId,
            uname: request.query['username']
        });
    else
        response.render('room', {
            roomId: 'testRoom',
            uname: request.query['username'] | "testName"
        });

});

/**
 * In this route the user will ask the server "Does this username exist already in your database?"
 * It doesn't matter if it's on registration or authentication, the check should be done in any case
 */
app.get('/user/:username', async(request, response) => {
    //check if the parameter was given
    if (!request.params) {
        response.send("No parameter given");
        return;
    }
    if (!request.params.username) {
        response.send("Enter a username");
        return;
    }
    if (request.params.username === "") {
        response.send("Enter a username");
        return;
    }
    //check if the user is registered in the database
    let usernameQueried = request.params.username;
    let userDB = await User.findOne({ username: usernameQueried }); //here we do the search
    console.log(`check user ${usernameQueried} existence:`, userDB ? true : false)
    if (userDB) {
        response.json({ username: userDB.username, status: true });
    } else {
        response.json({ msg: "User not found!", status: false });
    }
});

/**
 * Check if the user is authenticated
 */
app.get('/userAuthenticated', (request, response) => {
    console.log("authenticated", request.session.loggedIn);
    if (request.session.loggedIn) {
        response.json({ status: true, username: request.session.username });
    } else {
        response.json({ status: false });
    }
});

//auth route
const webuathnauth = require('./routes/webauthn_route.js');
app.use('/webauthn', webuathnauth)

//profile settings route
const profileroute = require('./routes/profile_route.js');
app.use('/profile', profileroute)


let roomToUsername = {}; //data structure containing each member in a room
let roomToChat = {} //data structure containing chat for each room

io.on('connection', socket => {

    //room events
    socket.on('join-room', (roomId, userId, username) => {
        let dir = 'chatfiles/' + roomId;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true }, err => { console.log(err); });
        }
        socket.join(roomId)
            //add user to the room structure
        if (roomId in roomToUsername) {
            roomToUsername[roomId].push(username);
        } else {
            roomToUsername[roomId] = [username];
        }
        console.log(roomToUsername);

        //send to the user the names of other members in the room
        //check if current user is not the only one in the room, and dont send his name to himself
        if ((roomToUsername[roomId].length != 0 || roomToUsername[roomId].length != 1) &&
            roomToUsername[roomId][0] != username) {
            membersNames = roomToUsername[roomId].filter(name => name != username);
            console.log(membersNames);
            socket.emit("get-members-in-call", membersNames);
            if (roomId in roomToChat) {
                if (roomToChat[roomId].length != 0) {
                    socket.emit("get-previous-chat-messages", roomToChat[roomId]); //send chat history
                }
            }
        }
        socket.to(roomId).emit('user-connected', userId, username);
        //delivery api, manages file sending of the chat
        var delivery = dl.listen(socket);

        //on disconnect, update the clients and clear some in-server variables
        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId, username);
            roomToUsername[roomId] = roomToUsername[roomId].filter(name => name != username);
            if (roomToUsername[roomId].length == 0) {
                rimraf(dir, () => { console.log("done deleting dir", dir); })
                delete roomToUsername[roomId];
                delete roomToChat[roomId];
            }

        });
        //messaging
        socket.on('text-msg', (textMsg, username) => {
            if (roomId in roomToChat) {
                roomToChat[roomId].push({ message: textMsg, username: username });
            } else {
                roomToChat[roomId] = [{ message: textMsg, username: username }];
            }
            socket.to(roomId).emit('get-text-msg', textMsg, username);
        });

        //on file receival, save the file locally first and broadcast a preview of it. (on demand download)
        delivery.on('receive.success', file => {
            if (!fs.existsSync(dir + '/' + file.name)) {
                fs.writeFile('./chatfiles/' + roomId + '/' + file.name, file.buffer, err => {
                    if (err)
                        console.log(err);
                    else
                        console.log("created file");
                });
            }
            //upon saving file, send a preview with a socket event
            socket.to(roomId).emit('get-file-preview', file.name, username);
            if (roomId in roomToChat) {
                roomToChat[roomId].push({ message: file.name, username: username, isFile: true }); //add preview to chat history
            } else {
                roomToChat[roomId] = [{ message: file.name, username: username, isFile: true }];
            }
        });

        socket.on('download-file', (fileName, roomId) => {
            if (!fs.existsSync('chatfiles/' + roomId + '/' + fileName)) {
                errorDescription = "Could not find file", fileName;
                socket.emit('err', errorDescription);
                console.log("could not find file", fileName, 'in', roomId);
                return;
            }
            //this should work but it doesn't --> buggy api
            // delivery.send({
            //     name: fileName,
            //     path: dir + '/' + fileName
            // });

            //we have the file name so we pull the file by the name, get it's data in a buffer and send it
            //to the client for construction
            fs.readFile(dir + '/' + fileName, (err, data) => {
                if (err) {
                    console.error('Error in read csv');
                } else {
                    socket.emit('get-file-download', fileName, data);
                }
            });
        });
    });
});

io.on('error', err => {
    console.log(err);
});

