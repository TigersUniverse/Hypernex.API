const nodemailer = require("nodemailer")

let ServerConfig

exports.create = function (config){
    ServerConfig = config
    return this;
}

exports.getDomain = function () {
    if(ServerConfig.SMTPSettings.OverrideDomain === undefined || ServerConfig.SMTPSettings.OverrideDomain === "")
        return undefined
    return ServerConfig.SMTPSettings.OverrideDomain
}

exports.sendEmail = function (data) {
    return new Promise((exec, reject) => {
        let connectionInfo = {
            host: ServerConfig.SMTPSettings.Server,
            port: ServerConfig.SMTPSettings.Port,
            secure: ServerConfig.SMTPSettings.Secure,
            auth: {
                user: ServerConfig.SMTPSettings.Username,
                pass: ServerConfig.SMTPSettings.Password,
            }
        }
        if(!ServerConfig.SMTPSettings.NoTLS)
            connectionInfo.tls = { ciphers: "SSLv3" }
        const transporter = nodemailer.createTransport(connectionInfo)
        const mailOptions = {
            from: data.from,
            to: data.to,
            subject: data.subject,
            html: data.html
        }
        transporter.sendMail(mailOptions, err => {
            if(err)
                reject(err)
            else
                exec(true)
        })
    })
}