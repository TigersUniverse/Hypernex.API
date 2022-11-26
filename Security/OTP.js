const speakeasy = require("speakeasy")

exports.create2faOTP = function (userdata){
    return speakeasy.generateSecret({
        length: 25,
        name: "Hypernex : " + userdata.Username
    })
}

exports.verify2faOPT = function (userdata, code) {
    return speakeasy.totp.verifyDelta({
        secret: userdata.TwoFA.base32,
        encoding: 'base32',
        token: code,
        window: 1,
        step: 30
    })
}