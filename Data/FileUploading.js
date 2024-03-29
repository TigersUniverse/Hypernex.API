const path = require("path")
const stream = require("stream")
const AWS = require("aws-sdk")
const crypto = require("crypto")

const ID = require("./ID.js")
const ArrayTools = require("./../Tools/ArrayTools.js")
const Logger = require("./../Logging/Logger.js")

let Config
let Users
let SearchDatabase
let molecular
let AVService
let broker

let UploadsCollection
let s3

exports.init = function (c, d, u, searchDatabaseModule, uploadsCollection) {
    return new Promise((exec, reject) => {
        Config = c
        Users = u
        SearchDatabase = searchDatabaseModule
        UploadsCollection = uploadsCollection
        AWS.config.update({
            accessKeyId: Config.LoadedConfig.SpacesInfo.AccessKeyId,
            secretAccessKey: Config.LoadedConfig.SpacesInfo.SecretAccessKey
        })
        s3 = new AWS.S3({
            endpoint: new AWS.Endpoint(Config.LoadedConfig.SpacesInfo.ConnectionURL),
            s3ForcePathStyle: true
        })
        if(c.LoadedConfig.AVSettings.ScanFiles){
            molecular = require("moleculer")
            AVService = require("moleculer-antivirus")
            broker = new molecular.ServiceBroker({ logger: console })
            broker.createService({
                mixins: AVService,
                settings:{
                    clamdHost: c.LoadedConfig.AVSettings.clamdHost,
                    clamdPort: c.LoadedConfig.AVSettings.clamdPort,
                    clamdTimeout: c.LoadedConfig.AVSettings.clamdTimeout,
                    clamdHealthCheckInterval: c.LoadedConfig.AVSettings.clamdHealthCheckInterval
                }
            })
            broker.start().then(() => {
                Logger.Log("Initialized FileUploading!")
                exec(this)
            })
        }
        else{
            Logger.Log("Initialized FileUploading!")
            exec(this)
        }
    })
}

exports.initUser = function (userid) {
    return new Promise((exec, reject) => {
        SearchDatabase.createDocument(UploadsCollection, {
            UserId: userid,
            Uploads: []
        }).then(r => {
            if(r)
                exec(r)
            else
                reject(new Error("Failed to save UploadData!"))
        }).catch(err => reject(err))
    })
}

function setUploadData(uploadData){
    return new Promise((exec, reject) => {
        SearchDatabase.updateDocument(UploadsCollection, {"UserId": uploadData.UserId}, {$set: uploadData}).then(r => {
            if(r)
                exec(true)
            else
                reject(new Error("Failed to save UploadData!"))
        }).catch(err => reject(err))
    })
}

function addUploadDataToUser (userid, data) {
    return new Promise((exec, reject) => {
        SearchDatabase.find(UploadsCollection, {"UserId": userid}).then(uploadDatas => {
            if(uploadDatas){
                let found = false
                for(let i in uploadDatas){
                    let uploadData = uploadDatas[i]
                    if(uploadData.UserId === userid){
                        found = true
                        let nud = uploadData
                        nud.Uploads.push(data)
                        setUploadData(nud).then(r => {
                            if(r)
                                exec(true)
                            else
                                reject(new Error("Failed to save UploadData!"))
                        }).catch(err => reject(err))
                    }
                }
                if(!found)
                    reject(new Error("Failed to find Upload Data from UserId " + userid))
            }
            else
                reject(new Error("No UploadData found!"))
        }).catch(err => reject(err))
    })
}

function removeUploadDataFromUser (userid, data) {
    return new Promise((exec, reject) => {
        SearchDatabase.find(UploadsCollection, {"UserId": userid}).then(uploadDatas => {
            if(uploadDatas){
                let found = false
                for(let i in uploadDatas){
                    let uploadData = uploadDatas[i]
                    if(uploadData.UserId === userid){
                        found = true
                        let nud = uploadData
                        nud.Uploads = ArrayTools.customFilterArray(nud.Uploads, item => item.FileId !== data.FileId)
                        setUploadData(nud).then(r => {
                            if(r)
                                exec(true)
                            else
                                reject(false)
                        }).catch(err => reject(err))
                    }
                }
                if(!found)
                    reject(new Error("Failed to find Upload Data from UserId " + userid))
            }
            else
                reject(false)
        }).catch(err => reject(err))
    })
}

// Indexed by the ID.IDTypes
const ALLOWED_FILE_TYPES = [[".jpg", ".jpeg", ".gif", ".png", ".mp4"], [".hna"], [".hnw"], [".js", ".lua"]]

function isValidFileType(fileType, UploadType){
    for(let i = 0; i < ALLOWED_FILE_TYPES[UploadType].length; i++){
        let allowedFileType = ALLOWED_FILE_TYPES[UploadType][i]
        if(allowedFileType === fileType)
            return allowedFileType
    }
    return false
}

function getUploadTypeFromFileExtension(fileExtension){
    switch (fileExtension) {
        case ".hna":
            return exports.UploadType.Avatar
        case ".hnw":
            return exports.UploadType.World
        case ".jpg":
            return exports.UploadType.Media
        case ".jpeg":
            return exports.UploadType.Media
        case ".gif":
            return exports.UploadType.Media
        case ".png":
            return exports.UploadType.Media
        case ".mp4":
            return exports.UploadType.Media
        case ".js":
            return exports.UploadType.ServerScript
        case ".lua":
            return exports.UploadType.ServerScript
    }
    return undefined
}

