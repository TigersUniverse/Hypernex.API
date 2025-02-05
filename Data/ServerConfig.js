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
    MongoDBURL: "",
    SpacesInfo: {
        AccessKeyId: "",
        SecretAccessKey: "",
        Region: "nyc3",
        SpaceName: "hypernex",
        ConnectionURL: ""
    },
    MaxFileSize: 1000,
    TrustAllDomains: false,
    AllowedDomains: ["i.imgur.com"],
    UseHTTPS: false,
    HTTPSTLS: {
        TLSKeyLocation: "",
        TLSCertificateLocation: ""
    },
    SocketPort: 2096,
    WebRoot: "html/",
    HTMLPaths: {
        EmailVerificationPath: "emailhtml/verifyEmail.html",
        ResetPasswordPath: "emailhtml/resetPassword.html"
    },
    SignupRules: {
        RequireInviteCode: true,
        GlobalInviteCodes: [],
        // This is only for User Invite Codes, not global ones
        RemoveCodeAfterUse: true
    },
    AVSettings:{
        ScanFiles: false,
        clamdPort: null,
        clamdHost: null,
        clamdTimeout: null,
        clamdHealthCheckInterval: null
    },
    EmailInterface: "sendmail",
    SMTPSettings:{
        Server: "",
        Port: 465,
        Secure: true,
        NoTLS: false,
        Username: "",
        Password: "",
        OverrideDomain: ""
    },
    DiscourseSecret: "",
    GameServerTokens: [],
    AllowAnyGameServer: false,
    RequireTokenToDownloadBuilds: false,
    GameEngine: "Unity",
    GameEngineVersion: "2023.2.20f1"
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
