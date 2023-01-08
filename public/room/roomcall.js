let current_location = window.location.href;
let x = window.location.href.slice(0, window.location.href.lastIndexOf('/'));
let effective_domain = x.slice(0, x.lastIndexOf('/'));

const socket = io(effective_domain);
const peerGrid = document.getElementById('video-grid');
const flexContainer = document.getElementById('flexbox-container-Id');
const messageBox = document.getElementById('messagesArea')
const participantsBox = document.getElementById('participantsList')
const myFeed = document.getElementById('myVideo');
const myPeer = new Peer();
let myPeerId = null;
var peerCounter = 0;


//set room id on header bar
document.getElementById("titleBox").innerHTML = ROOM_ID
document.getElementById("myVideoUsername").innerHTML = username;
document.getElementById("usernameBox").innerHTML = username;

enterCallAudio();

const myVideo = document.getElementById('myVideo')
myVideo.muted = true;
const peers = {};
let peersUsernames = [];
let chat = [];
let screenStream = null;
let screenSharing = false;
var delivery;
let printedPeers = []
let peerBoxesDict = {}
const MAX_FILE_SIZE = 1572864  //in bytes, that's 1.5 MB

navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
}).then(stream => {
  //add my video feed
	myVideo.srcObject = stream;
	myVideo.addEventListener('loadedmetadata', () => {
		myVideo.play();
	})

	//control buttons functionallity
	let toggleMic = async () =>{
		let audioTrack = stream.getTracks().find(track => track.kind === 'audio')
	
		if(audioTrack.enabled){
			audioTrack.enabled = false
			document.getElementById('mic-btn').style.backgroundColor = 'grey'
		}
		else{
			audioTrack.enabled = true
			document.getElementById('mic-btn').style.backgroundColor = 'transparent'
		}
	}

	let toggleCamera = async () =>{
		if (screenSharing) {
			alert("Cannot use camera while screen sharing")
			return;
		}
		let videoTrack = stream.getTracks().find(track => track.kind === 'video')
	
		if(videoTrack.enabled){
			videoTrack.enabled = false
			document.getElementById('camera-btn').style.backgroundColor = 'grey'
		}
		else{
			videoTrack.enabled = true
			document.getElementById('camera-btn').style.backgroundColor = 'transparent'
		}
	}

	let shareScreen = () => {

		try {
			//if already sharing, stop stream
			if (screenSharing) {
				stopScreenSharing();
				return;
			}

			//get screen stream
			navigator.mediaDevices.getDisplayMedia({
				video: { mediaSource: "screen", cursor: "always" },
				audio: false
			}).then(displayStream => {
				screenStream = displayStream;
				
				let videoTrack = screenStream.getVideoTracks()[0];
				videoTrack.onended = () => {
					stopScreenSharing();
				}
		
				//change stream for peers
				for (peerId in peers) {
					currentPeer = peers[peerId];
					sender = currentPeer.peerConnection.getSenders().find(function (s) {
						return s.track.kind == videoTrack.kind;
					});
					sender.replaceTrack(videoTrack);
				}
				screenSharing = true;
				//change local video to screen share
				myVideo.srcObject = screenStream;
				myVideo.addEventListener('loadedmetadata', () => {
					myVideo.play();
				})
			}).catch( err => console.log(err) );
		} catch (err) {
			console.log(err);
		}
	}

	function stopScreenSharing() {
		try {
			//if already streaming -> return
			if (!screenSharing) {
				return;
			}

			//stream var below is the video stream 
			let videoTrack = stream.getVideoTracks()[0];
			//stop screen stream and make it null
			screenStream.getTracks().forEach((track) => {
				track.stop();
			})
			//for each peer change screen stream to video stream
			for (peerId in peers) {
				currentPeer = peers[peerId];
				sender = currentPeer.peerConnection.getSenders().find(function (s) {
					return s.track.kind = videoTrack.kind;
				});
				sender.replaceTrack(videoTrack);
			}
			
			screenSharing = false;

			//set local stream to video stream again
			myVideo.srcObject = stream;
			myVideo.addEventListener('loadedmetadata', () => {
				myVideo.play();
			});
		} catch (err) {
			console.log(err);
		}

	}

	let hangUp = async() => {
		let leaveCall = confirm("Do you want to leave the current call?");
		if (!leaveCall) return;
		leaveCallAudio();
		//localStorage.setItem("inCall", false);
		socket.disconnect();
		socket.close();
		myPeer.disconnect();
		myPeer.destroy();
		window.location.replace(effective_domain)
		socket.emit('disconnect');
	}

	//localStorage.setItem("inCall", true);


	document.getElementById('camera-btn').addEventListener('click',toggleCamera);
	document.getElementById('mic-btn').addEventListener('click',toggleMic);
	document.getElementById('screen-share-btn').addEventListener('click', shareScreen);
	document.getElementById('hang-up-btn').addEventListener('click',hangUp);

	document.getElementById('mic-btn').click();

	myPeer.on('call', call => {
		call.answer(stream);
		const video = document.createElement('video');
		call.on('stream', userVideoStream => {
			//peerCounter++;
			addPeerStream(video, userVideoStream, call.metadata.id);
		});
		//on answer callee saves the call for the other peer calling -> call.metadata.id is the caller id
		peers[call.metadata.id] = call; 
		
	})

	socket.on('user-connected', (userId, username) => {
		connectToNewUser(userId, stream);
		peersUsernames.push(username);
		enterCallAudio();
		
	});
	
}).catch(err => {console.log(err);}) 