exports.doesFileIdExist = function (userid, fileId){
    return new Promise((exec, reject) => {
        SearchDatabase.find(UploadsCollection, {"UserId": userid}).then(uploadDatas => {
            if(uploadDatas){
                let found = false
                for(let i in uploadDatas){
                    let uploadData = uploadDatas[i]
                    if(uploadData.UserId === userid){
                        found = true
                        let ud = false
                        for(let i = 0; i < uploadData.Uploads.length; i++){
                            let data = uploadData.Uploads[i]
                            if(data.FileId === fileId)
                                ud = fileId
                        }
                        exec(!!ud)
                    }
                }
                if(!found)
                    reject(new Error("Failed to find Upload Data from UserId " + userid))
            }
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

exports.getFileMetaById = function (userid, fileId) {
    return new Promise((exec, reject) => {
        SearchDatabase.find(UploadsCollection, {"UserId": userid}).then(uploadDatas => {
            if(uploadDatas){
                let found = false
                for(let i in uploadDatas){
                    let uploadData = uploadDatas[i]
                    if(uploadData.UserId === userid){
                        found = true
                        let ud = undefined
                        for(let i = 0; i < uploadData.Uploads.length; i++){
                            let data = uploadData.Uploads[i]
                            if(data.FileId === fileId)
                                ud = data
                        }
                        exec(ud)
                    }
                }
                if(!found)
                    reject(new Error("Failed to find Upload Data from UserId " + userid))
            }
            else
                reject(new Error("Upload Data not found!"))
        }).catch(err => reject(err))
    })
}

// FILEDATA CANNOT CONTAIN SENSITIVE INFORMATION
function createFileData (userid, fileId, fileKey, fileExtension, uploadType, hash, size) {
    return {
        UserId: userid,
        FileId: fileId,
        FileName: fileId + fileExtension,
        UploadType: uploadType,
        Key: fileKey,
        Hash: hash,
        Size: size
    }
}

// THIS WILL NOT AUTHENTICATE A USER FOR YOU!
exports.getFileById = function (userid, fileId) {
    return new Promise((exec, reject) => {
        exports.getFileMetaById(userid, fileId).then(meta => {
            if(meta){
                s3.getObject({
                    Bucket: Config.LoadedConfig.SpacesInfo.SpaceName,
                    Key: meta.Key
                }, function (err, data) {
                    if(err){
                        reject(err)
                        return
                    }
                    exec({FileMeta: meta, FileData: data})
                })
            }
            else
                reject(new Error("Object not found!"))
        }).catch(err => reject(err))
    })
}

exports.getFileHash = function (data) {
    return crypto.createHash("md5").update(data).digest("hex")
}

// THIS WILL NOT AUTHENTICATE A USER FOR YOU!
exports.UploadFile = function (userid, fileName, buffer, hash, stats) {
    return new Promise((exec, reject) => {
        let fileType = path.extname(fileName).toLowerCase()
        let uploadType = getUploadTypeFromFileExtension(fileType)
        if(uploadType !== undefined){
            let ft = isValidFileType(fileType, uploadType)
            if(ft){
                let id = ID.new(ID.IDTypes.File)
                exports.doesFileIdExist(userid, id).then(r => {
                    if(!r){
                        const key = userid + "/" + id + ft
                        const data = createFileData(userid, id, key, fileType, uploadType, hash, stats.size)
                        if(Config.LoadedConfig.AVSettings.ScanFiles){
                            const s = stream.Readable.from(buffer)
                            broker.call('antivirus.scan', s).then(scanResult => {
                                if(!scanResult.infected){
                                    s3.upload({
                                        Body: buffer,
                                        Bucket: Config.LoadedConfig.SpacesInfo.SpaceName,
                                        Key: key
                                    }, function (err) {
                                        if(err){
                                            reject(err)
                                            return
                                        }
                                        addUploadDataToUser(userid, data).then(ur => {
                                            if(ur)
                                                exec(data)
                                            else
                                                reject(new Error("Failed to Upload MetaData for File"))
                                        }).catch(uerr => reject(uerr))
                                    })
                                }
                                else
                                    reject(new Error("File is infected!"))
                            }).catch(serr => reject(serr))
                        }
                        else{
                            s3.upload({
                                Body: buffer,
                                Bucket: Config.LoadedConfig.SpacesInfo.SpaceName,
                                Key: key
                            }, function (err) {
                                if(err){
                                    reject(err)
                                    return
                                }
                                addUploadDataToUser(userid, data).then(ur => {
                                    if(ur)
                                        exec(data)
                                    else
                                        reject(new Error("Failed to Upload MetaData for File"))
                                }).catch(uerr => reject(uerr))
                            })
                        }
                    }
                    else
                        reject(new Error("Id Already Exists!"))
                }).catch(gerr => reject(gerr))
            }
            else
                reject(new Error("Invalid FileType for UploadType"))
        }
        else
            reject(new Error("Invalid UploadType"))
    })
}

// THIS WILL NOT AUTHENTICATE A USER FOR YOU!
exports.DeleteFile = function (userid, fileId) {
    return new Promise((exec, reject) => {
        exports.getFileMetaById(userid, fileId).then(meta => {
            if(meta){
                s3.deleteObject({
                    Bucket: Config.LoadedConfig.SpacesInfo.SpaceName,
                    Key: meta.Key
                }, function (err) {
                    if(err){
                        reject(err)
                        return
                    }
                    removeUploadDataFromUser(userid, meta).then(r => {
                        if(r)
                            exec(true)
                        else
                            reject(new Error("Failed to delete file meta!"))
                    }).catch(rerr => reject(rerr))
                })
            }
            else
                reject(new Error("Failed to get FileMeta by Id!"))
        }).catch(err => reject(err))
    })
}

exports.UploadType = {
    Media: 0,
    Avatar: 1,
    World: 2,
    ServerScript: 3,
}