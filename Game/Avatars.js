const ID = require("./../Data/ID.js")
const ArrayTools = require("./../Tools/ArrayTools.js")
const Logger = require("./../Logging/Logger.js")
const GenericToken = require("../Security/GenericToken");

const AVATARDATA_DATABASE_PREFIX = "avatar/"

const MAX_AVATARNAME_LENGTH = 50
const MAX_AVATARDESC_LENGTH = 1000

let serverConfig
let Users
let Database
let URLTools
let SearchDatabase
let FileUploading

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

exports.SetFileUploadingModule = function (fileUploadModule){
    FileUploading = fileUploadModule
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
                    if(meta){
                        if(meta._id !== undefined)
                            delete meta._id
                        exec(meta)
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

exports.getAvatarMetaByFileId = function (userId, fileId) {
    return new Promise(exec => {
        Users.getUserDataFromUserId(userId).then(userMeta => {
            if(userMeta !== undefined){
                let maxAvatarChecks = userMeta.Avatars.length
                if(maxAvatarChecks === 0)
                    exec(undefined)
                else{
                    let r
                    let checks = 0
                    for(let i = 0; i < maxAvatarChecks; i++){
                        let avatarId = userMeta.Avatars[i]
                        exports.getAvatarMetaById(avatarId).then(avatarMeta => {
                            if(avatarMeta !== undefined){
                                for(let j = 0; j < avatarMeta.Builds.length; j++){
                                    let build = avatarMeta.Builds[j]
                                    if(build.FileId === fileId){
                                        if(avatarMeta._id !== undefined)
                                            delete avatarMeta._id
                                        r = avatarMeta
                                    }
                                }
                            }
                            checks++
                        }).catch(() => checks++)
                        let x = setInterval(() => {
                            if(checks >= maxAvatarChecks){
                                exec(r)
                                clearInterval(x)
                            }
                        }, 10)
                    }
                }
            }
            else
                exec(undefined)
        }).catch(() => exec(undefined))
    })
}

function verifyTokens(tokens){
    return ArrayTools.customFilterArray(tokens, x => GenericToken.isTokenValid(x))
}

// Do not expose!
exports.addAvatarToken = function (userid, avatarId) {
    return new Promise((exec, reject) => {
        exports.getAvatarMetaById(avatarId).then(avatarMeta => {
            if(avatarMeta !== undefined){
                if(avatarMeta.OwnerId === userid){
                    if(avatarMeta.Tokens === undefined)
                        avatarMeta.Tokens = []
                    else
                        avatarMeta.Tokens = verifyTokens(avatarMeta.Tokens)
                    let newToken = GenericToken.createToken(undefined, 1, false, true)
                    avatarMeta.Tokens.push(newToken)
                    setAvatarMeta(avatarMeta).then(r => {
                        if(r)
                            exec(newToken)
                        else
                            exec(undefined)
                    }).catch(err => reject(err))
                }
                else
                    exec(undefined)
            }
            else
                reject(new Error("Failed to find Avatar!"))
        }).catch(err => reject(err))
    })
}

exports.verifyAvatarToken = function (ownerid, fileId, tokenContent) {
    return new Promise((exec, reject) => {
        exports.getAvatarMetaByFileId(ownerid, fileId).then(avatarMeta => {
            if(avatarMeta !== undefined){
                if(avatarMeta.Tokens === undefined)
                    exec(false)
                else
                    exec(ArrayTools.customFind(avatarMeta.Tokens, x => x.content === tokenContent && GenericToken.isTokenValid(x)) !== undefined)
            }
            else
                reject(new Error("Failed to find Avatar!"))
        }).catch(err => reject(err))
    })
}

exports.removeAvatarToken = function (userid, avatarId, tokenContent) {
    return new Promise((exec, reject) => {
        exports.getAvatarMetaById(avatarId).then(avatarMeta => {
            if(avatarMeta !== undefined){
                if(avatarMeta.OwnerId === userid){
                    if(avatarMeta.Tokens === undefined)
                        exec(true)
                    else{
                        avatarMeta.Tokens = verifyTokens(avatarMeta.Tokens)
                        avatarMeta.Tokens = ArrayTools.customFilterArray(avatarMeta.Tokens, x => x.content !== tokenContent)
                        setAvatarMeta(avatarMeta).then(r => {
                            if(r)
                                exec(true)
                            else
                                exec(false)
                        }).catch(err => reject(err))
                    }
                }
                else
                    exec(false)
            }
            else
                reject(new Error("Failed to find Avatar!"))
        }).catch(err => reject(err))
    })
}

function clone(oldAvatarMeta, newAvatarMeta){
    newAvatarMeta.Publicity = oldAvatarMeta.Publicity
    newAvatarMeta.Name = oldAvatarMeta.Name
    newAvatarMeta.Description = oldAvatarMeta.Description
    newAvatarMeta.Tags = oldAvatarMeta.Tags
    newAvatarMeta.ImageURL = oldAvatarMeta.ImageURL
    return newAvatarMeta
}

exports.handleFileUpload = function (userid, tokenContent, fileid, clientAvatarMeta) {
    return new Promise((exec, reject) => {
        Users.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                let parsedClientAvatarMeta
                let allow = false
                try{
                    parsedClientAvatarMeta = JSON.parse(clientAvatarMeta)
                    allow = true
                }
                catch (e) {}
                if(allow){
                    isValidAvatarMeta(userid, parsedClientAvatarMeta).then(validClientMeta => {
                        if(validClientMeta){
                            let avatarMeta = parsedClientAvatarMeta
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
                                        delete avatarMeta.BuildPlatform
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
                                exports.getAvatarMetaById(avatarMeta.Id).then(am => {
                                    if(am !== undefined){
                                        let newbuilds = ArrayTools.customFilterArray(am.Builds, x => {
                                            if(x.BuildPlatform === avatarMeta.BuildPlatform){
                                                FileUploading.DeleteFile(userid, x.FileId).catch(() => {})
                                                return false
                                            }
                                            else
                                                return true
                                        })
                                        newbuilds.push({
                                            FileId: fileid,
                                            BuildPlatform: avatarMeta.BuildPlatform
                                        })
                                        am.Builds = newbuilds
                                        delete avatarMeta.BuildPlatform
                                        am = clone(avatarMeta, am)
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
            }
            else
                exec(undefined)
        }).catch(err => reject(err))
    })
}

function setAvatarMeta(avatarMeta){
    return new Promise((exec, reject) => {
        if(avatarMeta._id !== undefined)
            delete avatarMeta._id
        exports.doesAvatarExist(avatarMeta.Id).then(exists => {
            if(exists){
                SearchDatabase.updateDocument(AvatarsCollection, {"Id": avatarMeta.Id}, {$set: avatarMeta}).then(r => {
                    if(r){
                        if(avatarMeta._id !== undefined)
                            delete avatarMeta._id
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
            }
            else{
                SearchDatabase.createDocument(AvatarsCollection, avatarMeta).then(sdr => {
                    if(sdr){
                        if(avatarMeta._id !== undefined)
                            delete avatarMeta._id
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
            }
        }).catch(err => reject(err))
    })
}

exports.deleteAvatar = function (avatarid) {
    return new Promise((exec, reject) => {
        exports.doesAvatarExist(avatarid).then(exists => {
            if(exists){
                exports.getAvatarMetaById(avatarid).then(avatarMeta => {
                    if(avatarMeta){
                        for(let i = 0; i < avatarMeta.Builds.length; i++){
                            let build = avatarMeta.Builds[i]
                            FileUploading.DeleteFile(avatarMeta.OwnerId, build.FileId).catch(() => {})
                        }
                    }
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
                }).catch(() => {
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
                })
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
            if(avatarMeta.ImageURL !== "" && !URLTools.isURLAllowed(avatarMeta.ImageURL))
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