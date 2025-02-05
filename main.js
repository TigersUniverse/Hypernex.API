const fs = require("fs")
const process = require("process")

const Logger = require("./Logging/Logger.js")
const InviteCodes = require("./Data/InviteCodes.js")
const Database = require("./Data/Database.js")
const SearchDatabase = require("./Data/SearchDatabase.js")
const Emailing = require("./Data/Emailing.js")
const FileUploading = require("./Data/FileUploading.js")
const APIServer = require("./API/Server.js")
const Popularity = require("./Data/Popularity.js")
const Users = require("./Game/Users.js")
const SocketServer = require("./API/SocketServer.js")
const Avatars = require("./Game/Avatars.js")
const Worlds = require("./Game/Worlds.js")
const OTP = require("./Security/OTP.js")
const URLTools = require("./Tools/URLTools.js")
const Discourse = require("./Interfacing/discourse.js")

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
if(ServerConfig.LoadedConfig.EmailInterface.toLowerCase() === "smtp" && !ServerConfig.LoadedConfig.SMTPSettings.Secure)
    Logger.Warning("SMTP Security is disabled, this should not be done for production!")

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

// Integrations
let discourse = Discourse.Init(ServerConfig.LoadedConfig.DiscourseSecret)

Database.connect(ServerConfig.LoadedConfig.DatabaseInfo.DatabaseNumber,
    ServerConfig.LoadedConfig.DatabaseInfo.Host, ServerConfig.LoadedConfig.DatabaseInfo.Port,
    databaseUsername, databasePassword, databaseTLS).then(d => {
        SearchDatabase.Init(ServerConfig.LoadedConfig.MongoDBURL).then(sd => {
            let mainSearchDatabase = sd.createDatabase("main")
            let usersSearchCollection = sd.createCollection(mainSearchDatabase, "users")
            let avatarsSearchCollection = sd.createCollection(mainSearchDatabase, "avatars")
            let worldsSearchCollection = sd.createCollection(mainSearchDatabase, "worlds")
            let uploadsSearchCollection = sd.createCollection(mainSearchDatabase, "uploads")
            let worldPopularityCollections = sd.createCollection(mainSearchDatabase, "world_popularity")
            let avatarPopularityCollections = sd.createCollection(mainSearchDatabase, "avatar_popularity")
            // Init Modules
            let otp = OTP.init(ServerConfig)
            let u = Users.init(ServerConfig, d, otp, ut, sd, usersSearchCollection)
            let a = Avatars.init(ServerConfig, u, d, ut, sd, avatarsSearchCollection)
            InviteCodes.init(d, u, ServerConfig)
            Emailing.init(ServerConfig)
            FileUploading.init(ServerConfig, d, u, sd, uploadsSearchCollection).then(fu => {
                a.SetFileUploadingModule(fu)
                let p = Popularity.Init(sd, fu, avatarPopularityCollections, worldPopularityCollections)
                a.SetPopularityModule(p)
                let w = Worlds.init(ServerConfig, u, d, ut, fu, sd, worldsSearchCollection, p)
                let ss
                if(ServerConfig.LoadedConfig.UseHTTPS)
                    ss = SocketServer.Init(ServerConfig, u, w, {
                        key: fs.readFileSync(ServerConfig.LoadedConfig.HTTPSTLS.TLSKeyLocation),
                        cert: fs.readFileSync(ServerConfig.LoadedConfig.HTTPSTLS.TLSCertificateLocation)
                    })
                else
                    ss = SocketServer.Init(ServerConfig, u, w)
                // API comes last
                APIServer.initapp(u, ss, ServerConfig, fu, a, w, p, discourse)
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
