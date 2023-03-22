const fs = require("fs")
const formData = require("form-data")
const mailgun_api = require("mailgun.js")
const validator = require("validator")
const cheerio = require("cheerio")

const Logger = require("./../Logging/Logger.js")
const ID = require("./../Data/ID.js")

const mailgun = new mailgun_api(formData)
let mg

let baseURL
let mailgunURL

let emailVerificationHtml
let passwordResetHtml

exports.init = function (ServerConfig){
    mg = mailgun.client({
        username: ServerConfig.LoadedConfig.MailGun.Username,
        key: ServerConfig.LoadedConfig.MailGun.Key
    })
    emailVerificationHtml = fs.readFileSync(ServerConfig.LoadedConfig.HTMLPaths.EmailVerificationPath, 'utf8')
    passwordResetHtml = fs.readFileSync(ServerConfig.LoadedConfig.HTMLPaths.ResetPasswordPath, 'utf8')
    baseURL = ServerConfig.LoadedConfig.BaseURL
    mailgunURL = ServerConfig.LoadedConfig.MailGun.MailGunURL
    Logger.Log("Initialized Mailing!")
}

exports.isValidEmail = function (email) {
    return validator.isEmail(email)
}

exports.sendEmail = function (data) {
    return new Promise((exec, reject) => {
        mg.messages.create(mailgunURL, data).then(msg => {
            exec(msg)
        }).catch(err => {
            reject(err)
        })
    })
}

exports.sendVerificationEmailToUser = function (userdata) {
    return new Promise(exec => {
        if(!userdata.isEmailVerified && exports.isValidEmail(userdata.Email)){
            let t = ID.newSafeURLTokenPassword(25)
            let $ = cheerio.load(emailVerificationHtml)
            $("a").each(function () {
                let id = $(this).attr("id")
                if(id === "button-url"){
                    let url = baseURL + "verifyEmail?code=" + t + "&userid=" + userdata.Id
                    $(this).attr("href", url)
                }
            })
            const data = {
                from: 'no-reply <no-reply@' + mailgunURL + '>',
                to: userdata.Email,
                subject: userdata.Username + ", please Verify your Email!",
                html: $.html()
            }
            exports.sendEmail(data).then(r => {
                if(r)
                    exec(t)
                else
                    exec(false)
            }).catch(err => {
                Logger.Error("Failed to send email verification email to " + userdata.Email + " with error " + err)
                exec(false)
            })
        }
    })
}

exports.sendPasswordResetEmail = function (userdata, token) {
    return new Promise(exec => {
        if(userdata.isEmailVerified){
            let $ = cheerio.load(passwordResetHtml)
            $("a").each(function (){
                let id = $(this).attr("id")
                if(id === "button-url"){
                    let url = baseURL + "resetPassword?code=" + token + "&userid=" + userdata.Id
                    $(this).attr("href", url)
                }
            })
            const data = {
                from: 'no-reply <no-reply@' + mailgunURL + '>',
                to: userdata.Email,
                subject: userdata.Username + ", please Verify your Email!",
                html: $.html()
            }
            exports.sendEmail(data).then(r => {
                if(r)
                    exec(true)
                else
                    exec(false)
            }).catch(err => {
                Logger.Error("Failed to send email verification email to " + userdata.Email + " with error " + err)
                exec(false)
            })
        }
        else
            exec(false)
    })
}