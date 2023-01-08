//we use this object to control the user state, nothing special, we use this instead of having many variables
//TODO: delete state var
var state = {
    createResponse: null,
    publicKeyCredential: null,
    credential: null,
    user: {
        name: null,  //just the default name, could be null
        displayName: null
    },
}

var authenticated = false;

function detectWebAuthnSupport() {  //called at <body onload=""> in html
    if (window.PublicKeyCredential === undefined ||
        typeof window.PublicKeyCredential !== "function") {
        $('#register-button').attr("disabled", true);
        $('#login-button').attr("disabled", true);
        alert("WebAuthn is not currently supported by this browser");
        return;
    }
}

async function checksOnLoad() {
    console.log("checking authentication status");
    let response = await fetch(window.location.href + 'userAuthenticated', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    authenticated = await response.json();
    console.log("authenticated:",authenticated);
    if (authenticated.status) {
        document.getElementById("userIDField").value = authenticated.username;
        changeEnterRoomBox();
        hideAuthenticationForm();
        addHeaderLoginInfo();
    }
}
checksOnLoad();

function string2buffer(str) {
    return (new Uint8Array(str.length)).map(function (x, i) {
        return str.charCodeAt(i)
    });
}

// Encode an ArrayBuffer into a base64 string.
function bufferEncode(value) {
    return base64js.fromByteArray(value)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

// Don't drop any blanks
// decode
// probably useless
function bufferDecode(value) {
    return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

function buffer2string(buf) {
    let str = "";
    if (!(buf.constructor === Uint8Array)) {
        buf = new Uint8Array(buf);
    }
    buf.map(function (x) {
        return str += String.fromCharCode(x)
    });
    return str;
}


function setUser() {
    username = $("#authUsername").val();
    if (!username || username == "") {
        alert("No username found")
    }
    state.user.name = username.toLowerCase().replace(/\s/g, '');
    state.user.displayName = username.toLowerCase();
}

/**
 * When we receive the PublicKeyCredentialCreationOptions, the id and challenge are encoded in base64
 * to ensure transferability and compatibility with JSON. That's why we preformat the object by 
 * using base64url.decode, before using it
 * @param {JSON} credOptions 
 */
function preformatCredOptions(credOptions) {
    credOptions.challenge = window.base64url['decode'](credOptions.challenge);
    credOptions.user.id = window.base64url['decode'](credOptions.user.id);
}
/**
 * Makes a call to the 'localhost:3000/user/:username' endpoint
 */
async function checkUserExists() {
    if ($("#authUsername").val() === "") {
        alert("Please enter a username");
        return;
    }
    setUser();
    console.log("making a call to http://localhost:8000/user/:username to check user existence..")
    let response = await fetch(window.location.href + 'user/' + state.user.name, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    let userExists = await response.json();
    console.log("response:",userExists)
    return userExists.status;
}

async function makeCredential() {
    if ($("#authUsername").val() === "") {
        alert("Please enter a username");
        return;
    }
    let userExists = await checkUserExists();
    $('#login-button').attr("disabled", true);
    
    if (userExists) {
        alert("User exists, try another name");
        $('#login-button').attr("disabled", false);
        return;
    }
    console.log("making a call to /webauthn/register/fetchCredOptions fetch credentials options")
    if ($("#authUsername").val() === "") {
        alert("Please enter a username");
        $('#login-button').attr("disabled", false);
        return;
    }
    setUser();
    var credential = null;

    var attestation_type = "none";
    var authenticator_attachment = "cross-platform";

    fetch(window.location.href + 'webauthn/register/fetchCredOptions', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username: state.user.name,
            attestationType: attestation_type,
            authenticatorType: authenticator_attachment
        })
    })
    .then(resp => resp.json())
    .then(jsonResp => {  
        /**
         * the server response looks like this: {msg: ..., status: true/false}
         * if status == false, then there was an error, and msg is a string with the message error (we alert it below)
         * if status == true, then the value of msg is the PublicKeyCredentialCreationOptions
         */
        if (!jsonResp.status) {
            alert(jsonResp.msg);
            return;
        }
        PublicKeyCredentialCreationOptions = jsonResp.msg;
        credentialOptions = PublicKeyCredentialCreationOptions;  //for brevity we call it credentialOptions, we just wanted to demonstrate the fetching of the object
        console.log(credentialOptions);
        preformatCredOptions(credentialOptions);
        
        if (credentialOptions.publicKey.excludeCredentials) {
            for (var i = 0; i < credentialOptions.publicKey.excludeCredentials.length; i++) {
                credentialOptions.publicKey.excludeCredentials[i].id = bufferDecode(makeCredentialOptions.publicKey.excludeCredentials[i].id);
            }
        }

        //create the credential -> CTAP2 kicks in here, a popup appears asking to connect the authenticator and create the key pair
        navigator.credentials.create({  
            publicKey: credentialOptions
        }).then(function (newCredential) {
            console.log("PublicKeyCredential Created");
            console.log(newCredential);  //this is a JSON object so it is 100% ready to be sent back to the server endpoint 'webauthn/register/storeCredential'
            state.createResponse = newCredential;
            sendAuthenticatorAttestationResponse(newCredential);
        }).catch(function (err) { 
            //on credential creation abandonment, update the server to clear its session variables, and for the frontend reset the state variable (see top of the file) 
            abandonWebAuthnOperation();
            console.log(err)
        });
    })
    .catch(error => console.log(error));
}

function abandonWebAuthnOperation() {
    alert("Error on registration");

    fetch(window.location.href + 'webauthn/register/storeCredentials', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    });

    state = {
        createResponse: null,
        publicKeyCredential: null,
        credential: null,
        user: {
            name: "foo",
            displayName: "foo"
        },
    };
    console.log("Abandoning WebAuthn operation");
    $('#login-button').attr("disabled", false);
}

