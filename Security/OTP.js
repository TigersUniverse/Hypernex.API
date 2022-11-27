const speakeasy = require("speakeasy")

const Logger = require("../Logging/Logger.js")

let ServerConfig

exports.init = function (serverConfig) {
    ServerConfig = serverConfig
    Logger.Log("Initialized OTP!")
    return this
}

exports.create2faOTP = function (userdata){
    return speakeasy.generateSecret({
        length: 25,
        name: ServerConfig.BaseURL + " : " + userdata.Username
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