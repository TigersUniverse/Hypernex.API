exports.Log = function (object){
    console.log(object)
}

exports.Warning = function (object) {
    console.warn(object)
}

exports.Error = function (object) {
    // I don't know if a try-catch is needed
    try{
        console.error(object)
    } catch (e) {}
}