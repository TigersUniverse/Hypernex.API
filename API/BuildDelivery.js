const fs = require("fs")
const path = require("path")

const APIMessage = require("./APIMessage.js")
const ArrayTools = require("./../Tools/ArrayTools.js")
const Logger = require("./../Logging/Logger.js")
const bodyParser = require("body-parser");

let ServerConfig
let Users
let app
let apiEndpoint
let isUserBodyValid
let Post

const RefreshCount = 120
const BuildsDir = "builds"
let RegisteredBuilds = []

const getDirectories = source =>
    fs.readdirSync(source, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)

exports.init = function (serverConfig, a, apie, users, ubv) {
    ServerConfig = serverConfig
    app = a
    apiEndpoint = apie
    Users = users
    isUserBodyValid = ubv
    if(!fs.existsSync(BuildsDir)) {
        fs.mkdirSync(BuildsDir)
        console.warn("Builds are empty!")
    }
    readBuilds()
    setInterval(readBuilds, RefreshCount * 1000)
    app.get(apie + "getVersions/:name", function (req, res) {
        let name = req.params.name
        let versionStrings = []
        if(RegisteredBuilds[name] !== undefined)
            versionStrings = ArrayTools.clone(RegisteredBuilds[name])
        res.end(APIMessage.craftAPIMessage(true, "Got versions!", {
            Name: name,
            Versions: versionStrings
        }))
    })
}

function isBuildRegistered(name, versionString){
    if(RegisteredBuilds[name] === undefined)
        return false
    return ArrayTools.find(RegisteredBuilds[name], versionString) !== undefined
}

function readBuilds(){
    let directories = getDirectories(BuildsDir)
    for (let i = 0; i < directories.length; i++){
        let dir = path.join(BuildsDir, directories[i])
        let name = directories[i]
        let versions = getDirectories(dir).sort(function (a, b) {
            let dirPathA = path.join(dir, a)
            let dirPathB = path.join(dir, b)
            return fs.statSync(dirPathB).mtime.getTime() - fs.statSync(dirPathA).mtime.getTime();
        })
        prepareBuild(name, versions)
    }
}

function sendFile(res, fileName, data){
    res.setHeader('X-Filename', fileName);
    res.attachment(fileName)
    res.send(data)
}

function prepareBuild(name, versions){
    let dir = path.join(BuildsDir, name)
    let compatibleVersions = []
    for (let i = 0; i < versions.length; i++){
        let versionString = versions[i]
        let versionDir = path.join(dir, versionString)
        if(fs.existsSync(versionDir))
            compatibleVersions.push({
                Directory: versionDir,
                VersionString: versionString
            })
    }
    let preRegisteredVersions = []
    if(RegisteredBuilds[name] !== undefined)
        for(let i = 0; i < RegisteredBuilds[name].length; i++)
            preRegisteredVersions.push(RegisteredBuilds[name])
    RegisteredBuilds[name] = []
    for (let i = 0; i < compatibleVersions.length; i++){
        let versionObject = compatibleVersions[i]
        let wasBuildRegistered = ArrayTools.find(preRegisteredVersions, versionObject.VersionString) === undefined
        if(wasBuildRegistered)
            app.post(apiEndpoint + "getBuild/" + name + "/" + versionObject.VersionString, function (req, res) {
                let buildArtifact = req.body.buildArtifact
                if(buildArtifact === undefined)
                    buildArtifact = 0
                let files = fs.readdirSync(versionObject.Directory)
                if(files[buildArtifact] === undefined)
                    buildArtifact = 0
                if(files[buildArtifact] === undefined){
                    res.end(APIMessage.craftAPIMessage(false, "Failed to deliver build!"))
                    return
                }
                let file = path.join(BuildsDir, name, versionObject.VersionString, files[buildArtifact])
                if(file === undefined){
                    Logger.Error("No build for " + name + " on " + versionObject.VersionString)
                    res.end(APIMessage.craftAPIMessage(false, "Failed to deliver build!"))
                }
                let userid = req.body.userid
                let tokenContent = req.body.tokenContent
                if(ServerConfig.LoadedConfig.RequireTokenToDownloadBuilds){
                    if(isUserBodyValid(userid, 'string') && isUserBodyValid(tokenContent, 'string')){
                        Users.isUserIdTokenValid(userid, tokenContent).then(valid => {
                            if(valid)
                                sendFile(res, path.basename(file), fs.readFileSync(file))
                            else
                                res.end(APIMessage.craftAPIMessage(false, "Invalid Token!"))
                        }).catch(err => {
                            Logger.Error("Failed to Deliver Build for reason: " + err)
                            res.end(APIMessage.craftAPIMessage(false, "Failed to deliver build!"))
                        })
                    }
                    else
                        res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                }
                else
                    sendFile(res, path.basename(file), fs.readFileSync(file))
            })
        if(RegisteredBuilds[name] === undefined)
            RegisteredBuilds[name] = []
        RegisteredBuilds[name].push(versionObject.VersionString)
        if(!wasBuildRegistered)
            Logger.Log("Registered Build " + versionObject.VersionString + " for " + name)
    }
}