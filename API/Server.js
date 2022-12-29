const express = require('express')
const http = require('http')
const https = require('https')
const bodyParser = require("body-parser");
const path = require("path")

const Logger = require("./../Logging/Logger.js")
const APIMessage = require("./APIMessage.js")

const multer = require("multer")
const fs = require("fs");
let upload

const app = express()

let ServerConfig
let Users
let FileUploading
let Avatars

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

exports.initapp = function (usersModule, serverConfig, fileUploadModule, avatarsModule){
    Users = usersModule
    ServerConfig = serverConfig
    FileUploading = fileUploadModule
    Avatars = avatarsModule

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
                }).catch(err => {
                    Logger.Error("Failed to getUser from API for reason: " + err)
                    res.end(APIMessage.craftAPIMessage(false, "Failed to getUser!"))
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
                Logger.Error("Failed to verifyEmailToken!")
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
        if(isUserBodyValid(userid, "string") && isUserBodyValid(tokenContent, "string")){
            Users.isUserIdTokenValid(userid, tokenContent).then(validToken => {
                if(validToken){
                    let filebuffer = fs.readFileSync(file.path)
                    FileUploading.UploadFile(userid, file.originalname, filebuffer).then(r => {
                        if(r) {
                            if(avatarMeta !== undefined){
                                Avatars.handleFileUpload(userid, tokenContent, avatarMeta).then(verifiedAvatarMeta => {
                                    if(verifiedAvatarMeta !== undefined){
                                        Users.addAvatar(userid, verifiedAvatarMeta).then(uaar => {
                                            if(uuar){
                                                res.end(APIMessage.craftAPIMessage(true, "Uploaded Avatar!", {
                                                    UploadData: r
                                                }))
                                                deleteFile(file.path)
                                            }
                                            else{
                                                res.end(APIMessage.craftAPIMessage(false, "Failed to upload Avatar!"))
                                                deleteFile(file.path)
                                            }
                                        }).catch(err => {
                                            Logger.Error("Failed to upload avatar for reason " + err)
                                            res.end(APIMessage.craftAPIMessage(false, "Failed to upload avatar!"))
                                            deleteFile(file.path)
                                        })
                                    }
                                    else{
                                        res.end(APIMessage.craftAPIMessage(false, "Failed to upload Avatar!"))
                                        deleteFile(file.path)
                                    }
                                }).catch(err => {
                                    Logger.Error("Failed to upload avatar for reason " + err)
                                    res.end(APIMessage.craftAPIMessage(false, "Failed to upload avatar!"))
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

    app.get(getAPIEndpoint() + "file/:userid/:fileid", function (req, res) {
        let userid = req.params.userid
        let fileid = req.params.fileid
        if(isUserBodyValid(userid, "string") && isUserBodyValid(fileid, "string")){
            FileUploading.getFileById(userid, fileid).then(fileData => {
                if(fileData){
                    // TODO: Authentication with WebSocket
                    res.attachment(fileData.FileMeta.FileName)
                    res.send(fileData.FileData.Body)
                }
                else{
                    res.end(APIMessage.craftAPIMessage(false, "Failed to get file!"))
                }
            }).catch(err => {
                Logger.Error("Failed to get file for reason " + err)
                res.end(APIMessage.craftAPIMessage(false, "Failed to get file!"))
            })
        }
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