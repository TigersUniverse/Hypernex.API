const express = require('express')
const http = require('http')
const https = require('https')
const bodyParser = require("body-parser");
const path = require("path")

const Logger = require("./../Logging/Logger.js")
const APIMessage = require("./APIMessage.js")

const app = express()

let ServerConfig
let Users

const API_VERSION = "v1"

function getAPIEndpoint(){
    return "/api/" + API_VERSION + "/"
}

function isUserBodyValid(property, targetType){
    let v = true
    if(property === undefined)
        v = false
    if(targetType !== undefined)
        if(typeof property !== targetType)
            v = false
    return v
}

exports.initapp = function (usersModule, serverConfig){
    // TODO: Write some app endpoints when other interfaces are ready
    /*
        Note that other classes should implement functions to interpret API requests
        Pass the request parameter to these functions, and the respective modules should
        implement app extensions themselves
     */
    Users = usersModule
    ServerConfig = serverConfig

    app.use(express.static(path.resolve(serverConfig.LoadedConfig.WebRoot), {
        extensions: ['html', 'htm']
    }))
    app.use(bodyParser.urlencoded({extended: true}))
    app.use(bodyParser.json())

    app.post(getAPIEndpoint() + "createUser", function (req, res) {
        let username = req.body.username
        let password = req.body.password
        let email = req.body.email
        let inviteCode = req.body.inviteCode
        if(isUserBodyValid(username, 'string') && isUserBodyValid(password, 'string') &&
            isUserBodyValid(email, 'string') && isUserBodyValid(inviteCode, 'string')) {
            Users.createUser(username, password, email, inviteCode).then(userdata => {
                Logger.Log("Created user " + userdata.Username + " from API successfully!")
                res.end(APIMessage.craftAPIMessage(true, "Created user " + userdata.Username, {
                    UserData: Users.getPrivateUserData(userdata)
                }))
            }).catch(err => {
                Logger.Error("Failed to createUser from API for reason: " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to create user!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "doesUserExist", function (req, res) {
        let userid = req.body.userid
        if(isUserBodyValid(userid, 'string')){
            Users.doesUserExist(userid).then(r => {
                res.end(APIMessage.craftAPIMessage(true, "Completed Search", {
                    doesUserExist: r
                }))
            }).catch(err => {
                Logger.Error("Failed to doesUserExist from API for reason: " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to complete search!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "getUser", function (req, res) {
        let userid = req.body.userid
        let username = req.body.username
        let tokenContent = req.body.tokenContent
        if(isUserBodyValid(username, 'string')){
            if(isUserBodyValid(tokenContent, 'string')){
                // Return Private Client if token is valid
                Users.getPrivateClientUserData(username, tokenContent).then(userdata => {
                    if(userdata){
                        // This will censor for us
                        res.end(APIMessage.craftAPIMessage(true, "Got user " + userdata.username, {
                            UserData: userdata
                        }))
                    }
                    else
                        res.end(APIMessage.craftAPIMessage(false, "Failed to getUser!"))
                }).catch(err => {
                    Logger.Error("Failed to getUser from API for reason: " + err)
                    res.end(APIMessage.craftAPIMessage(false, "Failed to getUser!"))
                })
            }
            else{
                // Return censored
                Users.getUserDataFromUsername(username).then(userdata => {
                    if(userdata){
                        res.end(APIMessage.craftAPIMessage(true, "Got user " + userdata.username, {
                            // Do not forget to censor!
                            UserData: Users.censorUser(userdata)
                        }))
                    }
                    else
                        res.end(APIMessage.craftAPIMessage(false, "Failed to getUser!"))
                }).catch(err => {
                    Logger.Error("Failed to getUser from API for reason: " + err)
                    res.end(APIMessage.craftAPIMessage(false, "Failed to getUser!"))
                })
            }
        }
        else if(isUserBodyValid(userid, 'string')){
            if(isUserBodyValid(tokenContent, 'string')){
                // Return Private Client if token is valid
                Users.isUserIdTokenValid(userid, tokenContent).then(v => {
                    if(v){
                        Users.getUserDataFromUserId(userid).then(userdata => {
                            if(userdata){
                                // This will censor for us
                                res.end(APIMessage.craftAPIMessage(true, "Got user " + userdata.username, {
                                    UserData: userdata
                                }))
                            }
                            else
                                res.end(APIMessage.craftAPIMessage(false, "Failed to getUser!"))
                        }).catch(err => {
                            Logger.Error("Failed to getUser from API for reason: " + err)
                            res.end(APIMessage.craftAPIMessage(false, "Failed to getUser!"))
                        })
                    }
                    else
                        res.end(APIMessage.craftAPIMessage(false, "Invalid token!"))
                })
            }
            else{
                // Return censored
                Users.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        res.end(APIMessage.craftAPIMessage(true, "Got user " + userdata.username, {
                            // Do not forget to censor!
                            UserData: Users.censorUser(userdata)
                        }))
                    }
                    else
                        res.end(APIMessage.craftAPIMessage(false, "Failed to getUser!"))
                }).catch(err => {
                    Logger.Error("Failed to getUser from API for reason: " + err)
                    res.end(APIMessage.craftAPIMessage(false, "Failed to getUser!"))
                })
            }
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "login", function (req, res) {
        let app = req.body.app
        let username = req.body.username
        let password = req.body.password
        // not important if its undefined, some people may not have a 2fa code
        let twofacode = req.body.twofacode
        if(isUserBodyValid(username, 'string') && isUserBodyValid(password, 'string')){
            Users.Login(app, username, password, twofacode).then(r => {
                let result = r.result
                let token = r.token
                let status = r.status
                switch (result) {
                    case Users.LoginResult.Incorrect:
                        res.end(APIMessage.craftAPIMessage(true, "Incorrect credentials"), {
                            LoginResult: result
                        })
                        break
                    case Users.LoginResult.Missing2FA:
                        res.end(APIMessage.craftAPIMessage(true, "Missing 2FA", {
                            LoginResult: result
                        }))
                        break
                    case Users.LoginResult.Warned:
                        res.end(APIMessage.craftAPIMessage(true, "Warned", {
                            LoginResult: result,
                            WarnStatus: status,
                            token: token
                        }))
                        break
                    case Users.LoginResult.Banned:
                        res.end(APIMessage.craftAPIMessage(true, "Banned", {
                            LoginResult: result,
                            BanStatus: status
                        }))
                        break
                    case Users.LoginResult.Correct:
                        res.end(APIMessage.craftAPIMessage(true, "Login Successful", {
                            LoginResult: result,
                            token: token
                        }))
                        break
                    default:
                        res.end(APIMessage.craftAPIMessage(false, "Unknown LoginResult"))
                        break
                }
            }).catch(err => {
                Logger.Error("Failed to login from API for reason: " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to login!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })
}

exports.createServer = function (port, ssl){
    let server
    if(ssl === undefined){
        server = http.createServer(app)
        server.listen(port)
    }
    else{
        server = https.createServer(ssl, app)
        if(port !== 443)
            Logger.Warning("Port other than 443 is being used for HTTPS, this may cause issues.")
        server.listen(port)
    }
    return server
}