const MAX_IMAGE_SIZE = 1048576; //1 MB in bytes
//const Buffer = require('./buffer');
document.getElementById("usernameField").value = username;
document.getElementById("usernameField").readOnly = true;
document.getElementById("changeUsernameBtn").addEventListener('click', uploadUsername);
document.getElementById("uploadProfilePic").addEventListener('change', uploadProfilePic);
document.getElementById("cancelChangeUsernameBtn").addEventListener('click', cancelUsernameChange)
document.getElementById("goToStartMenu").addEventListener('click', goToIndex)

if (username != document.getElementById("usernameField").value) {
    document.getElementById("changeUsernameBtn").style.display = "none";
}

async function uploadProfilePic() {
    let profPic = document.getElementById("uploadProfilePic").files[0];
    if (!profPic) {
        return;
    }
    if (profPic.size > MAX_IMAGE_SIZE) {
        alert("Maximum profile image size is 1.5 MB!");
        return;
    }

    let fileReader = new FileReader();
    fileReader.onload = async() => {
        let response = await fetch(window.location.href + "/uploadProfilePic", {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fileName: profPic.name,
                image: {
                    data: JSON.stringify(fileReader.result),
                }
            })
        });
    }
    fileReader.readAsDataURL(profPic);

    // let statusObj = await response.json();
    // alert(statusObj.msg);
    // }, function (e) {
    //         console.error(e);
    //     });

}

async function uploadUsername() {
    let btn1 = document.getElementById("changeUsernameBtn");
    let btn2 = document.getElementById("cancelChangeUsernameBtn");
    let inputField = document.getElementById("usernameField");

    if (btn1.innerHTML == "Edit username") {
        btn1.innerHTML = "Upload new username";
        btn2.style.display = "inline";
        inputField.readOnly = false;
        return;
    }

    if (btn1.innerHTML == "Upload new username") {

        if (document.getElementById("usernameField").value == username) {
            alert("Insert a different username");
            return;
        }

        try {
            let response = await fetch(window.location.href + '/changeUsername', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ newUsername: document.getElementById("usernameField").value })
            });

            let status = await response.json();

            alert(status.msg);

            btn1.innerHTML = "Edit username";
            btn2.style.display = "none";
            inputField.readOnly = true;

            if (status.status) {
                window.location.replace(status.location);
            }

        } catch (err) {
            cancelUsernameChange();
            console.error(err);
        }
    }
}

function cancelUsernameChange() {
    document.getElementById("changeUsernameBtn").innerHTML = "Edit username";
    document.getElementById("cancelChangeUsernameBtn").style.display = "none";
    document.getElementById("usernameField").value = username;
    document.getElementById("usernameField").readOnly = true;
}

function goToIndex() {
    let indexPageURL = window.location.href.slice(0, window.location.href.lastIndexOf('/'));
    indexPageURL = indexPageURL.slice(0, indexPageURL.lastIndexOf('/'));
    console.log(indexPageURL);
    window.location.href = indexPageURL;
}