socket.on('user-disconnected', (userId, username) => {
  	if (peers[userId]) peers[userId].close();
  
	peersUsernames = peersUsernames.filter((name) => {
		return username != name;
	});
	leaveCallAudio();
  
	//removeFlexbox(userId);
	//peerCounter--;
});

socket.on("get-previous-chat-messages", previousChatMessages => {
	//otan mpainw sto call pairnw ta prohgoymena mhnymata => display the on screen
	chat = previousChatMessages;
	chat.forEach(msg => showMessage(msg));  //show previous messages in the chat to the user who just logged in
});

socket.on('get-text-msg', (textMsg, username) => {
	console.log(username, textMsg);
	showMessage({message: textMsg, username: username});
	chat.push({message: textMsg, username: username});
	messageAudio();
});

socket.on("get-members-in-call", usernames => {
	console.log(usernames);
	peersUsernames = usernames;
});

socket.on('get-file-preview', (fileName, username) => {
	showMessage({username: username, message: fileName, isFile: true})
});

socket.on('err', err => {
	alert(err);
});

myPeer.on('open', id => {
	myPeerId = id;
  	socket.emit('join-room', ROOM_ID, id, username);
});

function connectToNewUser(userId, stream) {
	const call = myPeer.call(userId, stream, {metadata: {"id":myPeerId}});
	const video = document.createElement('video');
	call.on('stream', userVideoStream => {
		addPeerStream(video, userVideoStream, userId);
	});
	call.on('close', () => {
		call.close();
		video.remove();
		peerCounter--;
		removeFlexbox(userId);
		leaveCallAudio();
	});
	//caller saves the call object with the corresponding peerId
	peers[userId] = call;
}

function removeFlexbox(userId) {
	flexContainer.removeChild(document.getElementById('flexbox-item-'+String(userId)));
	delete peerBoxesDict[userId];
	resizePeerBoxes();
}

var flag = false
function addPeerStream(video, stream, userId) {
	video.srcObject = stream;
	video.addEventListener('loadedmetadata', () => {
	  video.play();
	})
	video.setAttribute('id', "vid");
	
	
	if (flag===true){
		let box = document.createElement("div");
		peerBoxesDict[userId] = box;

		box.className = "flexbox-item";
		box.setAttribute('id', 'flexbox-item-'+String(userId));
		box.addEventListener('click',makeFullScreen(userId));		

		let blackBar = document.createElement("div");
		blackBar.className = "name-box";
		blackBar.setAttribute('id', "peerVideoUsername");
		blackBar.innerHTML = peersUsernames[peerCounter];

		peerCounter++;
		box.appendChild(video);
		box.appendChild(blackBar);
		flexContainer.appendChild(box);
	}flag = !flag;
	resizePeerBoxes();
}

function resizePeerBoxes()
{
	if(peerCounter===1){
		for(var key in peerBoxesDict) {
			peerBoxesDict[key].style.width = "68.7%";
			peerBoxesDict[key].style.height = "86.9%";
		}
	}

	else if(peerCounter===2){
		for(var key in peerBoxesDict) {
			peerBoxesDict[key].style.width = "48.8%";
			peerBoxesDict[key].style.height = "61.7%";
		}
	}

	else if(peerCounter>=3){
		for(var key in peerBoxesDict) {
			peerBoxesDict[key].style.width = "36.6%";
			peerBoxesDict[key].style.height = "46.3%";
		}
	}

	else if(peerCounter>=5){
		for(var key in peerBoxesDict) {
			peerBoxesDict[key].style.width = "24.4%";
			peerBoxesDict[key].style.height = "30.9%";
		}
	}
}

function makeFullScreen(fkey){
	for(var key in peerBoxesDict) {
		peerBoxesDict[key].style.width = "24.4%";
		peerBoxesDict[key].style.height = "30.9%";
	}
	peerBoxesDict[fkey].style.width = "48.8%";
	peerBoxesDict[fkey].style.height = "61.7%";
	peerBoxesDict[fkey].style.order = "1";
}

