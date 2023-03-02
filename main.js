const fs = require("fs")
const process = require("process")

const Logger = require("./Logging/Logger.js")
const InviteCodes = require("./Data/InviteCodes.js")
const Database = require("./Data/Database.js")
const SearchDatabase = require("./Data/SearchDatabase.js")
const Emailing = require("./Data/Emailing.js")
const FileUploading = require("./Data/FileUploading.js")
const APIServer = require("./API/Server.js")
const Users = require("./Game/Users.js")
const Avatars = require("./Game/Avatars.js")
const Worlds = require("./Game/Worlds.js")
const OTP = require("./Security/OTP.js")
const URLTools = require("./Tools/URLTools.js")

// Config
let ServerConfig = require("./Data/ServerConfig.js").init()
let ut = URLTools.Init(ServerConfig)

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
if(ServerConfig.LoadedConfig.TrustAllDomains)
    Logger.Warning("TrustAllDomains is enabled, this should not be done for production!")
if(ServerConfig.LoadedConfig.AllowAnyGameServer)
    Logger.Warning("AllowAnyGameServer is enabled! Any server can pose as a game server, this may be dangerous!")

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
        SearchDatabase.Init(ServerConfig.LoadedConfig.MongoDBURL).then(sd => {
            let mainSearchDatabase = sd.createDatabase("main")
            let usersSearchCollection = sd.createCollection(mainSearchDatabase, "users")
            let avatarsSearchCollection = sd.createCollection(mainSearchDatabase, "avatars")
            let worldsSearchCollection = sd.createCollection(mainSearchDatabase, "worlds")
            let uploadsSearchCollection = sd.createCollection(mainSearchDatabase, "uploads")
            // Init Modules
            let otp = OTP.init(ServerConfig)
            let u = Users.init(ServerConfig, d, otp, ut, sd, usersSearchCollection)
            let a = Avatars.init(ServerConfig, u, d, ut, sd, avatarsSearchCollection)
            let w = Worlds.init(ServerConfig, u, d, ut, sd, worldsSearchCollection)
            InviteCodes.init(d, u, ServerConfig)
            Emailing.init(ServerConfig)
            FileUploading.init(ServerConfig, d, u, sd, uploadsSearchCollection).then(fu => {
                // API comes last
                APIServer.initapp(u, ServerConfig, fu, a, w)
                let httpServer = APIServer.createServer(80)
                let httpsServer
                if(ServerConfig.LoadedConfig.UseHTTPS) {
                    httpsServer = APIServer.createServer(443, {
                        key: fs.readFileSync(ServerConfig.LoadedConfig.HTTPSTLS.TLSKeyLocation),
                        cert: fs.readFileSync(ServerConfig.LoadedConfig.HTTPSTLS.TLSCertificateLocation)
                    })
                }
            }).catch(err => console.log(err))
        })
    })

process.stdin.resume()