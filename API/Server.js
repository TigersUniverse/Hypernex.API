const express = require('express')
const http = require('http')
const https = require('https')
const bodyParser = require("body-parser");
const path = require("path")

const ArrayTools = require("./../Tools/ArrayTools.js")
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

exports.initapp = function (usersModule, socketServerModule, serverConfig, fileUploadModule, avatarsModule, worldsModule){
    Users = usersModule
    SocketServer = socketServerModule
    ServerConfig = serverConfig
    FileUploading = fileUploadModule
    Avatars = avatarsModule
    Worlds = worldsModule

    upload = multer({ dest: "uploads/", limits: { fileSize: ServerConfig.LoadedConfig.MaxFileSize * 1000000 } })
    app.use(express.static(path.resolve(serverConfig.LoadedConfig.WebRoot), {
        extensions: ['html', 'htm']
    }))
    app.use(bodyParser.urlencoded({extended: true}))
    app.use(bodyParser.json())

    // Server Information

    app.get(getAPIEndpoint() + "isInviteCodeRequired", function (req, res) {
        res.end(APIMessage.craftAPIMessage(true, "Got Information", {
            inviteCodeRequired: serverConfig.LoadedConfig.SignupRules.RequireInviteCode
        }))
    })

    app.get(getAPIEndpoint() + "getSocketInfo", function (req, res){
        res.end(APIMessage.craftAPIMessage(true, "Got Information", {
            IsWSS: ServerConfig.LoadedConfig.UseHTTPS,
            Port: ServerConfig.LoadedConfig.SocketPort
        }))
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

    // File Management

    function deleteFile(path){
        try{
            fs.unlinkSync(path)
        }
        catch(e){
            console.log(e)
        }
    }

    app.post(getAPIEndpoint() + "upload", upload.single('file'), function (req, res) {
        let file = req.file
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        let avatarMeta = req.body.avatarMeta
        let worldMeta = req.body.worldMeta
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string")){
            Users.isUserIdTokenValid(userid, tokenContent).then(validToken => {
                if(validToken){
                    let filebuffer = fs.readFileSync(file.path)
                    let fileHash = FileUploading.getFileHash(filebuffer)
                    // TODO: Test fileHash
                    FileUploading.UploadFile(userid, file.originalname, filebuffer, fileHash).then(r => {
                        if(r) {
                            if(avatarMeta !== undefined && r.UploadType === FileUploading.UploadType.Avatar){
                                Avatars.handleFileUpload(userid, tokenContent, r.FileId, avatarMeta).then(verifiedAvatarMeta => {
                                    if(verifiedAvatarMeta !== undefined){
                                        Users.addAvatar(userid, verifiedAvatarMeta).then(uaar => {
                                            if(uaar){
                                                res.end(APIMessage.craftAPIMessage(true, "Uploaded Avatar!", {
                                                    UploadData: r,
                                                    AvatarId: verifiedAvatarMeta.Id
                                                }))
                                                deleteFile(file.path)
                                            }
                                            else{
                                                res.end(APIMessage.craftAPIMessage(false, "Failed to upload Avatar!"))
                                                FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                                                Avatars.deleteAvatar(verifiedAvatarMeta.Id)
                                                deleteFile(file.path)
                                            }
                                        }).catch(err => {
                                            Logger.Error("Failed to upload avatar for reason " + err)
                                            res.end(APIMessage.craftAPIMessage(false, "Failed to upload avatar!"))
                                            FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                                            Avatars.deleteAvatar(verifiedAvatarMeta.Id)
                                            deleteFile(file.path)
                                        })
                                    }
                                    else{
                                        res.end(APIMessage.craftAPIMessage(false, "Failed to upload Avatar!"))
                                        FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                                        deleteFile(file.path)
                                    }
                                }).catch(err => {
                                    Logger.Error("Failed to upload avatar for reason " + err)
                                    res.end(APIMessage.craftAPIMessage(false, "Failed to upload avatar!"))
                                    FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                                    deleteFile(file.path)
                                })
                            }
                            else if(worldMeta !== undefined && r.UploadType === FileUploading.UploadType.World){
                                Worlds.handleFileUpload(userid, tokenContent, r.FileId, worldMeta).then(verifiedWorldMeta => {
                                    if(verifiedWorldMeta !== undefined){
                                        Users.addWorld(userid, verifiedWorldMeta).then(uwar => {
                                            if(uwar){
                                                res.end(APIMessage.craftAPIMessage(true, "Uploaded World!", {
                                                    UploadData: r,
                                                    WorldId: verifiedWorldMeta.Id
                                                }))
                                                deleteFile(file.path)
                                            }
                                            else{
                                                res.end(APIMessage.craftAPIMessage(false, "Failed to upload World!"))
                                                FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                                                Worlds.deleteWorld(verifiedWorldMeta.Id)
                                                deleteFile(file.path)
                                            }
                                        }).catch(err => {
                                            Logger.Error("Failed to upload world for reason " + err)
                                            res.end(APIMessage.craftAPIMessage(false, "Failed to upload world!"))
                                            FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                                            deleteFile(file.path)
                                        })
                                    }
                                    else{
                                        res.end(APIMessage.craftAPIMessage(false, "Failed to upload World!"))
                                        FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                                        deleteFile(file.path)
                                    }
                                }).catch(err => {
                                    Logger.Error("Failed to upload world for reason " + err)
                                    res.end(APIMessage.craftAPIMessage(false, "Failed to upload world!"))
                                    FileUploading.DeleteFile(userid, r.FileId).catch(() => {})
                                    deleteFile(file.path)
                                })
                            }
                            else {
                                res.end(APIMessage.craftAPIMessage(true, "Uploaded File!", {
                                    UploadData: r
                                }))
                                deleteFile(file.path)
                            }
                        }
                        else {
                            res.end(APIMessage.craftAPIMessage(false, "Failed to upload file!"))
                            deleteFile(file.path)
                        }
                    }).catch(err => {
                        Logger.Error("Failed to upload file for reason " + err)
                        res.end(APIMessage.craftAPIMessage(false, "Failed to upload file!"))
                        deleteFile(file.path)
                    })
                }
                else {
                    res.end(APIMessage.craftAPIMessage(false, "Failed to authenticate user!"))
                    deleteFile(file.path)
                }
            }).catch(err => {
                Logger.Error("Failed to upload file for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to upload file!"))
                deleteFile(file.path)
            })
        }
        else {
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
            deleteFile(file.path)
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

    app.get(getAPIEndpoint() + "search/user/:username", function (req, res) {
        let username = req.params.username
        if(isUserBodyValid(username, "string")){
            Users.safeSearchUsername(username).then(arr => {
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

    app.get(getAPIEndpoint() + "search/avatar/:name", function (req, res) {
        let name = req.params.name
        if(isUserBodyValid(name, "string")){
            Avatars.safeSearchAvatar(name).then(arr => {
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

    app.get(getAPIEndpoint() + "search/world/:name", function (req, res) {
        let name = req.params.name
        if(isUserBodyValid(name, "string")){
            Worlds.safeSearchWorld(name).then(arr => {
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

    app.get(getAPIEndpoint() + "file/:userid/:fileid", function (req, res) {
        let userid = req.params.userid
        let fileid = req.params.fileid
        if(isUserBodyValid(userid, "string") && isUserBodyValid(fileid, "string")){
            FileUploading.getFileById(userid, fileid).then(fileData => {
                if(fileData){
                    switch (fileData.FileMeta.UploadType) {
                        case FileUploading.UploadType.Avatar:{
                            Avatars.getAvatarMetaByFileId(userid, fileid).then(avatarMeta => {
                                if(avatarMeta !== undefined){
                                    if(avatarMeta.Publicity === Avatars.Publicity.Anyone){
                                        res.attachment(fileData.FileMeta.FileName)
                                        res.send(fileData.FileData.Body)
                                    }
                                    else
                                        res.end(APIMessage.craftAPIMessage(false, "Failed to Authenticate FileToken"))
                                }
                                else
                                    res.end(APIMessage.craftAPIMessage(false, "AvatarMeta does not exist!"))
                            }).catch(err => {
                                Logger.Error("Failed to get AvatarMeta for reason " + err)
                                res.end(APIMessage.craftAPIMessage(false, "Failed to get AvatarMeta!"))
                            })
                            break
                        }
                        case FileUploading.UploadType.World:{
                            Worlds.getWorldMetaByFileId(userid, fileid).then(worldMeta => {
                                if(worldMeta !== undefined){
                                    if(worldMeta.Publicity === Worlds.Publicity.Anyone){
                                        res.attachment(fileData.FileMeta.FileName)
                                        res.send(fileData.FileData.Body)
                                    }
                                    else
                                        res.end(APIMessage.craftAPIMessage(false, "Missing FileToken"))
                                }
                                else
                                    res.end(APIMessage.craftAPIMessage(false, "WorldMeta does not exist!"))
                            }).catch(err => {
                                Logger.Error("Failed to get WorldMeta for reason " + err)
                                res.end(APIMessage.craftAPIMessage(false, "Failed to get WorldMeta!"))
                            })
                            break
                        }
                        case FileUploading.UploadType.Media:
                            res.attachment(fileData.FileMeta.FileName)
                            res.send(fileData.FileData.Body)
                            break
                        default:
                            res.end(APIMessage.craftAPIMessage(false, "Incorrect Endpoint for Getting File"))
                            break
                    }
                }
                else{
                    res.end(APIMessage.craftAPIMessage(false, "Failed to get file!"))
                }
            }).catch(err => {
                Logger.Error("Failed to get file for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to get file!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.get(getAPIEndpoint() + "file/:userid/:fileid/:filetoken", function (req, res) {
        let userid = req.params.userid
        let fileid = req.params.fileid
        let filetoken = req.params.filetoken
        if(isUserBodyValid(userid, "string") && isUserBodyValid(fileid, "string")){
            FileUploading.getFileById(userid, fileid).then(fileData => {
                if(fileData){
                    switch (fileData.FileMeta.UploadType) {
                        case FileUploading.UploadType.Avatar:{
                            Avatars.verifyAvatarToken(userid, fileid, filetoken).then(valid => {
                                if(valid){
                                    res.attachment(fileData.FileMeta.FileName)
                                    res.send(fileData.FileData.Body)
                                }
                                else
                                    res.end(APIMessage.craftAPIMessage(false, "Failed to Authenticate FileToken"))
                            }).catch(err => {
                                Logger.Error("Failed to verify Avatar Token for reason " + err)
                                res.end(APIMessage.craftAPIMessage(false, "Failed to verify Avatar Token!"))
                            })
                            break
                        }
                        case FileUploading.UploadType.World:{
                            Worlds.verifyWorldToken(userid, fileid, filetoken).then(valid => {
                                if(valid){
                                    res.attachment(fileData.FileMeta.FileName)
                                    res.send(fileData.FileData.Body)
                                }
                                else
                                    res.end(APIMessage.craftAPIMessage(false, "Failed to Authenticate FileToken"))
                            }).catch(err => {
                                Logger.Error("Failed to verify World Token for reason " + err)
                                res.end(APIMessage.craftAPIMessage(false, "Failed to verify World Token!"))
                            })
                            break
                        }
                        // This assumes that the client is authed without a GameServerToken
                        case FileUploading.UploadType.ServerScript:{
                            if(SocketServer.AreGameServerCredentialsValid(filetoken, "")){
                                FileUploading.getFileById(userid, fileid).then(fileData => {
                                    res.attachment(fileData.FileMeta.FileName)
                                    res.send(fileData.FileData.Body)
                                }).catch(err => {
                                    Logger.Error("Failed to get file for reason " + err)
                                    res.end(APIMessage.craftAPIMessage(false, "Failed to get file!"))
                                })
                            }
                            else
                                res.end(APIMessage.craftAPIMessage(false, "Invalid GameServer credentials!"))
                            break
                        }
                        default:
                            res.end(APIMessage.craftAPIMessage(false, "Incorrect Endpoint for Getting File"))
                            break
                    }
                }
                else{
                    res.end(APIMessage.craftAPIMessage(false, "Failed to get file!"))
                }
            }).catch(err => {
                Logger.Error("Failed to get file for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to get file!"))
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.get(getAPIEndpoint() + "file/:userid/:fileid/:gameServerId/:gameServerToken", function (req, res) {
        let userid = req.params.userid
        let fileid = req.params.fileid
        let gameServerId = req.params.gameServerId
        let gameServerToken = req.params.gameServerToken
        if(isUserBodyValid(userid, "string") && isUserBodyValid(gameServerId, "string") && isUserBodyValid(gameServerId, "string") && isUserBodyValid(gameServerToken, "string")){
            if(SocketServer.AreGameServerCredentialsValid(gameServerId, gameServerToken)){
                FileUploading.getFileById(userid, fileid).then(fileData => {
                    if(fileData.FileMeta.UploadType === FileUploading.UploadType.ServerScript){
                        res.attachment(fileData.FileMeta.FileName)
                        res.send(fileData.FileData.Body)
                    }
                    else
                        res.end(APIMessage.craftAPIMessage(false, "File is not a ServerScript!"))
                }).catch(err => {
                    Logger.Error("Failed to get file for reason " + err)
                    res.end(APIMessage.craftAPIMessage(false, "Failed to get file!"))
                })
            }
            else
                res.end(APIMessage.craftAPIMessage(false, "Invalid GameServer credentials!"))
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

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
            })
        }
        else
            res.end(APIMessage.craftAPIMessage(false, "Invalid parameters!"))
    })

    app.post(getAPIEndpoint() + "instances", function (req, res) {
        let userid = req.body.userid
        let tokenContent = req.body.tokenContent
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string")){
            Users.isUserIdTokenValid(userid, tokenContent).then(isTokenValid => {
                if(isTokenValid){
                    Users.getUserDataFromUserId(userid).then(user => {
                        if(user !== undefined){
                            SocketServer.GetSafeInstances(user).then(instances => {
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