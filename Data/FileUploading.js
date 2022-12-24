const path = require("path")
const streamify = require("streamify")
const AWS = require("aws-sdk")

const ID = require("./ID.js")
const ArrayTools = require("./../Tools/ArrayTools.js")
const Logger = require("./../Logging/Logger.js")

const UPLOAD_FILE_PREFIX = "uploads/"

let Config
let Database
let Users

let s3

exports.init = function (c, d, u) {
    return new Promise((exec, reject) => {
        Config = c
        Database = d
        Users = u
        AWS.config.update({
            accessKeyId: Config.LoadedConfig.SpacesInfo.AccessKeyId,
            secretAccessKey: Config.LoadedConfig.SpacesInfo.SecretAccessKey
        })
        s3 = new AWS.S3({
            endpoint: new AWS.Endpoint("https://" + Config.LoadedConfig.SpacesInfo.SpaceName + "." +
                Config.LoadedConfig.SpacesInfo.Region + ".digitaloceanspaces.com"),
            s3ForcePathStyle: true
        })
        Logger.Log("Initialized FileUploading!")
        exec(this)
    })
}

exports.initUser = function (userid) {
    return new Promise((exec, reject) => {
        Database.set(UPLOAD_FILE_PREFIX + userid, {
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
        Database.set(UPLOAD_FILE_PREFIX + uploadData.UserId, uploadData).then(r => {
            if(r)
                exec(true)
            else
                reject(new Error("Failed to save UploadData!"))
        }).catch(err => reject(err))
    })
}

function addUploadDataToUser (userid, data) {
    return new Promise((exec, reject) => {
        Database.get(UPLOAD_FILE_PREFIX + userid).then(uploadData => {
            if(uploadData){
                let nud = uploadData
                nud.Uploads.push(data)
                setUploadData(nud).then(r => {
                    if(r)
                        exec(true)
                    else
                        reject(new Error("Failed to save UploadData!"))
                }).catch(err => reject(err))
            }
            else
                reject(new Error("No UploadData found!"))
        }).catch(err => reject(err))
    })
}

function removeUploadDataFromUser (userid, data) {
    return new Promise((exec, reject) => {
        Database.get(UPLOAD_FILE_PREFIX + userid).then(uploadData => {
            if(uploadData){
                let nud = uploadData
                nud.Uploads = ArrayTools.customFilterArray(nud.Uploads, item => item.FileId !== data.FileId)
                setUploadData(nud).then(r => {
                    if(r)
                        exec(true)
                    else
                        reject(false)
                }).catch(err => reject(err))
            }
            else
                reject(false)
        }).catch(err => reject(err))
    })
}

function isUploadTypeValid(uploadType){
    return uploadType === ID.IDTypes.Avatar || uploadType === ID.IDTypes.World || uploadType === ID.IDTypes.Media
}

// Indexed by the ID.IDTypes
const ALLOWED_FILE_TYPES = [[".jpg", ".jpeg", ".gif", ".png", ".mp4"], [".hna"], [".hnw"]]

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
    }
    return undefined
}

exports.doesFileIdExist = function (userid, fileId){
    return new Promise((exec, reject) => {
        Database.get(UPLOAD_FILE_PREFIX + userid).then(uploadData => {
            if(uploadData){
                let ud = false
                for(let i = 0; i < uploadData.Uploads.length; i++){
                    let data = uploadData.Uploads[i]
                    if(data.FileId === fileId)
                        ud = fileId
                }
                exec(!!ud)
            }
            else
                exec(false)
        }).catch(err => reject(err))
    })
}

exports.getFileMetaById = function (userid, fileId) {
    return new Promise((exec, reject) => {
        Database.get(UPLOAD_FILE_PREFIX + userid).then(uploadData => {
            if(uploadData){
                let ud = undefined
                for(let i = 0; i < uploadData.Uploads.length; i++){
                    let data = uploadData.Uploads[i]
                    if(data.FileId === fileId)
                        ud = data
                }
                exec(ud)
            }
            else
                reject(new Error("Upload Data not found!"))
        }).catch(err => reject(err))
    })
}

function createFileData (userid, fileId, fileKey, fileExtension, uploadType) {
    return {
        UserId: userid,
        FileId: fileId,
        FileName: fileId + fileExtension,
        UploadType: uploadType,
        Key: fileKey
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

// THIS WILL NOT AUTHENTICATE A USER FOR YOU!
exports.UploadFile = function (userid, fileName, buffer) {
    return new Promise((exec, reject) => {
        let fileType = path.extname(fileName)
        let uploadType = getUploadTypeFromFileExtension(fileType)
        if(uploadType !== undefined){
            let ft = isValidFileType(fileType, uploadType)
            if(ft){
                let id = ID.new(ID.IDTypes.File)
                exports.doesFileIdExist(userid, id).then(r => {
                    if(!r){
                        const key = userid + "/" + id + ft
                        const data = createFileData(userid, id, key, fileType)
                        //const stream = streamify(buffer)
                        //broker.call('antivirus.scan', stream).then(scanResult => {
                            //if(!scanResult.infected){
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
                            //}
                            //else
                                //reject(new Error("File is infected!"))
                        //})
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
    World: 2
}