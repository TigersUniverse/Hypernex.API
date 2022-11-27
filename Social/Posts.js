const Logger = require("../Logging/Logger.js")
const ID = require("../Data/ID.js")
const DateTools = require("../Tools/DateTools.js")
const ArrayTools = require("../Tools/ArrayTools.js")
let Users
let Database

const POSTS_PREFIX = "posts/"

exports.init = function (usersModule, databaseModule) {
    Users = usersModule
    Database = databaseModule
    Logger.Log("Initialized Posts!")
}

// Called whenever a user is created
exports.initUser = function (userdata) {
    return new Promise(exec => {
        let newSocialData = {
            Id: userdata.Id,
            Posts: [],
            /*
             * Following should look like this object
             * {
             *      FromUserId: "",
             *      PostId: ""
             * }
             * That way, a client can simply call the API to get the Post information
             */
            Likes: [],
            Saved: []
        }
        Database.set(POSTS_PREFIX + userdata.Id, newSocialData).then(r => {
            if(r){
                Logger.Log("Created Social data for user " + userdata.Username)
                exec(true)
            }
            else
                exec(false)
        }).catch(err => {
            Logger.Error("Failed to save posts for reason " + err)
            throw err
        })
    })
}

exports.getUserSocialData = function (userid) {
    return new Promise(exec => {
        Database.get(POSTS_PREFIX + userid).then(socialdata => {
            if(socialdata)
                exec(socialdata)
            else
                exec(null)
        }).catch(() => exec(null))
    })
}

exports.getPost = function (userid, postid) {
    return new Promise(exec => {
        exports.getUserSocialData(userid).then(socialdata => {
            if(socialdata){
                let i = ArrayTools.customFind(socialdata.Posts, item => item.PostId === postid)
                if(i)
                    exec(socialdata.Posts[i])
                else
                    exec(null)
            }
            else
                exec(null)
        }).catch(() => exec(null))
    })
}

function canUserSeePost(userid, post){
    return new Promise(exec => {
        Users.getUserDataFromUserId(post.FromUserId).then(userdata => {
            if(userdata){
                if(!userdata.Bio.isPrivateAccount)
                    exec(true)
                else{
                    let i = ArrayTools.find(userdata.Followers, userid)
                    if(i)
                        exec(true)
                    else
                        exec(false)
                }
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

function isUserMentioned(username, content){
    let ats = []
    for(let i = 0; i < content.length; i++){
        let letter = content[i]
        if(letter === '@')
            ats.push(i)
    }
    if(!ats.length <= 0)
        return false
    let usernames = []
    for(let x = 0; x < ats.length; x++){
        let at = ats[x]
        let hitgoal = false
        let username = ""
        for(let y = at; y < content.length; y++){
            let letter = content[y]
            let done = false
            if(letter === ' '){
                usernames.push(username)
                done = true
            }
            if(!done)
                username += letter.toLowerCase()
        }
    }
    let u = ArrayTools.find(usernames, username.toLowerCase())
    return !!u
}

// Don't forget to call canUserSeePost first!
function canUserCommentPost(userid, post){
    return new Promise(exec => {
        let commentPermissions = post.CommentPermissions
        if(commentPermissions === exports.CommentPermissions.Anyone)
            exec(true)
        else{
            Users.getUserDataFromUserId(post.FromUserId).then(userdata => {
                if(userdata){
                    switch (commentPermissions) {
                        case exports.CommentPermissions.Followers:
                            let follower = ArrayTools.find(userdata.Followers, userid)
                            if(follower)
                                exec(true)
                            else
                                exec(false)
                            break
                        case exports.CommentPermissions.Following:
                            let following = ArrayTools.find(userdata.Following, userid)
                            if(following)
                                exec(true)
                            else
                                exec(false)
                            break
                        case exports.CommentPermissions.Mentioned:

                    }
                }
                else
                    exec(false)
            }).catch(() => exec(false))
        }
    })
}

function postTemplate(userid, postid, content, date, commentPerms, commentDetails){
    if(content === null || !(typeof content === 'string' || content instanceof String))
        return null
    if(Number.isNaN(date))
        return null
    else
        if(date < DateTools.getUnixTime(new Date()))
            return null
    if(Number.isNaN(commentPerms))
        return null
    else
        if(!(commentPerms >=0 && commentPerms <= 3))
            return null
    return {
        FromUserId: userid,
        PostId: postid,
        Content: content,
        DatePublished: date,
        CommentDetails: {
            isComment: false,
            repliedToPostData: null
        },
        CommentPermissions: commentPerms,
        Comments: [],
        Likes: [],
        Shares: [],
        ShareDetails: {
            isPostShared: false,
            FromUserId: null,
            FromPostId: null
        }
    }
}

function createPostId(posts){
    let id = ID.new(ID.IDTypes.Post)
    for(let i = 0; i < posts.length; i++){
        let post = posts[i]
    }
}

exports.createPost = function (userid, tokenContent, content, date) {
    // This is a user post

}

exports.CommentPermissions = {
    Anyone: 0,
    Followers: 1,
    Following: 2,
    Mentioned: 3
}