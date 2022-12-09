const path = require("path")
const streamify = require("streamify")
const AWS = require("aws-sdk")

const { ServiceBroker } = require("moleculer")
const AVService = require("moleculer-antivirus")

const ID = require("./ID.js")
const Logger = require("./../Logging/Logger.js")

let Config
let Database
let Users

let broker = new ServiceBroker({ logger: console })
let s3

exports.init = function (c, d, u) {
    return new Promise((exec, reject) => {
        Config = c
        Database = d
        Users = u
        broker.createService({ mixins: AVService })
        broker.start().then(() => {
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
            exec(true)
        }).catch(err => reject(err))
    })
}

function isUploadTypeValid(uploadType){
    return uploadType === ID.IDTypes.Avatar || uploadType === ID.IDTypes.World || uploadType === ID.IDTypes.Media
}

// Indexed by the ID.IDTypes
const ALLOWED_FILE_TYPES = [[], ["hna"], ["hnw"], [], ["jpg", "jpeg", "gif", "png", "mp4"]]

function isValidFileType(fileType, UploadType){
    for(let i = 0; i < ALLOWED_FILE_TYPES[UploadType].length; i++){
        let allowedFileType = ALLOWED_FILE_TYPES[UploadType][i]
        if("." + allowedFileType === fileType)
            return allowedFileType
    }
    return false
}

function getFileMetaById (userid, fileId) {
    return new Promise((exec, reject) => {
        s3.headObject({
            Bucket: Config.LoadedConfig.SpacesInfo.SpaceName,
            Prefix: userid + "/" + fileId
        }, function (err, data) {
            if(err){
                reject(err)
                return
            }
            const contents = data.Contents
            const obj = contents.find(object => object.Key.startsWith(fileId))
            exec(obj)
        })
    })
}

// THIS WILL NOT AUTHENTICATE A USER FOR YOU!
exports.getFileById = function (userid, fileId) {
    return new Promise((exec, reject) => {
        getFileMetaById(userid, fileId).then(meta => {
            if(meta){
                s3.getObject({
                    Bucket: Config.LoadedConfig.SpacesInfo.SpaceName,
                    Key: meta.Key
                }, function (err, data) {
                    if(err){
                        reject(err)
                        return
                    }
                    exec(data)
                })
            }
            else
                reject(new Error("Object not found!"))
        })
    })
}

// THIS WILL NOT AUTHENTICATE A USER FOR YOU!
exports.UploadFile = function (buffer, data) {
    return new Promise((exec, reject) => {
        if(isUploadTypeValid(data.UploadType)){
            let ft = isValidFileType(path.extname(data.FileName), data.UploadType)
            if(ft){
                let id = ID.new(data.UploadType)
                getFileMetaById(data.Id, id).then(r => {
                    if(!r){
                        // TODO: Virus Scan
                        s3.upload({
                            Body: buffer,
                            Bucket: Config.LoadedConfig.SpacesInfo.SpaceName,
                            Key: data.Id + "/" + id + "." + ft
                        }, function (err) {
                            if(err){
                                reject(err)
                                return
                            }
                            exec(true)
                        })
                    }
                    else
                        reject(new Error("Id Already Exists!"))
                })
            }
            else
                reject(new Error("Invalid FileType for UploadType"))
        }
        else
            reject(new Error("Invalid UploadType"))
    })
}

// THIS WILL NOT AUTHENTICATE A USER FOR YOU!
exports.DeleteFile = function (key) {
    return new Promise((exec, reject) => {
        s3.deleteObject({
            Bucket: Config.LoadedConfig.SpacesInfo.SpaceName,
            Key: key
        }, function (err) {
            if(err){
                reject(err)
                return
            }
            exec(true)
        })
    })
}