//Chat functionallity
let chatIsOpen = false;
document.getElementById("chatBtn").addEventListener("click", toggleChat);
document.getElementById("sendMsgBtn").addEventListener("click", sendMsg);
document.getElementById("msgInputArea").addEventListener("keypress", event => {
	if (event.key === "Enter") {
		if (document.getElementById("msgInputArea").value == "")
			return;
		event.preventDefault();
		document.getElementById("sendMsgBtn").click();
	} });


function toggleChat() {
	if (participantsListIsOpen)
		closeParticipants();

	if(!chatIsOpen){
		openChat();
	} else {
		closeChat();
	}
}

function openChat() {
	document.getElementById("chatBox").style.display = "block";
	chatIsOpen = true;
}

function closeChat() {
	document.getElementById("chatBox").style.display = "none";
	chatIsOpen = false;
}

async function sendMsg() {
	let msg = document.getElementById("msgInputArea").value;
	if (!msg || msg == "") {
		return;
	}
	socket.emit('text-msg', msg, username);
	chat.push({message: msg, username: username});  //when sending a message put it in the chat list 
	document.getElementById("msgInputArea").value = "";
	showMessage({message: msg, username: username});
}

function showMessage(messageObj){
	//messageBox.textContent += messageObj.username + ": " + messageObj.message + '\n';  //show username: message
	//create outer div
	let newMsgLine = document.createElement("div");
	//create message element <p>
	//if sender is the current one, user darker class
	newMsgLine.className =  messageObj.username == username?"msg-container darker":"msg-container";
	let msg = document.createElement("p");
	if (messageObj.isFile) {  //if it is a file, messageObj.isFile is not undefined, and messageObj.message is the filename
		//we add an <a> element and make it clickable, so on click it downloads the file
		let clickable = document.createElement("a");
		clickable.style.cursor = "pointer";
		clickable.innerHTML = messageObj.message;
		clickable.onclick = () => {
			socket.emit('download-file', messageObj.message, ROOM_ID);
		};
		msg.appendChild(clickable);
	} else {
		msg.innerHTML = messageObj.message
	}
	//add it to the div
	newMsgLine.appendChild(msg);
	//create sender username as <span>
	let sender = document.createElement("span");
	//if sender is the current one, place the name to the right
	sender.className = messageObj.username == username?"time-right":"time-left";
	sender.innerHTML = messageObj.username;
	//add it to the div
	newMsgLine.appendChild(sender);

	//finally add the whole div to the messageBox
	messageBox.appendChild(newMsgLine);
	messageBox.scrollTop = messageBox.scrollHeight;
}

//participants list
var participantsListIsOpen = false;
document.getElementById("participantsBtn").addEventListener('click', toggleParticipants);

function toggleParticipants() {
	if (chatIsOpen)
		closeChat();

	if (participantsListIsOpen)
		closeParticipants();
	else 
		openParticipants();
}

function openParticipants() {	
	peersUsernames.forEach(name => {	
		printParticipant(name)
	});
	participantsListIsOpen = true;
	document.getElementById("participantsBox").style.display = "block";
}

function closeParticipants() {
	participantsListIsOpen = false;
	document.getElementById("participantsBox").style.display = "none";
	printedPeers = [];
	participantsBox.childNodes = null;
}

function printParticipant(name){
	let participantLine = document.createElement("div");
	participantLine.className = "participant-container"

	let username = document.createElement("p");
	username.innerHTML = name;

	let img = document.createElement("img");
	img.setAttribute('src', 'icons/user.png');

	participantLine.appendChild(img);//eikona profil xrhsth
	participantLine.appendChild(username);
	participantsBox.appendChild(participantLine);

	printedPeers.push(name);

}

//other functionallity
function enterCallAudio(){
	var audio = new Audio('sfx/enter.mp3');
	audio.play();
}
function leaveCallAudio(){
	var audio = new Audio('sfx/leave.mp3');
	audio.play();
}
function messageAudio(){
	var audio = new Audio('sfx/msg.mp3');
	audio.play();
}

var file;
document.getElementById("sendAttachmentBtn").addEventListener('change', loadAttachment);
function loadAttachment(evt) {
	file = document.getElementById("sendAttachmentBtn").files[0];
	if (!file) {
		return;
	}
	if (file.size > MAX_FILE_SIZE) {
		alert("File larger than 3MB!");
		return;
	}
	//socket.emit('file-msg', file);
	delivery.send(file);
	messageAudio();
	showMessage({username: username, message: file.name, isFile: true})
	evt.preventDefault();
}

socket.on('get-file-download', (fileName, data) => {
	let blob = new Blob([data]);
	saveAs(blob, fileName);
});


delivery = new Delivery(socket);

delivery.on('delivery.connect', delivery => {
	console.log('delivery api connected to server');		
});

delivery.on('send.success',function(fileUID){
	console.log("file was successfully sent.");
});

// window.onbeforeunload = function(event) { 
// 	localStorage.setItem("inCall", false);
// 	event.preventDefault();
//   	event.returnValue = '';
// }
