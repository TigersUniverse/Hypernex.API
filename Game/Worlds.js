const url = require("url")

const ID = require("./../Data/ID.js")
const GenericToken = require("./../Security/GenericToken.js")
const ArrayTools = require("./../Tools/ArrayTools.js")
const Logger = require("./../Logging/Logger.js")

const WORLDDATA_DATABASE_PREFIX = "world/"

const MAX_WORLDNAME_LENGTH = 50
const MAX_WORLDDESC_LENGTH = 1000
const MAX_WORLDICONS = 10

let serverConfig
let Users
let Database
let URLTools
let FileUploading
let SearchDatabase
let Popularity

let WorldsCollection

exports.init = function (ServerConfig, usersModule, databaseModule, urlToolsModule, fileUploadingModule, searchDatabaseModule, worldsCollection, popularityModule){
    serverConfig = ServerConfig
    Users = usersModule
    Database = databaseModule
    URLTools = urlToolsModule
    FileUploading = fileUploadingModule
    SearchDatabase = searchDatabaseModule
    WorldsCollection = worldsCollection
    Popularity = popularityModule
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

exports.getWorldMetaByFileId = function (userId, fileId) {
    return new Promise(exec => {
        Users.getUserDataFromUserId(userId).then(userMeta => {
            if(userMeta !== undefined){
                let maxWorldChecks = userMeta.Worlds.length
                if(maxWorldChecks === 0)
                    exec(undefined)
                else{
                    let r
                    let checks = 0
                    for(let i = 0; i < maxWorldChecks; i++){
                        let avatarId = userMeta.Worlds[i]
                        exports.getWorldMetaById(avatarId).then(worldMeta => {
                            if(worldMeta !== undefined){
                                for(let j = 0; j < worldMeta.Builds.length; j++){
                                    let build = worldMeta.Builds[j]
                                    if(build.FileId === fileId){
                                        if(worldMeta._id !== undefined)
                                            delete worldMeta._id
                                        r = worldMeta
                                    }
                                }
                            }
                            checks++
                        }).catch(() => checks++)
                        let x = setInterval(() => {
                            if(checks >= maxWorldChecks){
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
exports.addWorldToken = function (userid, worldId) {
    return new Promise((exec, reject) => {
        exports.getWorldMetaById(worldId).then(worldMeta => {
            if(worldMeta !== undefined){
                if(worldMeta.OwnerId === userid){
                    if(worldMeta.Tokens === undefined)
                        worldMeta.Tokens = []
                    else
                        worldMeta.Tokens = verifyTokens(worldMeta.Tokens)
                    let newToken = GenericToken.createToken(undefined, 1, false, true)
                    worldMeta.Tokens.push(newToken)
                    setWorldMeta(worldMeta).then(r => {
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
                reject(new Error("Failed to find World!"))
        }).catch(err => reject(err))
    })
}

exports.verifyWorldToken = function (ownerid, fileId, tokenContent) {
    return new Promise((exec, reject) => {
        exports.getWorldMetaByFileId(ownerid, fileId).then(worldMeta => {
            if(worldMeta !== undefined){
                if(worldMeta.Tokens === undefined)
                    exec(false)
                else
                    exec(ArrayTools.customFind(worldMeta.Tokens, x => x.content === tokenContent && GenericToken.isTokenValid(x)) !== undefined)
            }
            else
                reject(new Error("Failed to find World!"))
        }).catch(err => reject(err))
    })
}

exports.removeWorldToken = function (userid, worldId, tokenContent) {
    return new Promise((exec, reject) => {
        exports.getWorldMetaById(worldId).then(worldMeta => {
            if(worldMeta !== undefined){
                if(worldMeta.OwnerId === userid){
                    if(worldMeta.Tokens === undefined)
                        exec(true)
                    else{
                        worldMeta.Tokens = verifyTokens(worldMeta.Tokens)
                        worldMeta.Tokens = ArrayTools.customFilterArray(worldMeta.Tokens, x => x.content !== tokenContent)
                        setWorldMeta(worldMeta).then(r => {
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
                reject(new Error("Failed to find World!"))
        }).catch(err => reject(err))
    })
}

function deleteOldWorldFilesFromArray(filesToRemove){
    return new Promise((exec, reject) => {
        let item = filesToRemove[0]
        FileUploading.DeleteFile(item.UserId, item.FileId).then(r => {
            if(r){
                // USERID AND FILEID
                ArrayTools.removeFirstNeedle(filesToRemove)
                if(filesToRemove.length > 0)
                    deleteOldWorldFilesFromArray(filesToRemove).then(r => exec(r)).catch(err => reject(err))
                else
                    exec(true)
            }
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

function deleteAllOldWorldFiles (worldMeta, worldUserId, isDeleting, buildPlatform) {
    return new Promise((exec, reject) => {
        let assetsToRemove = []
        if(isDeleting === false){
            for(let i = 0; i < worldMeta.Builds.length; i++){
                let build = worldMeta.Builds[i]
                if(build.BuildPlatform === buildPlatform){
                    assetsToRemove.push({UserId: worldUserId, FileId: build.FileId})
                    for(let j = 0; j < build.ServerScripts.length; j++){
                        let serverScript = build.ServerScripts[j]
                        let u = url.parse(serverScript).pathname.split("/")
                        assetsToRemove.push({UserId: worldUserId, FileId: u[u.length - 1]})
                    }
                }
            }
        }
        else{
            for(let i = 0; i < worldMeta.Builds.length; i++){
                let build = worldMeta.Builds[i]
                assetsToRemove.push({UserId: worldUserId, FileId: build.FileId})
                for(let j = 0; j < build.ServerScripts.length; j++){
                    let serverScript = build.ServerScripts[j]
                    let u = url.parse(serverScript).pathname.split("/")
                    assetsToRemove.push({UserId: worldUserId, FileId: u[u.length - 1]})
                }
            }
        }
        if(assetsToRemove.length > 0)
            deleteOldWorldFilesFromArray(assetsToRemove).then(r => exec(r)).catch(err => reject(err))
        else
            exec(true)
    })
}

function clone(oldWorldMeta, newWorldMeta){
    newWorldMeta.Publicity = oldWorldMeta.Publicity
    newWorldMeta.Name = oldWorldMeta.Name
    newWorldMeta.Description = oldWorldMeta.Description
    newWorldMeta.Tags = oldWorldMeta.Tags
    newWorldMeta.ThumbnailURL = oldWorldMeta.ThumbnailURL
    newWorldMeta.IconURLs = oldWorldMeta.IconURLs
    return newWorldMeta
}

exports.handleFileUpload = function (userid, tokenContent, fileid, clientWorldMeta) {
    return new Promise((exec, reject) => {
        Users.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                let parsedClientWorldMeta
                let allow = false
                try{
                    parsedClientWorldMeta = JSON.parse(clientWorldMeta)
                    allow = true
                }
                catch (e) {}
                if(allow){
                    isValidWorldMeta(userid, parsedClientWorldMeta).then(validClientMeta => {
                        if(validClientMeta){
                            let worldMeta = parsedClientWorldMeta
                            let id = ID.new(ID.IDTypes.World)
                            if(worldMeta.Id === undefined || worldMeta.Id === ""){
                                worldMeta.Id = id
                                worldMeta.OwnerId = userid
                                exports.doesWorldExist(worldMeta.Id).then(overlapping => {
                                    if(overlapping)
                                        exec(undefined)
                                    else {
                                        worldMeta.Builds = [{
                                            FileId: fileid,
                                            BuildPlatform: worldMeta.BuildPlatform,
                                            ServerScripts: worldMeta.ServerScripts
                                        }]
                                        delete worldMeta.BuildPlatform
                                        delete worldMeta.ServerScripts
                                        setWorldMeta(worldMeta).then(r => {
                                            if (r)
                                                exec(worldMeta)
                                            else
                                                exec(undefined)
                                        }).catch(err => reject(err))
                                    }
                                }).catch(err => reject(err))
                            }
                            else
                                exports.getWorldMetaById(parsedClientWorldMeta.Id).then(wm => {
                                    if(wm !== undefined){
                                        let worldBuild
                                        for(let i = 0; i < wm.Builds.length; i++){
                                            let build = wm.Builds[i]
                                            if(build.BuildPlatform === worldMeta.BuildPlatform)
                                                worldBuild = build
                                        }
                                        if(worldBuild === undefined){
                                            // Different BuildPlatform
                                            let newbuilds = ArrayTools.customFilterArray(wm.Builds, x => {
                                                if(x.BuildPlatform === worldMeta.BuildPlatform){
                                                    FileUploading.DeleteFile(userid, x.FileId).catch(() => {})
                                                    return false
                                                }
                                                return true
                                            })
                                            newbuilds.push({
                                                FileId: fileid,
                                                BuildPlatform: worldMeta.BuildPlatform,
                                                ServerScripts: worldMeta.ServerScripts
                                            })
                                            delete worldMeta.BuildPlatform
                                            delete wm.ServerScripts
                                            wm.Builds = newbuilds
                                            wm = clone(worldMeta, wm)
                                            if(wm.Publicity !== exports.Publicity.Anyone)
                                                Popularity.DeleteWorldPublicity(worldMeta.Id).then().catch(() => {})
                                            setWorldMeta(wm).then(r => {
                                                if(r)
                                                    exec(wm)
                                                else
                                                    exec(undefined)
                                            }).catch(err => reject(err))
                                        }
                                        else
                                            deleteAllOldWorldFiles(wm, userid, false, worldBuild.BuildPlatform).then(dssr => {
                                                if(dssr){
                                                    let newbuilds = ArrayTools.customFilterArray(wm.Builds, x => {
                                                        if(x.BuildPlatform === worldMeta.BuildPlatform){
                                                            FileUploading.DeleteFile(userid, x.FileId).catch(() => {})
                                                            return false
                                                        }
                                                        return true
                                                    })
                                                    newbuilds.push({
                                                        FileId: fileid,
                                                        BuildPlatform: worldMeta.BuildPlatform,
                                                        ServerScripts: worldMeta.ServerScripts
                                                    })
                                                    delete worldMeta.BuildPlatform
                                                    delete wm.ServerScripts
                                                    wm.Builds = newbuilds
                                                    wm = clone(worldMeta, wm)
                                                    if(wm.Publicity !== exports.Publicity.Anyone)
                                                        Popularity.DeleteWorldPublicity(worldMeta.Id).then().catch(() => {})
                                                    setWorldMeta(wm).then(r => {
                                                        if(r)
                                                            exec(wm)
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
                }
                else
                    exec(undefined)
            }
            else
                exec(undefined)
        }).catch(err => reject(err))
    })
}

function setWorldMeta(worldMeta){
    return new Promise((exec, reject) => {
        if(worldMeta._id !== undefined)
            delete worldMeta._id
        exports.doesWorldExist(worldMeta.Id).then(exists => {
            if(exists){
                SearchDatabase.updateDocument(WorldsCollection, {"Id": worldMeta.Id}, {$set: worldMeta}).then(r => {
                    if(r){
                        if(worldMeta._id !== undefined)
                            delete worldMeta._id
                        Database.set(WORLDDATA_DATABASE_PREFIX + worldMeta.Id, worldMeta).then(rr => {
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
                SearchDatabase.createDocument(WorldsCollection, worldMeta).then(sdr => {
                    if(sdr){
                        if(worldMeta._id !== undefined)
                            delete worldMeta._id
                        Database.set(WORLDDATA_DATABASE_PREFIX + worldMeta.Id, worldMeta).then(rr => {
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

exports.deleteWorld = function (worldid) {
    return new Promise((exec, reject) => {
        exports.doesWorldExist(worldid).then(exists => {
            if(exists){
                exports.getWorldMetaById(worldid).then(worldMeta => {
                    if(worldMeta !== undefined){
                        {
                            deleteAllOldWorldFiles(worldMeta, worldMeta.OwnerId, true).then(dr => {
                                if (dr) {
                                    SearchDatabase.removeDocument(WorldsCollection, {"Id": worldid}).then(r => {
                                        if (r) {
                                            Database.delete(WORLDDATA_DATABASE_PREFIX + worldid).then(rr => {
                                                if (rr)
                                                    exec(true)
                                                else
                                                    exec(false)
                                            }).catch(err => reject(err))
                                        } else
                                            exec(false)
                                    }).catch(err => reject(err))
                                } else
                                    exec(false)
                            }).catch(() => {
                                SearchDatabase.removeDocument(WorldsCollection, {"Id": worldid}).then(r => {
                                    if (r) {
                                        Database.delete(WORLDDATA_DATABASE_PREFIX + worldid).then(rr => {
                                            if (rr)
                                                exec(true)
                                            else
                                                exec(false)
                                        }).catch(err => reject(err))
                                    } else
                                        exec(false)
                                }).catch(err => reject(err))
                            })
                            Popularity.DeleteWorldPublicity(worldMeta.Id).then().catch(() => {})
                        }
                    }
                    else
                        exec(false)
                })
            }
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

function isValidWorldMeta(ownerid, worldMeta){
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
            if(worldMeta.ThumbnailURL !== "" && !URLTools.isURLAllowed(worldMeta.ThumbnailURL))
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
            for(let i = 0; i < worldMeta.ServerScripts.length; i++){
                let serverScript = worldMeta.ServerScripts[i]
                if(!URLTools.isURLAllowed(serverScript, true))
                    allowed = false
            }
            if(worldMeta.BuildPlatform < exports.BuildPlatform.Windows || worldMeta.BuildPlatform > exports.BuildPlatform.Android)
                allowed = false
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
                        }).catch(() => exec(false))
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(allowed)
        }
        catch(e){
            exec(false)
        }
    })
}

function safeWorlds(worlds, itemsPerPage, page){
    let candidates = []
    let i = 0
    i += page * itemsPerPage
    if(worlds.length < i)
        return candidates
    for(i in worlds){
        let world = worlds[i]
        if(world.Publicity === exports.Publicity.Anyone)
            candidates.push(world.Id)
    }
    return candidates
}

exports.safeSearchWorld = function (name, itemsPerPage, page) {
    return new Promise((exec, reject) => {
        SearchDatabase.find(WorldsCollection, {"Name": {$regex: `.*${name}.*`, $options: 'i'}}).then(worlds => {
            exec(safeWorlds(worlds, itemsPerPage, page))
        }).catch(err => reject(err))
    })
}

exports.safeSearchWorldTag = function (tag, itemsPerPage, page) {
    return new Promise((exec, reject) => {
        SearchDatabase.find(WorldsCollection, {Tags: tag}).then(worlds => {
            exec(safeWorlds(worlds, itemsPerPage, page))
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