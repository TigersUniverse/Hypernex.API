const fs = require("fs")

const Logger = require("Logging/Logger.js")
const ServerConfig = require("Data/ServerConfig.js")
const Database = require("Data/Database.js")
const APIServer = require("API/Server.js")
const Users = require("Game/Users.js")
const Posts = require("Social/Social.js")
const OTP = require("Security/OTP.js")

// Config
if(!ServerConfig.DoesConfigExist())
    ServerConfig.SaveConfig()
else
    ServerConfig.LoadConfig()

if(!ServerConfig.LoadedConfig.DatabaseInfo.UseDatabaseTLS)
    Logger.Warning("TLS for Redis is disabled, this should not be done for production!")
if(!ServerConfig.LoadedConfig.UseHTTPS)
    Logger.Warning("HTTPS is disabled, this should not be done for production!")

// Database
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

let d = Database.connect(ServerConfig.LoadedConfig.DatabaseInfo.Host, ServerConfig.LoadedConfig.DatabaseInfo.Port,
    databasePassword, databaseTLS)

// Init Modules
let otp = OTP.init(ServerConfig)
let u = Users.init(ServerConfig, d, otp)
Posts.init(u, d)
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