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
            "username": userdata.Username,
            "avatar_url": userdata.Bio.PfpURL,
            "profile_background_url": userdata.Bio.BannerURL,
            "card_background_url": userdata.Bio.BannerURL,
            "bio": userdata.Bio.Description,
            "moderator": userdata.Rank >= 4,
            "admin": userdata.Rank >= 5
        };
        // TODO: Probably make better
        if(userdata.Bio.DisplayName !== null && userdata.Bio.DisplayName !== undefined && userdata.Bio.DisplayName !== ""){
            d.name = userdata.Bio.DisplayName
        }
        else{
            d.name = undefined
        }
        return sso.buildLoginString(d)
    }
    return undefined
}
