// TODO: Replace all "throw new Error" with reject in Promises
// I actually cant believe you did that

const fs = require("fs")
const process = require("process")

const Logger = require("./Logging/Logger.js")
const InviteCodes = require("./Data/InviteCodes.js")
const Database = require("./Data/Database.js")
const APIServer = require("./API/Server.js")
const Users = require("./Game/Users.js")
const Posts = require("./Social/Social.js")
const OTP = require("./Security/OTP.js")

// Config
let ServerConfig = require("./Data/ServerConfig.js").init()

if(!ServerConfig.DoesConfigExist()){
    ServerConfig.SaveConfig()
    Logger.Log("Please fill out the Config before continuing!")
    return
}
else
    ServerConfig.LoadConfig()

if(!ServerConfig.LoadedConfig.DatabaseInfo.UseDatabaseTLS)
    Logger.Warning("TLS for Redis is disabled, this should not be done for production!")
if(!ServerConfig.LoadedConfig.UseHTTPS)
    Logger.Warning("HTTPS is disabled, this should not be done for production!")

// Database
let databaseUsername
if(ServerConfig.LoadedConfig.DatabaseInfo.Username !== "")
    databaseUsername = ServerConfig.LoadedConfig.DatabaseInfo.Username
let databasePassword
if(ServerConfig.LoadedConfig.DatabaseInfo.Password !== "")
    databasePassword = ServerConfig.LoadedConfig.DatabaseInfo.Password
let databaseTLS
if(ServerConfig.LoadedConfig.DatabaseInfo.UseDatabaseTLS)
    databaseTLS = {
        key: fs.readFileSync(ServerConfig.LoadedConfig.DatabaseInfo.DatabaseTLS.TLSKeyLocation),
        cert: fs.readFileSync(ServerConfig.LoadedConfig.DatabaseInfo.DatabaseTLS.TLSCertificateLocation),
        ca: fs.readFileSync(ServerConfig.LoadedConfig.DatabaseInfo.DatabaseTLS.TLSCALocation)
    }

Database.connect(ServerConfig.LoadedConfig.DatabaseInfo.DatabaseNumber,
    ServerConfig.LoadedConfig.DatabaseInfo.Host, ServerConfig.LoadedConfig.DatabaseInfo.Port,
    databaseUsername, databasePassword, databaseTLS).then(d => {
        // Init Modules
        let otp = OTP.init(ServerConfig)
        let u = Users.init(ServerConfig, d, otp)
        Posts.init(u, d)
        InviteCodes.init(d, u, ServerConfig)
        // API comes last
        APIServer.initapp(u, ServerConfig)

        let httpServer = APIServer.createServer(80)
        let httpsServer
        if(ServerConfig.LoadedConfig.UseHTTPS){
            httpsServer = APIServer.createServer(443, {
                key: fs.readFileSync(ServerConfig.LoadedConfig.HTTPSTLS.TLSKeyLocation),
                cert: fs.readFileSync(ServerConfig.LoadedConfig.HTTPSTLS.TLSCertificateLocation)
            })
    }
})

process.stdin.resume()