const ID = require("./../Data/ID.js")
const ArrayTools = require("./../Tools/ArrayTools.js")
const Logger = require("./../Logging/Logger.js")

const AVATARDATA_DATABASE_PREFIX = "avatar/"

const MAX_AVATARNAME_LENGTH = 50
const MAX_AVATARDESC_LENGTH = 1000

let serverConfig
let Users
let Database
let URLTools
let SearchDatabase

let AvatarsCollection

exports.init = function (ServerConfig, usersModule, databaseModule, urlToolsModule, searchDatabaseModule, avatarsCollection){
    serverConfig = ServerConfig
    Users = usersModule
    Database = databaseModule
    URLTools = urlToolsModule
    SearchDatabase = searchDatabaseModule
    AvatarsCollection = avatarsCollection
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
                        let id = ID.new(ID.IDTypes.Avatar)
                        if(avatarMeta.Id === undefined || avatarMeta.Id === ""){
                            avatarMeta.Id = id
                            avatarMeta.OwnerId = userid
                            exports.doesAvatarExist(avatarMeta.Id).then(overlapping => {
                                if(overlapping)
                                    exec(undefined)
                                else{
                                    avatarMeta.Builds = [{
                                        FileId: fileid,
                                        BuildPlatform: avatarMeta.BuildPlatform
                                    }]
                                    setAvatarMeta(avatarMeta).then(r => {
                                        if(r)
                                            exec(avatarMeta)
                                        else
                                            exec(undefined)
                                    }).catch(err => reject(err))
                                }
                            }).catch(err => reject(err))
                        }
                        else
                            exports.getAvatarMetaById(id).then(am => {
                                if(am !== undefined){
                                    let newbuilds = ArrayTools.customFilterArray(am.Builds, x => x.BuildPlatform === avatarMeta.BuildPlatform)
                                    newbuilds.push({
                                        FileId: fileid,
                                        BuildPlatform: avatarMeta.BuildPlatform
                                    })
                                    am.Builds = newbuilds
                                    setAvatarMeta(am).then(r => {
                                        if(r)
                                            exec(am)
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
            }
            else
                exec(undefined)
        }).catch(err => reject(err))
    })
}

function setAvatarMeta(avatarMeta){
    return new Promise((exec, reject) => {
        SearchDatabase.updateDocument(AvatarsCollection, {"Id": avatarMeta.Id}, {$set: avatarMeta}).then(r => {
            if(r){
                Database.set(AVATARDATA_DATABASE_PREFIX + avatarMeta.Id, avatarMeta).then(rr => {
                    if(rr)
                        exec(rr)
                    else
                        exec(false)
                }).catch(err => reject(err))
            }
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

exports.deleteAvatar = function (avatarid) {
    return new Promise((exec, reject) => {
        exports.doesAvatarExist(avatarid).then(exists => {
            if(exists){
                SearchDatabase.removeDocument(AvatarsCollection, {"Id": avatarid}).then(r => {
                    if(r){
                        Database.delete(AVATARDATA_DATABASE_PREFIX + avatarid).then(rr => {
                            if(rr)
                                exec(true)
                            else
                                exec(false)
                        }).catch(err => reject(err))
                    }
                    else
                        exec(false)
                }).catch(err => reject(err))
            }
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
            if(avatarMeta.BuildPlatform < exports.BuildPlatform.Windows || avatarMeta.BuildPlatform > exports.BuildPlatform.Android)
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

exports.safeSearchAvatar = function (name) {
    return new Promise((exec, reject) => {
        SearchDatabase.find(AvatarsCollection, {"Name": {$regex: `.*${name}.*`, $options: 'i'}}).then(avatars => {
            let candidates = []
            for(let i in avatars){
                let avatar = avatars[i]
                if(avatar.Publicity === exports.Publicity.Anyone)
                    candidates.push(avatar.Id)
            }
            exec(candidates)
        }).catch(err => reject(err))
    })
}

exports.Publicity = {
    Anyone: 0,
    OwnerOnly: 1
}

exports.BuildPlatform = {
    Windows: 0,
    Android: 1
}