const ID = require("./../Data/ID.js")
const Logger = require("./../Logging/Logger.js");

const WORLDDATA_DATABASE_PREFIX = "world/"

const MAX_WORLDNAME_LENGTH = 50
const MAX_WORLDDESC_LENGTH = 1000
const MAX_WORLDICONS = 10

let serverConfig
let Users
let Database
let URLTools

exports.init = function (ServerConfig, usersModule, databaseModule, urlToolsModule){
    serverConfig = ServerConfig
    Users = usersModule
    Database = databaseModule
    URLTools = urlToolsModule
    Logger.Log("Initialized Worlds!")
    return this
}

exports.doesWorldExist = function (worldid) {
    return new Promise((exec, reject) => {
        Database.doesKeyExist(WORLDDATA_DATABASE_PREFIX + worldid).then(r => {
            if(r)
                exec(true)
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

exports.getWorldMetaById = function (worldid) {
    return new Promise((exec, reject) => {
        exports.doesWorldExist(worldid).then(worldExists => {
            if(worldExists){
                Database.get(WORLDDATA_DATABASE_PREFIX + worldid).then(meta => {
                    if(meta)
                        exec(meta)
                    else
                        exec(undefined)
                }).catch(err => reject(err))
            }
            else
                exec(undefined)
        }).catch(err => reject(err))
    })
}

exports.handleFileUpload = function (userid, tokenContent, clientWorldMeta) {
    return new Promise((exec, reject) => {
        Users.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                isValidAvatarMeta(userid, clientWorldMeta).then(validClientMeta => {
                    if(validClientMeta){
                        let worldMeta = clientWorldMeta
                        let id = ID.new(ID.IDTypes.World)
                        if(worldMeta.Id === undefined || worldMeta.Id === ""){
                            worldMeta.Id = id
                            exports.doesWorldExist(worldMeta.Id).then(overlapping => {
                                if(overlapping)
                                    exec(undefined)
                                else
                                    setAvatarMeta(worldMeta).then(r => {
                                        if(r)
                                            exec(worldMeta)
                                        else
                                            exec(undefined)
                                    }).catch(err => reject(err))
                            }).catch(err => reject(err))
                        }
                        else
                            setWorldMeta(worldMeta).then(r => {
                                if(r)
                                    exec(worldMeta)
                                else
                                    exec(undefined)
                            }).catch(err => reject(err))
                    }
                    else
                        exec(undefined)
                }).catch(err => reject(err))
            }
            else
                exec(undefined)
        }).catch(err => reject(err))
    })
}

function setWorldMeta(worldMeta){
    return new Promise((exec, reject) => {
        Database.set(WORLDDATA_DATABASE_PREFIX + worldMeta.Id, worldMeta).then(r => {
            if(r)
                exec(r)
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

function isValidAvatarMeta(ownerid, worldMeta){
    return new Promise(exec => {
        try{
            let allowed = true
            if(worldMeta.Publicity < 0 || worldMeta.Publicity > 1)
                allowed = false
            if(worldMeta.Name.length > MAX_WORLDNAME_LENGTH)
                allowed = false
            if(worldMeta.Description.length > MAX_WORLDDESC_LENGTH)
                allowed = false
            for(let i = 0; i < worldMeta.Tags.length; i++){
                let tag = worldMeta.Tags[i]
                if(typeof tag !== "string")
                    allowed = false
            }
            if(!URLTools.isURLAllowed(worldMeta.ThumbnailURL))
                allowed = false
            if(worldMeta.IconURLs.length > MAX_WORLDICONS)
                allowed = false
            else{
                for(let i = 0; i < worldMeta.IconURLs.length; i++){
                    let icon = worldMeta.IconURLs[i]
                    if(!URLTools.isURLAllowed(icon))
                        allowed = false
                }
            }
            if(!allowed){
                exec(false)
                return
            }
            if(worldMeta.Id !== undefined && worldMeta.Id !== ""){
                exports.doesWorldExist(worldMeta.Id).then(exists => {
                    if(exists){
                        exports.getWorldMetaById(worldMeta.Id).then(currentMeta => {
                            if(currentMeta){
                                if(ownerid === currentMeta.OwnerId)
                                    exec(true)
                                else
                                    exec(false)
                            }
                            else
                                exec(false)
                        }).catch(err => exec(false))
                    }
                    else
                        exec(false)
                }).catch(err => exec(false))
            }
            else
                exec(allowed)
        }
        catch(e){
            exec(false)
        }
    })
}

exports.Publicity = {
    Anyone: 0,
    OwnerOnly: 1
}