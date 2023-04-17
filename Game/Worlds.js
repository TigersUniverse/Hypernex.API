const ID = require("./../Data/ID.js")
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

let WorldsCollection

exports.init = function (ServerConfig, usersModule, databaseModule, urlToolsModule, fileUploadingModule, searchDatabaseModule, worldsCollection){
    serverConfig = ServerConfig
    Users = usersModule
    Database = databaseModule
    URLTools = urlToolsModule
    FileUploading = fileUploadingModule
    SearchDatabase = searchDatabaseModule
    WorldsCollection = worldsCollection
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
                let found = false
                let loop = 0
                for(let e = 0; e < userMeta.Worlds.length; e++){
                    let worldId = userMeta.Worlds[e]
                    exports.getWorldMetaById(worldId).then(world => {
                        if(found || world !== undefined){
                            for (let j = 0; j < world.Builds.length; j++){
                                let build = world.Builds[j]
                                if(build.FileId === fileId){
                                    if(world._id !== undefined)
                                        delete world._id
                                    found = true
                                    exec(world)
                                }
                            }
                            if(loop === userMeta.Worlds.length && !found)
                                exec(undefined)
                        }
                        loop++
                    }).catch(() => {
                        loop++
                        if(loop === userMeta.Worlds.length && !found)
                            exec(undefined)
                    })
                }
            }
            else
                exec(undefined)
        }).catch(() => exec(undefined))
    })
}

function deleteOldWorldFilesFromArray(worldScripts){
    return new Promise((exec, reject) => {
        FileUploading.DeleteFile(worldScripts[0].UserId, worldScripts[0].FileId).then(r => {
            if(r){
                let na = ArrayTools.customFilterArray(worldScripts, x => x.UserId === worldScripts[0].UserId && x.FileId === worldScripts[0].FileId)
                if(na.length > 0)
                    deleteOldWorldFilesFromArray(na).then(r => exec(r)).catch(() => exec(false))
                else
                    exec(true)
            }
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

function deleteAllOldWorldFiles (worldMeta, worldUserId, worldFileId) {
    return new Promise((exec, reject) => {
        let assetsToRemove = []
        for(let i = 0; i < worldMeta.ServerScripts.length; i++){
            let serverScript = worldMeta.ServerScripts[i]
            let s = serverScript.split("/")
            let len = s.length
            let fileId = s[len - 1]
            let userId = s[len - 2]
            assetsToRemove.push({UserId: userId, FileId: fileId})
        }
        if(worldUserId !== undefined && worldFileId !== undefined)
            assetsToRemove.push({UserId: worldUserId, FileId: worldFileId})
        deleteOldWorldFilesFromArray(assetsToRemove).then(r => exec(r)).catch(err => reject(err))
    })
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
                    isValidWorldMeta(userid, clientWorldMeta).then(validClientMeta => {
                        if(validClientMeta){
                            let worldMeta = clientWorldMeta
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
                                            BuildPlatform: worldMeta.BuildPlatform
                                        }]
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
                                exports.getWorldMetaById(id).then(wm => {
                                    if(wm !== undefined){
                                        let worldBuild
                                        for(let i = 0; i < wm.Builds.length; i++){
                                            let build = wm.Builds[i]
                                            if(build.BuildPlatform === worldMeta.BuildPlatform)
                                                worldBuild = build
                                        }
                                        if(worldBuild === undefined)
                                            deleteAllOldWorldFiles(worldMeta).then(dssr => {
                                                if(dssr){
                                                    let newbuilds = ArrayTools.customFilterArray(wm.Builds, x => {
                                                        if(x.BuildPlatform === worldMeta.BuildPlatform){
                                                            FileUploading.DeleteFile(userid, x.FileId).catch(() => {})
                                                            return false
                                                        }
                                                        else
                                                            return true
                                                    })
                                                    newbuilds.push({
                                                        FileId: fileid,
                                                        BuildPlatform: worldMeta.BuildPlatform
                                                    })
                                                    wm.Builds = newbuilds
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
                                        else
                                            deleteAllOldWorldFiles(worldMeta, userid, worldBuild.FileId).then(dssr => {
                                                if(dssr){
                                                    let newbuilds = ArrayTools.customFilterArray(wm.Builds, x => {
                                                        if(x.BuildPlatform === worldMeta.BuildPlatform){
                                                            FileUploading.DeleteFile(userid, x.FileId).catch(() => {})
                                                            return false
                                                        }
                                                        else
                                                            return true
                                                    })
                                                    newbuilds.push({
                                                        FileId: fileid,
                                                        BuildPlatform: worldMeta.BuildPlatform
                                                    })
                                                    wm.Builds = newbuilds
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
        exports.doesWorldExist(worldMeta.Id).then(exists => {
            if(exists){
                SearchDatabase.updateDocument(WorldsCollection, {"Id": worldMeta.Id}, {$set: worldMeta}).then(r => {
                    if(r){
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
                        for(let i = 0; i < worldMeta.Builds.length; i++){
                            let build = worldMeta.Builds[i]
                            FileUploading.DeleteFile(worldMeta.OwnerId, build.FileId).catch(() => {})
                        }
                        deleteAllOldWorldFiles(worldid).then(dr => {
                            if(dr){
                                SearchDatabase.removeDocument(WorldsCollection, {"Id": worldid}).then(r => {
                                    if(r){
                                        Database.delete(WORLDDATA_DATABASE_PREFIX + worldid).then(rr => {
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
                        }).catch(() => {
                            SearchDatabase.removeDocument(WorldsCollection, {"Id": worldid}).then(r => {
                                if(r){
                                    Database.delete(WORLDDATA_DATABASE_PREFIX + worldid).then(rr => {
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
                if(!URLTools.isURLAllowed(serverScript))
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

exports.safeSearchWorld = function (name) {
    return new Promise((exec, reject) => {
        SearchDatabase.find(WorldsCollection, {"Name": {$regex: `.*${name}.*`, $options: 'i'}}).then(worlds => {
            let candidates = []
            for(let i in worlds){
                let world = worlds[i]
                if(world.Publicity === exports.Publicity.Anyone)
                    candidates.push(world.Id)
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