const express = require('express')
const http = require('http')
const https = require('https')
const bodyParser = require("body-parser");
const path = require("path")
const cors = require("cors")

const ArrayTools = require("./../Tools/ArrayTools.js")
const GeoTools = require("./../Tools/GeoTools.js")
const Logger = require("./../Logging/Logger.js")
const APIMessage = require("./APIMessage.js")

const multer = require("multer")
const fs = require("fs");
let upload

const app = express()

let ServerConfig
let Users
let SocketServer
let FileUploading
let Avatars
let Worlds
let Popularity

let Discourse

const API_VERSION = "v1"

function getAPIEndpoint(){
    return "/api/" + API_VERSION + "/"
}

function isUserBodyValid(property, targetType){
    let v = true
    if(property === undefined || property === null)
        v = false
    if(targetType !== undefined)
        if(typeof property !== targetType)
            v = false
    return v
}

exports.initapp = function (usersModule, socketServerModule, serverConfig, cdns, fileUploadModule, avatarsModule, worldsModule, popularityModule, discourseModule){
    Users = usersModule
    SocketServer = socketServerModule
    ServerConfig = serverConfig
    FileUploading = fileUploadModule
    Avatars = avatarsModule
    Worlds = worldsModule
    Popularity = popularityModule
    Discourse = discourseModule

    upload = multer({ dest: "uploads/", limits: { fileSize: ServerConfig.LoadedConfig.MaxFileSize * 1000000 } })
    app.use(express.static(path.resolve(serverConfig.LoadedConfig.WebRoot), {
        extensions: ['html', 'htm']
    }))
    app.use(bodyParser.urlencoded({extended: true}))
    app.use(bodyParser.json())
    app.use(cors())

    // Server Information
    app.get(getAPIEndpoint() + "getInformation", function (req, res) {
        res.end(APIMessage.craftAPIMessage(true, "Got Informaion", {
            inviteCodeRequired: serverConfig.LoadedConfig.SignupRules.RequireInviteCode,
            allowAnyGameServer: serverConfig.LoadedConfig.AllowAnyGameServer,
            IsWSS: ServerConfig.LoadedConfig.UseHTTPS,
            Port: ServerConfig.LoadedConfig.SocketPort,
            GameEngine: serverConfig.LoadedConfig.GameEngine,
            GameEngineVersion: serverConfig.LoadedConfig.GameEngineVersion,
            servers: cdns
        }))
    })

    app.get(getAPIEndpoint() + "checkGameServer/:gameServerId", function (req, res) {
        let gameServerId = req.params.gameServerId
        if(!isUserBodyValid(gameServerId, "string")){
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
            return
        }
        if(serverConfig.LoadedConfig.AllowAnyGameServer){
            res.end(APIMessage.craftAPIMessage(true, "Got Information", {
                valid: SocketServer.IsGameServerConnected(gameServerId)
            }))
        }
        else{
            res.end(APIMessage.craftAPIMessage(true, "Got Information", {
                valid: false
            }))
        }
    })

    app.get(getAPIEndpoint() + "checkGameServer/:gameServerId/:gameServerToken", function (req, res) {
        let gameServerId = req.params.gameServerId
        let gameServerToken = req.params.gameServerToken
        if(!isUserBodyValid(gameServerId, "string")){
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
            return
        }
        if(serverConfig.LoadedConfig.AllowAnyGameServer){
            res.end(APIMessage.craftAPIMessage(true, "Got Information", {
                valid: SocketServer.IsGameServerConnected(gameServerId)
            }))
        }
        else{
            res.end(APIMessage.craftAPIMessage(true, "Got Information", {
                valid: SocketServer.IsValidGameServer(gameServerId, gameServerToken)
            }))
        }
    })

    // User Information

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

    app.get(getAPIEndpoint() + "doesUserExist", function (req, res) {
        let userid = req.query.userid
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
                        res.end(APIMessage.craftAPIMessage(true, "Got user " + userdata.Username, {
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
                        res.end(APIMessage.craftAPIMessage(true, "Got user " + userdata.Username, {
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
                                res.end(APIMessage.craftAPIMessage(true, "Got user " + userdata.Username, {
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
                }).catch(err => {
                    Logger.Error("Failed to getUser from API for reason: " + err)
                    res.end(APIMessage.craftAPIMessage(false, "Failed to getUser!"))
                })
            }
            else{
                // Return censored
                Users.getUserDataFromUserId(userid).then(userdata => {
                    if(userdata){
                        res.end(APIMessage.craftAPIMessage(true, "Got user " + userdata.Username, {
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

    app.post(getAPIEndpoint() + "logout", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        if(isUserBodyValid(userid) && isUserBodyValid(tokenContent)){
            Users.invalidateToken(userid, tokenContent).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Logged out!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Could not find a valid userid or token!"))
            }).catch(err => {
                Logger.Error("Failed to logout of account for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to logout of account for reason " + err))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "isValidToken", function (req, res) {
        let username = req.body.username
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        if(isUserBodyValid(username, "string")){
            if(isUserBodyValid(tokenContent, "string")){
                Users.isUserTokenValid(username, tokenContent).then(v => {
                    res.end(APIMessage.craftAPIMessage(true, "Completed Operation", {
                        isValidToken: v
                    }))
                }).catch(err => {
                    Logger.Error("Failed to API validate token for reason " + err)
                    res.end(APIMessage.craftAPIMessage(false, "Failed to validate token!"))
                })
            }
            else
                res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
        }
        else if(isUserBodyValid(userid, "string")){
            if(isUserBodyValid(tokenContent, "string")){
                Users.isUserIdTokenValid(userid, tokenContent).then(v => {
                    res.end(APIMessage.craftAPIMessage(true, "Completed Operation", {
                        isValidToken: v
                    }))
                }).catch(err => {
                    Logger.Error("Failed to API validate token for reason " + err)
                    res.end(APIMessage.craftAPIMessage(false, "Failed to validate token!"))
                })
            }
            else
                res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "discourse", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let payload = req.body.payload
        let sig = req.body.sig
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string") && isUserBodyValid(payload, "string"), isUserBodyValid(sig, "string")){
            Users.isUserIdTokenValid(userid, tokenContent).then(v => {
                Users.getUserDataFromUserId(userid).then(user => {
                    if(user !== undefined){
                        let params = Discourse.Validate(payload, sig, user)
                        if(params !== undefined){
                            res.end(APIMessage.craftAPIMessage(true, "Logged In with Discourse", {
                                urlAppend: params
                            }))
                        }
                        else{
                            res.end(APIMessage.craftAPIMessage(false, "Failed to validate Discourse!"))
                        }
                    }
                    else
                        res.end(APIMessage.craftAPIMessage(false, "Failed to get User for Discourse!"))
                }).catch(() => res.end(APIMessage.craftAPIMessage(false, "Failed to get user data!")))
            }).catch(err => {
                Logger.Error("Failed to API validate token for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to validate token!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    // User Modification

    app.post(getAPIEndpoint() + "sendVerificationEmail", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string")){
            Users.sendVerifyEmail(userid, tokenContent).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Sent Verification Email!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to send Verification Email!"))
            }).catch(err => {
                Logger.Error("Failed to send Verification Email for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to send Verification Email!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "verifyEmailToken", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let emailToken = req.body.emailToken
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string") && isUserBodyValid(emailToken, "string")){
            Users.verifyEmailToken(userid, tokenContent, emailToken).then(v => {
                if(v)
                    res.end(APIMessage.craftAPIMessage(true, "Verified Email!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to verify email!"))
            }).catch(err => {
                Logger.Error("Failed to verifyEmailToken for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to verify email!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "changeEmail", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let newEmail = req.body.newEmail
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string") && isUserBodyValid(newEmail, "string")){
            Users.changeEmail(userid, tokenContent, newEmail).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Changed email!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to change email!"))
            }).catch(err => {
                Logger.Error("Failed to change email for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to change email!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "enable2fa", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string")){
            Users.enable2fa(userid, tokenContent).then(otpurl => {
                if(otpurl)
                    res.end(APIMessage.craftAPIMessage(true, "Enabled 2FA!", {
                        otpauth_url: otpurl
                    }))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to enable 2FA!"))
            }).catch(err => {
                Logger.Error("Failed to enable 2FA for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to enable 2FA!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "verify2fa", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let code = req.body.code
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string") && isUserBodyValid(code, "string")){
            Users.verify2fa(userid, tokenContent, code).then(valid => {
                if(valid)
                    res.end(APIMessage.craftAPIMessage(true, "Verified 2FA!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Invalid 2FA Code!"))
            }).catch(err => {
                Logger.Error("Failed to verify 2FA for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to verify 2FA!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "remove2fa", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string")){
            Users.remove2fa(userid, tokenContent).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Removed 2FA!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to remove 2FA Code!"))
            }).catch(err => {
                Logger.Error("Failed to remove 2FA for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to remove 2FA Code!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "requestPasswordReset", function (req, res) {
        let email = req.body.email
        if(isUserBodyValid(email)){
            Users.requestPasswordReset(email).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Sent Password Reset Email to " + email))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to send Password Reset Email!"))
            }).catch(err => {
                Logger.Error("Failed to request password reset for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to send Password Reset Email!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "resetPassword", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let passwordResetContent = req.body.passwordResetContent
        let newPassword = req.body.newPassword
        if(isUserBodyValid(userid, "string")){
            if(isUserBodyValid(passwordResetContent, "string")){
                Users.resetPassword(userid, passwordResetContent, newPassword).then(r => {
                    if(r)
                        res.end(APIMessage.craftAPIMessage(true, "Reset Password!"))
                    else
                        res.end(APIMessage.craftAPIMessage(false, "Failed to Reset Password!"))
                }).catch(err => {
                    Logger.Error("Failed to reset password for reason " + err)
                    res.end(APIMessage.craftAPIMessage(false, "Failed to send Reset Password!"))
                })
            }
            else if(isUserBodyValid(tokenContent, "string")){
                Users.resetPasswordWithUserToken(userid, tokenContent, newPassword).then(r => {
                    if(r)
                        res.end(APIMessage.craftAPIMessage(true, "Reset Password!"))
                    else
                        res.end(APIMessage.craftAPIMessage(false, "Failed to Reset Password!"))
                }).catch(err => {
                    Logger.Error("Failed to reset password for reason " + err)
                    res.end(APIMessage.craftAPIMessage(false, "Failed to send Reset Password!"))
                })
            }
            else
                res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "updateBio", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let bio = req.body.bio
        if(isUserBodyValid(userid, "string") && isUserBodyValid(bio)){
            Users.updateBio(userid, tokenContent, bio).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Updated Bio!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to update bio!"))
            }).catch(err => {
                Logger.Error("Failed to update bio for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to update bio!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "blockUser", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let targetUserId = req.body.targetUserId
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string") && isUserBodyValid(targetUserId, "string")){
            Users.blockUser(userid, tokenContent, targetUserId).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Blocked User!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to block user!"))
            }).catch(err => {
                Logger.Error("Failed to block user for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to block user!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "unblockUser", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let targetUserId = req.body.targetUserId
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string") && isUserBodyValid(targetUserId, "string")){
            Users.unBlockUser(userid, tokenContent, targetUserId).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Unblocked User!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to unblock user!"))
            }).catch(err => {
                Logger.Error("Failed to unblock user for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to unblock user!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "followUser", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let targetUserId = req.body.targetUserId
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string") && isUserBodyValid(targetUserId, "string")){
            Users.followUser(userid, tokenContent, targetUserId).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Followed User!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to follow user!"))
            }).catch(err => {
                Logger.Error("Failed to follow user for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to follow user!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "unfollowUser", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let targetUserId = req.body.targetUserId
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string") && isUserBodyValid(targetUserId, "string")){
            Users.unFollowUser(userid, tokenContent, targetUserId).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Unfollowed User!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to unfollow user!"))
            }).catch(err => {
                Logger.Error("Failed to unfollow user for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to unfollow user!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "sendFriendRequest", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let targetUserId = req.body.targetUserId
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string") && isUserBodyValid(targetUserId, "string")){
            Users.sendFriendRequest(userid, tokenContent, targetUserId).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Sent friend request!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to send friend request!"))
            }).catch(err => {
                Logger.Error("Failed to send friend request for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to send friend request!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "acceptFriendRequest", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let targetUserId = req.body.targetUserId
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string") && isUserBodyValid(targetUserId, "string")){
            Users.acceptFriendRequest(userid, tokenContent, targetUserId).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Accepted friend request!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to accept friend request!"))
            }).catch(err => {
                Logger.Error("Failed to accept friend request for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to accept friend request!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "declineFriendRequest", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let targetUserId = req.body.targetUserId
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string") && isUserBodyValid(targetUserId, "string")){
            Users.declineFriendRequest(userid, tokenContent, targetUserId).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Declined friend request!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to decline friend request!"))
            }).catch(err => {
                Logger.Error("Failed to decline friend request for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to decline friend request!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "removeFriend", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let targetUserId = req.body.targetUserId
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string") && isUserBodyValid(targetUserId, "string")){
            Users.removeFriend(userid, tokenContent, targetUserId).then(r => {
                if(r)
                    res.end(APIMessage.craftAPIMessage(true, "Removed friend!"))
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to remove friend!"))
            }).catch(err => {
                Logger.Error("Failed to remove friend for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to remove friend!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "update/avatar", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let fileid = req.body.fileid
        let avatarMeta = req.body.avatarmeta
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string")){
            if(isUserBodyValid(fileid, "string")){
                FileUploading.getFileMetaById(userid, fileid).then(r => {
                    if(fileid !== undefined){
                        Avatars.handleFileUpload(userid, tokenContent, fileid, avatarMeta).then(verifiedAvatarMeta => {
                            if(verifiedAvatarMeta !== undefined){
                                Users.addAvatar(userid, verifiedAvatarMeta).then(uaar => {
                                    if(uaar){
                                        res.end(APIMessage.craftAPIMessage(true, "Uploaded Avatar!", {
                                            UploadData: r,
                                            AvatarId: verifiedAvatarMeta.Id
                                        }))
                                    }
                                    else{
                                        res.end(APIMessage.craftAPIMessage(false, "Failed to add Avatar!"))
                                        FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                                        Avatars.deleteAvatar(verifiedAvatarMeta.Id)
                                    }
                                }).catch(err => {
                                    Logger.Error("Failed to upload avatar for reason " + err)
                                    res.end(APIMessage.craftAPIMessage(false, "Failed to add avatar!"))
                                    FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                                    Avatars.deleteAvatar(verifiedAvatarMeta.Id)
                                })
                            }
                            else{
                                res.end(APIMessage.craftAPIMessage(false, "Failed to verify AvatarMeta!"))
                                FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                            }
                        })
                    }
                    else{
                        res.end(APIMessage.craftAPIMessage(false, "Failed to find file!"))
                    }
                }).catch(_ => {
                    res.end(APIMessage.craftAPIMessage(false, "Failed to find file!"))
                })
            }
            else{
                Avatars.updateMeta(userid, tokenContent, avatarMeta).then(verifiedAvatarMeta => {
                    if(verifiedAvatarMeta !== undefined){
                        res.end(APIMessage.craftAPIMessage(true, "Updated Avatar!"))
                    }
                    else{
                        res.end(APIMessage.craftAPIMessage(false, "Failed to update avatar!"))
                    }
                }).catch(_ => {
                    res.end(APIMessage.craftAPIMessage(false, "Failed to update avatar!"))
                })
            }
        }
    })

    app.post(getAPIEndpoint() + "remove/avatar", function (req, res) {
        let userid = req.body.userid
        let avatarid = req.body.avatarid
        let tokenContent = req.body.tokenContent
        if(isUserBodyValid(userid, "string") && isUserBodyValid(avatarid, "string") && isUserBodyValid(tokenContent, "string")){
            Users.removeAvatar(userid, tokenContent, avatarid).then(r => {
                if(r){
                    Avatars.deleteAvatar(avatarid).then(rr => {
                        if(rr)
                            res.end(APIMessage.craftAPIMessage(true, "Removed avatar!"))
                        else
                            res.end(APIMessage.craftAPIMessage(true, "Failed to remove avatar!"))
                    }).catch(err => {
                        Logger.Error("Failed to remove avatar for reason " + err)
                        res.end(APIMessage.craftAPIMessage(true, "Failed to remove avatar!"))
                    })
                }
                else
                    res.end(APIMessage.craftAPIMessage(true, "Failed to remove avatar!"))
            }).catch(err => {
                Logger.Error("Failed to remove avatar for reason " + err)
                res.end(APIMessage.craftAPIMessage(true, "Failed to remove avatar!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "update/world", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let fileid = req.body.fileid
        let worldMeta = req.body.worldmeta
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string")){
            if(isUserBodyValid(fileid, "string")){
                FileUploading.getFileMetaById(userid, fileid).then(r => {
                    if(fileid !== undefined){
                        Worlds.handleFileUpload(userid, tokenContent, fileid, worldMeta).then(verifiedWorldMeta => {
                            if(verifiedWorldMeta !== undefined){
                                Users.addWorld(userid, verifiedWorldMeta).then(uwar => {
                                    if(uwar){
                                        res.end(APIMessage.craftAPIMessage(true, "Uploaded World!", {
                                            UploadData: r,
                                            WorldId: verifiedWorldMeta.Id
                                        }))
                                    }
                                    else{
                                        res.end(APIMessage.craftAPIMessage(false, "Failed to add World!"))
                                        FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                                        Avatars.deleteAvatar(verifiedWorldMeta.Id)
                                    }
                                }).catch(err => {
                                    Logger.Error("Failed to upload avatar for reason " + err)
                                    res.end(APIMessage.craftAPIMessage(false, "Failed to add world!"))
                                    FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                                    Avatars.deleteAvatar(verifiedWorldMeta.Id)
                                })
                            }
                            else{
                                res.end(APIMessage.craftAPIMessage(false, "Failed to verify World!"))
                                FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                            }
                        })
                    }
                    else{
                        res.end(APIMessage.craftAPIMessage(false, "Failed to find file!"))
                    }
                }).catch(_ => {
                    res.end(APIMessage.craftAPIMessage(false, "Failed to find file!"))
                })
            }
            else{
                Worlds.updateMeta(userid, tokenContent, worldMeta).then(verifiedWorldMeta => {
                    if(verifiedWorldMeta !== undefined){
                        res.end(APIMessage.craftAPIMessage(true, "Updated World!"))
                    }
                    else{
                        res.end(APIMessage.craftAPIMessage(false, "Failed to update world!"))
                    }
                }).catch(_ => {
                    res.end(APIMessage.craftAPIMessage(false, "Failed to update world!"))
                })
            }
        }
    })

    app.post(getAPIEndpoint() + "remove/world", function (req, res) {
        let userid = req.body.userid
        let worldid = req.body.worldid
        let tokenContent = req.body.tokenContent
        if(isUserBodyValid(userid, "string") && isUserBodyValid(worldid, "string") && isUserBodyValid(tokenContent, "string")){
            Users.removeWorld(userid, tokenContent, worldid).then(r => {
                if(r){
                    Worlds.deleteWorld(worldid).then(rr => {
                        if(rr)
                            res.end(APIMessage.craftAPIMessage(true, "Removed world!"))
                        else
                            res.end(APIMessage.craftAPIMessage(true, "Failed to remove world!"))
                    }).catch(err => {
                        Logger.Error("Failed to remove world for reason " + err)
                        res.end(APIMessage.craftAPIMessage(true, "Failed to remove world!"))
                    })
                }
                else
                    res.end(APIMessage.craftAPIMessage(true, "Failed to remove world!"))
            }).catch(err => {
                Logger.Error("Failed to remove world for reason " + err)
                res.end(APIMessage.craftAPIMessage(true, "Failed to remove world!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "remove/file", function (req, res) {
        let userid = req.body.userid
        let fileid = req.body.fileid
        let tokenContent = req.body.tokenContent
        if(isUserBodyValid(userid, "string") && isUserBodyValid(fileid, "string") && isUserBodyValid(tokenContent, "string")){
            FileUploading.doesFileIdExist(userid, fileid).then(r => {
                if(r){
                    FileUploading.getFileById(userid, fileid).then(file => {
                        if(file !== undefined && file.UserId === userid && file.UploadType === FileUploading.UploadType.Media){
                            Users.isUserIdTokenValid(userid, tokenContent).then(validToken => {
                                if(validToken){
                                    FileUploading.DeleteFile(userid, fileid).then(rr => {
                                        if(rr)
                                            res.end(APIMessage.craftAPIMessage(true, "Deleted file!"))
                                        else
                                            res.end(APIMessage.craftAPIMessage(true, "Failed to delete file!"))
                                    }).catch(err => {
                                        Logger.Error("Failed to delete file for reason " + err)
                                        res.end(APIMessage.craftAPIMessage(false, "Failed to delete file!"))
                                    })
                                }
                                else
                                    res.end(APIMessage.craftAPIMessage(true, "Failed to delete file!"))
                            }).catch(err => {
                                Logger.Error("Failed to delete file for reason " + err)
                                res.end(APIMessage.craftAPIMessage(false, "Failed to delete file!"))
                            })
                        }
                        else
                            res.end(APIMessage.craftAPIMessage(true, "Failed to delete file!"))
                    }).catch(err => {
                        Logger.Error("Failed to delete file for reason " + err)
                        res.end(APIMessage.craftAPIMessage(false, "Failed to delete file!"))
                    })
                }
                else
                    res.end(APIMessage.craftAPIMessage(true, "Failed to delete file!"))
            }).catch(err => {
                Logger.Error("Failed to delete file for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to delete file!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.get(getAPIEndpoint() + "search/user/:username/:itemsPerPage/:pageNumber", function (req, res) {
        let username = req.params.username
        let itemsPerPage = parseInt(req.params.itemsPerPage)
        if(itemsPerPage > 50)
            itemsPerPage = 50
        let pageNumber = parseInt(req.params.pageNumber)
        if(isUserBodyValid(username, "string")){
            Users.safeSearchUsername(username, itemsPerPage, pageNumber).then(arr => {
                res.end(APIMessage.craftAPIMessage(true, "Found Candidates!", {
                    Candidates: arr
                }))
            }).catch(err => {
                Logger.Error("Failed to search by username for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to Search by Username"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.get(getAPIEndpoint() + "search/avatar/:name/:itemsPerPage/:pageNumber", function (req, res) {
        let name = req.params.name
        let itemsPerPage = parseInt(req.params.itemsPerPage)
        if(itemsPerPage > 50)
            itemsPerPage = 50
        let pageNumber = parseInt(req.params.pageNumber)
        if(isUserBodyValid(name, "string")){
            Avatars.safeSearchAvatar(name, itemsPerPage, pageNumber).then(arr => {
                res.end(APIMessage.craftAPIMessage(true, "Found Candidates!", {
                    Candidates: arr
                }))
            }).catch(err => {
                Logger.Error("Failed to search by Avatar Name for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to Search by Avatar Name"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.get(getAPIEndpoint() + "tag/avatar/:name/:itemsPerPage/:pageNumber", function (req, res) {
        let tag = req.params.name
        let itemsPerPage = parseInt(req.params.itemsPerPage)
        if(itemsPerPage > 50)
            itemsPerPage = 50
        let pageNumber = parseInt(req.params.pageNumber)
        if(isUserBodyValid(tag, "string")){
            Avatars.safeSearchAvatarTag(tag, itemsPerPage, pageNumber).then(arr => {
                res.end(APIMessage.craftAPIMessage(true, "Found Candidates!", {
                    Candidates: arr
                }))
            }).catch(err => {
                Logger.Error("Failed to search by Avatar Name for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to Search by Avatar Name"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.get(getAPIEndpoint() + "search/world/:name/:itemsPerPage/:pageNumber", function (req, res) {
        let name = req.params.name
        let itemsPerPage = parseInt(req.params.itemsPerPage)
        if(itemsPerPage > 50)
            itemsPerPage = 50
        let pageNumber = parseInt(req.params.pageNumber)
        if(isUserBodyValid(name, "string")){
            Worlds.safeSearchWorld(name, itemsPerPage, pageNumber).then(arr => {
                res.end(APIMessage.craftAPIMessage(true, "Found Candidates!", {
                    Candidates: arr
                }))
            }).catch(err => {
                Logger.Error("Failed to search by World Name for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to Search by World Name"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.get(getAPIEndpoint() + "tag/world/:name/:itemsPerPage/:pageNumber", function (req, res) {
        let tag = req.params.name
        let itemsPerPage = parseInt(req.params.itemsPerPage)
        if(itemsPerPage > 50)
            itemsPerPage = 50
        let pageNumber = parseInt(req.params.pageNumber)
        if(isUserBodyValid(tag, "string")){
            Worlds.safeSearchWorldTag(tag, itemsPerPage, pageNumber).then(arr => {
                res.end(APIMessage.craftAPIMessage(true, "Found Candidates!", {
                    Candidates: arr
                }))
            }).catch(err => {
                Logger.Error("Failed to search by World Name for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to Search by World Name"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.get(getAPIEndpoint() + "filemeta/:userid/:fileid", function (req, res) {
        let userid = req.params.userid
        let fileid = req.params.fileid
        if(isUserBodyValid(userid, "string") && isUserBodyValid(fileid, "string")){
            FileUploading.getFileMetaById(userid, fileid).then(fileMeta => {
                if(fileMeta !== undefined){
                    res.end(APIMessage.craftAPIMessage(true, "Got FileMeta!", {
                        FileMeta: fileMeta
                    }))
                }
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to get FileMeta!"))
            }).catch(err => {
                Logger.Error("Failed to get FileMeta for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to get FileMeta!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    async function redirectToCDN(req, res){
        const clientIP = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
        const closestServer = await GeoTools.findClosestServer(clientIP, cdns)
        const newPath = req.originalUrl.replace("/api/v1/file", "/file")
        const newURL = `${closestServer}${newPath}`
        res.redirect(302, newURL)
    }

    app.get(getAPIEndpoint() + "file/:userid/:fileid", redirectToCDN)
    app.get(getAPIEndpoint() + "file/:userid/:fileid/:filetoken", redirectToCDN)
    app.get(getAPIEndpoint() + "file/:userid/:fileid/:gameServerId/:gameServerToken", redirectToCDN)

    app.get(getAPIEndpoint() + "meta/avatar/:avatarid", function (req, res) {
        let avatarid = req.params.avatarid
        if(isUserBodyValid(avatarid, "string")){
            Avatars.getAvatarMetaById(avatarid).then(meta => {
                if(meta !== undefined){
                    res.end(APIMessage.craftAPIMessage(true, "Got avatar meta", {
                        Meta: meta
                    }))
                }
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to get avatar meta!"))
            }).catch(e => {
                Logger.Error("Failed to get avatar meta for reason " + e)
                res.end(APIMessage.craftAPIMessage(false, "Failed to get avatar meta!"))
            })
        }
    })

    app.get(getAPIEndpoint() + "meta/world/:worldid", function (req, res) {
        let worldid = req.params.worldid
        if(isUserBodyValid(worldid, "string")){
            Worlds.getWorldMetaById(worldid).then(meta => {
                if(meta !== undefined){
                    res.end(APIMessage.craftAPIMessage(true, "Got world meta", {
                        Meta: meta
                    }))
                }
                else
                    res.end(APIMessage.craftAPIMessage(false, "Failed to get world meta!"))
            }).catch(e => {
                Logger.Error("Failed to get world meta for reason " + e)
                res.end(APIMessage.craftAPIMessage(false, "Failed to get world meta!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "manageAssetToken", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let action = req.body.action
        let assetId = req.body.assetId
        let removeAssetToken = req.body.assetToken
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string") && isUserBodyValid(action) && isUserBodyValid(assetId, "string")) {
            Users.isUserIdTokenValid(userid, tokenContent).then(isValid => {
                if(isValid){
                    try {
                        let assetType = assetId.split('_')[0].toLowerCase()
                        switch (assetType) {
                            case "avatar": {
                                switch (action) {
                                    case 0:
                                        // Add
                                        Avatars.addAvatarToken(userid, assetId).then(token => {
                                            if(token !== undefined)
                                                res.end(APIMessage.craftAPIMessage(true, "Added Token!", {
                                                    token: token
                                                }))
                                            else
                                                res.end(APIMessage.craftAPIMessage(false, "Failed to add Token!"))
                                        }).catch(err => {
                                            Logger.Error("Failed to add token for reason " + err)
                                            res.end(APIMessage.craftAPIMessage(false, "Failed to add Token!"))
                                        })
                                        break
                                    case 1:
                                        // Remove
                                        if(isUserBodyValid(removeAssetToken, "string")){
                                            Avatars.removeAvatarToken(userid, assetId, removeAssetToken).then(token => {
                                                if(token === true)
                                                    res.end(APIMessage.craftAPIMessage(true, "Removed Token!"))
                                                else
                                                    res.end(APIMessage.craftAPIMessage(false, "Failed to remove Token!"))
                                            }).catch(err => {
                                                Logger.Error("Failed to remove token for reason " + err)
                                                res.end(APIMessage.craftAPIMessage(false, "Failed to remove Token!"))
                                            })
                                        }
                                        else
                                            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                                        break
                                }
                                break
                            }
                            case "world":{
                                switch (action) {
                                    case 0:
                                        // Add
                                        Worlds.addWorldToken(userid, assetId).then(token => {
                                            if(token !== undefined)
                                                res.end(APIMessage.craftAPIMessage(true, "Added Token!", {
                                                    token: token
                                                }))
                                            else
                                                res.end(APIMessage.craftAPIMessage(false, "Failed to add Token!"))
                                        }).catch(err => {
                                            Logger.Error("Failed to add token for reason " + err)
                                            res.end(APIMessage.craftAPIMessage(false, "Failed to add Token!"))
                                        })
                                        break
                                    case 1:
                                        // Remove
                                        if(isUserBodyValid(removeAssetToken, "string")){
                                            Worlds.removeWorldToken(userid, assetId, removeAssetToken).then(token => {
                                                if(token === true)
                                                    res.end(APIMessage.craftAPIMessage(true, "Removed Token!"))
                                                else
                                                    res.end(APIMessage.craftAPIMessage(false, "Failed to remove Token!"))
                                            }).catch(err => {
                                                Logger.Error("Failed to remove token for reason " + err)
                                                res.end(APIMessage.craftAPIMessage(false, "Failed to remove Token!"))
                                            })
                                        }
                                        else
                                            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                                        break
                                }
                                break
                            }
                            default:
                                res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                                break
                        }
                    }
                    catch (e) {
                        res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                    }
                }
                else
                    res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
            }).catch(() => res.end(APIMessage.craftAPIMessage(false, "Failed to verify Token!")))
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "instances", function (req, res) {
        let worldid = req.body.worldid
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        if(isUserBodyValid(worldid, "string") && isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string")){
            Users.isUserIdTokenValid(userid, tokenContent).then(isTokenValid => {
                if(isTokenValid){
                    Users.getUserDataFromUserId(userid).then(user => {
                        if(user !== undefined){
                            SocketServer.GetSafeInstances(user, worldid).then(instances => {
                                if(instances !== undefined){
                                    res.end(APIMessage.craftAPIMessage(true, "Got instances!", {
                                        SafeInstances: instances
                                    }))
                                }
                                else
                                    res.end(APIMessage.craftAPIMessage(false, "Failed to get Instances!"))
                            }).catch(() => res.end(APIMessage.craftAPIMessage(false, "Failed to get Instances!")))
                        }
                        else
                            res.end(APIMessage.craftAPIMessage(false, "Failed to get User for Instances!"))
                    }).catch(() => res.end(APIMessage.craftAPIMessage(false, "Failed to get Instances!")))
                }
                else
                    res.end(APIMessage.craftAPIMessage(false, "Invalid Token!"))
            }).catch(() => res.end(APIMessage.craftAPIMessage(false, "Failed to get Instances!")))
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.get(getAPIEndpoint() + "instances/:worldid", function (req, res) {
        let worldId = req.params.worldid
        if(isUserBodyValid(worldId, "string")){
            let instances = SocketServer.GetPublicInstancesOfWorld(worldId)
            res.end(APIMessage.craftAPIMessage(true, "Got instances!", {
                SafeInstances: instances
            }))
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.get(getAPIEndpoint() + "gameServers", function (req, res){
        let gameServers = SocketServer.GetAllGameServers()
        res.end(APIMessage.craftAPIMessage(true, "Got GameServers!", {
            GameServers: gameServers
        }))
    })

    app.get(getAPIEndpoint() + "popularity/world/:popularityType/:itemsPerPage/:page", function (req, res) {
        try{
            let popularityType = req.params.popularityType
            if(!isUserBodyValid(popularityType)){
                res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                return
            }
            popularityType = Popularity.VerifyPopularityType(Number(popularityType))
            let page = req.params.page
            if(page === undefined || page === null)
                page = 0
            page = Number(page)
            let itemsPerPage = req.params.itemsPerPage
            if(itemsPerPage === undefined || itemsPerPage === null)
                itemsPerPage = 50
            itemsPerPage = Number(itemsPerPage)
            Popularity.GetPopularity(FileUploading.UploadType.World, popularityType, page, itemsPerPage).then(r => {
                if(r !== undefined){
                    res.end(APIMessage.craftAPIMessage(true, "Got Popularity!", {
                        Popularity: r
                    }))
                }
                else{
                    res.end(APIMessage.craftAPIMessage(false, "Failed to get popularity!"))
                }
            }).catch(e => {
                res.end(APIMessage.craftAPIMessage(false, "Failed to get popularity!"))
            })
        } catch(_){
            res.end(APIMessage.craftAPIMessage(false, "Failed to get popularity!"))
        }
    })

    app.get(getAPIEndpoint() + "popularity/avatar/:popularityType/:itemsPerPage/:page", function (req, res) {
        try{
            let popularityType = req.params.popularityType
            if(!isUserBodyValid(popularityType)){
                res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                return
            }
            popularityType = Popularity.VerifyPopularityType(Number(popularityType))
            let page = req.params.page
            if(page === undefined || page === null)
                page = 0
            page = Number(page)
            let itemsPerPage = req.params.itemsPerPage
            if(itemsPerPage === undefined || itemsPerPage === null)
                itemsPerPage = 50
            itemsPerPage = Number(itemsPerPage)
            Popularity.GetPopularity(FileUploading.UploadType.Avatar, popularityType, page, itemsPerPage).then(r => {
                if(r !== undefined){
                    res.end(APIMessage.craftAPIMessage(true, "Got Popularity!", {
                        Popularity: r
                    }))
                }
                else{
                    res.end(APIMessage.craftAPIMessage(false, "Failed to get popularity!"))
                }
            }).catch(() => {
                res.end(APIMessage.craftAPIMessage(false, "Failed to get popularity!"))
            })
        } catch(_){
            res.end(APIMessage.craftAPIMessage(false, "Failed to get popularity!"))
        }
    })

    app.post(getAPIEndpoint() + "moderation", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let action = req.body.action
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string")){
            Users.isUserIdTokenValid(userid, tokenContent).then(isTokenValid => {
                if(isTokenValid){
                    Users.getUserDataFromUserId(userid).then(user => {
                        if(user !== undefined){
                            switch (action.toLowerCase()) {
                                case "addbadge":{
                                    if(user.Rank < Users.Rank.Admin){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid permissions!"))
                                        break
                                    }
                                    // Add a badge to a user
                                    let targetUserId = req.body.targetUserId
                                    let badgeName = req.body.badgeName
                                    if(!isUserBodyValid(targetUserId, "string") || !isUserBodyValid(badgeName, "string")){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                                        break
                                    }
                                    Users.addBadge(targetUserId, badgeName).then(r => {
                                        if(r){
                                            res.end(APIMessage.craftAPIMessage(true, "Done!"))
                                        }
                                        else{
                                            res.end(APIMessage.craftAPIMessage(false, "Could not add badge!"))
                                        }
                                    }).catch(_ => res.end(APIMessage.craftAPIMessage(false, "Could not add badge!")))
                                    break
                                }
                                case "removebadge":{
                                    if(user.Rank < Users.Rank.Admin){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid permissions!"))
                                        break
                                    }
                                    // Remove a user's badge
                                    let targetUserId = req.body.targetUserId
                                    let badgeName = req.body.badgeName
                                    if(!isUserBodyValid(targetUserId, "string") || !isUserBodyValid(badgeName, "string")){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                                        break
                                    }
                                    Users.removeBadge(targetUserId, badgeName).then(r => {
                                        if(r){
                                            res.end(APIMessage.craftAPIMessage(true, "Done!"))
                                        }
                                        else{
                                            res.end(APIMessage.craftAPIMessage(false, "Could not add badge!"))
                                        }
                                    }).catch(_ => res.end(APIMessage.craftAPIMessage(false, "Could not add badge!")))
                                    break
                                }
                                case "setrank":{
                                    if(user.Rank < Users.Rank.Admin){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid permissions!"))
                                        break
                                    }
                                    // Set the user's rank
                                    let targetUserId = req.body.targetUserId
                                    let newRank = req.body.newRank
                                    if(!isUserBodyValid(targetUserId, "string") || !isUserBodyValid(newRank)){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                                        break
                                    }
                                    Users.setRank(targetUserId, newRank).then(r => {
                                        if(r){
                                            res.end(APIMessage.craftAPIMessage(true, "Done!"))
                                        }
                                        else{
                                            res.end(APIMessage.craftAPIMessage(false, "Could not set rank!"))
                                        }
                                    }).catch(_ => res.end(APIMessage.craftAPIMessage(false, "Could not set rank!")))
                                    break
                                }
                                case "warnuser":{
                                    if(user.Rank < Users.Rank.Moderator){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid permissions!"))
                                        break
                                    }
                                    // Give the user a warning
                                    let targetUserId = req.body.targetUserId
                                    let warnReason = req.body.warnReason
                                    let warnDescription = req.body.warnDescription
                                    if(!isUserBodyValid(targetUserId, "string") || !isUserBodyValid(warnReason, "string") || !isUserBodyValid(warnDescription, "string")){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                                        break
                                    }
                                    Users.warnUser(targetUserId, warnReason, warnDescription).then(r => {
                                        if(r){
                                            res.end(APIMessage.craftAPIMessage(true, "Done!"))
                                        }
                                        else{
                                            res.end(APIMessage.craftAPIMessage(false, "Could not warn!"))
                                        }
                                    }).catch(_ => res.end(APIMessage.craftAPIMessage(false, "Could not warn!")))
                                    break
                                }
                                case "banuser":{
                                    if(user.Rank < Users.Rank.Moderator){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid permissions!"))
                                        break
                                    }
                                    // Ban the user
                                    let targetUserId = req.body.targetUserId
                                    let banReason = req.body.banReason
                                    let banDescription = req.body.banDescription
                                    let timeEnd = req.body.timeEnd
                                    if(!isUserBodyValid(targetUserId, "string") || !isUserBodyValid(banReason, "string") || !isUserBodyValid(banDescription, "string") || !isUserBodyValid(timeEnd)){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                                        break
                                    }
                                    Users.banUser(targetUserId, banReason, banDescription, timeEnd).then(r => {
                                        if(r){
                                            res.end(APIMessage.craftAPIMessage(true, "Done!"))
                                        }
                                        else{
                                            res.end(APIMessage.craftAPIMessage(false, "Could not ban!"))
                                        }
                                    }).catch(_ => res.end(APIMessage.craftAPIMessage(false, "Could not ban!")))
                                    break
                                }
                                case "unbanuser":{
                                    if(user.Rank < Users.Rank.Moderator){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid permissions!"))
                                        break
                                    }
                                    // Revert the user's ban
                                    let targetUserId = req.body.targetUserId
                                    if(!isUserBodyValid(targetUserId, "string")){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                                        break
                                    }
                                    Users.unBanUser(targetUserId).then(r => {
                                        if(r){
                                            res.end(APIMessage.craftAPIMessage(true, "Done!"))
                                        }
                                        else{
                                            res.end(APIMessage.craftAPIMessage(false, "Could not ban!"))
                                        }
                                    }).catch(_ => res.end(APIMessage.craftAPIMessage(false, "Could not ban!")))
                                    break
                                }
                                case "deleteavatar":{
                                    if(user.Rank < Users.Rank.Moderator){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid permissions!"))
                                        break
                                    }
                                    // Delete an avatar
                                    let targetUserId = req.body.targetUserId
                                    let avatarid = req.body.avatarId
                                    if(!isUserBodyValid(targetUserId, "string") || !isUserBodyValid(avatarid, "string")){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                                        break
                                    }
                                    Users.moderatorRemoveAvatar(userid, avatarid).then(r => {
                                        if(r){
                                            Avatars.deleteAvatar(avatarid).then(rr => {
                                                if(rr)
                                                    res.end(APIMessage.craftAPIMessage(true, "Removed avatar!"))
                                                else
                                                    res.end(APIMessage.craftAPIMessage(false, "Failed to remove avatar!"))
                                            }).catch(err => {
                                                Logger.Error("Failed to remove avatar for reason " + err)
                                                res.end(APIMessage.craftAPIMessage(false, "Failed to remove avatar!"))
                                            })
                                        }
                                        else
                                            res.end(APIMessage.craftAPIMessage(false, "Failed to remove avatar!"))
                                    }).catch(err => {
                                        Logger.Error("Failed to remove avatar for reason " + err)
                                        res.end(APIMessage.craftAPIMessage(false, "Failed to remove avatar!"))
                                    })
                                    break
                                }
                                case "deleteworld":{
                                    if(user.Rank < Users.Rank.Moderator){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid permissions!"))
                                        break
                                    }
                                    // Delete a world
                                    let targetUserId = req.body.targetUserId
                                    let worldid = req.body.worldId
                                    if(!isUserBodyValid(targetUserId, "string") || !isUserBodyValid(worldid, "string")){
                                        res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                                        break
                                    }
                                    Users.moderatorRemoveWorld(userid, tokenContent, worldid).then(r => {
                                        if(r){
                                            Worlds.deleteWorld(worldid).then(rr => {
                                                if(rr)
                                                    res.end(APIMessage.craftAPIMessage(true, "Removed world!"))
                                                else
                                                    res.end(APIMessage.craftAPIMessage(false, "Failed to remove world!"))
                                            }).catch(err => {
                                                Logger.Error("Failed to remove world for reason " + err)
                                                res.end(APIMessage.craftAPIMessage(false, "Failed to remove world!"))
                                            })
                                        }
                                        else
                                            res.end(APIMessage.craftAPIMessage(false, "Failed to remove world!"))
                                    }).catch(err => {
                                        Logger.Error("Failed to remove world for reason " + err)
                                        res.end(APIMessage.craftAPIMessage(false, "Failed to remove world!"))
                                    })
                                    break
                                }
                                default:
                                    res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
                                    break
                            }
                        }
                        else
                            res.end(APIMessage.craftAPIMessage(false, "Could not find user!"))
                    }).catch(() => res.end(APIMessage.craftAPIMessage(false, "Failed to moderate!")))
                }
                else
                    res.end(APIMessage.craftAPIMessage(false, "Invalid Token!"))
            }).catch(() => res.end(APIMessage.craftAPIMessage(false, "Failed to moderate!")))
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.get(getAPIEndpoint() + "randomImage", async function (req, res) {
        const clientIP = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
        const closestServer = await GeoTools.findClosestServer(clientIP, cdns)
        const newURL = `${closestServer}randomImage`
        res.redirect(302, newURL)
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
    server.on('clientError', (err, socket) => {
        if (err.code === 'ECONNRESET' || !socket.writable) {
            return;
        }
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    })
    return server
}
