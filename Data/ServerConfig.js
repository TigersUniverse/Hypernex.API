const fs = require('fs')

const Logger = require("./../Logging/Logger.js")

exports.LoadedConfig = {
    BaseURL: "",
    DatabaseInfo: {
        DatabaseNumber: 0,
        Host: "127.0.0.1",
        Port: 6379,
        Username: "default",
        Password: "",
        UseDatabaseTLS: false,
        DatabaseTLS: {
            TLSKeyLocation: "",
            TLSCertificateLocation: "",
            TLSCALocation: ""
        },
    },
    SpacesInfo: {
        AccessKeyId: "",
        SecretAccessKey: "",
        Region: "nyc3",
        SpaceName: "hypernex"
    },
    UseHTTPS: false,
    HTTPSTLS: {
        TLSKeyLocation: "",
        TLSCertificateLocation: ""
    },
    WebRoot: "html/",
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

exports.init = function (){
    return this
}

exports.LoadConfig = function (configLocation) {
    if(configLocation === undefined)
        configLocation = "config.json"
    let data = fs.readFileSync(configLocation, 'utf8').toString()
    exports.LoadedConfig = JSON.parse(data)
    Logger.Log("Loaded config from file " + configLocation)
    return JSON.parse(data)
}

exports.SaveConfig = function (configLocation) {
    if(configLocation === undefined)
        configLocation = "config.json"
    let data = JSON.stringify(exports.LoadedConfig, null, 4)
    fs.writeFileSync(configLocation, data)
    Logger.Log("Saved LoadedConfig to file " + configLocation)
}

exports.DoesConfigExist = function (configLocation) {
    if(configLocation === undefined)
        configLocation = "config.json"
    return fs.existsSync(configLocation)
}