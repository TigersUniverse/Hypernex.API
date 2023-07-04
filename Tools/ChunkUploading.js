const fs = require("fs")

const ID = require("./../Data/ID.js")

const uploadDirectory = "uploads/"

exports.DoesIdExist = function (id){
    if(id === undefined || id === null || id === "")
        return false
    return fs.existsSync(uploadDirectory + id)
}

exports.GetId = function () {
    let id = ID.newSafeURLTokenPassword(50)
    while(fs.existsSync(uploadDirectory + id))
        id = ID.newSafeURLTokenPassword(50)
    if(!fs.existsSync(uploadDirectory + id))
        fs.mkdirSync(uploadDirectory + id)
    return id
}

exports.PushFile = function (id, chunkNumber, data) {
    return new Promise((exec, reject) => {
        let fileName = uploadDirectory + id + "/file-" + chunkNumber
        fs.writeFile(fileName, Buffer.from(data), 'binary', err => {
            if(err){
                reject(err)
                return
            }
            exec(fileName)
        })
    })
}

exports.GetFileCount = function (id) {
    return fs.readdirSync(uploadDirectory + id, {withFileTypes: true}).filter(x => !x.isDirectory()).map(x => x.name).length
}

exports.CombineFiles = function (id, originalFileName) {
    let dir = uploadDirectory + id
    let files = fs.readdirSync(dir, {withFileTypes: true}).filter(x => !x.isDirectory()).map(x => x.name)
    let data = Array(exports.GetFileCount(id))
    for (let i = 0; i < files.length; i++){
        let file = dir + "/" + files[i]
        let num = Number(files[i].split('-')[1].split('.')[0])
        data[num] = fs.readFileSync(file)
    }
    let bufferConcat = Buffer.concat(data)
    let out = dir + "/" + originalFileName
    fs.writeFileSync(out, bufferConcat)
    return out
}

exports.DisposeId = function (id){
    if(fs.existsSync(uploadDirectory + id))
        fs.rmSync(uploadDirectory + id, {recursive: true, force: true})
}