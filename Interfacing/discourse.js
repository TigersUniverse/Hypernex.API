const discourse = require("discourse-sso")

let canValidate = true
let sso

exports.Init = function (secret) {
    if(secret === undefined || secret === "") {
        canValidate = false
        return this
    }
    sso = new discourse(secret)
    return this
}

exports.Validate = function (payload, sig, userdata) {
    if(!canValidate)
        return undefined
    if(sso.validate(payload, sig)){
        let nonce = sso.getNonce(payload)
        let d = {
            "nonce": nonce,
            "external_id": userdata.Id,
            "email": userdata.Email,
            "username": userdata.Username
        };
        // TODO: Probably make better
        if(userdata.Bio !== null && userdata.Bio !== undefined && userdata.Bio.DisplayName !== null && userdata.Bio.DisplayName !== undefined && userdata.Bio.DisplayName !== ""){
            d.name = userdata.Bio.DisplayName
        }
        else{
            d.name = undefined
        }
        return sso.buildLoginString(d)
    }
    return undefined
}
