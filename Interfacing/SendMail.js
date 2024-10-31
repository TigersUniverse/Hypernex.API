const nodemailer = require("nodemailer")

exports.create = function (config){return this;}

exports.getDomain = function () {return undefined}

exports.sendEmail = function (data) {
    return new Promise((exec, reject) => {
        const transporter = nodemailer.createTransport({sendmail: true}, {
            from: data.from,
            to: data.to,
            subject: data.subject,
        })
        transporter.sendMail({html: data.html}, err => {
            if(err)
                reject(err)
            else
                exec(true)
        })
    })
}
