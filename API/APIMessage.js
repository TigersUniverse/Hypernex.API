exports.craftAPIMessage = function (success, message, result) {
    return JSON.stringify({
        success: success,
        message: message,
        result: result
    })
}