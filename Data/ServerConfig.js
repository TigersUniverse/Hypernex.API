const fs = require('fs')
const Logger = require("../Logging/Logger.js")

exports.LoadedConfig = {
    BaseURL: "",
    DatabaseInfo: {
        Host: "127.0.0.1",
        Port: 6379,
        Password: "",
        UseDatabaseTLS: false,
        DatabaseTLS: {
            TLSKeyLocation: "",
            TLSCertificateLocation: "",
            TLSCALocation: ""
        },
    },
    UseHTTPS: false,
    HTTPSTLS: {
        TLSKeyLocation: "",
        TLSCertificateLocation: ""
    },
    MailGun: {
        Username: "",
        Key: "",
        MailGunURL: ""
    },
    HTMLPaths: {
        EmailVerificationPath: "emailhtml/verifyEmail.html",
        ResetPasswordPath: "emailhtml/resetPassword.html"
    },
    SignupRules: {
        RequireInviteCode: true,
        GlobalInviteCodes: [],
        // This is only for User Invite Codes, not global ones
        RemoveCodeAfterUse: true
    }
}

exports.LoadConfig = function (configLocation) {
    if(configLocation === null)
        configLocation = "config.json"
    let data = fs.readFileSync(configLocation, 'utf8').toString()
    exports.LoadedConfig = JSON.parse(data)
    Logger.Log("Loaded config from file " + configLocation)
}

exports.SaveConfig = function (configLocation) {
    if(configLocation === null)
        configLocation = "config.json"
    let data = JSON.stringify(exports.LoadedConfig)
    fs.writeFileSync(configLocation, data)
    Logger.Log("Saved LoadedConfig to file " + configLocation)
}

exports.DoesConfigExist = function (configLocation) {
    if(configLocation === null)
        configLocation = "config.json"
    return fs.existsSync(configLocation)
}