const ID = require("./../Data/ID.js")
const Logger = require("./../Logging/Logger.js");

const AVATARDATA_DATABASE_PREFIX = "avatar/"

const MAX_AVATARNAME_LENGTH = 50
const MAX_AVATARDESC_LENGTH = 1000

let serverConfig
let Users
let Database
let URLTools

exports.init = function (ServerConfig, usersModule, databaseModule, urlToolsModule){
    serverConfig = ServerConfig
    Users = usersModule
    Database = databaseModule
    URLTools = urlToolsModule
    Logger.Log("Initialized Avatars!")
    return this
}

exports.doesAvatarExist = function (avatarid) {
    return new Promise((exec, reject) => {
        Database.doesKeyExist(AVATARDATA_DATABASE_PREFIX + avatarid).then(r => {
            if(r)
                exec(true)
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

exports.getAvatarMetaById = function (avatarid) {
    return new Promise((exec, reject) => {
        exports.doesAvatarExist(avatarid).then(avatarExists => {
            if(avatarExists){
                Database.get(AVATARDATA_DATABASE_PREFIX + avatarid).then(meta => {
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

exports.handleFileUpload = function (userid, tokenContent, fileid, clientAvatarMeta) {
    return new Promise((exec, reject) => {
        Users.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                isValidAvatarMeta(userid, clientAvatarMeta).then(validClientMeta => {
                    if(validClientMeta){
                        let avatarMeta = clientAvatarMeta
                        avatarMeta.FileId = fileid
                        let id = ID.new(ID.IDTypes.Avatar)
                        if(avatarMeta.Id === undefined || avatarMeta.Id === ""){
                            avatarMeta.Id = id
                            exports.doesAvatarExist(avatarMeta.Id).then(overlapping => {
                                if(overlapping)
                                    exec(undefined)
                                else
                                    setAvatarMeta(avatarMeta).then(r => {
                                        if(r)
                                            exec(avatarMeta)
                                        else
                                            exec(undefined)
                                    }).catch(err => reject(err))
                            }).catch(err => reject(err))
                        }
                        else
                            setAvatarMeta(avatarMeta).then(r => {
                                if(r)
                                    exec(avatarMeta)
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

function setAvatarMeta(avatarMeta){
    return new Promise((exec, reject) => {
        Database.set(AVATARDATA_DATABASE_PREFIX + avatarMeta.Id, avatarMeta).then(r => {
            if(r)
                exec(r)
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

function isValidAvatarMeta(ownerid, avatarMeta){
    return new Promise((exec, reject) => {
        try{
            let allowed = true
            if(avatarMeta.Publicity < 0 || avatarMeta.Publicity > 1)
                allowed = false
            if(avatarMeta.Name.length > MAX_AVATARNAME_LENGTH)
                allowed = false
            if(avatarMeta.Description.length > MAX_AVATARDESC_LENGTH)
                allowed = false
            for(let i = 0; i < avatarMeta.Tags.length; i++){
                let tag = avatarMeta.Tags[i]
                if(typeof tag !== "string")
                    allowed = false
            }
            if(!URLTools.isURLAllowed(avatarMeta.ImageURL))
                allowed = false
            if(!allowed){
                exec(false)
                return
            }
            if(avatarMeta.Id !== undefined && avatarMeta.Id !== ""){
                exports.doesAvatarExist(avatarMeta.Id).then(exists => {
                    if(exists){
                        exports.getAvatarMetaById(avatarMeta.Id).then(currentMeta => {
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