/**
 * This method is called after the public key credential is created.
 * We send the AuthenticatorAttestationResponse but wait to get a status response back
 * to make sure the server successfully saved the credential
 * @param {PublicKeyCredential} newCredential the AuthenticatorAttestationResponse
 */
async function sendAuthenticatorAttestationResponse(newCredential) {

    let statusResponse = await fetch(window.location.href + 'webauthn/register/storeCredentials', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        //because navigator.credentials.create returns ArrayBuffer, encode them to base64 url, and decode on server
        body: JSON.stringify({
            id: newCredential.id,
            rawId: window.base64url['encode'](newCredential.rawId),
            response: {
                clientDataJSON: window.base64url['encode'](newCredential.response.clientDataJSON),
                attestationObject: window.base64url['encode'](newCredential.response.attestationObject)
            },
            type: newCredential.type
        })
    });

    let status = await statusResponse.json();    
    alert(status.msg);
    
    if (status.status) {
        setUser()
    }

    if (status.status) {
        $('#login-button').attr("disabled", false);
    }
}


async function getAssertion() {
    if ($("#authUsername").val() === "") {
        alert("Please enter a username");
        return;
    }
    setUser();
    let userExists = await checkUserExists();
    $('#register-button').attr("disabled", true);
    
    if (!userExists) {
        alert("User does not exist, try registering first");
        $('#register-button').attr("disabled", false);
        return;
    }

    console.log("making a call to http://localhost:8000/webauthn/login/fetchAssertionOptions to fetch assertion options");
    fetch(window.location.href + 'webauthn/login/fetchAssertionOptions', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username: state.user.name
        })
    })
    .then(response => response.json())
    .then(jsonResp => {  
        /**
         * the server response looks like this: {msg: ..., status: true/false}
         * if status == false, then there was an error, and msg is a string with the message error (we alert it below)
         * if status == true, then the value of msg is the PublicKeyCredentialRequestOptions
         */

        if (!jsonResp.status) {
            alert(jsonResp.msg);
            return;
        }

        PublicKeyCredentialRequestOptions = jsonResp.msg;
        assertionOptions = PublicKeyCredentialRequestOptions; //for brevity we call it assertionOptions, we just wanted to demonstrate the fetching of the object
        console.log(assertionOptions);

        assertionOptions.challenge = base64url.decode(assertionOptions.challenge);
        assertionOptions.allowCredentials.forEach( credential => {
            credential.id = base64url.decode(credential.id);
        });

        navigator.credentials.get({
            publicKey: assertionOptions
        })
        .then(assertionResponse => {
            console.log("Assertion created");
            console.log(assertionResponse);
            sendAuthenticatorAssertionResponse(assertionResponse);
            alert("Successfully logged in!");
            setUser()
            authenticated = true;
            changeEnterRoomBox();
            hideAuthenticationForm();
            addHeaderLoginInfo();
        })
        .catch(err => {
            console.log(err);
            alert("Error on user authentication :(")
        }); 
        
    })
    .catch(err => console.log(err));
    
    $('#register-button').attr("disabled", false);
}

async function sendAuthenticatorAssertionResponse(assertionResponse) {
    console.log("Sending AuthenticatorAssertionResponse to the server");

    try {
	    let result = await fetch(window.location.href + 'webauthn/login/verifyAssertion', {
	        method: 'POST',
	        headers: {
	            'Accept': 'application/json',
	            'Content-Type': 'application/json'
	        },
	        body: JSON.stringify({
	            id: assertionResponse.id,
	            rawId: window.base64url['encode'](assertionResponse.rawId),
	            response: {
	                authenticatorData: window.base64url['encode'](assertionResponse.response.authenticatorData),
	                clientDataJSON: window.base64url['encode'](assertionResponse.response.clientDataJSON),
	                signature: window.base64url['encode'](assertionResponse.response.signature),
	                userHandle: window.base64url['encode'](assertionResponse.response.userHandle),
	            },
	            type: assertionResponse.type
	        })
	    });

        let status = await result.json();
        console.log(status);
        document.getElementById("authUsername").value = "";
        document.getElementById("userIDField").value = status.username;

    } catch (err) {
        console.log(err);
    }
}

async function logout() {

    try {
        let result = await fetch(window.location.href + 'webauthn/logout', {
            method: 'delete',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        let status = await result.json();
        console.log(status.msg)
        window.location.reload();
    } catch (err) {
        console.log(err);
    }

}

document.getElementById('register-button').addEventListener('click', makeCredential);
document.getElementById('login-button').addEventListener('click', getAssertion);
document.getElementById('logout-button').addEventListener('click', logout);
document.getElementById('userBox').addEventListener('click', goToDashboard);


function changeEnterRoomBox() {
    document.getElementById("userIDField").readOnly = true;
    document.getElementById("guestText").style.display = "none";
}

function hideAuthenticationForm() {
    document.getElementById("authenticationFormSlogan").style.display = "none";
    document.getElementById("authUsername").style.display = "none";
    document.getElementById("register-button").style.display = "none";
    document.getElementById("login-button").style.display = "none";
}

function addHeaderLoginInfo() {
    document.getElementById("userBox").value = state.user.name;
    document.getElementById("userBox").style.display = "inline";
    document.getElementById("logout-button").style.display = "inline";
}


function goToDashboard() {
    
}