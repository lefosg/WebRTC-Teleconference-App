const { createHash } = require('crypto');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const vanillacbor = require('vanillacbor');
const base64url  = require('base64url');
const cbor = require('cbor');

/**
 * Hashes the string according to sha256 algorithm
 * @param {string} string 
 * @returns the hash of the string input - sha256 
 */
function hash(string) {
    return createHash('sha256').update(string).digest();
}

/**
 * Takes signature, data and PEM public key and tries to verify signature
 * @param  {Buffer} signature
 * @param  {Buffer} data
 * @param  {String} publicKey - PEM encoded public key
 * @return {Boolean}
 */
function verifySignature(signature, data, publicKey) {
    return crypto.createVerify('SHA256')
        .update(data)
        .verify(publicKey, signature);
}

/**
 * Returns base64url encoded buffer of the given length
 * @param  {Number} len - length of the buffer
 * @return {String}     - base64url random buffer
 */
function randomBase64URLBuffer(len) {
    len = len || 32;
    let buff = crypto.randomBytes(len);
    return base64url(buff);
}

/**
 * Usernames may be stored hashed in the database so we need to compare their hashes
 * @param {String} given username provided at authentication 
 * @param {String} stored username stored in database
 * @returns true/false if username hashes match
 */
function validateUsername(given, stored) {
    return bcrypt.compareSync(given, stored);
}

// ASSERTION HELPER FUNCTIONS

function parseGetAssertAuthData(buffer) {
    let rpIdHash      = buffer.slice(0, 32);          buffer = buffer.slice(32);
    let flagsBuf      = buffer.slice(0, 1);           buffer = buffer.slice(1);
    let flagsInt       = flagsBuf[0];
    let up            = !!(flagsInt & 0x01); // Test of User Presence
    let uv            = !!(flagsInt & 0x04); // User Verification
    let at            = !!(flagsInt & 0x40); // Attestation data
    let ed            = !!(flagsInt & 0x80); // Extension data
    let flags = {up, uv, at, ed, flagsInt};
    let counterBuf    = buffer.slice(0, 4);           buffer = buffer.slice(4);
    let counter       = counterBuf.readUInt32BE(0);

    return {rpIdHash, flagsBuf, flags, counter, counterBuf}
}

// ATTESTATION HELPER FUNCTIONS

/**
 * A function parse authData contained in an attestation response object
 * @param {Buffer} buffer 
 * @returns an object containing authData of the attestation object
 */
const parseGetAttestAuthData = (buffer) => {
    let rpIdHash      = buffer.slice(0, 32);          buffer = buffer.slice(32);
    let flagsBuffer   = buffer.slice(0, 1);              buffer = buffer.slice(1);
    let flagsInt      = flagsBuffer[0];
    let up            = !!(flagsInt & 0x01); // Test of User Presence
    let uv            = !!(flagsInt & 0x04); // User Verification
    let at            = !!(flagsInt & 0x40); // Attestation data
    let ed            = !!(flagsInt & 0x80); // Extension data
    let flags = {up, uv, at, ed, flagsInt};
    let counterBuffer    = buffer.slice(0, 4);           buffer = buffer.slice(4);
    let counter       = counterBuffer.readUInt32BE(0);
    let aaguid        = buffer.slice(0, 16);          buffer = buffer.slice(16);
    let credIDLenBuf  = buffer.slice(0, 2);           buffer = buffer.slice(2);
    let credIDLen     = credIDLenBuf.readUInt16BE(0);
    let credID        = buffer.slice(0, credIDLen);   buffer = buffer.slice(credIDLen);
    let cosePublicKeyBuffer = buffer;

    counter = parseInt(counterBuffer.toString('hex'));
    aaguid  = aaguid.toString('hex');
    credID  = base64url.encode(credID);
    cosePublicKeyBuffer = cbor.decodeAllSync(cosePublicKeyBuffer)[0];
    return {rpIdHash, flags, counter, counterBuffer, aaguid, credID, cosePublicKeyBuffer}
}


/**
 * Takes COSE encoded public key and converts it to RAW PKCS ECDHA key
 * @param  {Buffer} COSEPublicKey - COSE encoded public key
 * @return {Buffer}               - RAW PKCS encoded public key
 */
function COSEECDHAtoPKCS(COSEPublicKey) {
    /* 
       +------+-------+-------+---------+----------------------------------+
       | name | key   | label | type    | description                      |
       |      | type  |       |         |                                  |
       +------+-------+-------+---------+----------------------------------+
       | crv  | 2     | -1    | int /   | EC Curve identifier - Taken from |
       |      |       |       | tstr    | the COSE Curves registry         |
       |      |       |       |         |                                  |
       | x    | 2     | -2    | bstr    | X Coordinate                     |
       |      |       |       |         |                                  |
       | y    | 2     | -3    | bstr /  | Y Coordinate                     |
       |      |       |       | bool    |                                  |
       |      |       |       |         |                                  |
       | d    | 2     | -4    | bstr    | Private key                      |
       +------+-------+-------+---------+----------------------------------+
    */

        try {
            let coseStruct = COSEPublicKey;
            let tag = Buffer.from([0x04]);
            let x   = coseStruct.get(-2);
            let y   = coseStruct.get(-3);
            return Buffer.concat([tag, x, y])
        } catch (err) {
            console.log(err);
        }

}

/**
 * Convert binary certificate or public key to an OpenSSL-compatible PEM text format.
 * @param  {Buffer} buffer - Cert or PubKey buffer
 * @return {String}             - PEM
 */
let ASN1toPEM = (pkBuffer) => {
    if (!Buffer.isBuffer(pkBuffer))
        throw new Error("ASN1toPEM: pkBuffer must be Buffer.")

    let type;
    if (pkBuffer.length == 65 && pkBuffer[0] == 0x04) {
        /*
            If needed, we encode rawpublic key to ASN structure, adding metadata:
            SEQUENCE {
              SEQUENCE {
                 OBJECTIDENTIFIER 1.2.840.10045.2.1 (ecPublicKey)
                 OBJECTIDENTIFIER 1.2.840.10045.3.1.7 (P-256)
              }
              BITSTRING <raw public key>
            }
            Luckily, to do that, we just need to prefix it with constant 26 bytes (metadata is constant).
        */
        
        pkBuffer = Buffer.concat([
            new Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"),
            pkBuffer
        ]);

        type = 'PUBLIC KEY';
    } else {
        type = 'CERTIFICATE';
    }

    let b64cert = pkBuffer.toString('base64');

    let PEMKey = '';
    for(let i = 0; i < Math.ceil(b64cert.length / 64); i++) {
        let start = 64 * i;

        PEMKey += b64cert.substr(start, 64) + '\n';
    }

    PEMKey = `-----BEGIN ${type}-----\n` + PEMKey + `-----END ${type}-----\n`;
    
    return PEMKey
}


module.exports ={
    hash,
    verifySignature,
    COSEECDHAtoPKCS,
    randomBase64URLBuffer,
    parseGetAttestAuthData,
    parseGetAssertAuthData,
    ASN1toPEM
};